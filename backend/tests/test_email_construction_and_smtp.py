import email
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from unittest.mock import MagicMock, patch

import pytest
import config
from utils.email import (
    build_email_message,
    _send_html_email,
    send_otp_email,
    send_google_signup_token_email,
    send_credentials_email,
    send_registration_pending_email,
    send_registration_confirmation_email,
    send_registration_rejection_email,
    send_event_day_ticket_email,
    send_admin_new_registration_notification,
    send_infrastructure_alert_email,
)


class TestEmailConstructionAndSMTP:

    def test_build_email_message_headers_and_date(self):
        to = "participant@example.com"
        subject = "Test CyberCarnival Email"
        html = "<p>Hello CyberCarnival</p>"

        msg = build_email_message(to=to, subject=subject, html=html)

        assert isinstance(msg, EmailMessage)
        assert msg["To"] == to
        assert msg["Subject"] == subject
        assert "CyberCarnival" in msg["From"]

        # 1. Date header verification
        assert "Date" in msg
        dt = parsedate_to_datetime(msg["Date"])
        assert dt is not None

        # 2 & 3. Message-ID header verification & domain check
        assert "Message-ID" in msg
        assert "cybercarnival.in" in msg["Message-ID"]

    def test_mime_structure_plain_and_html(self):
        msg = build_email_message(
            to="user@example.com",
            subject="Verification Code",
            html="<h1>OTP: 123456</h1>",
            plain_text="Your OTP is 123456",
        )

        raw_bytes = msg.as_bytes()
        parsed_msg = email.message_from_bytes(raw_bytes)

        # 4 & 5 & 6. Plain-text and HTML alternative check
        assert parsed_msg.is_multipart()
        
        body_plain = msg.get_body(preferencelist=("plain",)).get_content()
        body_html = msg.get_body(preferencelist=("html",)).get_content()

        assert "Your OTP is 123456" in body_plain
        assert "<h1>OTP: 123456</h1>" in body_html

        # 7. Verify no bogus base64 text parts
        plain_part = msg.get_body(preferencelist=("plain",))
        assert plain_part.get("Content-Transfer-Encoding") in [None, "7bit", "8bit", "quoted-printable"]

    def test_attachment_handling(self):
        attachment_data = b"FAKE_PNG_BYTES"
        attachment_name = "ticket.png"

        msg = build_email_message(
            to="user@example.com",
            subject="Ticket Included",
            html="<p>Your ticket is attached.</p>",
            attachment_bytes=attachment_data,
            attachment_filename=attachment_name,
        )

        attachments = list(msg.iter_attachments())
        assert len(attachments) == 1
        assert attachments[0].get_filename() == attachment_name
        assert attachments[0].get_content() == attachment_data

    @patch("smtplib.SMTP")
    def test_smtp_local_hostname_configuration(self, mock_smtp):
        mock_server = MagicMock()
        mock_smtp.return_value.__enter__.return_value = mock_server

        with patch.object(config, "EMAIL_DEV_MODE", False), \
             patch.object(config, "EMAIL_SMTP_USER", "smtp_user"), \
             patch.object(config, "EMAIL_SMTP_PASSWORD", "smtp_pass"), \
             patch.object(config, "EMAIL_SMTP_URL", "smtp.gmail.com:587"), \
             patch.object(config, "SMTP_LOCAL_HOSTNAME", "srv4.smrtech.in"):

            _send_html_email("dest@example.com", "Test Subject", "<p>Body</p>")

            mock_smtp.assert_called_once()
            _, kwargs = mock_smtp.call_args
            assert kwargs.get("local_hostname") == "srv4.smrtech.in"
            mock_server.starttls.assert_called_once()
            mock_server.login.assert_called_once_with("smtp_user", "smtp_pass")
            mock_server.send_message.assert_called_once()

    @patch("smtplib.SMTP_SSL")
    def test_smtp_ssl_local_hostname_configuration(self, mock_smtp_ssl):
        mock_server = MagicMock()
        mock_smtp_ssl.return_value.__enter__.return_value = mock_server

        with patch.object(config, "EMAIL_DEV_MODE", False), \
             patch.object(config, "EMAIL_SMTP_USER", "smtp_user"), \
             patch.object(config, "EMAIL_SMTP_PASSWORD", "smtp_pass"), \
             patch.object(config, "EMAIL_SMTP_URL", "smtp.gmail.com:465"), \
             patch.object(config, "SMTP_LOCAL_HOSTNAME", "srv4.smrtech.in"):

            _send_html_email("dest@example.com", "Test SSL", "<p>Body SSL</p>")

            mock_smtp_ssl.assert_called_once()
            _, kwargs = mock_smtp_ssl.call_args
            assert kwargs.get("local_hostname") == "srv4.smrtech.in"
            mock_server.login.assert_called_once_with("smtp_user", "smtp_pass")
            mock_server.send_message.assert_called_once()

    def test_all_transactional_email_functions_dev_mode(self):
        with patch.object(config, "EMAIL_DEV_MODE", True):
            send_otp_email("user@example.com", "123456", "signup")
            send_google_signup_token_email("user@example.com", "CC-TOKEN-123")
            send_credentials_email("user@example.com", "CC-TOKEN-123", "user1", "temp123")
            send_registration_pending_email(
                "user@example.com",
                recipient_name="User",
                event_name="CTF",
                registration_id="reg-123",
            )
            send_registration_confirmation_email(
                "user@example.com",
                recipient_name="User",
                event_name="CTF",
                registration_id="reg-123",
            )
            send_registration_rejection_email(
                "user@example.com",
                recipient_name="User",
                event_name="CTF",
                registration_id="reg-123",
                rejection_reason="Invalid transaction ID",
            )
            send_event_day_ticket_email(
                "user@example.com",
                recipient_name="User",
                event_name="CTF",
                registration_id="reg-123",
                ticket_token="token-xyz",
            )
            send_admin_new_registration_notification(
                "reg-123",
                event_name="CTF",
                participant_name="User",
                participant_email="user@example.com",
                username="user1",
            )
            send_infrastructure_alert_email(
                subject="Test Alert",
                title="Storage Alert",
                message="Storage test warning",
                service_name="storage",
            )
