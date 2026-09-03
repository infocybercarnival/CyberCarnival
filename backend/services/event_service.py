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
    if "start_date" in data:
        event.event_start_date = data["start_date"]
    if "end_date" in data:
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


def create_event(data: dict) -> Event:
    event = Event(name=data["name"])
    _apply_fields(event, data)
    db.session.add(event)
    db.session.commit()
    return event


def update_event(event_id: str, data: dict) -> Event | None:
    event = get_event(event_id)
    if not event:
        return None
    _apply_fields(event, data)
    db.session.commit()
    return event


def set_event_active(event_id: str, active: bool) -> bool:
    event = get_event(event_id)
    if not event:
        return False
    event.active = active
    db.session.commit()
    return True


def set_registration_open(event_id: str, open_: bool) -> bool:
    """The coordinator-facing "close registration" switch — separate from
    `active` (admin's show/hide-the-whole-event switch). Closing this stops
    new registrations without hiding the event from listings."""
    event = get_event(event_id)
    if not event:
        return False
    event.registration_open = open_
    db.session.commit()
    return True


def delete_event(event_id: str) -> bool:
    event = get_event(event_id)
    if not event:
        return False
    db.session.delete(event)
    db.session.commit()
    return True


def save_poster(event: Event, file_storage) -> str:
    """Validates and saves an uploaded poster, returns its public URL.
    Raises ValueError on anything that fails validation."""
    filename = file_storage.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in config.ALLOWED_POSTER_EXTENSIONS:
        raise ValueError(f"unsupported file type: .{ext}")

    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size > config.MAX_POSTER_SIZE_BYTES:
        raise ValueError("file too large (max 5 MB)")

    # Extension allow-listing alone only checks the filename, not the bytes —
    # a same-request-content-type-spoofed file with a fake .jpg extension
    # would sail through the checks above. Actually decode it as an image
    # (Pillow) and re-encode a fresh copy from the decoded pixel data, so
    # whatever gets saved to disk is provably a real image and nothing else
    # embedded/appended in the original upload survives.
    try:
        with Image.open(file_storage.stream) as img:
            img.verify()
        file_storage.stream.seek(0)
        with Image.open(file_storage.stream) as img:
            img.load()
            normalized = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img.copy()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError("file is not a valid image")

    safe_name = secure_filename(f"{uuid.uuid4().hex}.{ext}")
    dest = config.UPLOAD_DIR / safe_name
    save_format = "JPEG" if ext in ("jpg", "jpeg") else ext.upper()
    if save_format == "JPEG" and normalized.mode == "RGBA":
        normalized = normalized.convert("RGB")
    normalized.save(dest, format=save_format)

    # Remove the previous poster file (if any) now that it's been replaced.
    if event.poster_url and event.poster_url.startswith("/uploads/posters/"):
        old_path = config.UPLOAD_DIR / event.poster_url.rsplit("/", 1)[-1]
        if old_path.exists():
            try:
                old_path.unlink()
            except OSError:
                pass

    event.poster_url = f"/uploads/posters/{safe_name}"
    db.session.commit()
    return event.poster_url