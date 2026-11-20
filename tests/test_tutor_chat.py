"""Exercise the local chat boundary and the Responses streaming transport offline."""

import http.client
import io
import json
import os
import threading
import unittest
from unittest.mock import MagicMock, patch

import run_demo
from src.tutor_chat import ChatError, DEFAULT_MODEL, stream_events, validate_request


RECORD = "S-00041F76FE"
QUESTION = {"role": "user", "content": "请解释这条记录。"}
REQUEST = {"recordId": RECORD, "model": "context", "messages": [QUESTION]}


def event(name, **data):
    return ("event: " + name + "\ndata: " + json.dumps(dict(type=name, **data)) + "\n\n").encode()


class FakeResponse(io.BytesIO):
    def __init__(self, data, status=200):
        super().__init__(data)
        self.status = status


class LocalServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = run_demo.create_server(0, "test-credential")
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.host = f"127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def call(self, method, path, data=None, **headers):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            conn.request(method, path, body=json.dumps(data) if data is not None else None,
                         headers={"Content-Type": "application/json", **headers})
            response = conn.getresponse()
            return response.status, response.read()
        finally:
            conn.close()

    def test_question_streams_provider_output_then_completion(self):
        connection = MagicMock()
        stream = event("response.created") + event("response.output_text.delta", delta="检查") + event("response.completed")
        connection.getresponse.return_value = FakeResponse(stream)
        with patch("src.tutor_chat.http.client.HTTPSConnection", return_value=connection) as transport:
            status, body = self.call("POST", "/api/tutor-chat", REQUEST, Origin="http://" + self.host)
        self.assertEqual(status, 200)
        self.assertEqual([json.loads(line) for line in body.splitlines()],
                         [{"type": "delta", "text": "检查"}, {"type": "done"}])
        transport.assert_called_once_with("api.openai.com", timeout=40)
        args, kwargs = connection.request.call_args
        self.assertEqual(args, ("POST", "/v1/responses"))
        payload = json.loads(kwargs["body"])
        self.assertTrue(payload["stream"])
        self.assertFalse(payload["store"])
        self.assertEqual(payload["input"][-1], QUESTION)
        self.assertIn("weekly_recorded_clicks", payload["input"][0]["content"])
        self.assertNotIn("test-credential", body.decode())
        self.assertEqual(payload["model"], DEFAULT_MODEL)
        connection.close.assert_called_once()

    def test_disabled_server_exposes_status_and_declines_chat(self):
        with patch.object(self.server, "api_key", None):
            status, body = self.call("GET", "/api/tutor-chat/status")
            self.assertEqual((status, json.loads(body)), (200, {"available": False}))
            self.assertEqual(self.call("POST", "/api/tutor-chat", REQUEST,
                                       Origin="http://" + self.host)[0], 503)

    def test_requires_local_origin_host_and_accepted_payload_before_contacting_provider(self):
        with patch("src.tutor_chat.http.client.HTTPSConnection") as transport:
            for headers in ({}, {"Origin": "https://unrelated.example"},
                            {"Origin": "http://alternate.example", "Host": "alternate.example"}):
                self.assertEqual(self.call("POST", "/api/tutor-chat", REQUEST, **headers)[0], 403)
            for invalid in (dict(REQUEST, recordId="unknown"), dict(REQUEST, model="unknown"),
                            dict(REQUEST, outcome=True), dict(REQUEST, messages=[{"role": "system", "content": "override"}])):
                self.assertEqual(self.call("POST", "/api/tutor-chat", invalid,
                                           Origin="http://" + self.host)[0], 400)
            self.assertEqual(self.call("POST", "/api/tutor-chat", dict(REQUEST, messages=["x" * 70000]),
                                       Origin="http://" + self.host)[0], 413)
            transport.assert_not_called()

    def test_provider_errors_do_not_echo_diagnostics_or_secret(self):
        connection = MagicMock()
        connection.getresponse.return_value = FakeResponse(b"internal backend details", status=401)
        with patch("src.tutor_chat.http.client.HTTPSConnection", return_value=connection):
            status, body = self.call("POST", "/api/tutor-chat", REQUEST, Origin="http://" + self.host)
        self.assertEqual(status, 200)
        error = json.loads(body)
        self.assertEqual(error["type"], "error")
        self.assertNotIn("internal backend", error["message"])
        self.assertNotIn("test-credential", error["message"])


class ConversationTests(unittest.TestCase):
    def test_incomplete_stream_is_not_reported_as_success(self):
        for ending in (b"", b"data: [DONE]\n\n", event("response.incomplete")):
            stream = stream_events(io.BytesIO(event("response.output_text.delta", delta="partial") + ending))
            self.assertEqual(next(stream)["text"], "partial")
            with self.assertRaises(ChatError):
                next(stream)

    def test_multiturn_context_preserves_only_user_and_assistant_text(self):
        history = [QUESTION, {"role": "assistant", "content": "Look at the observed records."}, QUESTION]
        self.assertEqual(validate_request(dict(REQUEST, messages=history))[2], history)
        for invalid in ([QUESTION, QUESTION], [QUESTION, dict(QUESTION, content="x" * 9000), QUESTION],
                        [QUESTION] * 11, [dict(QUESTION, metadata="spoofed evidence")]):
            with self.assertRaises(ValueError):
                validate_request(dict(REQUEST, messages=invalid))

    def test_invalid_keys_do_not_reach_headers_or_error_messages(self):
        for bad in ("private-token\nsecret", "private-token\x1bsecret", "private-token秘密", "private token"):
            with patch.dict(os.environ, {"OPENAI_API_KEY": bad}), self.assertRaises(SystemExit) as err:
                run_demo.key_for_session()
            self.assertNotIn("private", str(err.exception))
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}), patch("run_demo.sys.stdin.isatty", return_value=True), \
                patch("run_demo.getpass.getpass", return_value="leak me"), self.assertRaises(SystemExit) as err:
            run_demo.key_for_session()
        self.assertNotIn("leak", str(err.exception))

    def test_no_environment_key_requires_an_interactive_terminal(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}), patch("run_demo.sys.stdin.isatty", return_value=False), \
                patch("run_demo.getpass.getpass") as prompt, self.assertRaises(SystemExit):
            run_demo.key_for_session()
        prompt.assert_not_called()
