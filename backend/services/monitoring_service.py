"""
Monitoring service for system health detection, Supabase database check,
Supabase storage check, official quota metric evaluation, and status aggregation.
"""

from typing import Any
import requests
from sqlalchemy import text

import config
from extensions import db
from services.storage_service import is_supabase_storage_configured
from utils.logger import get_logger

logger = get_logger("monitoring_service")


def check_database_health() -> dict[str, Any]:
    """Performs a lightweight SELECT 1 database ping."""
    try:
        db.session.execute(text("SELECT 1"))
        return {
            "service": "database",
            "status": "healthy",
            "message": "Database is reachable and responding to queries.",
        }
    except Exception as exc:
        logger.error("Database health check failed: %s", exc)
        return {
            "service": "database",
            "status": "unhealthy",
            "message": "Database ping failed or database is unreachable.",
        }


def check_storage_health() -> dict[str, Any]:
    """Performs a lightweight head/get API check against Supabase Storage REST endpoint."""
    if not is_supabase_storage_configured():
        return {
            "service": "storage",
            "status": "offline_dev",
            "message": "Supabase Storage credentials not set (running in local development mode).",
        }

    url = f"{config.SUPABASE_URL}/storage/v1/bucket"
    headers = {
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
    }

    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            return {
                "service": "storage",
                "status": "healthy",
                "message": "Supabase Storage API is reachable and responding.",
            }
        return {
            "service": "storage",
            "status": "unhealthy",
            "message": f"Supabase Storage ping returned status {resp.status_code}.",
        }
    except Exception as exc:
        logger.error("Storage health check failed: %s", exc)
        return {
            "service": "storage",
            "status": "unhealthy",
            "message": "Supabase Storage API is unreachable.",
        }


def check_supabase_quota_metrics() -> dict[str, Any]:
    """
    Queries official Supabase Management API if SUPABASE_MANAGEMENT_TOKEN & SUPABASE_PROJECT_REF
    are configured in environment variables.

    CRITICAL RULE: DO NOT fake percentages if tokens are missing.
    """
    token = getattr(config, "SUPABASE_MANAGEMENT_TOKEN", "")
    project_ref = getattr(config, "SUPABASE_PROJECT_REF", "")

    if not token or not project_ref:
        return {
            "status": "unavailable",
            "reason": "Official Supabase quota metrics are not configured or unavailable.",
            "metrics_available": False,
        }

    url = f"https://api.supabase.com/v1/projects/{project_ref}/resources"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            db_pct = data.get("database_size_pct", 0)
            storage_pct = data.get("storage_size_pct", 0)
            max_pct = max(db_pct, storage_pct)

            warn_thresh = getattr(config, "SUPABASE_WARNING_THRESHOLD", 80)
            crit_thresh = getattr(config, "SUPABASE_CRITICAL_THRESHOLD", 90)
            emerg_thresh = getattr(config, "SUPABASE_EMERGENCY_THRESHOLD", 95)

            if max_pct >= emerg_thresh:
                status = "emergency"
            elif max_pct >= crit_thresh:
                status = "critical"
            elif max_pct >= warn_thresh:
                status = "warning"
            else:
                status = "healthy"

            return {
                "status": status,
                "metrics_available": True,
                "database_usage_pct": db_pct,
                "storage_usage_pct": storage_pct,
                "max_usage_pct": max_pct,
            }

        return {
            "status": "unavailable",
            "reason": f"Supabase Management API returned status {resp.status_code}.",
            "metrics_available": False,
        }
    except Exception as exc:
        logger.error("Failed to query Supabase Management API: %s", exc)
        return {
            "status": "unavailable",
            "reason": "Failed to reach Supabase Management API.",
            "metrics_available": False,
        }


def run_full_system_health_check() -> dict[str, Any]:
    """Aggregates system component health and active alerts."""
    db_health = check_database_health()
    storage_health = check_storage_health()
    quota = check_supabase_quota_metrics()

    from services import alert_service
    unread_count = 0
    try:
        unread_count = alert_service.get_unread_count()
    except Exception:
        pass

    return {
        "database": db_health,
        "storage": storage_health,
        "quota": quota,
        "alerts": {
            "unread": unread_count,
        },
    }
