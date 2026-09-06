import secrets
from pathlib import Path

import config
from storage import json_store

_REVOKED_FILE = config.DATA_DIR / "revoked_sessions.json"
_in_memory_revoked = set()

# Load persisted revoked SIDs on startup
try:
    _data = json_store.read_all(_REVOKED_FILE)
    for _item in _data:
        if isinstance(_item, dict) and "sid" in _item:
            _in_memory_revoked.add(_item["sid"])
except Exception:
    pass


def generate_sid() -> str:
    return secrets.token_hex(16)


def revoke_session(sid: str) -> None:
    if not sid:
        return
    _in_memory_revoked.add(sid)
    try:
        json_store.append(_REVOKED_FILE, {"sid": sid})
    except Exception:
        pass


def is_session_revoked(sid: str) -> bool:
    if not sid:
        return False
    return sid in _in_memory_revoked
