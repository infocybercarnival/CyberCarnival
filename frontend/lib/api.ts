// Talks to Flask backend. In dev (`pnpm dev`), NEXT_PUBLIC_API_URL from
// .env.development points at the standalone backend on :5000. In production
// this is unset on purpose — Flask serves the built frontend and the API
// from the same origin, so relative paths ('') just work, no CORS needed.
const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// Every call that carries the participant session cookie needs
// credentials: 'include' — otherwise the browser won't send/accept it
// cross-origin (dev mode, frontend on :3000 / backend on :5000).
async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, { ...options, credentials: 'include' })
}

export class ApiValidationError extends Error {
  fields?: Record<string, string>
  status?: number
  constructor(message: string, fields?: Record<string, string>, status?: number) {
    super(message)
    this.fields = fields
    this.status = status
  }
}

async function parseOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiValidationError(data.error || `request failed (${res.status})`, data.fields, res.status)
  }
  return data
}

// --- Speakers ---------------------------------------------------------------------------

export type ApiSpeaker = {
  id: string
  name: string
  designation: string | null
  organization: string | null
  category: string
  portrait_url: string | null
  bio: string | null
  expertise: string[]
  session_title: string | null
  session_time: string | null
  session_venue: string | null
  socials: { twitter: string | null; linkedin: string | null; github: string | null }
  is_featured: boolean
}

export async function fetchSpeakers(): Promise<ApiSpeaker[]> {
  const res = await fetch(`${API_URL}/api/speakers`, { cache: 'no-store' })
  return parseOrThrow(res)
}

// --- Events ---------------------------------------------------------------------------

export type ApiEvent = {
  id: string
  name: string
  category: string
  tag: string | null
  description: string | null
  poster_url: string | null
  venue: string | null
  date: string | null
  time: string | null
  fee: string | null
  fee_amount: number | null
  min_team_size: number | null
  max_team_size: number | null
  max_teams: number | null
  teams_registered: number
  seats_available: number | null
  prize: string | null
  registration_open: boolean
}

let eventsPromiseCache: Promise<ApiEvent[]> | null = null

export async function fetchEvents(): Promise<ApiEvent[]> {
  if (eventsPromiseCache) return eventsPromiseCache

  eventsPromiseCache = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/events`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not load events from the server.')
      return await res.json()
    } catch (err) {
      eventsPromiseCache = null
      throw err
    }
  })()

  return eventsPromiseCache
}

export async function fetchEvent(eventId: string): Promise<ApiEvent> {
  const res = await fetch(`${API_URL}/api/events/${encodeURIComponent(eventId)}`, { cache: 'no-store' })
  if (res.status === 404) {
    throw new ApiValidationError('Event not found', undefined, 404)
  }
  if (!res.ok) {
    throw new ApiValidationError(`Could not load event (${res.status})`, undefined, res.status)
  }
  return res.json()
}

export async function initiateGoogleLogin(turnstileToken: string): Promise<string> {
  const res = await apiFetch('/api/auth/google/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnstile_token: turnstileToken }),
  })
  const data = await parseOrThrow(res)
  return data.auth_url
}

export async function requestOtp(email: string, turnstileToken: string): Promise<void> {
  const res = await apiFetch('/api/auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, turnstile_token: turnstileToken }),
  })
  await parseOrThrow(res)
}

export async function verifyOtp(email: string, otp: string): Promise<void> {
  const res = await apiFetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  })
  await parseOrThrow(res)
}

export type PublicUser = {

  id: string
  cybercarnival_token: string
  username: string
  email: string
  full_name: string | null
  phone: string | null
  college: string | null
  is_srm_ramapuram: boolean
  register_number: string | null
  profile_completed: boolean
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' })
}

export async function loginWithPassword(credentials: { username: string; password: string; turnstileToken: string }): Promise<PublicUser> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
      turnstile_token: credentials.turnstileToken,
    }),
  })
  return parseOrThrow(res)
}

export async function fetchMe(): Promise<PublicUser | null> {
  const res = await apiFetch('/api/auth/me')
  if (res.status === 401) return null
  return parseOrThrow(res)
}

export async function completeProfile(data: {
  full_name: string
  phone: string
  college?: string
  is_srm_ramapuram?: boolean
  register_number?: string
}): Promise<PublicUser> {
  const res = await apiFetch('/api/auth/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return parseOrThrow(res)
}


export type MyEvent = {
  registration_id: string
  event_id: string
  event_name: string
  team_name: string | null
  is_leader: boolean
  status: 'confirmed' | 'pending_verification'
  members: { name: string; token: string }[]
  venue: string | null
  date: string | null
  time: string | null
}

export async function fetchMyEvents(): Promise<MyEvent[]> {
  const res = await apiFetch('/api/auth/me/events')
  return parseOrThrow(res)
}

// --- Event registration ---------------------------------------------------------------

export type RegistrationPayload = {
  event_id: string
  participant_mode: 'individual' | 'team'
  team_name?: string
  member_tokens?: string[]
  transaction_id?: string
}

export type RegistrationResult = {
  id: string
  status: 'confirmed' | 'pending_verification'
  warnings: string[]
  payment_message?: string | null
}

export type PaymentInfo = {
  amount: number
  currency: string
  qr_url: string
  is_dummy: boolean
}

export type MemberPreview = {
  cybercarnival_token: string
  name: string
  college: string | null
  register_number: string | null
}

export async function fetchMemberPreview(token: string): Promise<MemberPreview> {
  const res = await apiFetch(`/api/registrations/member-preview/${encodeURIComponent(token.trim().toUpperCase())}`)
  return parseOrThrow(res)
}

export async function fetchPaymentInfo(eventId: string): Promise<PaymentInfo> {
  const res = await fetch(`${API_URL}/api/events/${encodeURIComponent(eventId)}/payment-info`, { cache: 'no-store' })
  return parseOrThrow(res)
}

export function paymentQrUrl(eventId: string): string {
  return `${API_URL}/api/events/${encodeURIComponent(eventId)}/payment-qr`
}

export async function fetchRegistrationWarnings(eventId: string): Promise<string[]> {
  const res = await apiFetch(`/api/registrations/preflight/${encodeURIComponent(eventId)}`)
  const data = await parseOrThrow(res)
  return data.warnings || []
}

export async function submitRegistration(payload: RegistrationPayload): Promise<RegistrationResult> {
  const res = await apiFetch('/api/registrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseOrThrow(res)
}

// --- Ticket (public — what the emailed QR code / "view event details" link opens) -----

export type Ticket = {
  status: string
  event_name: string
  team_name: string | null
  venue: string | null
  date: string | null
  time: string | null
  members: { name: string; is_leader: boolean }[]
}

export async function fetchTicket(registrationId: string): Promise<Ticket> {
  // No credentials here on purpose — this is scanned at the door, possibly
  // by someone who isn't logged in as the registrant at all. The
  // registration_id itself (an unguessable UUID) is the access control.
  const res = await fetch(`${API_URL}/api/registrations/${encodeURIComponent(registrationId)}/ticket`, {
    cache: 'no-store',
  })
  return parseOrThrow(res)
}
