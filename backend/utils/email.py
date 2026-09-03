"""
Sends every CyberCarnival email (OTP, account credentials, event registration
confirmation) as an HTML ticket-card, over SMTP (Gmail app password, per
.env). When EMAIL_DEV_MODE=true (the default until real SMTP creds are set),
nothing is sent over the network — the rendered HTML is written to the app
log instead, so every flow can be exercised end-to-end with no email account
configured.
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from pathlib import Path

from flask import render_template

import config
from utils.logger import get_logger
from utils.qrcode_gen import generate_qr_png

logger = get_logger("email")

LOGO_PATH = Path(config.BASE_DIR) / "static" / "email-logo.png"


def _send_html_email(to: str, subject: str, html: str, *, qr_data: str | None = None, dev_summary: str = "") -> None:
    """Builds and sends a multipart/related email: multipart/alternative
    (plain-text fallback + HTML) plus inline images referenced by the HTML
    as cid:logo / cid:qr. qr_data, if given, is the string to encode as a QR
    and attach under cid:qr — omitted entirely for emails that don't need one.
    dev_summary is the human-readable payload (OTP code, credentials, ticket
    link) logged in EMAIL_DEV_MODE — the whole point of dev mode is being able
    to complete these flows locally without real SMTP, so the actual value
    has to be visible in the log, not just "N chars of HTML rendered"."""
    if config.EMAIL_DEV_MODE:
        logger.info("EMAIL_DEV_MODE — not sending. to=%s subject=%r\n%s", to, subject, dev_summary)
        return

    if not config.EMAIL_SMTP_USER or not config.EMAIL_SMTP_PASSWORD:
        raise RuntimeError(
            "EMAIL_DEV_MODE is false but EMAIL_SMTP_USER/EMAIL_SMTP_PASSWORD are not set."
        )

    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = f"{config.EMAIL_FROM_NAME} <{config.EMAIL_FROM}>"
    msg["To"] = to

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText("This email contains HTML content — please view it in an HTML-capable email client.", "plain", "utf-8"))
    alt.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(alt)

    if LOGO_PATH.exists():
        with open(LOGO_PATH, "rb") as f:
            logo = MIMEImage(f.read())
        logo.add_header("Content-ID", "<logo>")
        logo.add_header("Content-Disposition", "inline", filename="cybercarnival-logo.png")
        msg.attach(logo)
    else:
        logger.warning("email logo missing at %s — sending without it", LOGO_PATH)

    if qr_data:
        qr = MIMEImage(generate_qr_png(qr_data))
        qr.add_header("Content-ID", "<qr>")
        qr.add_header("Content-Disposition", "inline", filename="ticket-qr.png")
        msg.attach(qr)

    host, _, port = config.EMAIL_SMTP_URL.partition(":")
    port = int(port) if port else 587

    with smtplib.SMTP(host, port, timeout=10) as server:
        server.starttls()
        server.login(config.EMAIL_SMTP_USER, config.EMAIL_SMTP_PASSWORD)
        server.sendmail(config.EMAIL_FROM, [to], msg.as_string())

    logger.info("email sent to=%s subject=%r", to, subject)


def send_otp_email(to: str, otp_code: str) -> None:
    html = render_template(
        "email/otp.html",
        otp_code=otp_code,
        ttl_minutes=config.OTP_TTL_SECONDS // 60,
    )
    _send_html_email(
        to, "Your CyberCarnival verification code", html,
        dev_summary=f"Your CyberCarnival OTP is: {otp_code}\nExpires in {config.OTP_TTL_SECONDS // 60} minutes.",
    )


def send_google_signup_token_email(to: str, token: str) -> None:
    """Sent once, right when a brand-new account is created via Google
    sign-in — there's no password to hand over (Google handles auth), just
    the participant token, which is the one thing they can't get from
    Google itself and need for teammates to add them to a team."""
    html = render_template(
        "email/google_token.html",
        token=token,
        site_url=config.SITE_URL,
    )
    _send_html_email(
        to, "Your CyberCarnival token", html,
        dev_summary=f"You're in! Your CyberCarnival token: {token}",
    )


def send_credentials_email(to: str, token: str, username: str, temp_password: str) -> None:
    html = render_template(
        "email/credentials.html",
        token=token,
        username=username,
        temp_password=temp_password,
        site_url=config.SITE_URL,
    )
    _send_html_email(
        to, "Your CyberCarnival account is ready", html,
        dev_summary=(
            "You're verified! Here are your CyberCarnival credentials:\n\n"
            f"CyberCarnival Token: {token}\n"
            f"Username: {username}\n"
            f"Temporary password: {temp_password}"
        ),
    )


def send_registration_confirmation_email(
    to: str,
    *,
    recipient_name: str,
    event_name: str,
    registration_id: str,
    team_name: str | None = None,
    event_date: str | None = None,
    event_time: str | None = None,
    venue: str | None = None,
    fee: str | None = None,
    members: list[str] | None = None,
) -> None:
    ticket_url = f"{config.SITE_URL}/ticket?id={registration_id}"
    html = render_template(
        "email/registration_confirmed.html",
        recipient_name=recipient_name,
        event_name=event_name,
        team_name=team_name,
        event_date=event_date,
        event_time=event_time,
        venue=venue,
        fee=fee,
        members=members or [],
        ticket_url=ticket_url,
    )
    _send_html_email(
        to, f"Registration confirmed — {event_name}", html, qr_data=ticket_url,
        dev_summary=(
            f"Hey {recipient_name}, your registration for {event_name} is confirmed.\n"
            f"Team: {team_name or '(solo)'}\nTicket URL (also encoded in the QR): {ticket_url}"
        ),
    )
