# CyberCarnival Backend

Flask API + admin/coordinator dashboards for CyberCarnival.

## Production stack

- Backend: Render
- Database: PostgreSQL on Supabase
- Frontend: Vercel
- ORM: Flask-SQLAlchemy + psycopg 3

## PostgreSQL bootstrap

The authoritative SQL files are now only in `backend/postgres/`:

1. Run `backend/postgres/schema.sql` in Supabase SQL Editor.
2. Run `backend/postgres/data.sql` to import the data converted from `Dump20260903`.
3. Set `DATABASE_URL` on Render to the Supabase pooler connection string.

Old MySQL schema/migration SQL files were removed.

## Required Render environment variables

At minimum configure: `SECRET_KEY`, `FLASK_ENV=production`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `SITE_URL`, Google OAuth values, Cloudflare Turnstile secret, UPI payment values, and email values.

Because the Vercel frontend and Render backend are cross-site, production session cookies are configured as `Secure; SameSite=None`. `ALLOWED_ORIGINS` must contain only the exact Vercel/custom frontend origins.

## Manual UPI payment rule

Loading the registration modal or payment QR never creates a registration. For a paid event a record is created only when the authenticated participant submits the registration form with a transaction/UTR reference. It is stored as `pending_verification` until an admin/coordinator verifies it.
