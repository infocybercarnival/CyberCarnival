import io
from PIL import Image, ImageDraw
from utils.qrcode_gen import generate_qr_png

def generate_ticket_attachment(
    recipient_name: str,
    event_name: str,
    registration_id: str,
    venue: str | None = None,
    event_date: str | None = None,
    event_time: str | None = None,
    team_name: str | None = None,
    ticket_url: str = ""
) -> bytes:
    """Generates an official CyberCarnival 2026 digital admission ticket PNG image
    containing event details, participant information, status, and embedded QR code.
    Uses Pillow (PIL) - zero extra heavy external PDF dependencies required."""
    width, height = 650, 420
    img = Image.new("RGB", (width, height), color=(11, 10, 16))  # #0b0a10
    draw = ImageDraw.Draw(img)

    # Outer border (Cyber Cyan & Purple accent gradient style)
    draw.rectangle([8, 8, width - 8, height - 8], outline=(42, 36, 56), width=2)
    draw.rectangle([12, 12, width - 12, height - 12], outline=(143, 42, 255), width=1)

    # Top Header Banner (#12101a)
    draw.rectangle([13, 13, width - 13, 75], fill=(18, 16, 26))
    draw.text((25, 25), "CYBERCARNIVAL 2026", fill=(0, 240, 255))
    draw.text((25, 48), "OFFICIAL EVENT ADMISSION TICKET", fill=(168, 168, 179))
    draw.text((width - 180, 35), "[ VERIFIED ]", fill=(16, 185, 129))

    # Left Section: Event & Participant Details
    left_x = 25
    curr_y = 95

    draw.text((left_x, curr_y), "EVENT:", fill=(119, 119, 127))
    draw.text((left_x + 110, curr_y), (event_name[:35] if event_name else "CYBERCARNIVAL EVENT"), fill=(245, 245, 247))
    curr_y += 30

    draw.text((left_x, curr_y), "PARTICIPANT:", fill=(119, 119, 127))
    draw.text((left_x + 110, curr_y), (recipient_name[:35] if recipient_name else "PARTICIPANT"), fill=(245, 245, 247))
    curr_y += 30

    if team_name:
        draw.text((left_x, curr_y), "TEAM:", fill=(119, 119, 127))
        draw.text((left_x + 110, curr_y), str(team_name[:35]), fill=(245, 245, 247))
        curr_y += 30

    draw.text((left_x, curr_y), "TICKET ID:", fill=(119, 119, 127))
    draw.text((left_x + 110, curr_y), str(registration_id), fill=(0, 240, 255))
    curr_y += 30

    draw.text((left_x, curr_y), "VENUE:", fill=(119, 119, 127))
    draw.text((left_x + 110, curr_y), (venue or "SRM RAMAPURAM")[:35], fill=(245, 245, 247))
    curr_y += 30

    draw.text((left_x, curr_y), "DATE & TIME:", fill=(119, 119, 127))
    dt_str = f"{event_date or '7 — 8 OCT 2026'} | {event_time or '09:00 AM'}"
    draw.text((left_x + 110, curr_y), dt_str[:38], fill=(245, 245, 247))
    curr_y += 30

    draw.text((left_x, curr_y), "STATUS:", fill=(119, 119, 127))
    draw.text((left_x + 110, curr_y), "CONFIRMED & APPROVED", fill=(16, 185, 129))

    # Right Section: Embedded QR Code
    if ticket_url:
        try:
            qr_bytes = generate_qr_png(ticket_url)
            qr_img = Image.open(io.BytesIO(qr_bytes)).convert("RGB").resize((160, 160))
            # Paste QR on white card background
            card = Image.new("RGB", (180, 180), color=(255, 255, 255))
            card.paste(qr_img, (10, 10))
            img.paste(card, (width - 210, 95))
            draw.text((width - 210, 285), "SCAN AT VENUE", fill=(168, 168, 179))
        except Exception:
            pass

    # Bottom Footer Line
    draw.line([(25, height - 45), (width - 25, height - 45)], fill=(42, 36, 56), width=1)
    draw.text((25, height - 35), "Carry valid student ID. Admission valid only for specified event.", fill=(119, 119, 127))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
