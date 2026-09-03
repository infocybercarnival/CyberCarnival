"""
Thread-and-process-safe JSON "table" storage.

Every JSON file gets a paired .lock file. All reads/writes go through a
filelock, and writes are atomic (write to temp file, fsync, os.replace)
so a crash or concurrent request can never leave a half-written,
corrupted JSON file on disk.

This is a stand-in for a real database per current project requirements.
Swapping this module out for a DB-backed one later should not require
changing any route/service code, as long as the same function signatures
are kept.
"""
import json
import os
import tempfile
from pathlib import Path
from filelock import FileLock

_LOCK_TIMEOUT = 10  # seconds


def _lock_path(path: Path) -> str:
    return str(path) + ".lock"


def read_all(path: Path) -> list:
    """Return the list stored in `path`. Empty list if file doesn't exist yet."""
    lock = FileLock(_lock_path(path), timeout=_LOCK_TIMEOUT)
    with lock:
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return []
            return json.loads(content)


def _atomic_write(path: Path, data: list) -> None:
    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp_", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)  # atomic on POSIX
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def write_all(path: Path, data: list) -> None:
    lock = FileLock(_lock_path(path), timeout=_LOCK_TIMEOUT)
    with lock:
        _atomic_write(path, data)


def append(path: Path, record: dict) -> dict:
    """Read-modify-write under a single lock so concurrent appends never clobber each other."""
    lock = FileLock(_lock_path(path), timeout=_LOCK_TIMEOUT)
    with lock:
        current = []
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    current = json.loads(content)
        current.append(record)
        _atomic_write(path, current)
    return record


def update_where(path: Path, match_fn, update_fn) -> bool:
    """
    Update the first record for which match_fn(record) is True, in place,
    using update_fn(record) -> record. Returns True if a record was updated.
    """
    lock = FileLock(_lock_path(path), timeout=_LOCK_TIMEOUT)
    with lock:
        current = []
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    current = json.loads(content)
        updated = False
        for i, record in enumerate(current):
            if match_fn(record):
                current[i] = update_fn(record)
                updated = True
                break
        if updated:
            _atomic_write(path, current)
        return updated


def delete_where(path: Path, match_fn) -> bool:
    lock = FileLock(_lock_path(path), timeout=_LOCK_TIMEOUT)
    with lock:
        current = []
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    current = json.loads(content)
        new_data = [r for r in current if not match_fn(r)]
        changed = len(new_data) != len(current)
        if changed:
            _atomic_write(path, new_data)
        return changed
