"""Manual UPI QR payment helpers.

A UPI QR can pre-fill payee + amount, but the QR by itself does NOT prove
that money arrived. Therefore a paid registration is stored as
pending_verification until an authorized coordinator/admin checks the bank/UPI
statement and confirms it.
"""
from urllib.parse import urlencode
import config


def build_upi_uri(amount_paise: int, event_name: str, registration_ref: str | None = None) -> str:
    amount_rupees = f"{(amount_paise or 0) / 100:.2f}"
    note = f"CyberCarnival - {event_name}"
    if registration_ref:
        note += f" - {registration_ref}"
    params = {
        "pa": config.UPI_ID,
        "pn": config.UPI_PAYEE_NAME,
        "am": amount_rupees,
        "cu": "INR",
        "tn": note[:80],
    }
    return "upi://pay?" + urlencode(params)
