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


def _send_html_email(
    to: str,
    subject: str,
    html: str,
    *,
    qr_data: str | None = None,
    attachment_bytes: bytes | None = None,
    attachment_filename: str | None = None,
    dev_summary: str = ""
) -> None:
    """Builds and sends a multipart/related email: multipart/alternative
    (plain-text fallback + HTML) plus inline images referenced by the HTML
    as cid:logo / cid:qr. qr_data, if given, is the string to encode as a QR
    and attach under cid:qr — omitted entirely for emails that don't need one.
    dev_summary is the human-readable payload logged in EMAIL_DEV_MODE."""
    if config.EMAIL_DEV_MODE:
        logger.info("EMAIL_DEV_MODE — not sending. to=%s subject=%r\n%s", to, subject, dev_summary)
        return

    if not config.EMAIL_SMTP_USER or not config.EMAIL_SMTP_PASSWORD:
        raise RuntimeError(
            "EMAIL_DEV_MODE is false but EMAIL_SMTP_USER/EMAIL_SMTP_PASSWORD are not set. "
            "Please configure EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD in your environment."
        )

    from_addr = config.EMAIL_FROM or config.EMAIL_SMTP_USER
    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = f"{config.EMAIL_FROM_NAME} <{from_addr}>"
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

    if attachment_bytes and attachment_filename:
        attachment = MIMEImage(attachment_bytes)
        attachment.add_header("Content-Disposition", "attachment", filename=attachment_filename)
        msg.attach(attachment)

    host, _, port = config.EMAIL_SMTP_URL.partition(":")
    port = int(port) if port else 587

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(config.EMAIL_SMTP_USER, config.EMAIL_SMTP_PASSWORD)
            server.sendmail(from_addr, [to], msg.as_string())

        logger.info("email sent to=%s subject=%r", to, subject)
    except smtplib.SMTPAuthenticationError:
        logger.error("SMTP authentication failed for user=%s. Please verify EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD (16-char App Password).", config.EMAIL_SMTP_USER)
        raise RuntimeError("Email delivery failed due to SMTP authentication error. Verify App Password.")
    except Exception as exc:
        logger.error("Failed to send email to=%s via %s: %s", to, config.EMAIL_SMTP_URL, exc)
        raise


def send_otp_email(to: str, otp_code: str, purpose: str = "signup") -> None:
    subject = "Your CyberCarnival login verification code" if purpose == "login" else "Your CyberCarnival verification code"
    html = render_template(
        "email/otp.html",
        otp_code=otp_code,
        purpose=purpose,
        ttl_minutes=config.OTP_TTL_SECONDS // 60,
    )
    _send_html_email(
        to, subject, html,
        dev_summary=f"Your CyberCarnival ({purpose}) OTP is: {otp_code}\nExpires in {config.OTP_TTL_SECONDS // 60} minutes.",
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
    recipient_email: str | None = None,
    college_name: str | None = None,
    event_name: str,
    registration_id: str,
    team_name: str | None = None,
    event_date: str | None = None,
    event_time: str | None = None,
    venue: str | None = None,
    fee: str | None = None,
    members: list[str] | None = None,
    ticket_token: str | None = None,
) -> None:
    token_query = f"&token={ticket_token}" if ticket_token else ""
    ticket_url = f"{config.SITE_URL}/ticket?id={registration_id}{token_query}"
    subject = f"🎉 Registration Confirmed — CyberCarnival 2026 | {event_name}"

    ticket_attachment_bytes = None
    ticket_filename = f"CyberCarnival_2026_Ticket_{registration_id}.png"
    try:
        from utils.ticket_gen import generate_ticket_attachment
        ticket_attachment_bytes = generate_ticket_attachment(
            recipient_name=recipient_name,
            event_name=event_name,
            registration_id=registration_id,
            venue=venue,
            event_date=event_date,
            event_time=event_time,
            team_name=team_name,
            ticket_url=ticket_url,
        )
    except Exception as exc:
        logger.warning("Could not generate ticket image attachment: %s", exc)

    html = render_template(
        "email/registration_confirmed.html",
        recipient_name=recipient_name,
        recipient_email=recipient_email or to,
        college_name=college_name or "SRM Institute of Science and Technology",
        event_name=event_name,
        registration_id=registration_id,
        team_name=team_name,
        event_date=event_date or "7 — 8 OCTOBER 2026",
        event_time=event_time or "09:00 AM ONWARDS",
        venue=venue or "SRM RAMAPURAM",
        fee=fee,
        members=members or [],
        ticket_url=ticket_url,
    )
    _send_html_email(
        to, subject, html,
        qr_data=ticket_url,
        attachment_bytes=ticket_attachment_bytes,
        attachment_filename=ticket_filename,
        dev_summary=(
            f"Hello {recipient_name},\n\n"
            f"Your registration for {event_name} has been approved.\n"
            f"Your payment has been verified successfully.\n\n"
            f"Registration ID: {registration_id}\n"
            f"Event: {event_name}\n"
            f"Status: CONFIRMED & VERIFIED\n\n"
            f"Ticket URL: {ticket_url}"
        ),
    )


def send_registration_rejection_email(
    to: str,
    *,
    recipient_name: str,
    event_name: str,
    registration_id: str,
    rejection_reason: str,
) -> None:
    subject = f"CyberCarnival – Event Registration Update | {event_name}"
    dev_summary = (
        f"Hello {recipient_name},\n\n"
        f"Your registration for {event_name} (ID: {registration_id}) was not approved and has been removed.\n"
        f"Reason: {rejection_reason}\n\n"
        "If you have questions, please contact the CyberCarnival team."
    )
    try:
        html = render_template(
            "email/registration_declined.html",
            recipient_name=recipient_name,
            event_name=event_name,
            registration_id=registration_id,
            rejection_reason=rejection_reason,
        )
        _send_html_email(to, subject, html, dev_summary=dev_summary)
    except Exception:
        logger.exception("Failed to send registration rejection email to %s", to)


def get_admin_notification_recipients() -> list[str]:
    """Returns the list of administrator email addresses to receive system notifications.
    Checks ADMIN_NOTIFICATION_EMAIL, ADMIN_GOOGLE_EMAIL, and database Admin accounts."""
    recipients = []

    raw_config_email = (
        getattr(config, "ADMIN_NOTIFICATION_EMAIL", None)
        or getattr(config, "ADMIN_GOOGLE_EMAIL", None)
        or "info.cybercarnival@gmail.com"
    )
    for email in str(raw_config_email).split(","):
        email = email.strip().lower()
        if email and email not in recipients:
            recipients.append(email)

    try:
        from models import Admin
        admin_rows = Admin.query.all()
        for admin in admin_rows:
            if hasattr(admin, "email") and admin.email:
                e = admin.email.strip().lower()
                if e and e not in recipients:
                    recipients.append(e)
    except Exception as exc:
        logger.warning("Could not query DB Admin table for email recipients: %s", exc)

    return recipients



def send_admin_new_registration_notification(
    registration_id: str,
    *,
    event_name: str,
    participant_name: str,
    participant_email: str,
    username: str,
    participant_mode: str = "individual",
    team_name: str | None = None,
    team_size: int = 1,
    members: list[str] | None = None,
    payment_status: str = "CONFIRMATION PENDING",
    fee: str | None = None,
    transaction_id: str | None = None,
) -> None:
    """Sends immediate email notification to CyberCarnival administrator(s) when a new registration is submitted."""
    recipients = get_admin_notification_recipients()
    if not recipients:
        logger.warning("No admin notification recipients configured. Skipping admin notification for registration %s.", registration_id)
        return

    subject = f"🔔 New Event Registration — CyberCarnival 2026 | {event_name}"
    admin_login_url = f"{config.SITE_URL}/admin/"

    try:
        html = render_template(
            "email/admin_new_registration.html",
            registration_id=registration_id,
            event_name=event_name,
            participant_name=participant_name,
            participant_email=participant_email,
            username=username,
            participant_mode=participant_mode,
            team_name=team_name,
            team_size=team_size,
            members=members or [],
            payment_status=payment_status,
            fee=fee or "Free / Pending",
            transaction_id=transaction_id,
            admin_login_url=admin_login_url,
            site_url=config.SITE_URL,
        )
    except Exception as exc:
        logger.exception("Failed to render admin_new_registration.html template: %s", exc)
        return

    dev_summary = (
        f"NEW EVENT REGISTRATION RECEIVED\n\n"
        f"Participant: {participant_name} ({participant_email}, @{username})\n"
        f"Event: {event_name}\n"
        f"Registration ID: {registration_id}\n"
        f"Mode: {participant_mode}"
        + (f" (Team: {team_name}, Size: {team_size})" if team_name else "")
        + f"\nFee: {fee}\n"
        f"Status: {payment_status}\n"
        f"Admin Link: {admin_login_url}"
    )

    for to in recipients:
        try:
            _send_html_email(
                to,
                subject,
                html,
                dev_summary=dev_summary,
            )
        except Exception:
            logger.exception("Failed to send admin registration notification to=%s for registration=%s", to, registration_id)

