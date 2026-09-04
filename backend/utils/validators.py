"""
Strict, allow-list style validation for all public input.
Never trust the client. Reject anything that doesn't match, don't try to
"fix" or reinterpret bad input.
"""
import re

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9.\-]{1,255}\.[a-zA-Z]{2,24}$")
PHONE_RE = re.compile(r"^[0-9+\-() ]{7,20}$")
# Letters (incl. common accented ranges), spaces, hyphens, apostrophes, dots.
NAME_RE = re.compile(r"^[A-Za-z\u00C0-\u024F .'\-]{2,80}$")
SAFE_TEXT_RE = re.compile(r"^[A-Za-z0-9 .,'\-&()/]{0,200}$")
ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")
OTP_RE = re.compile(r"^[0-9]{6}$")
TOKEN_RE = re.compile(r"^CC[A-Z0-9]{8,14}$")
TEAM_NAME_RE = re.compile(r"^[A-Za-z0-9 .,'\-&()/]{0,120}$")


class ValidationError(Exception):
    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__(str(errors))


def _strip(value) -> str:
    if not isinstance(value, str):
        raise ValueError("expected a string")
    # Strip control characters (defends against log injection / hidden payloads).
    cleaned = "".join(ch for ch in value if ch >= " " or ch == "\t")
    return cleaned.strip()


def validate_registration_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "request body must be a JSON object"})

    errors = {}
    clean = {}

    try:
        name = _strip(data.get("name", ""))
        if not NAME_RE.match(name):
            errors["name"] = "must be 2-80 letters, spaces, hyphens, apostrophes, or dots"
        clean["name"] = name
    except ValueError:
        errors["name"] = "invalid"

    try:
        email = _strip(data.get("email", "")).lower()
        if not EMAIL_RE.match(email):
            errors["email"] = "invalid email address"
        clean["email"] = email
    except ValueError:
        errors["email"] = "invalid"

    try:
        phone = _strip(data.get("phone", ""))
        if not PHONE_RE.match(phone):
            errors["phone"] = "invalid phone number"
        clean["phone"] = phone
    except ValueError:
        errors["phone"] = "invalid"

    try:
        event_id = _strip(data.get("event_id", ""))
        if not ID_RE.match(event_id):
            errors["event_id"] = "invalid event_id"
        clean["event_id"] = event_id
    except ValueError:
        errors["event_id"] = "invalid"

    try:
        college = _strip(data.get("college", ""))
        if college and not SAFE_TEXT_RE.match(college):
            errors["college"] = "contains unsupported characters"
        clean["college"] = college
    except ValueError:
        errors["college"] = "invalid"

    # Optional team member list — capped in size to prevent abuse.
    team_members = data.get("team_members", [])
    if team_members:
        if not isinstance(team_members, list) or len(team_members) > 10:
            errors["team_members"] = "must be a list of at most 10 names"
        else:
            cleaned_members = []
            for member in team_members:
                try:
                    m = _strip(member)
                except ValueError:
                    errors["team_members"] = "invalid member name"
                    break
                if not NAME_RE.match(m):
                    errors["team_members"] = "invalid member name"
                    break
                cleaned_members.append(m)
            else:
                clean["team_members"] = cleaned_members
    else:
        clean["team_members"] = []

    if errors:
        raise ValidationError(errors)
    return clean


def validate_login_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "request body must be a JSON object"})
    username = _strip(data.get("username", ""))
    password = data.get("password", "")
    errors = {}
    if not username or len(username) > 64:
        errors["username"] = "required"
    if not isinstance(password, str) or not password or len(password) > 256:
        errors["password"] = "required"
    if errors:
        raise ValidationError(errors)
    return {"username": username, "password": password}


def validate_email_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "request body must be a JSON object"})
    try:
        email = _strip(data.get("email", "")).lower()
    except ValueError:
        raise ValidationError({"email": "invalid"})
    if not EMAIL_RE.match(email):
        raise ValidationError({"email": "invalid email address"})
    return {"email": email}


def validate_otp_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "request body must be a JSON object"})
    errors = {}
    try:
        email = _strip(data.get("email", "")).lower()
    except ValueError:
        email = ""
    if not EMAIL_RE.match(email):
        errors["email"] = "invalid email address"

    try:
        otp = _strip(data.get("otp", ""))
    except ValueError:
        otp = ""
    if not OTP_RE.match(otp):
        errors["otp"] = "must be a 6-digit code"

    if errors:
        raise ValidationError(errors)
    return {"email": email, "otp": otp}


INDIAN_PHONE_RE = re.compile(r"^(?:\+?91[\-\s]?)?[6-9]\d{9}$")


def validate_profile_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "request body must be a JSON object"})
    errors = {}
    clean = {}

    # 1. Participant Name *
    raw_name = data.get("participant_name") or data.get("full_name") or ""
    try:
        name = _strip(raw_name)
        if not name:
            errors["participant_name"] = "Participant Name is required"
        elif not NAME_RE.match(name):
            errors["participant_name"] = "must be 2-80 letters, spaces, hyphens, apostrophes, or dots"
        clean["full_name"] = name
        clean["participant_name"] = name
    except ValueError:
        errors["participant_name"] = "invalid name"

    # 2. Participant Email ID (Read-only field derived from authenticated account)
    raw_email = data.get("participant_email") or data.get("email") or ""
    if raw_email:
        try:
            email = _strip(raw_email).lower()
            if email and not EMAIL_RE.match(email):
                errors["participant_email"] = "must be a valid email address"
            clean["email"] = email
            clean["participant_email"] = email
        except ValueError:
            pass

    # 3. College Name * (Mandatory)
    raw_college = data.get("college_name") or data.get("college") or ""
    try:
        college = _strip(raw_college)
        if not college:
            errors["college_name"] = "College Name is required"
        elif not SAFE_TEXT_RE.match(college):
            errors["college_name"] = "contains unsupported characters"
        clean["college"] = college
        clean["college_name"] = college
    except ValueError:
        errors["college_name"] = "invalid college name"

    # 4. Phone Number * (Mandatory - exactly 10 numeric digits)
    raw_phone = data.get("phone") or data.get("participant_phone") or ""
    if not isinstance(raw_phone, str):
        errors["phone"] = "Phone number must be exactly 10 digits."
    else:
        phone = raw_phone.strip()
        if not phone:
            errors["phone"] = "Phone number must be exactly 10 digits."
        elif not re.match(r"^[0-9]{10}$", phone):
            errors["phone"] = "Phone number must be exactly 10 digits."
        else:
            clean["phone"] = phone
            clean["participant_phone"] = phone

    # 5. Confirmation Checkbox * (Mandatory boolean True)
    confirmed = data.get("details_confirmed")
    if not (isinstance(confirmed, bool) and confirmed is True):
        errors["details_confirmed"] = "Please confirm that the above details are correct before continuing."
    else:
        clean["details_confirmed"] = True

    if errors:
        raise ValidationError(errors)
    return clean


def validate_event_registration_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "request body must be a JSON object"})
    errors = {}
    clean = {}

    try:
        event_id = _strip(data.get("event_id", ""))
        if not ID_RE.match(event_id):
            errors["event_id"] = "invalid event_id"
        clean["event_id"] = event_id
    except ValueError:
        errors["event_id"] = "invalid"

    try:
        team_name = _strip(data.get("team_name", ""))
        if team_name and not TEAM_NAME_RE.match(team_name):
            errors["team_name"] = "contains unsupported characters"
        clean["team_name"] = team_name
    except ValueError:
        errors["team_name"] = "invalid"

    try:
        participant_mode = _strip(data.get("participant_mode", "individual")).lower()
        if participant_mode not in {"individual", "team"}:
            errors["participant_mode"] = "must be individual or team"
        clean["participant_mode"] = participant_mode
    except ValueError:
        errors["participant_mode"] = "invalid"

    try:
        transaction_id = _strip(data.get("transaction_id", "")).upper()
        if transaction_id and (len(transaction_id) < 6 or len(transaction_id) > 80 or not SAFE_TEXT_RE.match(transaction_id)):
            errors["transaction_id"] = "enter a valid UPI transaction/reference ID"
        clean["transaction_id"] = transaction_id
    except ValueError:
        errors["transaction_id"] = "invalid"

    # Teammates are added by their cybercarnival_token, not free-text names —
    # each token must already belong to a verified account.
    member_tokens = data.get("member_tokens", [])
    if member_tokens:
        if not isinstance(member_tokens, list) or len(member_tokens) > 10:
            errors["member_tokens"] = "must be a list of at most 10 tokens"
        else:
            cleaned_tokens = []
            for token in member_tokens:
                try:
                    t = _strip(token).upper()
                except ValueError:
                    errors["member_tokens"] = "invalid token"
                    break
                if not TOKEN_RE.match(t):
                    errors["member_tokens"] = f"invalid token: {token}"
                    break
                cleaned_tokens.append(t)
            else:
                clean["member_tokens"] = cleaned_tokens
    else:
        clean["member_tokens"] = []

    # Optional inline participant details roster
    participants = data.get("participants", [])
    if participants:
        if not isinstance(participants, list) or len(participants) > 11:
            errors["participants"] = "Participants must be a list of at most 11 member details"
        else:
            cleaned_participants = []
            seen_emails = set()
            for idx, p_data in enumerate(participants):
                try:
                    p_clean = validate_single_participant_detail(p_data, idx)
                    p_email = p_clean["participant_email"]
                    if p_email in seen_emails:
                        errors["participants"] = "This email ID is already registered for another participant."
                        break
                    seen_emails.add(p_email)
                    cleaned_participants.append(p_clean)
                except ValidationError as ve:
                    for k, v in ve.errors.items():
                        errors[f"participants[{idx}].{k}"] = v
                    break
            else:
                clean["participants"] = cleaned_participants
    else:
        clean["participants"] = []

    if errors:
        raise ValidationError(errors)
    return clean


def validate_single_participant_detail(data: dict, index: int = 0) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "Participant detail must be a JSON object"})

    errors = {}
    clean = {}

    # 1. Participant Name
    raw_name = data.get("participant_name") or data.get("name") or ""
    try:
        name = _strip(str(raw_name))
        if not name or len(name) < 2 or len(name) > 120 or not NAME_RE.match(name):
            errors["participant_name"] = "Full name is required (2-120 letters, spaces, hyphens)"
        else:
            clean["participant_name"] = name
    except ValueError:
        errors["participant_name"] = "Full name is required"

    # 2. Participant Email
    raw_email = data.get("participant_email") or data.get("email") or ""
    try:
        email = _strip(str(raw_email)).lower()
        if not email or not EMAIL_RE.match(email):
            errors["participant_email"] = "Valid email address is required"
        else:
            clean["participant_email"] = email
    except ValueError:
        errors["participant_email"] = "Valid email address is required"

    # 3. College Name
    raw_college = data.get("college_name") or data.get("college") or ""
    try:
        college = _strip(str(raw_college))
        if not college or len(college) < 2 or len(college) > 150:
            errors["college_name"] = "College name is required"
        else:
            clean["college_name"] = college
    except ValueError:
        errors["college_name"] = "College name is required"

    # 4. Contact Number (Phone)
    raw_phone = data.get("participant_phone") or data.get("phone") or ""
    try:
        phone = _strip(str(raw_phone))
        digits = re.sub(r"\D", "", phone)
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        elif digits.startswith("0") and len(digits) == 11:
            digits = digits[1:]

        if len(digits) != 10 or digits[0] not in "6789":
            errors["participant_phone"] = "Valid 10-digit Indian contact number is required"
        else:
            clean["participant_phone"] = digits
    except ValueError:
        errors["participant_phone"] = "Valid contact number is required"

    if errors:
        raise ValidationError(errors)
    return clean


def validate_participant_details_submission(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"_": "Request body must be a JSON object"})

    errors = {}
    clean = {}

    participants = data.get("participants", [])
    if not isinstance(participants, list) or not participants:
        if "participant_name" in data or "name" in data:
            participants = [data]
        else:
            errors["participants"] = "At least one participant details entry is required"
            raise ValidationError(errors)

    if len(participants) > 11:
        errors["participants"] = "Maximum 11 participant entries allowed"
        raise ValidationError(errors)

    cleaned_participants = []
    seen_emails = set()

    for idx, p_data in enumerate(participants):
        try:
            p_clean = validate_single_participant_detail(p_data, idx)
            p_email = p_clean["participant_email"]
            if p_email in seen_emails:
                errors["participants"] = "This email ID is already registered for another participant."
                break
            seen_emails.add(p_email)
            cleaned_participants.append(p_clean)
        except ValidationError as ve:
            for k, v in ve.errors.items():
                errors[f"participants[{idx}].{k}"] = v
            break

    if errors:
        raise ValidationError(errors)

    clean["participants"] = cleaned_participants
    return clean


