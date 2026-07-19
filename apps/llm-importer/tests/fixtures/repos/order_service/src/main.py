"""order_service fixture — calls sample_service and uses a database."""
import os

SAMPLE_SERVICE_URL = os.environ.get("SAMPLE_SERVICE_URL", "http://sample-service:3000")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/orders")


async def create_order(user_id: str, items: list) -> dict:
    """Creates an order and notifies user-service via HTTP."""
    import urllib.request
    import json
    payload = json.dumps({"userId": user_id, "items": items}).encode()
    req = urllib.request.Request(
        f"{SAMPLE_SERVICE_URL}/users/{user_id}/notify",
        data=payload,
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    return result
