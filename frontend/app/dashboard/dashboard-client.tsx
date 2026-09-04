'use client'

import { useEffect, useState, useMemo, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { ChromaGrid, type ChromaGridItem } from '@/components/ChromaGrid'
import { EVENTS } from '@/lib/events-data'
import {
  fetchMe,
  fetchMyEvents,
  completeProfile,
  logout,
  type PublicUser,
  type MyEvent,
  ApiValidationError,
} from '@/lib/api'

type StatusFilter = 'ALL' | 'UPCOMING' | 'COMPLETED'

export function DashboardClient() {
  const router = useRouter()
  const [user, setUser] = useState<PublicUser | null>(null)
  const [events, setEvents] = useState<MyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedToken, setCopiedToken] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('ALL')

  useEffect(() => {
    fetchMe()
      .then((u) => {
        if (u) {
          setUser(u)
          if (u.profile_completed) {
            fetchMyEvents()
              .then((evs) => setEvents(evs || []))
              .catch(() => setEvents([]))
          } else {
            setEvents([])
          }
        } else {
          setUser(null)
          setEvents([])
        }
      })
      .catch(() => {
        setUser(null)
        setEvents([])
      })
      .finally(() => setLoading(false))
  }, [router])

  const staticByName = useMemo(() => new Map(EVENTS.map((e) => [e.name.toUpperCase(), e])), [])

  // Map backend registered events to ChromaGridItem layout matching /events
  const chromaItems: ChromaGridItem[] = useMemo(() => {
    return events.map((ev) => {
      const fallback = staticByName.get(ev.event_name.toUpperCase())
      const posterSrc = fallback?.poster || null
      const tag = ev.status === 'pending_verification' ? 'PAYMENT PENDING' : (fallback?.tag || 'REGISTERED')

      return {
        id: ev.event_id || ev.event_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: ev.event_name,
        tag,
        category: 'REGISTERED',
        description: ev.status === 'pending_verification' ? `Payment submitted — verification pending${ev.team_name ? ` · Team: ${ev.team_name}` : ''}` : (ev.team_name ? `Team: ${ev.team_name}` : 'Individual Registration'),
        posterSrc,
        posterAlt: `${ev.event_name} poster`,
        fee: fallback?.details.fee || 'REGISTERED',
        date: ev.date || fallback?.details.date || '7 — 8 OCTOBER',
        venue: ev.venue || fallback?.details.venue || 'SRM RAMAPURAM',
        teamSize: ev.members && ev.members.length > 0 ? `${ev.members.length} MEMBER(S)` : null,
        seatsStatus: ev.status === 'pending_verification' ? '● PAYMENT VERIFICATION PENDING' : '● CONFIRMED',
        seatsRatio: null,
        registrationOpen: true,
        isFallback: false,
      }
    })
  }, [events, staticByName])

  const handleCopyToken = () => {
    if (user?.cybercarnival_token) {
      navigator.clipboard.writeText(user.cybercarnival_token)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="mx-auto flex min-h-[70vh] max-w-7xl flex-col items-center justify-center px-6 pt-36">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-8 w-8 animate-spin border-2 border-primary border-t-transparent" />
            <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground">
              INITIALIZING MY EVENTS DOSSIER...
            </p>
          </div>
        </main>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="relative z-10 mx-auto max-w-7xl px-6 pb-32 pt-36 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.3em] text-primary">MY EVENTS</p>
          <div className="mt-8 flex flex-col items-center justify-center rounded-[14px] border border-primary/30 bg-card/40 p-10 sm:p-16 text-center font-mono backdrop-blur-md shadow-[0_0_30px_rgba(168,85,247,0.1)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              <span className="text-2xl">◈</span>
            </div>
            <h1 className="mt-6 font-display text-xl sm:text-3xl font-bold tracking-[0.15em] text-foreground">
              PLEASE LOG IN TO VIEW YOUR REGISTERED EVENTS
            </h1>
            <p className="mt-2 text-xs sm:text-sm tracking-[0.05em] text-muted-foreground max-w-md">
              Log in with your account to view your mission status and event registrations.
            </p>
            <div className="mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 border border-primary bg-primary px-7 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_0_25px_rgba(168,85,247,0.35)] rounded-[3px]"
              >
                LOG IN TO CONTINUE →
              </Link>
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-32 pt-36 lg:px-10">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] tracking-[0.3em] text-primary">MY EVENTS</p>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-none tracking-tight text-foreground">
              {user.profile_completed ? `YOUR ACTIVE MISSIONS` : 'FINISH YOUR PROFILE'}
            </h1>
            <p className="mt-3 text-sm font-mono text-muted-foreground tracking-[0.1em]">
              Welcome back, <span className="text-foreground font-semibold">{user.full_name || user.username}</span>
            </p>
          </div>

          <div className="font-mono text-xs tracking-[0.25em] text-primary border border-primary/40 bg-primary/10 px-3.5 py-2 backdrop-blur-sm rounded-sm">
            {events.length} {events.length === 1 ? 'REGISTERED EVENT' : 'REGISTERED EVENTS'}
          </div>
        </div>

        {/* CyberCarnival Token Box */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-primary/40 bg-card/60 p-5 rounded-[10px] backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.12)]">
          <div className="flex items-center gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                YOUR CYBERCARNIVAL TOKEN
              </p>
              <p className="mt-1 font-mono text-lg font-bold tracking-[0.15em] text-primary">
                {user.cybercarnival_token}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyToken}
              className="border border-primary/40 bg-background/50 px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] text-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-sm"
            >
              {copiedToken ? 'COPIED ✓' : 'COPY TOKEN ⎘'}
            </button>
          </div>

          <p className="max-w-md text-xs text-muted-foreground font-mono">
            Share this token with teammates so they can add you when registering for team events.
          </p>

          <button
            type="button"
            onClick={() => {
              logout().then(() => router.push('/'))
            }}
            className="border border-destructive/40 px-4 py-2 font-mono text-[11px] tracking-[0.15em] text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all rounded-sm"
          >
            LOG OUT
          </button>
        </div>

        {!user.profile_completed ? (
          <ProfileForm
            user={user}
            onDone={(u) => {
              setUser(u)
              fetchMyEvents()
                .then((evs) => setEvents(evs || []))
                .catch(() => setEvents([]))
            }}
          />
        ) : (
          <div className="mt-12">
            {/* Status Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
              <div className="flex flex-wrap gap-2.5">
                {(['ALL', 'UPCOMING', 'COMPLETED'] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`border px-5 py-2 font-mono text-[11px] tracking-[0.2em] transition-all rounded-sm ${
                      filter === f
                        ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_15px_rgba(168,85,247,0.35)] font-bold'
                        : 'border-border bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Registered Events Grid or Professional Empty State */}
            <div className="mt-8">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[14px] border border-primary/30 bg-card/40 p-10 sm:p-16 text-center font-mono backdrop-blur-md shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                    <span className="text-2xl">◈</span>
                  </div>
                  <h2 className="mt-6 font-display text-xl sm:text-2xl font-bold tracking-[0.15em] text-foreground">
                    NO REGISTERED EVENTS
                  </h2>
                  <p className="mt-2 text-xs sm:text-sm tracking-[0.05em] text-muted-foreground max-w-md">
                    Your registered events will appear here.
                  </p>
                  <div className="mt-8">
                    <Link
                      href="/events"
                      className="inline-flex items-center gap-2 border border-primary bg-primary px-7 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_0_25px_rgba(168,85,247,0.35)] rounded-[3px]"
                    >
                      EXPLORE EVENTS →
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {events.map((ev) => (
                    <div
                      key={ev.registration_id}
                      className="group relative flex flex-col justify-between rounded-[12px] border border-primary/40 bg-card/60 p-6 font-mono text-xs backdrop-blur-md shadow-[0_0_30px_rgba(168,85,247,0.1)] transition-all hover:border-primary hover:shadow-[0_0_40px_rgba(168,85,247,0.2)]"
                    >
                      <div>
                        {/* Event Title & Team */}
                        <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
                          <div>
                            <h3 className="font-display text-lg font-bold tracking-tight text-foreground">
                              {ev.event_name}
                            </h3>
                            {ev.team_name && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                TEAM: <strong className="text-foreground">{ev.team_name}</strong>
                              </p>
                            )}
                          </div>
                          <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                            {ev.is_leader ? 'LEADER' : 'MEMBER'}
                          </span>
                        </div>

                        {/* Event Venue & Date */}
                        <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                          {ev.venue && <p>VENUE: <span className="text-foreground">{ev.venue}</span></p>}
                          {ev.date && <p>DATE: <span className="text-foreground">{ev.date}</span></p>}
                        </div>

                        {/* Status Card Main Body */}
                        <div className="mt-5 rounded-[8px] border p-4">
                          {ev.status === 'pending_verification' && (
                            <div className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                              <p className="font-bold tracking-wider uppercase text-[11px]">
                                REGISTRATION: PENDING VERIFICATION
                              </p>
                              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                                Payment submitted successfully. Waiting for admin verification.
                              </p>
                            </div>
                          )}

                          {ev.status === 'confirmed' && (
                            <div className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                              <p className="font-bold tracking-wider uppercase text-[11px]">
                                REGISTRATION: APPROVED
                              </p>
                              <p className="text-[10px] text-emerald-400 font-bold mt-0.5">
                                PAYMENT: VERIFIED
                              </p>
                              <p className="mt-2 text-[11px] text-emerald-200 font-semibold flex items-center gap-1.5">
                                ✓ Event registration approved
                              </p>
                            </div>
                          )}

                          {ev.status === 'rejected' && (
                            <div className="border-destructive/40 bg-destructive/10 text-destructive">
                              <p className="font-bold tracking-wider uppercase text-[11px]">
                                REGISTRATION: REJECTED
                              </p>
                              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                                {ev.rejection_reason ? `Rejection Reason: ${ev.rejection_reason}` : 'Payment details could not be verified by admin.'}
                              </p>
                            </div>
                          )}

                          {ev.status === 'pending_payment' && (
                            <div className="border-primary/40 bg-primary/10 text-primary">
                              <p className="font-bold tracking-wider uppercase text-[11px]">
                                PAYMENT REQUIRED
                              </p>
                              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                                Complete your payment to submit your registration for review.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Links */}
                      <div className="mt-6 flex flex-wrap gap-2 pt-3 border-t border-border/40">
                        {ev.status === 'confirmed' && (
                          <Link
                            href={`/ticket?id=${ev.registration_id}`}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[3px] border border-emerald-500/60 bg-emerald-500/20 px-4 py-2.5 font-mono text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/30"
                          >
                            VIEW TICKET →
                          </Link>
                        )}
                        {ev.status === 'pending_payment' && (
                          <Link
                            href={`/payment?eventId=${ev.event_id}&registrationId=${ev.registration_id}`}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[3px] border border-primary bg-primary px-4 py-2.5 font-mono text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                          >
                            COMPLETE PAYMENT →
                          </Link>
                        )}
                        {ev.status === 'pending_verification' && (
                          <Link
                            href={`/payment?eventId=${ev.event_id}&registrationId=${ev.registration_id}`}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[3px] border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
                          >
                            VIEW SUBMITTED PAYMENT →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  )
}

function ProfileForm({ user, onDone }: { user: PublicUser; onDone: (u: PublicUser) => void }) {
  const [participantName, setParticipantName] = useState(user.full_name || '')
  const [collegeName, setCollegeName] = useState(user.college || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [detailsConfirmed, setDetailsConfirmed] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Reset confirmation checkbox whenever any of the editable participant details changes
  const handleNameChange = (val: string) => {
    setParticipantName(val)
    setDetailsConfirmed(false)
  }
  const handleCollegeChange = (val: string) => {
    setCollegeName(val)
    setDetailsConfirmed(false)
  }
  const handlePhoneChange = (val: string) => {
    const digitsOnly = val.replace(/\D/g, '').slice(0, 10)
    setPhone(digitsOnly)
    setDetailsConfirmed(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const errors: Record<string, string> = {}
    if (!participantName.trim()) {
      errors.participant_name = 'Participant Name is required'
    }
    if (!collegeName.trim()) {
      errors.college_name = 'College Name is required'
    }
    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      errors.phone = 'Phone number must be exactly 10 digits.'
    }
    if (!detailsConfirmed) {
      errors.details_confirmed = 'Please confirm that the above details are correct before continuing.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setStatus('submitting')
    try {
      const u = await completeProfile({
        participant_name: participantName.trim(),
        college_name: collegeName.trim(),
        phone,
        details_confirmed: true,
        full_name: participantName.trim(),
        college: collegeName.trim(),
      })
      onDone(u)
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setError(err.message)
        setFieldErrors(err.fields || {})
      } else {
        setError('Something went wrong while saving your profile. Please try again.')
      }
    } finally {
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex max-w-xl flex-col gap-6 border border-primary/40 bg-card/60 p-6 sm:p-8 rounded-[12px] backdrop-blur-md shadow-[0_0_30px_rgba(168,85,247,0.12)]">
      <div>
        <h2 className="font-display text-xl font-bold tracking-[0.1em] text-foreground">
          PARTICIPANT DETAILS
        </h2>
        <p className="mt-1 text-xs font-mono text-muted-foreground">
          Complete your participant details carefully. These details will be used for your certificate and Digital Wallet.
        </p>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs font-mono text-destructive rounded-[6px]">
          {error}
        </div>
      )}

      {/* Field 1: Participant Name */}
      <Field
        label="Participant Name *"
        helperText="Full name as it should appear on the certificate."
        error={fieldErrors.participant_name || fieldErrors.full_name}
      >
        <input
          required
          maxLength={80}
          placeholder="e.g. Rahul Sharma"
          value={participantName}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </Field>

      {/* Field 2: Participant Email ID (READ ONLY / LOCKED) */}
      <div>
        <label className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-foreground">
          PARTICIPANT EMAIL ID
        </label>
        <div className="mt-1.5 flex items-center justify-between border border-primary/30 bg-background/40 px-3.5 py-2.5 font-mono text-xs text-foreground/80 rounded-sm select-none">
          <span className="truncate">{user.email}</span>
          <span className="ml-2 font-bold text-primary" title="Verified account email">✓</span>
        </div>
        <p className="mt-1 text-[11px] font-mono text-muted-foreground leading-normal">
          Verified email address — cannot be changed here.
        </p>
      </div>

      {/* Field 3: College Name */}
      <Field
        label="College Name *"
        helperText="Enter your college/institution name. This information may be used on the certificate for inter-college participants."
        error={fieldErrors.college_name || fieldErrors.college}
      >
        <input
          required
          maxLength={200}
          placeholder="e.g. SRM Institute of Science and Technology"
          value={collegeName}
          onChange={(e) => handleCollegeChange(e.target.value)}
        />
      </Field>

      {/* Field 4: Phone Number */}
      <Field
        label="Phone Number *"
        helperText="Enter your contact number for any clarification regarding the details provided."
        error={fieldErrors.phone || fieldErrors.participant_phone}
      >
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{10}"
          required
          maxLength={10}
          placeholder="e.g. 9876543210"
          value={phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
        />
      </Field>

      {/* Disclaimer Box */}
      <div className="border border-primary/40 bg-primary/10 p-4 sm:p-5 rounded-[8px] backdrop-blur-sm shadow-[0_0_15px_rgba(168,85,247,0.15)]">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-primary tracking-[0.1em]">
          <span>⚠ CERTIFICATE INFORMATION</span>
        </div>
        <div className="mt-2 space-y-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <p>
            Please verify these details carefully before submitting.
          </p>
          <p>
            The information provided above will be used to generate your CyberCarnival certificate and related Digital Wallet records.
          </p>
          <p>
            Your name, college name, email ID, and contact number will be stored and used for the relevant certificate and participant records.
          </p>
        </div>
      </div>

      {/* Confirmation Checkbox */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer border border-primary/30 bg-primary/5 p-4 rounded-[8px] hover:border-primary/60 transition-all font-mono text-xs text-foreground">
          <input
            type="checkbox"
            checked={detailsConfirmed}
            onChange={(e) => setDetailsConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-primary/50 bg-background text-primary accent-primary focus:ring-primary/50 cursor-pointer"
          />
          <span className="leading-relaxed">
            I confirm that the above details are correct and should be used for my CyberCarnival certificate and Digital Wallet records.
          </span>
        </label>
        {fieldErrors.details_confirmed && (
          <p className="mt-1.5 text-xs font-mono text-destructive">{fieldErrors.details_confirmed}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-2 border border-primary bg-primary px-8 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_0_25px_rgba(168,85,247,0.35)] disabled:opacity-50 rounded-[3px]"
      >
        {status === 'submitting' ? 'SAVING…' : 'SAVE & CONTINUE →'}
      </button>
    </form>
  )
}

function Field({
  label,
  helperText,
  error,
  children,
}: {
  label: string
  helperText?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-foreground">
        {label}
      </label>
      <div className="mt-1.5 [&>input]:w-full [&>input]:border [&>input]:border-border/80 [&>input]:bg-background/60 [&>input]:px-3.5 [&>input]:py-2.5 [&>input]:font-mono [&>input]:text-xs [&>input]:text-foreground [&>input]:outline-none [&>input]:focus:border-primary [&>input]:focus:ring-1 [&>input]:focus:ring-primary/50 [&>input]:rounded-sm">
        {children}
      </div>
      {helperText && (
        <p className="mt-1 text-[11px] font-mono text-muted-foreground leading-normal">{helperText}</p>
      )}
      {error && <p className="mt-1 text-xs font-mono text-destructive">{error}</p>}
    </div>
  )
}
