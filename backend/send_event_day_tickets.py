"""
Send CyberCarnival attendance-ticket emails for events happening today.

Run this once every morning using Windows Task Scheduler or cron.

Duplicate protection:
    audit_log records one EVENT_DAY_TICKET_EMAIL_SENT entry per
    registration + event date, so re-running the job is safe.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app import create_app
from extensions import db
from models import (
    AuditLogEntry,
    EventRegistration,
)
from utils.email import send_event_day_ticket_email
from utils.logger import get_logger

logger = get_logger("event_day_ticket_mailer")

TIMEZONE = ZoneInfo("Asia/Kolkata")


def _already_sent(
    registration_id: str,
    event_date: str,
) -> bool:
    target = f"{registration_id}:{event_date}"

    return (
        AuditLogEntry.query
        .filter_by(
            action="EVENT_DAY_TICKET_EMAIL_SENT",
            target=target,
        )
        .first()
        is not None
    )


def _mark_sent(
    registration_id: str,
    event_date: str,
    sent_count: int,
) -> None:
    db.session.add(
        AuditLogEntry(
            actor="system:event-day-mailer",
            action="EVENT_DAY_TICKET_EMAIL_SENT",
            target=f"{registration_id}:{event_date}",
            meta_json={
                "registration_id": registration_id,
                "event_date": event_date,
                "recipient_count": sent_count,
            },
        )
    )
    db.session.commit()


def run() -> None:
    app = create_app()

    with app.app_context():
        today = datetime.now(TIMEZONE).date()

        registrations = (
            EventRegistration.query
            .filter(
                EventRegistration.status == "confirmed",
                EventRegistration.ticket_token.isnot(None),
            )
            .all()
        )

        checked = 0
        sent_registrations = 0

        for reg in registrations:
            event = reg.event

            if not event or not event.event_start_date:
                continue

            start = event.event_start_date
            end = event.event_end_date or start

            if not (start <= today <= end):
                continue

            checked += 1
            date_key = today.isoformat()

            if _already_sent(reg.id, date_key):
                logger.info(
                    "event-day ticket already sent registration=%s date=%s",
                    reg.id,
                    date_key,
                )
                continue

            roster = [
                (
                    member.participant_name
                    or (
                        member.user.full_name
                        if member.user else None
                    )
                    or (
                        member.user.username
                        if member.user else ""
                    )
                )
                for member in reg.members
            ]

            sent_to = set()

            for member in reg.members:
                email = (
                    member.participant_email
                    or (
                        member.user.email
                        if member.user else ""
                    )
                    or ""
                ).strip().lower()

                if not email or email in sent_to:
                    continue

                recipient_name = (
                    member.participant_name
                    or (
                        member.user.full_name
                        if member.user else None
                    )
                    or (
                        member.user.username
                        if member.user else None
                    )
                    or "Participant"
                )

                try:
                    send_event_day_ticket_email(
                        email,
                        recipient_name=recipient_name,
                        event_name=event.name,
                        registration_id=reg.id,
                        ticket_token=reg.ticket_token,
                        team_name=reg.team_name,
                        event_date=event.event_date,
                        event_time=event.event_time,
                        venue=event.venue,
                        members=roster,
                    )
                    sent_to.add(email)

                except Exception:
                    logger.exception(
                        "event-day ticket email failed "
                        "registration=%s to=%s",
                        reg.id,
                        email,
                    )

            if sent_to:
                _mark_sent(
                    reg.id,
                    date_key,
                    len(sent_to),
                )
                sent_registrations += 1

        logger.info(
            "event-day mailer complete date=%s eligible=%s sent=%s",
            today.isoformat(),
            checked,
            sent_registrations,
        )


if __name__ == "__main__":
    run()
