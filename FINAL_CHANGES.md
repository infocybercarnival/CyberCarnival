# Final demo changes

- Backend switched to PostgreSQL/Supabase (`psycopg`), with Supabase connection values placed in `backend/.env` for handoff.
- Old MySQL SQL/migration files removed.
- Added `backend/postgres/schema.sql` and `backend/postgres/data.sql` converted from `Dump20260903`.
- Paid-event registration is created only after the final form submit contains a UPI transaction/UTR reference.
- My Events never shows an unpaid/pre-submit registration; submitted pending-verification registrations are shown with a pending label.
- Raw UPI URI/Open UPI App exposure removed from frontend/API; QR remains server-generated.
- Team token preview added with limited participant details for verification.
- Admin/coordinator participant names are clickable to view full details.
- Admin and coordinator CSV exports now contain each teammate as a separate row with contact/token/register-number information.
- Exact origin validation, confirmed-only public ticket access, production cross-site cookie settings, and PostgreSQL connection hardening added.
- Vercel no longer deploys the Flask backend; it builds only the frontend. Render is the sole backend.
- Google OAuth values updated to the supplied demo credentials. Cloudflare secret/site key intentionally left blank for the official values.
