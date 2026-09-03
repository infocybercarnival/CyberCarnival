from flask import Blueprint, jsonify
from services import speaker_service

bp = Blueprint("speakers", __name__)


@bp.get("/api/speakers")
def list_speakers():
    return jsonify([s.to_public_dict() for s in speaker_service.list_speakers()])
