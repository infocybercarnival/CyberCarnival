from extensions import db
from models import AuditLogEntry


def log_action(actor: str, action: str, detail: str, ip: str) -> None:
    """Append-only audit trail. Never log secrets/passwords/tokens here."""
    entry = AuditLogEntry(actor=actor, action=action, target=detail, meta_json={"ip": ip})
    db.session.add(entry)
    db.session.commit()


def list_audit_log(limit: int = 200) -> list:
    rows = AuditLogEntry.query.order_by(AuditLogEntry.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "timestamp": r.created_at.timestamp() if r.created_at else None,
            "actor": r.actor,
            "action": r.action,
            "detail": r.target,
            "ip": (r.meta_json or {}).get("ip", ""),
        }
        for r in rows
    ]
