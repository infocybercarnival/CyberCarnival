'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  fetchMe, fetchEvent, fetchRegistrationWarnings, fetchMemberPreview,
  submitRegistration, ApiValidationError, type PublicUser, type ApiEvent, type MemberPreview,
  type ParticipantDetail
} from '@/lib/api'

type Props = { eventId: string | null; eventName: string; onClose: () => void }

type Status = 'idle' | 'submitting' | 'done' | 'error'

type TeammateDetail = {
  token: string
  participant_name: string
  participant_email: string
  college_name: string
  participant_phone: string
}

export function RegistrationModal({ eventId, eventName, onClose }: Props) {
  const router = useRouter()
  const [me, setMe] = useState<PublicUser | null | 'loading'>('loading')
  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [mode, setMode] = useState<'individual' | 'team'>('individual')
  const [teamName, setTeamName] = useState('')

  // Leader details (Participant 1)
  const [leaderName, setLeaderName] = useState('')
  const [leaderEmail, setLeaderEmail] = useState('')
  const [leaderCollege, setLeaderCollege] = useState('')
  const [leaderPhone, setLeaderPhone] = useState('')

  // Teammates details (Participant 2..N)
  const [teammates, setTeammates] = useState<TeammateDetail[]>([])
  const [memberPreviews, setMemberPreviews] = useState<Record<number, MemberPreview | 'loading' | 'not_found'>>({})

  const [warnings, setWarnings] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchMe().then((u) => {
      setMe(u)
      if (u) {
        setLeaderName(u.full_name || u.username || '')
        setLeaderEmail(u.email || '')
        setLeaderCollege(u.college || '')
        setLeaderPhone(u.phone || '')
      }
    }).catch(() => setMe(null))
  }, [])

  useEffect(() => {
    if (!eventId) return
    fetchEvent(eventId).then((e) => {
      setEvent(e)
      if (e.max_team_size === 1) setMode('individual')
      else if ((e.min_team_size || 1) > 1) setMode('team')
    }).catch(() => setEvent(null))
  }, [eventId])

  useEffect(() => {
    if (!eventId || !me || me === 'loading') return
    fetchRegistrationWarnings(eventId).then((w) => {
      setWarnings(w.map((name) => `You already have ${name} on an overlapping date. You can still register.`))
    }).catch(() => {})
  }, [eventId, me])

  if (!eventId) return null
  const individualOnly = event?.max_team_size === 1
  const teamOnly = (event?.min_team_size || 1) > 1

  function addTeammate() {
    const maxTeammates = Math.max(0, (event?.max_team_size || 11) - 1)
    if (teammates.length < maxTeammates) {
      setTeammates([...teammates, { token: '', participant_name: '', participant_email: '', college_name: '', participant_phone: '' }])
      setFieldErrors((prev) => { const copy = { ...prev }; delete copy.member_tokens; return copy })
    } else {
      setFieldErrors((prev) => ({ ...prev, member_tokens: `Maximum team size for this event is ${event?.max_team_size || 11} participants (1 leader + ${maxTeammates} teammates).` }))
    }
  }

  function updateTeammate(i: number, key: keyof TeammateDetail, value: string) {
    const next = [...teammates]
    next[i] = { ...next[i], [key]: key === 'token' ? value.toUpperCase() : value }
    setTeammates(next)
  }

  function removeTeammate(i: number) {
    setTeammates(teammates.filter((_, idx) => idx !== i))
    setMemberPreviews({})
  }

  async function previewMember(i: number) {
    const token = (teammates[i]?.token || '').trim().toUpperCase()
    if (!token) return
    setMemberPreviews((prev) => ({ ...prev, [i]: 'loading' }))
    try {
      const data = await fetchMemberPreview(token)
      setMemberPreviews((prev) => ({ ...prev, [i]: data }))
      // Autofill teammate details if empty
      updateTeammate(i, 'participant_name', teammates[i].participant_name || data.name || '')
      updateTeammate(i, 'college_name', teammates[i].college_name || data.college || '')
    } catch {
      setMemberPreviews((prev) => ({ ...prev, [i]: 'not_found' }))
    }
  }

  function validateFrontend(): boolean {
    const errors: Record<string, string> = {}

    // 1. Leader validation
    if (!leaderName.trim()) errors.leaderName = 'Participant name is required'
    if (!leaderEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leaderEmail.trim())) errors.leaderEmail = 'Valid email ID is required'
    if (!leaderCollege.trim()) errors.leaderCollege = 'College name is required'
    const cleanLeaderPhone = leaderPhone.replace(/\D/g, '')
    if (cleanLeaderPhone.length < 10 || !/^[6-9]\d{9}$/.test(cleanLeaderPhone.slice(-10))) errors.leaderPhone = 'Valid 10-digit Indian contact number is required'

    // 2. Team Name validation
    if (mode === 'team' && !teamName.trim()) {
      errors.teamName = 'Team name is required for team registrations'
    }

    // 3. Unique email set check
    const emailsSeen = new Set<string>()
    if (leaderEmail.trim()) emailsSeen.add(leaderEmail.trim().toLowerCase())

    if (mode === 'team') {
      teammates.forEach((tm, idx) => {
        if (!tm.token.trim()) errors[`tm_token_${idx}`] = 'CyberCarnival token is required'
        if (!tm.participant_name.trim()) errors[`tm_name_${idx}`] = 'Participant name is required'
        if (!tm.participant_email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tm.participant_email.trim())) errors[`tm_email_${idx}`] = 'Valid email ID is required'
        if (!tm.college_name.trim()) errors[`tm_college_${idx}`] = 'College name is required'
        const tmPhoneDigits = tm.participant_phone.replace(/\D/g, '')
        if (tmPhoneDigits.length < 10 || !/^[6-9]\d{9}$/.test(tmPhoneDigits.slice(-10))) errors[`tm_phone_${idx}`] = 'Valid 10-digit contact number is required'

        const em = tm.participant_email.trim().toLowerCase()
        if (em) {
          if (emailsSeen.has(em)) {
            errors[`tm_email_${idx}`] = 'This email ID is already registered for another participant.'
            errors.uniqueEmails = 'This email ID is already registered for another participant.'
          }
          emailsSeen.add(em)
        }
      })
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setErrorMsg(errors.uniqueEmails || 'Please fill in all mandatory participant details correctly.')
      return false
    }
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (!validateFrontend()) return

    setStatus('submitting')

    const participantList: ParticipantDetail[] = [
      {
        participant_name: leaderName.trim(),
        participant_email: leaderEmail.trim().toLowerCase(),
        college_name: leaderCollege.trim(),
        participant_phone: leaderPhone.replace(/\D/g, '').slice(-10),
        is_leader: true,
      },
    ]

    if (mode === 'team') {
      teammates.forEach((tm) => {
        participantList.push({
          participant_name: tm.participant_name.trim(),
          participant_email: tm.participant_email.trim().toLowerCase(),
          college_name: tm.college_name.trim(),
          participant_phone: tm.participant_phone.replace(/\D/g, '').slice(-10),
          is_leader: false,
        })
      })
    }

    try {
      const result = await submitRegistration({
        event_id: eventId!,
        participant_mode: mode,
        team_name: mode === 'team' ? teamName || undefined : undefined,
        member_tokens: mode === 'team' ? teammates.map((t) => t.token.trim()) : [],
        participants: participantList,
      })

      if (result.status === 'pending_payment' || (result.payment_url && result.status !== 'confirmed')) {
        onClose()
        const targetUrl = result.payment_url || `/payment?eventId=${eventId}&registrationId=${result.id}`
        router.push(targetUrl)
        return
      }

      setWarnings((prev) => [...prev, ...(result.warnings || [])])
      setStatus('done')
    } catch (err) {
      setStatus('error')
      if (err instanceof ApiValidationError) {
        setErrorMsg(err.message)
        if (err.fields) setFieldErrors(err.fields)
      } else {
        setErrorMsg('Something went wrong. Try again.')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm px-4 py-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 md:p-8">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">✕</button>

        {me === 'loading' && <p className="py-10 text-center font-mono text-xs tracking-[.2em] text-muted-foreground">LOADING…</p>}
        {me === null && (
          <div className="py-10 text-center">
            <p className="font-mono text-xs tracking-[.3em] text-primary">CYBERCARNIVAL TOKEN REQUIRED</p>
            <h3 className="mt-4 text-2xl font-bold">Create your account first</h3>
            <p className="mt-3 text-sm text-muted-foreground">Click register to get your CyberCarnival token, then come back to register for {eventName}.</p>
            <div className="mt-7 flex justify-center gap-3">
              <Link href="/register" className="bg-primary px-5 py-2 text-sm text-primary-foreground">GET TOKEN</Link>
              <Link href="/login" className="border border-border px-5 py-2 text-sm">SIGN IN</Link>
            </div>
          </div>
        )}
        {me && me !== 'loading' && !me.profile_completed && (
          <div className="py-10 text-center">
            <h3 className="text-2xl font-bold">Finish your profile</h3>
            <p className="mt-3 text-sm text-muted-foreground">We use your saved profile details in event registrations.</p>
            <Link href="/dashboard" className="mt-7 inline-flex bg-primary px-5 py-2 text-sm text-primary-foreground">COMPLETE PROFILE</Link>
          </div>
        )}

        {me && me !== 'loading' && me.profile_completed && status === 'done' && (
          <div className="py-10 text-center">
            <p className="font-mono text-xs tracking-[.3em] text-primary">REGISTRATION CONFIRMED</p>
            <h3 className="mt-4 text-2xl font-bold">You're registered</h3>
            <p className="mt-3 text-sm text-muted-foreground">Your registration for {eventName} is confirmed.</p>
            {warnings.length > 0 && <WarningBox warnings={warnings} />}
            <button type="button" onClick={onClose} className="mt-7 border border-primary/60 px-6 py-2 text-sm">CLOSE</button>
          </div>
        )}

        {me && me !== 'loading' && me.profile_completed && status !== 'done' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <p className="font-mono text-xs tracking-[.3em] text-primary">EVENT REGISTRATION & CERTIFICATE DETAILS</p>
              <h3 className="mt-2 text-2xl font-bold">{eventName}</h3>
            </div>
            {warnings.length > 0 && <WarningBox warnings={warnings} />}
            {errorMsg && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{errorMsg}</p>}

            {/* Participation Type Selection */}
            <section>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Participation type</p>
              <div className="grid grid-cols-2 gap-3">
                <ModeCard label="Individual" selected={mode === 'individual'} disabled={teamOnly} onClick={() => setMode('individual')} />
                <ModeCard label="Team" selected={mode === 'team'} disabled={individualOnly} onClick={() => setMode('team')} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Allowed team size: {event?.min_team_size || 1}–{event?.max_team_size || 11} participants</p>
            </section>

            {mode === 'team' && (
              <section className="space-y-2">
                <Field label="Team name *" error={fieldErrors.teamName || fieldErrors.team_name}>
                  <input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={120} placeholder="Enter your team name" />
                </Field>
              </section>
            )}

            {/* Mandatory Participant Details Roster (Certificate & Digital Wallet) */}
            <section className="space-y-4 border-t border-border/80 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-mono text-xs font-bold uppercase tracking-[.2em] text-primary">
                    PARTICIPANT DETAILS ({mode === 'team' ? `1 LEADER + ${teammates.length} TEAMMATES` : '1 PARTICIPANT'})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Required for certificate generation and individual Digital Wallet creation.
                  </p>
                </div>
                {mode === 'team' && (
                  <button type="button" onClick={addTeammate} className="rounded-lg border border-primary/40 px-3 py-1.5 font-mono text-xs text-primary transition-all hover:bg-primary/10">
                    + ADD TEAMMATE
                  </button>
                )}
              </div>

              {/* Participant 1: Leader */}
              <div className="rounded-xl border border-primary/40 bg-card/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-primary tracking-wider">PARTICIPANT 1 (TEAM LEADER)</span>
                  <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] text-primary">LEADER</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Participant Name (for Certificate) *" error={fieldErrors.leaderName}>
                    <input value={leaderName} onChange={(e) => setLeaderName(e.target.value)} placeholder="Full name for certificate" />
                  </Field>
                  <Field label="Participant Email ID (Unique for Digital Wallet) *" error={fieldErrors.leaderEmail}>
                    <input type="email" value={leaderEmail} onChange={(e) => setLeaderEmail(e.target.value)} placeholder="participant@example.com" />
                  </Field>
                  <Field label="College Name *" error={fieldErrors.leaderCollege}>
                    <input value={leaderCollege} onChange={(e) => setLeaderCollege(e.target.value)} placeholder="College / University Name" />
                  </Field>
                  <Field label="Contact Number (10 digits) *" error={fieldErrors.leaderPhone}>
                    <input value={leaderPhone} onChange={(e) => setLeaderPhone(e.target.value)} placeholder="10-digit mobile number" />
                  </Field>
                </div>
              </div>

              {/* Teammates: Participant 2..N */}
              {mode === 'team' && teammates.map((tm, i) => (
                <div key={i} className="relative rounded-xl border border-border/80 bg-background/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-foreground tracking-wider">PARTICIPANT {i + 2} (TEAMMATE)</span>
                    <button type="button" onClick={() => removeTeammate(i)} className="text-xs text-destructive hover:underline">
                      ✕ Remove teammate
                    </button>
                  </div>

                  <Field label="CyberCarnival Token *" error={fieldErrors[`tm_token_${i}`]}>
                    <div className="flex gap-2">
                      <input value={tm.token} onChange={(e) => updateTeammate(i, 'token', e.target.value)} onBlur={() => previewMember(i)} placeholder="CCXXXXXXXXXXXXX" className="font-mono uppercase" />
                      <button type="button" onClick={() => previewMember(i)} className="rounded-lg border border-border px-3 py-1 font-mono text-xs hover:bg-secondary">
                        CHECK
                      </button>
                    </div>
                  </Field>
                  {memberPreviews[i] === 'loading' && <p className="text-xs text-muted-foreground">Checking token…</p>}
                  {memberPreviews[i] === 'not_found' && <p className="text-xs text-destructive">Token not found. Ask teammate for their valid CyberCarnival token.</p>}

                  <div className="grid gap-3 md:grid-cols-2 pt-1">
                    <Field label={`Participant ${i + 2} Name (for Certificate) *`} error={fieldErrors[`tm_name_${i}`]}>
                      <input value={tm.participant_name} onChange={(e) => updateTeammate(i, 'participant_name', e.target.value)} placeholder="Full name for certificate" />
                    </Field>
                    <Field label={`Participant ${i + 2} Email ID (Unique for Digital Wallet) *`} error={fieldErrors[`tm_email_${i}`]}>
                      <input type="email" value={tm.participant_email} onChange={(e) => updateTeammate(i, 'participant_email', e.target.value)} placeholder="teammate@example.com" />
                    </Field>
                    <Field label={`Participant ${i + 2} College Name *`} error={fieldErrors[`tm_college_${i}`]}>
                      <input value={tm.college_name} onChange={(e) => updateTeammate(i, 'college_name', e.target.value)} placeholder="College / University Name" />
                    </Field>
                    <Field label={`Participant ${i + 2} Contact Number (10 digits) *`} error={fieldErrors[`tm_phone_${i}`]}>
                      <input value={tm.participant_phone} onChange={(e) => updateTeammate(i, 'participant_phone', e.target.value)} placeholder="10-digit mobile number" />
                    </Field>
                  </div>
                </div>
              ))}
              {fieldErrors.member_tokens && <p className="text-xs text-destructive">{fieldErrors.member_tokens}</p>}
            </section>

            <button type="submit" disabled={status === 'submitting'} className="w-full rounded-lg bg-primary px-6 py-3.5 font-mono text-xs tracking-[.15em] text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
              {status === 'submitting' ? 'VALIDATING & PROCEEDING…' : 'CONFIRM PARTICIPANT DETAILS & PROCEED TO PAYMENT →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function WarningBox({ warnings }: { warnings: string[] }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm">
      <p className="font-semibold">Schedule warning — registration is still allowed</p>
      {warnings.map((w, i) => <p key={i} className="mt-1 text-muted-foreground">• {w}</p>)}
    </div>
  )
}

function ModeCard({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`rounded-lg border p-3 text-left text-sm ${selected ? 'border-primary bg-primary/10' : 'border-border'} disabled:cursor-not-allowed disabled:opacity-40`}>
      {label}
    </button>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">{label}</label>
      <div className="mt-1 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-input [&>input]:bg-transparent [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:outline-none [&>input]:focus:border-primary">
        {children}
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
    </div>
  )
}
