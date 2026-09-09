# CyberCarnival security audit — demo build

## Changes applied

- **Registration/payment state bug fixed:** payment-info and QR endpoints are read-only. Paid registrations are created only by the final registration POST and only when a transaction ID is supplied.
- **My Events hardened:** only confirmed registrations, or `pending_verification` registrations that actually contain a submitted transaction ID, are returned.
- **UPI disclosure reduced:** the payment-info JSON no longer returns the raw `upi://` URI and the frontend no longer prints an Open UPI App link. The QR is generated server-side. A receiving UPI VPA cannot be made secret from somebody who can scan/decode a functioning payment QR; it is part of the payment payload by design.
- **Transaction replay protection:** transaction/reference IDs remain unique at the database and application layer.
- **Origin validation fixed:** state-changing registration requests now compare exact normalized origins instead of vulnerable prefix matching.
- **Coordinator IDOR protection retained:** coordinator endpoints verify that the logged-in coordinator owns the requested event.
- **Team-token lookup privacy:** teammate preview requires login, is rate-limited, and returns only name/college/register number. It does not expose teammate email or phone before registration.
- **Admin/coordinator participant details:** authenticated staff views contain the full team-member details; names are clickable and exports include every member.
- **Public ticket tightened:** ticket data is returned only for confirmed registrations.
- **PostgreSQL production driver:** psycopg 3 is explicit and pool pre-ping is enabled for hosted DB connections.
- **Production session cookie:** `Secure` + `SameSite=None` is used in production because Vercel and Render are cross-site.
- **Security headers:** clickjacking, MIME sniffing, permissions policy, CSP, and HSTS-in-production remain enabled.
- **CAPTCHA:** Turnstile verification remains server-side; the official secret must be set only on Render and the public site key only on Vercel.

## Deployment items that still require your real values

- Exact Vercel URL in `ALLOWED_ORIGINS`.
- Exact Render URL in `SITE_URL`, `GOOGLE_REDIRECT_URI`, and Vercel's `NEXT_PUBLIC_API_URL`.
- Official Cloudflare Turnstile site/secret keys.
- Real UPI ID; keep `UPI_DUMMY_MODE=true` until it is available.

## Important operational notes

- Do not commit `backend/.env` to Git. Use Render environment variables. The project ZIP contains an `.env` only because it was requested for handoff.
- Rotate any credential that has been pasted into chat or previously committed before a real public launch.
- Vercel -> Render authentication relies on cross-site cookies. `SameSite=None; Secure` is required, but browser third-party-cookie restrictions can still affect some users. For the strongest production setup, use a custom domain so frontend and API are same-site (for example `cybercarnival.example` and `api.cybercarnival.example`) or proxy the API through the frontend origin.
- Manual UPI verification is not equivalent to a payment gateway webhook. Coordinators/admins must verify the UTR against the receiving account before confirming payment.
