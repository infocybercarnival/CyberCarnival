"""
Alert management service for persistent Admin Notifications, system health monitoring,
deduplication, and recovery detection.
"""

from datetime import datetime, timedelta, timezone
from typing import Any
import config

from extensions import db
from models import AdminAlert
from utils.email import send_infrastructure_alert_email
from utils.logger import get_logger

logger = get_logger("alert_service")

# In-memory email cooldown tracking per alert category
_LAST_EMAIL_SENT: dict[str, datetime] = {}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _should_send_email(category: str, now: datetime) -> bool:
    cooldown_minutes = getattr(config, "ALERT_EMAIL_COOLDOWN_MINUTES", 60)
    last_sent = _LAST_EMAIL_SENT.get(category)
    if not last_sent:
        return True
    return (now - last_sent) >= timedelta(minutes=cooldown_minutes)


def create_or_update_alert(
    title: str,
    message: str,
    severity: str = "warning",
    category: str = "system",
    meta: dict[str, Any] | None = None,
    deduplicate_hours: int = 1,
) -> AdminAlert | None:
    """
    Creates a new persistent AdminAlert or updates an existing unresolved alert if one with
    the same category and title occurred within `deduplicate_hours`. Sends an external SMTP
    critical email alert if severity is critical and cooldown period has expired.
    """
    try:
        cutoff = _utc_now() - timedelta(hours=deduplicate_hours)

        existing = (
            AdminAlert.query.filter(
                AdminAlert.category == category,
                AdminAlert.title == title,
                AdminAlert.status != "resolved",
                AdminAlert.last_detected_at >= cutoff,
            )
            .order_by(AdminAlert.last_detected_at.desc())
            .first()
        )

        now = _utc_now()
        alert_obj = None

        if existing:
            existing.occurrence_count += 1
            existing.last_detected_at = now
            existing.message = message
            existing.severity = severity
            if meta:
                current_meta = existing.meta_json or {}
                current_meta.update(meta)
                existing.meta_json = current_meta

            db.session.commit()
            logger.info("updated existing admin alert id=%s count=%d", existing.id, existing.occurrence_count)
            alert_obj = existing
        else:
            alert = AdminAlert(
                title=title,
                message=message,
                severity=severity,
                category=category,
                status="unread",
                occurrence_count=1,
                first_detected_at=now,
                last_detected_at=now,
                meta_json=meta or {},
            )
            db.session.add(alert)
            db.session.commit()
            logger.info("created new admin alert id=%s title='%s' severity=%s", alert.id, title, severity)
            alert_obj = alert

        # External SMTP Email Alert Triggering with Deduplication Cooldown
        if severity == "critical" and _should_send_email(category, now):
            email_sent = send_infrastructure_alert_email(
                subject=f"🚨 CyberCarnival Critical Alert — {title}",
                title=title,
                message=message,
                service_name=category,
                severity="critical",
                occurrence_count=alert_obj.occurrence_count if alert_obj else 1,
                meta=meta,
            )
            if email_sent:
                _LAST_EMAIL_SENT[category] = now

        return alert_obj

    except Exception:
        logger.exception("failed to create or update admin alert in database")
        try:
            db.session.rollback()
        except Exception:
            pass

        # Database is unavailable! Attempt independent external SMTP alert
        now = _utc_now()
        if severity == "critical" and _should_send_email(category, now):
            email_sent = send_infrastructure_alert_email(
                subject=f"🚨 CyberCarnival Critical Alert — {title}",
                title=title,
                message=f"{message} (Note: AdminAlert database persistence failed due to DB outage)",
                service_name=category,
                severity="critical",
                meta=meta,
            )
            if email_sent:
                _LAST_EMAIL_SENT[category] = now

        return None


def create_recovery_alert(category: str, service_name: str) -> AdminAlert | None:
    """
    Detects if unresolved warning/critical alerts exist in `category`, marks them resolved,
    posts an info-level recovery notification, and sends a recovery email.
    """
    try:
        active_unresolved = AdminAlert.query.filter(
            AdminAlert.category == category,
            AdminAlert.status != "resolved",
            AdminAlert.severity.in_(["warning", "critical"]),
        ).all()

        if not active_unresolved:
            return None

        now = _utc_now()
        for alert in active_unresolved:
            alert.status = "resolved"
            alert.resolved_at = now

        db.session.commit()

        recovery_alert = create_or_update_alert(
            title=f"🟢 {service_name} Recovered",
            message=f"{service_name} operations have recovered successfully.",
            severity="info",
            category=category,
            meta={"recovered_alert_ids": [a.id for a in active_unresolved]},
            deduplicate_hours=1,
        )

        # Trigger Recovery Email
        send_infrastructure_alert_email(
            subject=f"🟢 CyberCarnival Service Recovery — {service_name} Recovered",
            title=f"🟢 {service_name} Recovered",
            message=f"{service_name} operations have recovered successfully and returned to normal status.",
            service_name=service_name,
            severity="info",
            is_recovery=True,
        )

        logger.info("posted recovery alert for service=%s resolved_count=%d", service_name, len(active_unresolved))
        return recovery_alert

    except Exception:
        logger.exception("failed to post recovery alert for category=%s", category)
        try:
            db.session.rollback()
        except Exception:
            pass
        return None


def list_alerts(status_filter: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Returns a list of AdminAlert records ordered by newest first."""
    query = AdminAlert.query

    if status_filter:
        if status_filter == "unread":
            query = query.filter(AdminAlert.status == "unread")
        elif status_filter == "read":
            query = query.filter(AdminAlert.status == "read")
        elif status_filter == "resolved":
            query = query.filter(AdminAlert.status == "resolved")
        elif status_filter == "unresolved":
            query = query.filter(AdminAlert.status != "resolved")

    alerts = query.order_by(AdminAlert.last_detected_at.desc()).limit(limit).all()
    return [a.to_dict() for a in alerts]


def get_unread_count() -> int:
    """Returns the count of unread alerts."""
    return AdminAlert.query.filter(AdminAlert.status == "unread").count()


def mark_as_read(alert_id: str) -> bool:
    """Marks an alert as read."""
    alert = db.session.get(AdminAlert, alert_id)
    if not alert:
        return False

    if alert.status == "unread":
        alert.status = "read"
        db.session.commit()
    return True


def mark_as_resolved(alert_id: str) -> bool:
    """Marks an alert as resolved."""
    alert = db.session.get(AdminAlert, alert_id)
    if not alert:
        return False

    alert.status = "resolved"
    alert.resolved_at = _utc_now()
    db.session.commit()
    return True
