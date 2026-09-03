from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf import CSRFProtect
from flask_sqlalchemy import SQLAlchemy

import config

limiter = Limiter(key_func=get_remote_address, storage_uri=config.RATELIMIT_STORAGE_URI)
csrf = CSRFProtect()
db = SQLAlchemy()
