import os

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


def send_confirmation(to: str, title: str, order_id: str) -> None:
    """Email the customer their order confirmation through SendGrid."""
    message = Mail(
        from_email="orders@bookshop.example",
        to_emails=to,
        subject=f"Your order {order_id}",
        plain_text_content=f"Thanks for ordering {title}!",
    )
    SendGridAPIClient(os.environ["SENDGRID_API_KEY"]).send(message)
