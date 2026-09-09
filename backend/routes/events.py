from flask import Blueprint, jsonify, Response
from services import event_service, payment_service
import config
from utils.qrcode_gen import generate_qr_png

bp = Blueprint("events", __name__)


@bp.get("/api/events")
def list_events():
    return jsonify([e.to_public_dict() for e in event_service.list_events()])


@bp.get("/api/events/<event_id>")
def get_event(event_id):
    event = event_service.get_event(event_id)
    if not event or not event.active:
        return jsonify({"error": "not found"}), 404
    return jsonify(event.to_public_dict())


@bp.get("/api/events/<event_id>/payment-info")
def payment_info(event_id):
    event = event_service.get_event(event_id)
    if not event or not event.active:
        return jsonify({"error": "not found"}), 404
    amount = event.fee_amount or 0
    return jsonify({
        "amount": amount,
        "currency": "INR",
        # Do not expose the raw UPI URI as ordinary page/API text. The QR is
        # generated server-side. Note: a valid payment QR necessarily embeds
        # the receiving VPA, so a user can still decode it from the QR itself.
        "qr_url": f"/api/events/{event.id}/payment-qr",
        "is_dummy": config.UPI_DUMMY_MODE,
    })


@bp.get("/api/events/<event_id>/payment-qr")
def payment_qr(event_id):
    event = event_service.get_event(event_id)
    if not event or not event.active:
        return jsonify({"error": "not found"}), 404
    if not event.fee_amount:
        return jsonify({"error": "this event is free"}), 400
    uri = payment_service.build_upi_uri(event.fee_amount, event.name)
    return Response(generate_qr_png(uri, box_size=8, border=2), mimetype="image/png",
                    headers={"Cache-Control": "no-store"})
