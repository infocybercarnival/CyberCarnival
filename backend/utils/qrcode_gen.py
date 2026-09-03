"""
Generates QR code images for email tickets. Pure function — takes the URL
to encode, returns PNG bytes. No DB/request access here on purpose, so it's
trivially testable and reusable outside the email-sending path later
(e.g. an admin "view QR" button) if that's ever wanted.
"""
import io

import qrcode
from qrcode.constants import ERROR_CORRECT_M


def generate_qr_png(data: str, box_size: int = 10, border: int = 2) -> bytes:
    qr = qrcode.QRCode(
        error_correction=ERROR_CORRECT_M,  # tolerates some print/screen glare
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
