"""Serve the offline demonstration locally using only the Python standard library."""
import argparse
import functools
import http.server
import webbrowser
from pathlib import Path

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true');args=parser.parse_args()
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(Path(__file__).parent/'web'))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),handler)
    url=f'http://127.0.0.1:{args.port}'
    print('Engagement-to-Support Lab:',url,flush=True)
    if not args.no_browser:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
