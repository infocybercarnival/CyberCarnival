# CyberCarnival manual UPI registration flow

1. User clicks Register.
2. If not signed in, they are sent to create/login to a CyberCarnival account and get a token.
3. Registration modal loads saved account details from PostgreSQL/Supabase.
4. User chooses Individual or Team (event min/max team size is enforced server-side).
5. If the user already has another overlapping event, the UI shows a warning but does not block registration.
6. For paid events, the backend generates a UPI URI with the event-specific amount from `events.fee_amount` (stored in paise) and renders it as a QR.
7. User pays, enters the UPI transaction/reference ID, then submits.
8. Paid registrations are saved as `pending_verification`. The transaction ID is unique so the same reference cannot be reused in two registrations.
9. Coordinator/admin verifies the transaction against the actual receiving UPI/bank statement, then changes status to `confirmed`. Confirmation email/ticket should only be treated as final after this step.
10. Free events are confirmed immediately.

## Production payment QR settings
Set these server environment variables:

- `UPI_ID` — the college/club merchant VPA, e.g. `cybercarnival@bank`
- `UPI_PAYEE_NAME` — display name, e.g. `CyberCarnival 2026`
- `UPI_DUMMY_MODE=false`

The encoded URI format is:

`upi://pay?pa=<UPI_ID>&pn=<PAYEE>&am=<RUPEES>&cu=INR&tn=<EVENT>`

Example for a ₹250 event:

`upi://pay?pa=cybercarnival@bank&pn=CyberCarnival%202026&am=250.00&cu=INR&tn=CyberCarnival%20-%20CTF`

The amount is produced from the database (`fee_amount=25000` paise), so each event automatically gets the correct QR amount.

## Important limitation
A normal UPI QR + manually typed transaction ID is not automatic payment verification. A participant can type a fake/reference ID. Keep the registration `pending_verification` until an authorized person checks the actual merchant/bank statement. If you later get a proper payment gateway/merchant API, replace manual verification with server-to-server verification.
