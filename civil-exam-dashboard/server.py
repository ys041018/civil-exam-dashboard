#!/usr/bin/env python3
"""Local dashboard server with shared JSON storage for LAN devices."""

from __future__ import annotations

import argparse
import json
import os
import socket
import tempfile
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


LOCK = threading.Lock()


def local_ipv4_addresses() -> list[str]:
    addresses: set[str] = set()
    try:
        hostname = socket.gethostname()
        for item in socket.getaddrinfo(hostname, None, family=socket.AF_INET):
            address = item[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            address = sock.getsockname()[0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass

    private_addresses = sorted(address for address in addresses if is_private_ipv4(address))
    return private_addresses


def is_private_ipv4(address: str) -> bool:
    try:
        parts = [int(part) for part in address.split(".")]
    except ValueError:
        return False
    if len(parts) != 4 or any(part < 0 or part > 255 for part in parts):
        return False
    if parts[0] == 10:
        return True
    if parts[0] == 192 and parts[1] == 168:
        return True
    if parts[0] == 172 and 16 <= parts[1] <= 31:
        return True
    return False


class DashboardHandler(SimpleHTTPRequestHandler):
    server_version = "CivilExamDashboard/1.0"

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    @property
    def state_path(self) -> Path:
        return Path(self.directory) / "data" / "state.json"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/state":
            try:
                with LOCK:
                    data = self.state_path.read_text(encoding="utf-8")
                self.send_json(json.loads(data))
            except FileNotFoundError:
                self.send_json({"exists": False})
            except (OSError, json.JSONDecodeError) as error:
                self.send_json({"message": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if path == "/api/info":
            host = self.server.server_address[0]
            lan_enabled = host not in {"127.0.0.1", "localhost", "::1"}
            addresses = local_ipv4_addresses() if lan_enabled else []
            port = self.server.server_address[1]
            self.send_json(
                {
                    "lanEnabled": lan_enabled,
                    "port": port,
                    "addresses": addresses,
                    "urls": [f"http://{address}:{port}/" for address in addresses],
                }
            )
            return

        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 10 * 1024 * 1024:
                raise ValueError("invalid request size")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("state must be a JSON object")

            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            serialized = json.dumps(payload, ensure_ascii=False, indent=2)
            with LOCK:
                with tempfile.NamedTemporaryFile(
                    "w",
                    encoding="utf-8",
                    dir=self.state_path.parent,
                    delete=False,
                ) as handle:
                    handle.write(serialized)
                    temp_name = handle.name
                os.replace(temp_name, self.state_path)
            self.send_json({"ok": True})
        except (ValueError, OSError, json.JSONDecodeError) as error:
            self.send_json({"message": str(error)}, HTTPStatus.BAD_REQUEST)

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Civil exam dashboard server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--directory", default=str(Path(__file__).resolve().parent))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    directory = str(Path(args.directory).resolve())
    handler = lambda *handler_args, **handler_kwargs: DashboardHandler(
        *handler_args,
        directory=directory,
        **handler_kwargs,
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Server running at http://127.0.0.1:{args.port}/")
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        for address in local_ipv4_addresses():
            print(f"Mobile access: http://{address}:{args.port}/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
