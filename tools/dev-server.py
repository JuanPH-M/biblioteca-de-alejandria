"""Servidor local sin caché para probar la app: python tools/dev-server.py  ->  http://localhost:5173"""
import http.server, functools, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=root)).serve_forever()
