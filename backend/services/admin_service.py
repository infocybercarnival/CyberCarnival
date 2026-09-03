from extensions import db
from models import Admin
from utils.security import hash_password, verify_password


def get_admin_by_username(username: str):
    return Admin.query.filter_by(username=username).first()


def verify_admin_credentials(username: str, password: str) -> bool:
    admin = get_admin_by_username(username)
    if not admin:
        # Still run a hash check against a dummy hash so responses take
        # roughly the same time whether the username exists or not
        # (mitigates username enumeration via timing).
        verify_password(password, hash_password("decoy-password-not-real"))
        return False
    return verify_password(password, admin.password_hash)


def create_admin(username: str, plain_password: str) -> Admin:
    if get_admin_by_username(username):
        raise ValueError("username already exists")
    admin = Admin(username=username, password_hash=hash_password(plain_password))
    db.session.add(admin)
    db.session.commit()
    return admin
