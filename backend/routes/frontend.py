"""
Serves the frontend's static export (frontend/out, built with `npm run build`
or `pnpm build` after setting output: 'export' in next.config.mjs) from the
same Flask process — so `python app.py` alone runs the whole site.

This blueprint is registered LAST in app.py and only matches paths nothing
else claimed (/api/*, /admin/*, /static/* are all more specific routes and
win automatically). If frontend/out doesn't exist yet (frontend not built),
requests here 404 with a helpful message instead of crashing.
"""
from pathlib import Path
from flask import Blueprint, send_from_directory, abort, jsonify

import config

bp = Blueprint("frontend", __name__)


def _resolve_safe(path: str) -> Path | None:
    """Resolve `path` under FRONTEND_DIST_DIR, refusing anything that escapes it."""
    target = (config.FRONTEND_DIST_DIR / path).resolve()
    try:
        target.relative_to(config.FRONTEND_DIST_DIR)
    except ValueError:
        return None  # path traversal attempt (e.g. ../../etc/passwd)
    return target


@bp.route("/", defaults={"path": ""})
@bp.route("/<path:path>")
def serve_frontend(path):
    if not config.FRONTEND_DIST_DIR.exists():
        return jsonify(
            {
                "error": "frontend not built",
                "hint": "run `npm run build` (or `pnpm build`) inside the frontend/ "
                "folder, then restart the backend.",
            }
        ), 404

    target = _resolve_safe(path)
    if target is None:
        abort(404)

    # 1. Exact file (JS/CSS/images/etc, or an already-.html path).
    if target.is_file():
        rel = target.relative_to(config.FRONTEND_DIST_DIR)
        return send_from_directory(config.FRONTEND_DIST_DIR, rel.as_posix())

    # 2. Next static export page file: <route>.html
    html_file = config.FRONTEND_DIST_DIR / f"{path}.html" if path else config.FRONTEND_DIST_DIR / "index.html"
    if html_file.is_file():
        rel = html_file.relative_to(config.FRONTEND_DIST_DIR)
        return send_from_directory(config.FRONTEND_DIST_DIR, rel.as_posix())

    # 3. Next static export page folder: <route>/index.html (trailingSlash: true style)
    index_file = config.FRONTEND_DIST_DIR / path / "index.html"
    if index_file.is_file():
        rel = index_file.relative_to(config.FRONTEND_DIST_DIR)
        return send_from_directory(config.FRONTEND_DIST_DIR, rel.as_posix())

    abort(404)
