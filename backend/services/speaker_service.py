from extensions import db
from models import Speaker


def list_speakers(include_inactive: bool = False):
    q = Speaker.query
    if not include_inactive:
        q = q.filter_by(active=True)
    return q.order_by(Speaker.display_order.asc(), Speaker.created_at.asc()).all()


def get_speaker(speaker_id: str):
    return db.session.get(Speaker, speaker_id)


def create_speaker(data: dict) -> Speaker:
    speaker = Speaker(name=data["name"])
    _apply_fields(speaker, data)
    db.session.add(speaker)
    db.session.commit()
    return speaker


def update_speaker(speaker_id: str, data: dict) -> Speaker | None:
    speaker = get_speaker(speaker_id)
    if not speaker:
        return None
    _apply_fields(speaker, data)
    db.session.commit()
    return speaker


def delete_speaker(speaker_id: str) -> bool:
    speaker = get_speaker(speaker_id)
    if not speaker:
        return False
    db.session.delete(speaker)
    db.session.commit()
    return True


def _apply_fields(speaker: Speaker, data: dict) -> None:
    for field in (
        "name", "designation", "organization", "category", "portrait_url",
        "bio", "session_title", "session_time", "session_venue",
        "twitter_url", "linkedin_url", "github_url",
    ):
        if field in data:
            setattr(speaker, field, data[field])
    if "expertise" in data:
        speaker.expertise = data["expertise"]
    if "is_featured" in data:
        speaker.is_featured = bool(data["is_featured"])
    if "display_order" in data:
        speaker.display_order = int(data["display_order"] or 0)
    if "active" in data:
        speaker.active = bool(data["active"])


def save_portrait(speaker: Speaker, file_storage) -> str:
    """Same content-verified upload pattern as event posters — decodes and
    re-encodes via PIL so an extension-spoofed non-image file can't get
    saved as-is."""
    import uuid
    import config
    from PIL import Image, UnidentifiedImageError

    filename = file_storage.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in config.ALLOWED_POSTER_EXTENSIONS:
        raise ValueError(f"unsupported file type: .{ext}")

    file_storage.stream.seek(0, 2)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size > config.MAX_POSTER_SIZE_BYTES:
        raise ValueError("file too large (max 5 MB)")

    try:
        with Image.open(file_storage.stream) as img:
            img.verify()
        file_storage.stream.seek(0)
        with Image.open(file_storage.stream) as img:
            img.load()
            normalized = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img.copy()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError("file is not a valid image")

    safe_name = f"speaker_{uuid.uuid4().hex}.{ext}"
    dest = config.UPLOAD_DIR / safe_name
    save_format = "JPEG" if ext in ("jpg", "jpeg") else ext.upper()
    if save_format == "JPEG" and normalized.mode == "RGBA":
        normalized = normalized.convert("RGB")
    normalized.save(dest, format=save_format)

    if speaker.portrait_url and speaker.portrait_url.startswith("/uploads/posters/"):
        old_path = config.UPLOAD_DIR / speaker.portrait_url.rsplit("/", 1)[-1]
        if old_path.exists():
            try:
                old_path.unlink()
            except OSError:
                pass

    speaker.portrait_url = f"/uploads/posters/{safe_name}"
    db.session.commit()
    return speaker.portrait_url
