"""Entry point for sample_service fixture."""
import asyncio
from .db import connect_db
from .events import create_publisher
from .server import create_app


async def main() -> None:
    await connect_db()
    publisher = create_publisher()
    app = create_app(publisher)
    print(f"Server started: {app}")


if __name__ == "__main__":
    asyncio.run(main())
