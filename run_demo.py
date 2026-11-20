"""Serve the demo on loopback, with optional server-side OpenAI tutor chat."""

import argparse
import functools
import getpass
import http.server
import json
import os
from pathlib import Path
import sys
import threading
import warnings
import webbrowser

from src.tutor_chat import ChatError, DEFAULT_MODEL, MAX_REQUEST_BYTES, stream_reply, validate_request


class DemoHandler(http.server.SimpleHTTPRequestHandler):
    timeout = 20

    def log_message(self, fmt, *args):
        # The chat session, request text and credentials stay out of access logs.
        pass

    def local_host(self):
        host = self.headers.get("Host", "")
        port = self.server.server_port
        allowed = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if port == 80:
            allowed.update(("127.0.0.1", "localhost"))
        return host if host in allowed and len(self.headers.get_all("Host", [])) == 1 else None

    def json_reply(self, status, data):
        encoded = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if not self.local_host():
            return self.json_reply(403, {"error": "Open the demo on this computer."})
        if self.path == "/api/tutor-chat/status":
            return self.json_reply(200, {"available": bool(self.server.api_key)})
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/tutor-chat":
            return self.json_reply(404, {"error": "Unknown endpoint."})
        host = self.local_host()
        if not host or self.headers.get_all("Origin", []) != [f"http://{host}"]:
            return self.json_reply(403, {"error": "Send questions from the local demo."})
        if not self.server.api_key:
            return self.json_reply(503, {"error": "Start the local demo with --chat to enable questions."})
        if self.headers.get_content_type() != "application/json":
            return self.json_reply(415, {"error": "A JSON request is required."})
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit() or len(lengths[0]) > 9:
            return self.json_reply(400, {"error": "Invalid request length."})
        length = int(lengths[0])
        if not 0 < length <= MAX_REQUEST_BYTES:
            return self.json_reply(413, {"error": "Shorten the conversation and try again."})
        if not self.server.slots.acquire(blocking=False):
            return self.json_reply(429, {"error": "Another reply is in progress. Try again shortly."})
        try:
            self.answer_question(length)
        finally:
            self.server.slots.release()

    def answer_question(self, length):
        from src.chat_evidence import get_evidence

        try:
            body = json.loads(self.rfile.read(length))
            record, model, messages = validate_request(body)
            evidence = get_evidence(record, model)
        except (ValueError, UnicodeError, RecursionError):
            return self.json_reply(400, {"error": "Check the record, selected model and question length."})
        except OSError:
            return self.json_reply(503, {"error": "The local evidence could not be read."})
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        events = stream_reply(self.server.api_key, self.server.api_model, evidence, messages)
        try:
            try:
                for event in events:
                    self.write_event(event)
            except ChatError as err:
                self.write_event({"type": "error", "message": str(err)})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        finally:
            events.close()

    def write_event(self, event):
        self.wfile.write((json.dumps(event, ensure_ascii=True) + "\n").encode())
        self.wfile.flush()


def create_server(port, api_key=None, api_model=DEFAULT_MODEL):
    handler = functools.partial(DemoHandler, directory=str(Path(__file__).resolve().parent / "web"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.api_key = api_key
    server.api_model = api_model
    server.slots = threading.BoundedSemaphore(2)
    return server


def checked_key(value):
    if not value or not value.isascii() or any(ord(char) < 33 or ord(char) > 126 for char in value):
        raise SystemExit("Check the API key and enter it again using visible characters without spaces.")
    return value


def key_for_session():
    value = os.environ.get("OPENAI_API_KEY")
    if value:
        return checked_key(value)
    if not sys.stdin.isatty():
        raise SystemExit("Run --chat in an interactive terminal, or set OPENAI_API_KEY for its process.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            value = getpass.getpass("OpenAI API key (hidden, this session only): ")
    except (getpass.GetPassWarning, EOFError, KeyboardInterrupt):
        raise SystemExit("Hidden key input was unavailable or cancelled.")
    if not value:
        raise SystemExit("No key entered. Run again when ready.")
    return checked_key(value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--chat", action="store_true", help="Enable tutor chat with your OpenAI API key")
    args = parser.parse_args()
    key = key_for_session() if args.chat else None
    model = os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL
    with create_server(args.port, key, model) as server:
        url = f"http://127.0.0.1:{server.server_port}/" + ("#queue" if args.chat else "")
        print("Engagement-to-Support Lab:", url, flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
