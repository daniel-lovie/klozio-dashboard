#!/usr/bin/env python3
"""A bearer-token gate in front of Ollama, so the tunnel can be public and Ollama cannot.

Ollama has no authentication of any kind. Whoever reaches the port runs models on the GPU, reads the
model list, and can pull or DELETE models. Publishing it through a Cloudflare tunnel therefore hands
a 121GB machine to the internet: verified on 2026-08-19, `https://ollama.klozio.io/api/tags` answered
200 to a request carrying deliberately bogus credentials.

Cloudflare Access with a service token is the better gate and it belongs in front of this one — it
rejects at Cloudflare's edge, so unauthorised traffic never reaches the house. This exists because it
holds even when Access is misconfigured, which is exactly the state that produced this file, and
because it is the layer WE control: an Access policy edited in a dashboard can be turned off without
anything in this repository noticing.

Layout after this lands:

    cloudflared  ->  127.0.0.1:11434  (this proxy, token required)  ->  127.0.0.1:11435  (Ollama)
    factory_worker / text_engine     ->  127.0.0.1:11435 direct, no token, loopback only

The local pipeline talks straight to Ollama and is unaffected by anything here; only the path that
comes in from the internet is gated. The token lives in ~/.ollama/proxy_token (0600) — never in the
unit file, which is world-readable.
"""
from __future__ import annotations

import hmac
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN = ("127.0.0.1", int(os.environ.get("PROXY_PORT", "11434")))
UPSTREAM = os.environ.get("PROXY_UPSTREAM", "http://127.0.0.1:11435")
TOKEN_FILE = os.path.expanduser(os.environ.get("PROXY_TOKEN_FILE", "~/.ollama/proxy_token"))

# A cold Qwen load is ~115s and a long generation runs past three minutes; a stingy timeout here would
# read as "the local model is unreliable" when it is only slow.
READ_TIMEOUT = 600

# Two different filters, and conflating them is a real bug rather than untidiness. On the way IN,
# Host and Content-Length describe the hop we are replacing and urllib recomputes both. On the way
# OUT, Content-Length is the only thing telling the client where the body ends: stripping it leaves a
# keep-alive HTTP/1.1 response with no length and no chunked framing, so the client reads until the
# connection closes — which never happens. curl tolerated it, Next's fetch (undici) hung for thirty
# seconds and reported the Spark as unreachable. Date and Server are dropped because send_response
# writes its own and duplicates are the kind of thing a strict client is entitled to reject.
REQ_STRIP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
             "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length"}
RESP_STRIP = {"connection", "keep-alive", "proxy-authenticate", "te", "trailers",
              "transfer-encoding", "upgrade", "date", "server"}

try:
    TOKEN = open(TOKEN_FILE).read().strip()
except OSError as e:
    sys.exit(f"token okunamadi ({TOKEN_FILE}): {e}")
if len(TOKEN) < 32:
    sys.exit("token cok kisa — en az 32 karakter olmali")


class Gate(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "klozio-gate"

    def log_message(self, fmt, *a):  # journald already timestamps every line
        sys.stderr.write(f"{fmt % a}\n")

    def _authorised(self) -> bool:
        got = self.headers.get("Authorization", "")
        if not got.lower().startswith("bearer "):
            return False
        # compare_digest, not ==: a plain comparison leaks the token one character at a time to
        # anyone willing to time a few thousand requests.
        return hmac.compare_digest(got[7:].strip(), TOKEN)

    def _deny(self):
        who = self.headers.get("CF-Connecting-IP") or self.client_address[0]
        self.log_message(f"401 {self.command} {self.path} from {who}")
        body = b'{"error":"unauthorized"}'
        self.send_response(401)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _relay(self):
        if not self._authorised():
            return self._deny()

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(UPSTREAM + self.path, data=body, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in REQ_STRIP and k.lower() != "authorization":
                req.add_header(k, v)

        try:
            up = urllib.request.urlopen(req, timeout=READ_TIMEOUT)
        except urllib.error.HTTPError as e:      # a 4xx/5xx from Ollama is a real answer, pass it on
            up = e
        except Exception as e:
            msg = str(e)[:200].encode()
            self.send_response(502)
            self.send_header("content-type", "text/plain")
            self.send_header("content-length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return

        self.send_response(up.status)
        for k, v in up.headers.items():
            if k.lower() not in RESP_STRIP:
                self.send_header(k, v)
        # Streamed chat arrives as NDJSON with no content-length, so the response has to be chunked
        # back out; buffering it whole would turn a live stream into a four-minute silence.
        chunked = not up.headers.get("Content-Length")
        if chunked:
            self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        try:
            while True:
                buf = up.read(8192)
                if not buf:
                    break
                if chunked:
                    self.wfile.write(b"%x\r\n" % len(buf) + buf + b"\r\n")
                else:
                    self.wfile.write(buf)
                self.wfile.flush()
            if chunked:
                self.wfile.write(b"0\r\n\r\n")
        except (BrokenPipeError, ConnectionResetError):
            pass                                  # the client hung up mid-stream; nothing to repair
        finally:
            up.close()

    do_GET = do_POST = do_PUT = do_DELETE = do_HEAD = _relay


if __name__ == "__main__":
    srv = ThreadingHTTPServer(LISTEN, Gate)
    srv.daemon_threads = True
    print(f"gate {LISTEN[0]}:{LISTEN[1]} -> {UPSTREAM}", flush=True)
    srv.serve_forever()
