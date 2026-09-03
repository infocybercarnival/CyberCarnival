# Render + Vercel + Supabase demo deployment

## 1. Supabase
Run, in order:

- `backend/postgres/schema.sql`
- `backend/postgres/data.sql`

## 2. Render backend
Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
gunicorn --chdir backend app:app
```

Set environment variables from `backend/.env` in the Render dashboard. For the demo also set:

- `FLASK_ENV=production`
- `ALLOWED_ORIGINS=https://YOUR-VERCEL-DOMAIN.vercel.app`
- `SITE_URL=https://YOUR-RENDER-SERVICE.onrender.com`
- `GOOGLE_REDIRECT_URI=https://YOUR-RENDER-SERVICE.onrender.com/api/auth/google/callback`
- `TURNSTILE_SECRET_KEY=<official secret key>`
- `UPI_ID=<real receiving VPA when available>`
- `UPI_DUMMY_MODE=false` only after the real UPI ID is configured

Add the exact Render callback URL to the Google OAuth client's Authorized redirect URIs.

## 3. Vercel frontend
Set these Vercel environment variables before building:

```text
NEXT_PUBLIC_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<official public site key>
NEXT_PUBLIC_BASE_PATH=
```

Deploy the repository using the existing `vercel.json` build/output settings.

## 4. Demo smoke test

1. Open `/api/health` on Render.
2. Open the Vercel site and confirm events load from Supabase.
3. Create/sign into a participant account.
4. Open a paid event registration. Merely opening/scanning the QR must not add anything to My Events.
5. Enter teammate tokens; their safe verification details should appear.
6. Submit a UTR/transaction ID. Only now should the event appear in My Events as payment verification pending.
7. Log into the coordinator panel, click participant names to inspect details, verify payment, and export CSV.
8. Confirm the CSV contains every team member as a separate row.
