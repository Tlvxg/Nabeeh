"""Vercel serverless function — AI assistant health check."""

import json
import os
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        configured = bool(os.environ.get("OPENROUTER_API_KEY", ""))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({
            "configured": configured,
            "model": "deepseek/deepseek-v4-pro",
        }).encode())
