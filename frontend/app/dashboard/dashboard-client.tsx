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
              {chromaItems.length === 0 ? (
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
                <ChromaGrid items={chromaItems} radius={320} damping={0.45} fadeOut={0.6} ease="power3.out" />
              )}
            </div>
          </div>
        )}
      </main>
    </>
  )
}

function ProfileForm({ onDone }: { onDone: (u: PublicUser) => void }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [college, setCollege] = useState('')
  const [isSrmRamapuram, setIsSrmRamapuram] = useState(false)
  const [registerNumber, setRegisterNumber] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    setFieldErrors({})
    try {
      const u = await completeProfile({
        full_name: fullName,
        phone,
        college: isSrmRamapuram ? 'SRM IST Ramapuram' : college,
        is_srm_ramapuram: isSrmRamapuram,
        register_number: isSrmRamapuram ? registerNumber : undefined,
      })
      onDone(u)
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setError(err.message)
        setFieldErrors(err.fields || {})
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex max-w-md flex-col gap-4 border border-border bg-card/60 p-6 rounded-[10px]">
      <p className="text-xs font-mono text-muted-foreground">
        Complete your profile once — after this you can register for events and join teams.
      </p>
      {error && (
        <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">{error}</p>
      )}
      <Field label="Full name" error={fieldErrors.full_name}>
        <input required maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label="Phone" error={fieldErrors.phone}>
        <input required maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="College (optional)" error={fieldErrors.college}>
        <input
          maxLength={200}
          value={isSrmRamapuram ? 'SRM IST Ramapuram' : college}
          onChange={(e) => setCollege(e.target.value)}
          disabled={isSrmRamapuram}
        />
      </Field>
      <label className="flex items-center gap-3 border border-border/80 bg-background/40 px-3 py-3 font-mono text-[11px] text-foreground rounded-sm">
        <input
          type="checkbox"
          checked={isSrmRamapuram}
          onChange={(e) => {
            setIsSrmRamapuram(e.target.checked)
            if (!e.target.checked) setRegisterNumber('')
          }}
          className="h-4 w-4 accent-primary"
        />
        <span>I am from SRM IST Ramapuram</span>
      </label>
      {isSrmRamapuram && (
        <Field label="Register number" error={fieldErrors.register_number}>
          <input
            required
            maxLength={40}
            value={registerNumber}
            onChange={(e) => setRegisterNumber(e.target.value.toUpperCase())}
          />
        </Field>
      )}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-2 bg-primary px-6 py-3 font-mono text-[11px] font-bold tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 rounded-[3px]"
      >
        {status === 'submitting' ? 'SAVING…' : 'SAVE & CONTINUE →'}
      </button>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</label>
      <div className="mt-1 [&>input]:w-full [&>input]:border [&>input]:border-border/80 [&>input]:bg-background/60 [&>input]:px-3 [&>input]:py-2 [&>input]:font-mono [&>input]:text-xs [&>input]:text-foreground [&>input]:outline-none [&>input]:focus:border-primary [&>input]:rounded-sm">
        {children}
      </div>
      {error && <p className="mt-1 text-xs font-mono text-destructive">{error}</p>}
    </div>
  )
}
