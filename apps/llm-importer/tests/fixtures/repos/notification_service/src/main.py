"""notification_service fixture — sends emails via SendGrid and publishes to Kafka."""
import os

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")


async def send_notification(user_id: str, message: str) -> None:
    """Sends email via SendGrid HTTP API and publishes event to Kafka."""
    import urllib.request
    import json
    # Call SendGrid API
    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps({"to": user_id, "body": message}).encode(),
        headers={"Authorization": f"Bearer {SENDGRID_API_KEY}"},
    )
    with urllib.request.urlopen(req):
        pass
