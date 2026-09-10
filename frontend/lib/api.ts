export function getApiUrl(): string {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim()

  if (configuredApiUrl) {
    return configuredApiUrl.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://${hostname}:5000`
    }

    // Office-server / same-origin fallback.
    return window.location.origin
  }

  return ''
}

export const API_URL = getApiUrl()

async function fetchCsrfToken(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/csrf-token`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Could not obtain CSRF token (${res.status})`)
  }

  const data = await res.json()
  if (!data?.csrf_token) {
    throw new Error('CSRF token missing from server response')
  }

  return data.csrf_token as string
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiUrl()
  const method = (options.method || 'GET').toUpperCase()
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const headers = new Headers(options.headers || {})

  if (unsafe) {
    const csrfToken = await fetchCsrfToken(baseUrl)
    headers.set('X-CSRFToken', csrfToken)
  }

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
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
    throw new ApiValidationError(
      data.error || `request failed (${res.status})`,
      data.fields,
      res.status
    )
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
  socials: {
    twitter: string | null
    linkedin: string | null
    github: string | null
  }
  is_featured: boolean
}

export async function fetchSpeakers(): Promise<ApiSpeaker[]> {
  const res = await apiFetch('/api/speakers', { cache: 'no-store' })
  return parseOrThrow(res)
}

// --- Events ---------------------------------------------------------------------------

export type ApiCoordinator = {
  id: string
  name: string
  email: string
  phone: string
  is_active: boolean
}

export type ApiEvent = {
  id: string
  name: string
  category: string
  tag: string | null
  description: string | null
  poster_url: string | null
  poster_url_2: string | null
  venue: string | null
  date: string | null
  time: string | null
  fee: string | null
  fee_amount: number | null
  min_team_size: number | null
  max_team_size: number | null
  max_teams: number | null
  capacity?: number | null
  confirmed_count?: number
  confirmation_pending_count?: number
  occupied_count?: number
  available_slots?: number | null
  confirmation_queue_full?: boolean
  teams_registered: number
  seats_available: number | null
  prize: string | null
  registration_open: boolean
  coordinators?: {
    faculty: ApiCoordinator[]
    student: ApiCoordinator[]
  }
}

let eventsPromiseCache: Promise<ApiEvent[]> | null = null

export async function fetchEvents(): Promise<ApiEvent[]> {
  if (eventsPromiseCache) return eventsPromiseCache

  eventsPromiseCache = (async () => {
    try {
      const res = await apiFetch('/api/events', { cache: 'no-store' })

      if (!res.ok) {
        throw new Error('Could not load events from the server.')
      }

      return await res.json()
    } catch (err) {
      eventsPromiseCache = null
      throw err
    }
  })()

  return eventsPromiseCache
}

export async function fetchEvent(eventId: string): Promise<ApiEvent> {
  const res = await apiFetch(
    `/api/events/${encodeURIComponent(eventId)}`,
    { cache: 'no-store' }
  )

  if (res.status === 404) {
    throw new ApiValidationError('Event not found', undefined, 404)
  }

  if (!res.ok) {
    throw new ApiValidationError(
      `Could not load event (${res.status})`,
      undefined,
      res.status
    )
  }

  return res.json()
}

// --- Authentication -------------------------------------------------------------------

export async function initiateGoogleLogin(
  turnstileToken: string,
  source: 'login' | 'register' = 'login'
): Promise<string> {
  const res = await apiFetch('/api/auth/google/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      turnstile_token: turnstileToken,
      source,
    }),
  })

  const data = await parseOrThrow(res)
  return data.auth_url
}

export type RequestOtpResponse = {
  ok?: boolean
  cooldown_active?: boolean
  error?: string
}

export async function requestOtp(
  email: string,
  turnstileToken: string
): Promise<RequestOtpResponse> {
  const res = await apiFetch('/api/auth/request-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      turnstile_token: turnstileToken,
    }),
  })

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))

    if (
      data.cooldown_active ||
      (data.error && data.error.includes('wait a minute'))
    ) {
      return {
        cooldown_active: true,
        error: data.error,
      }
    }
  }

  return parseOrThrow(res)
}

export async function verifyOtp(email: string, otp: string): Promise<void> {
  const res = await apiFetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      otp,
    }),
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
  await apiFetch('/api/auth/logout', {
    method: 'POST',
  })
}

export type LoginResponse = {
  otp_required?: boolean
  masked_email?: string
  message?: string
}

export async function loginWithPassword(credentials: {
  username: string
  password: string
  turnstileToken: string
}): Promise<LoginResponse> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
      turnstile_token: credentials.turnstileToken,
    }),
  })

  return parseOrThrow(res)
}

export async function verifyLoginOtp(otp: string): Promise<PublicUser> {
  const res = await apiFetch('/api/auth/verify-login-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ otp }),
  })

  return parseOrThrow(res)
}

export async function resendLoginOtp(): Promise<void> {
  const res = await apiFetch('/api/auth/resend-login-otp', {
    method: 'POST',
  })

  await parseOrThrow(res)
}

export async function fetchMe(): Promise<PublicUser | null> {
  const res = await apiFetch('/api/auth/me', {
    cache: 'no-store',
  })

  if (res.status === 401) {
    return null
  }

  return parseOrThrow(res)
}

export async function completeProfile(data: {
  full_name?: string
  phone?: string
  college?: string
  participant_name?: string
  participant_email?: string
  college_name?: string
  details_confirmed?: boolean
  is_srm_ramapuram?: boolean
  register_number?: string
}): Promise<PublicUser> {
  const res = await apiFetch('/api/auth/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  return parseOrThrow(res)
}

// --- My Events -------------------------------------------------------------------------

export type MyEvent = {
  registration_id: string
  event_id: string
  event_name: string
  team_name: string | null
  is_leader: boolean
  status:
    | 'confirmed'
    | 'pending_payment'
    | 'pending_verification'
    | 'rejected'
    | 'cancelled'
  rejection_reason?: string | null
  members: {
    name: string
    token: string
    is_leader?: boolean
  }[]
  venue: string | null
  date: string | null
  time: string | null
}

export async function fetchMyEvents(): Promise<MyEvent[]> {
  const res = await apiFetch('/api/auth/me/events', {
    cache: 'no-store',
  })

  return parseOrThrow(res)
}

// --- Event registration ---------------------------------------------------------------

export type ParticipantDetail = {
  participant_name: string
  participant_email: string
  college_name: string
  participant_phone: string
  is_leader?: boolean
  member_id?: string
  user_id?: string
}

export type ParticipantDetailsResponse = {
  registration_id: string
  event_id: string
  event_name: string
  participant_mode: string
  team_name: string | null
  status: string
  participants: ParticipantDetail[]
}

export type RegistrationPayload = {
  event_id: string
  participant_mode: 'individual' | 'team'
  team_name?: string
  member_tokens?: string[]
  transaction_id?: string
  participants?: ParticipantDetail[]
}

export type RegistrationResult = {
  id: string
  status:
    | 'confirmed'
    | 'pending_payment'
    | 'pending_verification'
    | 'rejected'
    | 'cancelled'
  warnings: string[]
  payment_url?: string | null
  payment_message?: string | null
}

export type PaymentPageData = {
  registration_id: string
  event_id: string
  event_name: string
  event_description: string
  event_date: string | null
  event_time: string | null
  venue: string | null
  fee_amount_paise: number
  fee_amount_rupees: string
  participant_mode: string
  team_name: string | null
  status: string
  transaction_id: string
  disclaimer_accepted: boolean
  has_proof: boolean
  upi_id: string
  upi_payee_name: string
  upi_dummy_mode: boolean
  qr_url: string
  members: {
    name: string
    email?: string
    college?: string
    phone?: string
    is_leader: boolean
  }[]
}

export async function fetchPaymentDetails(
  eventId: string,
  registrationId: string
): Promise<PaymentPageData> {
  const res = await apiFetch(
    `/api/events/${encodeURIComponent(eventId)}/payment/${encodeURIComponent(
      registrationId
    )}`,
    { cache: 'no-store' }
  )

  return parseOrThrow(res)
}

export async function submitPaymentProof(
  registrationId: string,
  formData: FormData
): Promise<{
  id: string
  status: string
  message: string
}> {
  const res = await apiFetch(
    `/api/registrations/${encodeURIComponent(registrationId)}/payment`,
    {
      method: 'POST',
      body: formData,
    }
  )

  return parseOrThrow(res)
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

export async function fetchMemberPreview(
  token: string
): Promise<MemberPreview> {
  const res = await apiFetch(
    `/api/registrations/member-preview/${encodeURIComponent(
      token.trim().toUpperCase()
    )}`
  )

  return parseOrThrow(res)
}

export async function fetchPaymentInfo(
  eventId: string
): Promise<PaymentInfo> {
  const res = await apiFetch(
    `/api/events/${encodeURIComponent(eventId)}/payment-info`,
    { cache: 'no-store' }
  )

  return parseOrThrow(res)
}

export function paymentQrUrl(eventId: string): string {
  return `${getApiUrl()}/api/events/${encodeURIComponent(eventId)}/payment-qr`
}

export async function fetchRegistrationWarnings(
  eventId: string
): Promise<string[]> {
  const res = await apiFetch(
    `/api/registrations/preflight/${encodeURIComponent(eventId)}`
  )

  const data = await parseOrThrow(res)
  return data.warnings || []
}

export async function submitRegistration(
  payload: RegistrationPayload
): Promise<RegistrationResult> {
  const res = await apiFetch('/api/registrations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseOrThrow(res)
}

export async function fetchParticipantDetails(
  registrationId: string
): Promise<ParticipantDetailsResponse> {
  const res = await apiFetch(
    `/api/registrations/${encodeURIComponent(
      registrationId
    )}/participant-details`
  )

  return parseOrThrow(res)
}

export async function submitParticipantDetails(
  registrationId: string,
  participants: ParticipantDetail[]
): Promise<{
  id: string
  status: string
  message: string
}> {
  const res = await apiFetch(
    `/api/registrations/${encodeURIComponent(
      registrationId
    )}/participant-details`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ participants }),
    }
  )

  return parseOrThrow(res)
}

// --- Ticket ---------------------------------------------------------------------------

export type Ticket = {
  status: string
  event_name: string
  team_name: string | null
  venue: string | null
  date: string | null
  time: string | null
  members: {
    name: string
    is_leader: boolean
  }[]
}

export async function fetchTicket(
  registrationId: string
): Promise<Ticket> {
  const res = await fetch(
    `${getApiUrl()}/api/registrations/${encodeURIComponent(
      registrationId
    )}/ticket`,
    {
      cache: 'no-store',
    }
  )

  return parseOrThrow(res)
}
