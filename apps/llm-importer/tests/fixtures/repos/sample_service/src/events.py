"""AMQP publisher — publishes user-created events to RabbitMQ."""
import os
from typing import Any


AMQP_URL = os.environ.get("AMQP_URL", "amqp://localhost:5672")


def create_publisher() -> Any:
    # In production: connection = await aio_pika.connect_robust(AMQP_URL)
    print(f"Connecting to message broker: {AMQP_URL}")
    return {"url": AMQP_URL}


async def publish_event(publisher: Any, event: str, data: dict) -> None:
    print(f"Publishing {event} to {publisher['url']}: {data}")
