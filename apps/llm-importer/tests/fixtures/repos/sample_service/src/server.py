"""HTTP server — makes outgoing call to notification-service."""
import os
from typing import Any

import urllib.request
import json

NOTIFICATION_SERVICE_URL = os.environ.get(
    "NOTIFICATION_SERVICE_URL", "http://notification-service:4000"
)


def create_app(publisher: Any) -> dict:
    return {"publisher": publisher}


async def send_welcome_notification(user_id: str) -> None:
    """Calls notification-service via HTTP."""
    url = f"{NOTIFICATION_SERVICE_URL}/notify/welcome"
    payload = json.dumps({"userId": user_id}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Notification failed: {resp.status}")
