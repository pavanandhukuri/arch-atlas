"""Database connection — connects to PostgreSQL via DATABASE_URL."""
import os


DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/sampledb")


async def connect_db() -> None:
    # In production: pool = await asyncpg.create_pool(DATABASE_URL)
    print(f"Connecting to database: {DATABASE_URL}")
