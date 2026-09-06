from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf import CSRFProtect
from flask_sqlalchemy import SQLAlchemy

import config


def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address()


limiter = Limiter(key_func=get_client_ip, storage_uri=config.RATELIMIT_STORAGE_URI)
csrf = CSRFProtect()
db = SQLAlchemy()
