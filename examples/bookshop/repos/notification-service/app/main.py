import asyncio
import os

import httpx
from fastapi import FastAPI

from app.events import bus
from app.mailer import send_confirmation

CATALOG_URL = os.environ.get("CATALOG_URL", "http://catalog-service:8081")

app = FastAPI(title="notification-service")


async def on_order_placed(event: dict) -> None:
    """When an order is placed, look up the book title and email a confirmation."""
    async with httpx.AsyncClient() as client:
        book = (await client.get(f"{CATALOG_URL}/books/{event['isbn']}")).json()
    send_confirmation(event["email"], book["title"], event["id"])


bus.subscribe("order.placed", on_order_placed)


@app.on_event("startup")
async def start_consuming() -> None:
    asyncio.create_task(bus.run())


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}
