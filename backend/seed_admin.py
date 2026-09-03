"""
Creates the first admin account from BOOTSTRAP_ADMIN_USERNAME /
BOOTSTRAP_ADMIN_PASSWORD in .env. The password is hashed immediately on
write — the plaintext is never persisted anywhere.

After running this once, remove BOOTSTRAP_ADMIN_PASSWORD from .env.
Run: python seed_admin.py
"""
import getpass
import os
import sys

from app import app
from services.admin_service import create_admin, get_admin_by_username

if __name__ == "__main__":
    username = os.environ.get("BOOTSTRAP_ADMIN_USERNAME") or input("Admin username: ").strip()
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD") or getpass.getpass("Admin password: ")

    if not username or not password:
        print("Username and password are required.")
        sys.exit(1)

    if len(password) < 3:
        print("Refusing to create an admin with a password under 3 characters.")
        sys.exit(1)

    with app.app_context():
        if get_admin_by_username(username):
            print(f"Admin '{username}' already exists — not overwriting.")
            sys.exit(1)

        create_admin(username, password)
        print(f"Admin '{username}' created. Remove BOOTSTRAP_ADMIN_PASSWORD from .env now.")
