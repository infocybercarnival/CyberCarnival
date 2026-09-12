"""
Supabase Storage service for permanent image and screenshot uploads.

Stores files in Supabase Storage buckets (e.g. private 'payment-proofs' and
public 'event-assets') and provides signed/public URL generation routines.

Falls back to local disk storage when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
are not configured (e.g. local offline development).
"""

import os
import uuid
from pathlib import Path

import requests

import config
from services import alert_service
from utils.logger import get_logger

logger = get_logger("storage_service")


class SupabaseStorageError(Exception):
    """Raised when a Supabase Storage operation fails in production."""
    pass


def is_supabase_storage_configured() -> bool:
    return bool(config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY)


def upload_to_supabase(
    bucket: str,
    storage_path: str,
    file_bytes: bytes,
    mime_type: str,
) -> bool:
    """
    Uploads raw file bytes to Supabase Storage via REST API.
    Endpoint: POST {SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}
    """
    if not is_supabase_storage_configured():
        logger.error(
            "Supabase Storage credentials missing: SUPABASE_URL configured=%s, SUPABASE_SERVICE_ROLE_KEY configured=%s",
            bool(config.SUPABASE_URL),
            bool(config.SUPABASE_SERVICE_ROLE_KEY),
        )
        return False

    url = f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": mime_type,
        "x-upsert": "true",
    }

    try:
        resp = requests.post(url, headers=headers, data=file_bytes, timeout=15)
        if resp.status_code in (200, 201):
            logger.info(
                "uploaded file to Supabase Storage bucket=%s path=%s size=%d",
                bucket,
                storage_path,
                len(file_bytes),
            )
            return True

        logger.error(
            "Supabase Storage upload HTTP failure bucket=%s path=%s status=%d response=%s",
            bucket,
            storage_path,
            resp.status_code,
            resp.text[:300],
        )
        return False
    except Exception as exc:
        logger.exception(
            "Exception uploading to Supabase Storage bucket=%s path=%s: %s",
            bucket,
            storage_path,
            exc,
        )
        return False


def get_signed_url(bucket: str, storage_path: str, expires_in: int = 3600) -> str | None:
    """
    Generates a short-lived signed URL for private buckets (e.g. payment proofs).
    Endpoint: POST {SUPABASE_URL}/storage/v1/object/sign/{bucket}/{storage_path}
    """
    if not is_supabase_storage_configured():
        return None

    url = f"{config.SUPABASE_URL}/storage/v1/object/sign/{bucket}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }
    payload = {"expiresIn": expires_in}

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            signed_path = data.get("signedURL")
            if signed_path:
                if signed_path.startswith("http://") or signed_path.startswith("https://"):
                    return signed_path
                return f"{config.SUPABASE_URL}{signed_path}"

        logger.warning(
            "Supabase Storage signed URL failed bucket=%s path=%s status=%d",
            bucket,
            storage_path,
            resp.status_code,
        )
        return None
    except Exception:
        logger.exception("exception generating Supabase Storage signed URL")
        return None


def get_public_url(bucket: str, storage_path: str) -> str | None:
    """Generates direct CDN URL for public buckets (e.g. event assets/posters)."""
    if not is_supabase_storage_configured():
        return None
    return f"{config.SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}"


def upload_payment_proof(
    user_id: str,
    registration_id: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
) -> dict:
    """
    Validates and uploads payment proof screenshot to Supabase Storage private bucket
    `payment-proofs` under path `payment-proofs/{user_id}/{registration_id}_{uuid}.{ext}`.

    In production or when Supabase Storage is configured, failures raise SupabaseStorageError
    and trigger a critical AdminAlert instead of writing to local disk.
    """
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "png").lower().strip()
    if ext not in config.ALLOWED_PAYMENT_PROOF_EXTENSIONS:
        ext = "png"

    unique_id = uuid.uuid4().hex[:12]
    storage_path = f"{user_id}/{registration_id}_{unique_id}.{ext}"
    bucket = config.SUPABASE_BUCKET_PAYMENT_PROOFS

    if is_supabase_storage_configured() or config.IS_PRODUCTION:
        success = upload_to_supabase(bucket, storage_path, file_bytes, mime_type)
        if success:
            alert_service.create_recovery_alert("supabase_storage", "Supabase Storage")
            storage_reference = f"supabase:{bucket}/{storage_path}"
            signed_url = get_signed_url(bucket, storage_path)
            return {
                "storage_reference": storage_reference,
                "is_supabase": True,
                "signed_url": signed_url,
                "filename": storage_reference,
            }
        else:
            alert_service.create_or_update_alert(
                title="🚨 Supabase Storage Unavailable",
                message="A payment screenshot upload failed because Supabase Storage was unavailable. The file was NOT stored on the server filesystem.",
                severity="critical",
                category="supabase_storage",
                meta={"user_id": user_id, "registration_id": registration_id, "file_size": len(file_bytes)},
            )
            raise SupabaseStorageError("Payment storage is temporarily unavailable. Please try again later.")

    # Fallback to local storage ONLY in offline development mode
    local_filename = f"{registration_id}_{unique_id}.{ext}"
    local_dest = config.PAYMENT_PROOF_DIR / local_filename
    with open(local_dest, "wb") as f:
        f.write(file_bytes)

    logger.info("saved payment proof to local disk filename=%s", local_filename)
    return {
        "storage_reference": local_filename,
        "is_supabase": False,
        "signed_url": None,
        "filename": local_filename,
    }


def upload_event_asset(
    subfolder: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
) -> str:
    """
    Uploads event posters or speaker portraits to Supabase Storage public asset bucket `event-assets`.
    Returns public Supabase URL or local relative path.
    """
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "jpg").lower().strip()
    if ext not in config.ALLOWED_POSTER_EXTENSIONS:
        ext = "jpg"

    unique_name = f"{uuid.uuid4().hex[:12]}.{ext}"
    storage_path = f"{subfolder}/{unique_name}"
    bucket = config.SUPABASE_BUCKET_ASSETS

    if is_supabase_storage_configured() or config.IS_PRODUCTION:
        success = upload_to_supabase(bucket, storage_path, file_bytes, mime_type)
        if success:
            alert_service.create_recovery_alert("supabase_storage", "Supabase Storage")
            pub_url = get_public_url(bucket, storage_path)
            if pub_url:
                return pub_url
        else:
            alert_service.create_or_update_alert(
                title="🚨 Supabase Storage Asset Upload Failed",
                message="An event asset upload failed because Supabase Storage was unavailable. The asset was NOT stored on the server filesystem.",
                severity="warning",
                category="supabase_storage",
                meta={"subfolder": subfolder, "filename": filename},
            )
            raise SupabaseStorageError("Asset storage is temporarily unavailable. Please try again later.")

    # Fallback to local UPLOAD_DIR ONLY in offline development mode
    local_dest = config.UPLOAD_DIR / unique_name
    with open(local_dest, "wb") as f:
        f.write(file_bytes)

    logger.info("saved asset to local disk filename=%s", unique_name)
    return f"/uploads/posters/{unique_name}"


def upload_speaker_portrait(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
) -> str:
    """Uploads a speaker portrait to Supabase Storage event-assets/speakers."""
    return upload_event_asset("speakers", file_bytes, filename, mime_type)


def get_signed_payment_proof_url(storage_reference: str, expires_in: int = 3600) -> str | None:
    """
    Parses storage_reference (e.g. 'supabase:payment-proofs/user_id/reg_uuid.png')
    and generates a short-lived signed URL for private payment proof screenshots.
    """
    if not storage_reference:
        return None

    if storage_reference.startswith("supabase:"):
        ref_path = storage_reference[len("supabase:"):]
        parts = ref_path.split("/", 1)
        if len(parts) == 2:
            bucket, path = parts[0], parts[1]
            return get_signed_url(bucket, path, expires_in=expires_in)

    return None


def get_public_asset_url(storage_reference: str) -> str | None:
    """Generates or returns public URL for asset references."""
    if not storage_reference:
        return None

    if storage_reference.startswith("supabase:"):
        ref_path = storage_reference[len("supabase:"):]
        parts = ref_path.split("/", 1)
        if len(parts) == 2:
            bucket, path = parts[0], parts[1]
            return get_public_url(bucket, path)

    if storage_reference.startswith("http://") or storage_reference.startswith("https://") or storage_reference.startswith("/"):
        return storage_reference

    return None


def delete_file(storage_reference: str) -> bool:
    """
    Safely deletes a file from Supabase Storage or local disk when replaced/cleaned up.
    """
    if not storage_reference:
        return False

    if storage_reference.startswith("supabase:"):
        if not is_supabase_storage_configured():
            return False
        ref_path = storage_reference[len("supabase:"):]
        parts = ref_path.split("/", 1)
        if len(parts) == 2:
            bucket, storage_path = parts[0], parts[1]
            url = f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}"
            headers = {
                "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
            }
            try:
                resp = requests.delete(url, headers=headers, timeout=10)
                if resp.status_code in (200, 204):
                    logger.info("deleted file from Supabase Storage bucket=%s path=%s", bucket, storage_path)
                    return True
            except Exception:
                logger.exception("exception deleting from Supabase Storage bucket=%s path=%s", bucket, storage_path)
        return False

    # Local file deletion fallback
    filename = storage_reference.rsplit("/", 1)[-1]
    local_path = config.PAYMENT_PROOF_DIR / filename
    if not local_path.exists():
        local_path = config.UPLOAD_DIR / filename

    if local_path.exists():
        try:
            local_path.unlink()
            logger.info("deleted local file path=%s", local_path)
            return True
        except OSError:
            pass

    return False
