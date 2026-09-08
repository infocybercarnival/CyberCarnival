import os
import uuid

from werkzeug.utils import secure_filename
from PIL import Image, UnidentifiedImageError

import config
from extensions import db
from models import Event


def list_events(include_inactive: bool = False) -> list:
    q = Event.query
    if not include_inactive:
        q = q.filter_by(active=True)
    return q.order_by(Event.created_at.asc()).all()


def get_event(event_id: str):
    return db.session.get(Event, event_id)


def _apply_fields(event: Event, data: dict) -> None:
    """Shared by create/update — only touches fields present in `data`."""
    if "name" in data:
        event.name = data["name"]

    if "category" in data:
        event.category = data["category"] or "TECHNICAL"

    if "tag" in data:
        event.tag = data["tag"]

    if "description" in data:
        event.description = data["description"]

    if "venue" in data:
        event.venue = data["venue"]

    if "date" in data:
        event.event_date = data["date"]

    # Current admin_api.py sends event_start_date/event_end_date.
    # Keep support for the old start_date/end_date keys too so older callers
    # do not break during deployment.
    if "event_start_date" in data:
        event.event_start_date = data["event_start_date"]
    elif "start_date" in data:
        event.event_start_date = data["start_date"]

    if "event_end_date" in data:
        event.event_end_date = data["event_end_date"]
    elif "end_date" in data:
        event.event_end_date = data["end_date"]

    if "time" in data:
        event.event_time = data["time"]

    if "fee" in data:
        event.fee = data["fee"]

    if "fee_amount" in data:
        event.fee_amount = data["fee_amount"]

    if "min_team_size" in data:
        event.min_team_size = data["min_team_size"]

    if "max_team_size" in data:
        event.max_team_size = data["max_team_size"]

    if "max_teams" in data:
        event.max_teams = data["max_teams"]

    if "prize" in data:
        event.prize = data["prize"]

    if "poster_url" in data:
        event.poster_url = data["poster_url"]

    if "active" in data:
        event.active = bool(data["active"])

    if "registration_open" in data:
        event.registration_open = bool(data["registration_open"])


def create_event(data: dict) -> Event:
    event = Event(name=data["name"])

    try:
        _apply_fields(event, data)
        db.session.add(event)
        db.session.commit()
        db.session.refresh(event)
        return event
    except Exception:
        db.session.rollback()
        raise


def update_event(event_id: str, data: dict) -> Event | None:
    event = get_event(event_id)

    if not event:
        return None

    try:
        _apply_fields(event, data)
        db.session.commit()
        db.session.refresh(event)
        return event
    except Exception:
        db.session.rollback()
        raise


def set_event_active(event_id: str, active: bool) -> bool:
    event = get_event(event_id)

    if not event:
        return False

    try:
        event.active = active
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        raise


def set_registration_open(event_id: str, open_: bool) -> bool:
    """The coordinator-facing "close registration" switch — separate from
    `active` (admin's show/hide-the-whole-event switch). Closing this stops
    new registrations without hiding the event from listings."""
    event = get_event(event_id)

    if not event:
        return False

    try:
        event.registration_open = open_
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        raise


def delete_event(event_id: str) -> bool:
    event = get_event(event_id)

    if not event:
        return False

    old_poster_url = event.poster_url

    try:
        db.session.delete(event)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    # Clean up physical poster file after DB commit succeeds
    if old_poster_url and old_poster_url.startswith("/uploads/posters/"):
        old_path = config.UPLOAD_DIR / old_poster_url.rsplit("/", 1)[-1]

        if old_path.exists():
            try:
                old_path.unlink()
            except OSError:
                pass

    return True


def save_poster(event: Event, file_storage) -> str:
    """Validate and save an uploaded event poster.

    Returns the public poster URL.

    Raises:
        ValueError: For invalid uploads or server-side file save failures.

    Notes:
        The upload directory is created on demand so fresh Render instances
        do not fail when the posters directory does not exist yet.
    """
    filename = file_storage.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in config.ALLOWED_POSTER_EXTENSIONS:
        raise ValueError(f"unsupported file type: .{ext}")

    # Determine file size without permanently consuming the stream.
    try:
        file_storage.stream.seek(0, os.SEEK_END)
        size = file_storage.stream.tell()
        file_storage.stream.seek(0)
    except (OSError, ValueError) as exc:
        raise ValueError(f"could not read uploaded file: {str(exc)}") from exc

    if size > config.MAX_POSTER_SIZE_BYTES:
        raise ValueError("file too large (max 5 MB)")

    try:
        # First pass: verify that the uploaded bytes are really an image.
        with Image.open(file_storage.stream) as img:
            img.verify()

        file_storage.stream.seek(0)

        # Second pass: fully load and normalize the image before saving.
        with Image.open(file_storage.stream) as img:
            img.load()
            normalized = (
                img.convert("RGB")
                if img.mode not in ("RGB", "RGBA")
                else img.copy()
            )
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("file is not a valid image") from exc

    safe_name = secure_filename(f"{uuid.uuid4().hex}.{ext}")

    # IMPORTANT FOR RENDER / FRESH DEPLOYMENTS:
    # The directory may not exist yet, so create it before writing the file.
    try:
        config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ValueError(f"could not create poster upload directory: {str(exc)}") from exc

    dest = config.UPLOAD_DIR / safe_name

    save_format = "JPEG" if ext in ("jpg", "jpeg") else ext.upper()

    if save_format == "JPEG" and normalized.mode == "RGBA":
        normalized = normalized.convert("RGB")

    # Convert filesystem/image write errors into ValueError so admin_api.py
    # can return a useful 422 response instead of an unexplained 500.
    try:
        normalized.save(dest, format=save_format)
    except (OSError, ValueError) as exc:
        raise ValueError(f"could not save poster file: {str(exc)}") from exc

    old_poster_url = event.poster_url

    try:
        event.poster_url = f"/uploads/posters/{safe_name}"
        db.session.commit()
        db.session.refresh(event)
    except Exception:
        # If DB commit fails, delete newly uploaded poster and revert/raise.
        if dest.exists():
            try:
                dest.unlink()
            except OSError:
                pass

        db.session.rollback()
        raise

    # Remove the previous poster file only AFTER DB commit succeeds.
    if (
        old_poster_url
        and old_poster_url.startswith("/uploads/posters/")
        and old_poster_url != event.poster_url
    ):
        old_path = config.UPLOAD_DIR / old_poster_url.rsplit("/", 1)[-1]

        if old_path.exists():
            try:
                old_path.unlink()
            except OSError:
                pass

    return event.poster_url
