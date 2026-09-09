"""
CyberCarnival email delivery.

Every participant/admin email is rendered with the same CyberCarnival
ticket-card visual language. SMTP delivery is controlled by config.py.

EMAIL_DEV_MODE=true:
    No network email is sent; a summary is logged.

EMAIL_DEV_MODE=false:
    Gmail/SMTP credentials are used and the HTML card is sent.
"""

from __future__ import annotations

import html as html_lib
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Iterable

import config
from utils.logger import get_logger
from utils.qrcode_gen import generate_qr_png

logger = get_logger("email")

LOGO_PATH = Path(config.BASE_DIR) / "static" / "email-logo.png"


# ---------------------------------------------------------------------------
# Core SMTP delivery
# ---------------------------------------------------------------------------

def _send_html_email(
    to: str,
    subject: str,
    html: str,
    *,
    qr_data: str | None = None,
    attachment_bytes: bytes | None = None,
    attachment_filename: str | None = None,
    dev_summary: str = "",
) -> None:
    if config.EMAIL_DEV_MODE:
        logger.info(
            "EMAIL_DEV_MODE — not sending. to=%s subject=%r\n%s",
            to,
            subject,
            dev_summary,
        )
        return

    if not config.EMAIL_SMTP_USER or not config.EMAIL_SMTP_PASSWORD:
        raise RuntimeError(
            "EMAIL_DEV_MODE is false but EMAIL_SMTP_USER / "
            "EMAIL_SMTP_PASSWORD are not configured."
        )

    from_addr = config.EMAIL_FROM or config.EMAIL_SMTP_USER

    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = f"{config.EMAIL_FROM_NAME} <{from_addr}>"
    msg["To"] = to

    alternative = MIMEMultipart("alternative")
    alternative.attach(
        MIMEText(
            "CyberCarnival notification. Please open this message in an "
            "HTML-capable email client.",
            "plain",
            "utf-8",
        )
    )
    alternative.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(alternative)

    if LOGO_PATH.exists():
        with LOGO_PATH.open("rb") as f:
            logo = MIMEImage(f.read())
        logo.add_header("Content-ID", "<logo>")
        logo.add_header(
            "Content-Disposition",
            "inline",
            filename="cybercarnival-logo.png",
        )
        msg.attach(logo)
    else:
        logger.warning(
            "email logo missing at %s — sending card without inline logo",
            LOGO_PATH,
        )

    if qr_data:
        qr = MIMEImage(generate_qr_png(qr_data))
        qr.add_header("Content-ID", "<qr>")
        qr.add_header(
            "Content-Disposition",
            "inline",
            filename="ticket-qr.png",
        )
        msg.attach(qr)

    if attachment_bytes and attachment_filename:
        attachment = MIMEImage(attachment_bytes)
        attachment.add_header(
            "Content-Disposition",
            "attachment",
            filename=attachment_filename,
        )
        msg.attach(attachment)

    host, _, port = config.EMAIL_SMTP_URL.partition(":")
    port = int(port) if port else 587

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(
                config.EMAIL_SMTP_USER,
                config.EMAIL_SMTP_PASSWORD,
            )
            server.sendmail(
                from_addr,
                [to],
                msg.as_string(),
            )

        logger.info(
            "email sent to=%s subject=%r",
            to,
            subject,
        )

    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed for user=%s",
            config.EMAIL_SMTP_USER,
        )
        raise RuntimeError(
            "Email delivery failed due to SMTP authentication error."
        )

    except Exception as exc:
        logger.error(
            "Failed to send email to=%s via %s: %s",
            to,
            config.EMAIL_SMTP_URL,
            exc,
        )
        raise


# ---------------------------------------------------------------------------
# Shared CyberCarnival card renderer
# ---------------------------------------------------------------------------

def _e(value) -> str:
    if value is None:
        return ""
    return html_lib.escape(str(value), quote=True)


def _rows_html(rows: Iterable[tuple[str, object]]) -> str:
    output = []

    for label, value in rows:
        if value is None or str(value).strip() == "":
            continue

        output.append(
            f"""
            <tr>
              <td style="
                padding:10px 12px;
                border-bottom:1px solid #2b1d3f;
                color:#a998bd;
                font-size:11px;
                letter-spacing:1.2px;
                text-transform:uppercase;
                width:38%;
              ">{_e(label)}</td>
              <td style="
                padding:10px 12px;
                border-bottom:1px solid #2b1d3f;
                color:#f5efff;
                font-size:13px;
                font-weight:700;
                word-break:break-word;
              ">{_e(value)}</td>
            </tr>
            """
        )

    return "".join(output)


def _list_html(items: Iterable[object] | None) -> str:
    clean_items = [
        str(item).strip()
        for item in (items or [])
        if str(item).strip()
    ]

    if not clean_items:
        return ""

    lis = "".join(
        f"""
        <li style="
          margin:0 0 7px 0;
          color:#d9cceb;
          font-size:12px;
          line-height:1.55;
        ">{_e(item)}</li>
        """
        for item in clean_items
    )

    return f"""
      <div style="
        margin-top:18px;
        padding:16px 18px;
        border:1px solid #3a2455;
        background:#100b18;
        border-radius:10px;
      ">
        <div style="
          margin-bottom:10px;
          color:#b16cff;
          font-size:10px;
          font-weight:800;
          letter-spacing:2px;
          text-transform:uppercase;
        ">Team / Details</div>
        <ul style="margin:0;padding-left:18px;">{lis}</ul>
      </div>
    """


def _render_card(
    *,
    eyebrow: str,
    title: str,
    message: str,
    status: str | None = None,
    status_color: str = "#a855f7",
    rows: Iterable[tuple[str, object]] = (),
    list_items: Iterable[object] | None = None,
    code_value: str | None = None,
    button_text: str | None = None,
    button_url: str | None = None,
    show_qr: bool = False,
    footer_note: str | None = None,
) -> str:
    logo_html = """
      <img
        src="cid:logo"
        alt="CyberCarnival"
        width="150"
        style="
          display:block;
          max-width:150px;
          height:auto;
          margin:0 auto;
          border:0;
        "
      />
    """ if LOGO_PATH.exists() else """
      <div style="
        color:#f5efff;
        font-size:24px;
        font-weight:900;
        letter-spacing:2px;
        text-align:center;
      ">CYBERCARNIVAL 2026</div>
    """

    status_html = ""
    if status:
        status_html = f"""
        <div style="text-align:center;margin:18px 0 4px;">
          <span style="
            display:inline-block;
            padding:8px 14px;
            border:1px solid {_e(status_color)};
            border-radius:999px;
            color:{_e(status_color)};
            background:#0e0915;
            font-size:10px;
            font-weight:900;
            letter-spacing:1.5px;
            text-transform:uppercase;
          ">{_e(status)}</span>
        </div>
        """

    code_html = ""
    if code_value:
        code_html = f"""
        <div style="
          margin:22px 0;
          padding:18px 16px;
          border:1px solid #8b5cf6;
          border-radius:10px;
          background:#12091f;
          text-align:center;
        ">
          <div style="
            color:#9a84ad;
            font-size:9px;
            letter-spacing:2px;
            text-transform:uppercase;
            margin-bottom:8px;
          ">Secure Code</div>
          <div style="
            color:#ffffff;
            font-size:28px;
            font-weight:900;
            letter-spacing:7px;
          ">{_e(code_value)}</div>
        </div>
        """

    details_html = ""
    rows_rendered = _rows_html(rows)
    if rows_rendered:
        details_html = f"""
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          style="
            margin-top:20px;
            border:1px solid #332147;
            border-radius:10px;
            border-collapse:separate;
            border-spacing:0;
            overflow:hidden;
            background:#0d0912;
          "
        >
          {rows_rendered}
        </table>
        """

    qr_html = ""
    if show_qr:
        qr_html = """
        <div style="
          margin-top:22px;
          padding:18px;
          border:1px solid #3b2752;
          border-radius:10px;
          background:#ffffff;
          text-align:center;
        ">
          <img
            src="cid:qr"
            alt="CyberCarnival attendance ticket QR"
            width="190"
            height="190"
            style="display:block;margin:0 auto;width:190px;height:190px;"
          />
        </div>
        <div style="
          margin-top:8px;
          color:#9f8ab3;
          font-size:10px;
          text-align:center;
          letter-spacing:1px;
        ">
          PRESENT THIS QR AT THE EVENT CHECK-IN DESK
        </div>
        """

    button_html = ""
    if button_text and button_url:
        button_html = f"""
        <div style="text-align:center;margin-top:24px;">
          <a
            href="{_e(button_url)}"
            style="
              display:inline-block;
              padding:13px 22px;
              border-radius:6px;
              background:#8b5cf6;
              color:#ffffff;
              text-decoration:none;
              font-size:11px;
              font-weight:900;
              letter-spacing:1.5px;
              text-transform:uppercase;
            "
          >{_e(button_text)} &nbsp;→</a>
        </div>
        """

    footer = footer_note or (
        "This is an automated CyberCarnival 2026 message. "
        "Please keep this email for reference."
    )

    return f"""<!doctype html>
<html>
  <body style="
    margin:0;
    padding:0;
    background:#050308;
    font-family:Arial,Helvetica,sans-serif;
    color:#f7f0ff;
  ">
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      style="background:#050308;padding:28px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            style="
              max-width:620px;
              border:1px solid #593181;
              border-radius:14px;
              background:#09060d;
              box-shadow:0 0 30px rgba(139,92,246,.16);
              overflow:hidden;
            "
          >
            <tr>
              <td style="
                height:4px;
                line-height:4px;
                background:#8b5cf6;
                font-size:0;
              ">&nbsp;</td>
            </tr>

            <tr>
              <td style="padding:28px 28px 10px;text-align:center;">
                {logo_html}
              </td>
            </tr>

            <tr>
              <td style="padding:4px 28px 30px;">
                <div style="
                  color:#a855f7;
                  font-size:9px;
                  font-weight:900;
                  letter-spacing:3px;
                  text-transform:uppercase;
                  text-align:center;
                ">{_e(eyebrow)}</div>

                <h1 style="
                  margin:12px 0 8px;
                  color:#ffffff;
                  font-size:25px;
                  line-height:1.2;
                  text-align:center;
                  text-transform:uppercase;
                ">{_e(title)}</h1>

                <p style="
                  margin:0 auto;
                  max-width:500px;
                  color:#c8b8d8;
                  font-size:13px;
                  line-height:1.7;
                  text-align:center;
                ">{_e(message)}</p>

                {status_html}
                {code_html}
                {details_html}
                {_list_html(list_items)}
                {qr_html}
                {button_html}

                <div style="
                  margin-top:28px;
                  padding-top:18px;
                  border-top:1px solid #251633;
                  color:#776886;
                  font-size:9px;
                  line-height:1.6;
                  letter-spacing:.5px;
                  text-align:center;
                ">
                  {_e(footer)}
                  <br/>
                  CYBERCARNIVAL 2026 · SRM RAMAPURAM
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _ticket_url(
    registration_id: str,
    ticket_token: str | None,
) -> str:
    token_query = (
        f"&token={ticket_token}"
        if ticket_token
        else ""
    )

    return (
        f"{config.SITE_URL.rstrip('/')}/ticket"
        f"?id={registration_id}{token_query}"
    )


def _generate_ticket_attachment(
    *,
    recipient_name: str,
    event_name: str,
    registration_id: str,
    venue: str | None,
    event_date: str | None,
    event_time: str | None,
    team_name: str | None,
    ticket_url: str,
) -> bytes | None:
    try:
        from utils.ticket_gen import generate_ticket_attachment

        return generate_ticket_attachment(
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
        logger.warning(
            "Could not generate ticket image attachment: %s",
            exc,
        )
        return None


# ---------------------------------------------------------------------------
# Account / authentication emails
# ---------------------------------------------------------------------------

def send_otp_email(
    to: str,
    otp_code: str,
    purpose: str = "signup",
) -> None:
    is_login = purpose == "login"

    html = _render_card(
        eyebrow="SECURITY VERIFICATION",
        title=(
            "LOGIN VERIFICATION"
            if is_login
            else "VERIFY YOUR EMAIL"
        ),
        message=(
            "Use the secure code below to continue signing in."
            if is_login
            else "Use the secure code below to verify your email and create your CyberCarnival account."
        ),
        status="ONE-TIME CODE",
        code_value=otp_code,
        rows=[
            (
                "Expires In",
                f"{config.OTP_TTL_SECONDS // 60} minutes",
            ),
        ],
        footer_note=(
            "Never share this verification code with anyone. "
            "CyberCarnival staff will never ask for your OTP."
        ),
    )

    subject = (
        "CyberCarnival login verification code"
        if is_login
        else "Verify your CyberCarnival account"
    )

    _send_html_email(
        to,
        subject,
        html,
        dev_summary=(
            f"CyberCarnival {purpose} OTP: {otp_code}\n"
            f"Expires in {config.OTP_TTL_SECONDS // 60} minutes."
        ),
    )


def send_google_signup_token_email(
    to: str,
    token: str,
) -> None:
    html = _render_card(
        eyebrow="ACCOUNT CREATED",
        title="WELCOME TO CYBERCARNIVAL",
        message=(
            "Your Google account has been verified and your CyberCarnival "
            "participant profile has been created successfully."
        ),
        status="ACCOUNT ACTIVE",
        status_color="#34d399",
        rows=[
            ("Email", to),
            ("CyberCarnival Token", token),
            ("Sign-in Method", "Google"),
        ],
        button_text="OPEN CYBERCARNIVAL",
        button_url=config.SITE_URL,
        footer_note=(
            "Keep your CyberCarnival token safe. Teammates may use this "
            "token when adding you to a team registration."
        ),
    )

    _send_html_email(
        to,
        "Your CyberCarnival account is ready",
        html,
        dev_summary=(
            "Google signup completed.\n"
            f"CyberCarnival Token: {token}"
        ),
    )


def send_credentials_email(
    to: str,
    token: str,
    username: str,
    temp_password: str,
) -> None:
    html = _render_card(
        eyebrow="ACCOUNT CREATED",
        title="WELCOME TO CYBERCARNIVAL",
        message=(
            "Your email has been verified and your CyberCarnival account "
            "is ready."
        ),
        status="ACCOUNT ACTIVE",
        status_color="#34d399",
        rows=[
            ("Email", to),
            ("CyberCarnival Token", token),
            ("Username", username),
            ("Temporary Password", temp_password),
        ],
        button_text="LOGIN TO CYBERCARNIVAL",
        button_url=f"{config.SITE_URL.rstrip('/')}/login",
        footer_note=(
            "Keep these credentials private. Your CyberCarnival token is "
            "used when teammates add you to team events."
        ),
    )

    _send_html_email(
        to,
        "Your CyberCarnival account is ready",
        html,
        dev_summary=(
            f"CyberCarnival Token: {token}\n"
            f"Username: {username}\n"
            f"Temporary password: {temp_password}"
        ),
    )


# ---------------------------------------------------------------------------
# Registration lifecycle emails
# ---------------------------------------------------------------------------

def send_registration_pending_email(
    to: str,
    *,
    recipient_name: str,
    event_name: str,
    registration_id: str,
    team_name: str | None = None,
    event_date: str | None = None,
    event_time: str | None = None,
    venue: str | None = None,
    transaction_id: str | None = None,
) -> None:
    html = _render_card(
        eyebrow="REGISTRATION RECEIVED",
        title="CONFIRMATION PENDING",
        message=(
            f"Hi {recipient_name}, your payment details for {event_name} "
            "have been submitted successfully. The registration is now "
            "waiting for administrator verification."
        ),
        status="UNDER ADMIN REVIEW",
        status_color="#fbbf24",
        rows=[
            ("Event", event_name),
            ("Registration ID", registration_id),
            ("Team", team_name),
            ("Date", event_date),
            ("Time", event_time),
            ("Venue", venue),
            ("Transaction ID", transaction_id),
        ],
        button_text="VIEW MY EVENTS",
        button_url=f"{config.SITE_URL.rstrip('/')}/dashboard",
        footer_note=(
            "You will receive another email as soon as your registration "
            "is approved or rejected."
        ),
    )

    _send_html_email(
        to,
        f"Registration under review — {event_name}",
        html,
        dev_summary=(
            f"Registration {registration_id} for {event_name} is pending "
            "administrator verification."
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
    ticket_url = _ticket_url(
        registration_id,
        ticket_token,
    )

    attachment = _generate_ticket_attachment(
        recipient_name=recipient_name,
        event_name=event_name,
        registration_id=registration_id,
        venue=venue,
        event_date=event_date,
        event_time=event_time,
        team_name=team_name,
        ticket_url=ticket_url,
    )

    html = _render_card(
        eyebrow="REGISTRATION APPROVED",
        title="YOU'RE CONFIRMED",
        message=(
            f"Hi {recipient_name}, your registration for {event_name} "
            "has been approved. Your payment has been verified successfully."
        ),
        status="CONFIRMED",
        status_color="#34d399",
        rows=[
            ("Event", event_name),
            ("Registration ID", registration_id),
            ("Participant", recipient_name),
            ("Email", recipient_email or to),
            ("College", college_name),
            ("Team", team_name),
            ("Date", event_date),
            ("Time", event_time),
            ("Venue", venue),
            ("Fee", fee),
        ],
        list_items=members,
        button_text="VIEW TICKET",
        button_url=ticket_url,
        footer_note=(
            "Keep this confirmation email. Your attendance ticket will also "
            "be sent again on the event date."
        ),
    )

    _send_html_email(
        to,
        f"Registration confirmed — {event_name}",
        html,
        qr_data=ticket_url,
        attachment_bytes=attachment,
        attachment_filename=(
            f"CyberCarnival_2026_Ticket_{registration_id}.png"
            if attachment
            else None
        ),
        dev_summary=(
            f"Registration {registration_id} confirmed for {event_name}.\n"
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
    html = _render_card(
        eyebrow="REGISTRATION UPDATE",
        title="REGISTRATION NOT APPROVED",
        message=(
            f"Hi {recipient_name}, your registration for {event_name} "
            "could not be approved."
        ),
        status="REJECTED",
        status_color="#fb7185",
        rows=[
            ("Event", event_name),
            ("Registration ID", registration_id),
            ("Reason", rejection_reason),
        ],
        button_text="VIEW MY EVENTS",
        button_url=f"{config.SITE_URL.rstrip('/')}/dashboard",
        footer_note=(
            "If you believe this needs review, contact the CyberCarnival "
            "organising team or the event coordinator."
        ),
    )

    _send_html_email(
        to,
        f"Registration update — {event_name}",
        html,
        dev_summary=(
            f"Registration {registration_id} rejected for {event_name}.\n"
            f"Reason: {rejection_reason}"
        ),
    )


def send_event_day_ticket_email(
    to: str,
    *,
    recipient_name: str,
    event_name: str,
    registration_id: str,
    ticket_token: str,
    team_name: str | None = None,
    event_date: str | None = None,
    event_time: str | None = None,
    venue: str | None = None,
    members: list[str] | None = None,
) -> None:
    ticket_url = _ticket_url(
        registration_id,
        ticket_token,
    )

    attachment = _generate_ticket_attachment(
        recipient_name=recipient_name,
        event_name=event_name,
        registration_id=registration_id,
        venue=venue,
        event_date=event_date,
        event_time=event_time,
        team_name=team_name,
        ticket_url=ticket_url,
    )

    html = _render_card(
        eyebrow="EVENT DAY",
        title="YOUR ATTENDANCE TICKET",
        message=(
            f"Today is {event_name}. Keep this ticket ready and present "
            "the QR code at the attendance/check-in desk."
        ),
        status="VALID FOR ATTENDANCE",
        status_color="#34d399",
        rows=[
            ("Participant", recipient_name),
            ("Event", event_name),
            ("Registration ID", registration_id),
            ("Team", team_name),
            ("Date", event_date),
            ("Time", event_time),
            ("Venue", venue),
        ],
        list_items=members,
        button_text="OPEN TICKET",
        button_url=ticket_url,
        show_qr=True,
        footer_note=(
            "This QR ticket is linked to your confirmed CyberCarnival "
            "registration. Do not share it publicly."
        ),
    )

    _send_html_email(
        to,
        f"Today's attendance ticket — {event_name}",
        html,
        qr_data=ticket_url,
        attachment_bytes=attachment,
        attachment_filename=(
            f"CyberCarnival_Attendance_Ticket_{registration_id}.png"
            if attachment
            else None
        ),
        dev_summary=(
            f"Event-day ticket for {event_name} / registration "
            f"{registration_id}.\nTicket URL: {ticket_url}"
        ),
    )


# ---------------------------------------------------------------------------
# Admin notification
# ---------------------------------------------------------------------------

def get_admin_notification_recipients() -> list[str]:
    recipients: list[str] = []

    raw = (
        getattr(
            config,
            "ADMIN_NOTIFICATION_EMAIL",
            None,
        )
        or getattr(
            config,
            "ADMIN_GOOGLE_EMAIL",
            None,
        )
        or "info.cybercarnival@gmail.com"
    )

    for email in str(raw).split(","):
        email = email.strip().lower()
        if email and email not in recipients:
            recipients.append(email)

    try:
        from models import Admin

        for admin in Admin.query.all():
            email = getattr(
                admin,
                "email",
                None,
            )

            if email:
                email = email.strip().lower()

                if email and email not in recipients:
                    recipients.append(email)

    except Exception as exc:
        logger.warning(
            "Could not query Admin table for email recipients: %s",
            exc,
        )

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
    members: list | None = None,
    payment_status: str = "CONFIRMATION PENDING",
    fee: str | None = None,
    transaction_id: str | None = None,
) -> None:
    recipients = get_admin_notification_recipients()

    if not recipients:
        logger.warning(
            "No admin notification recipients configured for registration %s.",
            registration_id,
        )
        return

    member_names = []

    for member in members or []:
        if isinstance(member, dict):
            name = str(member.get("name") or "").strip()
            email = str(member.get("email") or "").strip()

            if name and email:
                member_names.append(f"{name} — {email}")
            elif name:
                member_names.append(name)
        else:
            member_names.append(str(member))

    admin_url = f"{config.SITE_URL.rstrip('/')}/admin/"

    card = _render_card(
        eyebrow="ADMIN NOTIFICATION",
        title="NEW EVENT REGISTRATION",
        message=(
            "A new CyberCarnival event registration has been created "
            "and may require payment/approval review."
        ),
        status=payment_status,
        status_color="#fbbf24",
        rows=[
            ("Event", event_name),
            ("Registration ID", registration_id),
            ("Participant", participant_name),
            ("Email", participant_email),
            ("Username", username),
            ("Mode", participant_mode),
            ("Team", team_name),
            ("Team Size", team_size),
            ("Fee", fee),
            ("Transaction ID", transaction_id),
        ],
        list_items=member_names,
        button_text="OPEN ADMIN PANEL",
        button_url=admin_url,
    )

    for to in recipients:
        try:
            _send_html_email(
                to,
                f"New event registration — {event_name}",
                card,
                dev_summary=(
                    f"New registration {registration_id} for {event_name}.\n"
                    f"Participant: {participant_name} ({participant_email})"
                ),
            )
        except Exception:
            logger.exception(
                "Failed to send admin registration notification "
                "to=%s registration=%s",
                to,
                registration_id,
            )
