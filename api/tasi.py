"""Vercel serverless function — TASI index data via Yahoo Finance."""

import json
import urllib.request
from http.server import BaseHTTPRequestHandler


YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5ETASI.SR?range=1d&interval=1d"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            req = urllib.request.Request(
                YAHOO_URL,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())

            meta = data["chart"]["result"][0]["meta"]
            price = meta.get("regularMarketPrice", 0)
            prev_close = meta.get("chartPreviousClose") or meta.get("previousClose", 0)
            change = round(price - prev_close, 2) if prev_close else 0
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

            result = {
                "value": price,
                "change": change,
                "change_percent": change_pct,
                "volume": meta.get("regularMarketVolume", 0),
                "trades": None,
                "day_high": meta.get("regularMarketDayHigh"),
                "day_low": meta.get("regularMarketDayLow"),
                "prev_close": prev_close,
                "last_updated": meta.get("regularMarketTime", ""),
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "public, max-age=300")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
