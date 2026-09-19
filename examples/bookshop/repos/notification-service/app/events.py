"""A tiny event bus over Kafka, so handlers only deal with topics and payloads."""
import asyncio
import json
import os
from collections import defaultdict
from typing import Awaitable, Callable

from aiokafka import AIOKafkaConsumer

Handler = Callable[[dict], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, topic: str, handler: Handler) -> None:
        self._handlers[topic].append(handler)

    async def run(self) -> None:
        consumer = AIOKafkaConsumer(
            *self._handlers.keys(),
            bootstrap_servers=os.environ.get("KAFKA_BROKER", "kafka:9092"),
            group_id="notification-service",
        )
        await consumer.start()
        try:
            async for message in consumer:
                event = json.loads(message.value)
                await asyncio.gather(*(h(event) for h in self._handlers[message.topic]))
        finally:
            await consumer.stop()


bus = EventBus()
