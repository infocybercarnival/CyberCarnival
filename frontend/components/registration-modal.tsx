'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  fetchMe, fetchEvent, fetchPaymentInfo, fetchRegistrationWarnings, fetchMemberPreview, paymentQrUrl,
  submitRegistration, ApiValidationError, type PublicUser, type ApiEvent, type PaymentInfo, type MemberPreview,
} from '@/lib/api'

type Props = { eventId: string | null; eventName: string; onClose: () => void }

type Status = 'idle' | 'submitting' | 'done' | 'error'

export function RegistrationModal({ eventId, eventName, onClose }: Props) {
  const [me, setMe] = useState<PublicUser | null | 'loading'>('loading')
  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [payment, setPayment] = useState<PaymentInfo | null>(null)
  const [mode, setMode] = useState<'individual' | 'team'>('individual')
  const [teamName, setTeamName] = useState('')
  const [memberTokens, setMemberTokens] = useState<string[]>([])
  const [memberPreviews, setMemberPreviews] = useState<Record<number, MemberPreview | 'loading' | 'not_found'>>({})
  const [transactionId, setTransactionId] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [resultStatus, setResultStatus] = useState<'confirmed' | 'pending_verification' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => { fetchMe().then(setMe).catch(() => setMe(null)) }, [])
  useEffect(() => {
    if (!eventId) return
    fetchEvent(eventId).then((e) => {
      setEvent(e)
      if (e.max_team_size === 1) setMode('individual')
      else if ((e.min_team_size || 1) > 1) setMode('team')
      if (e.fee_amount) fetchPaymentInfo(eventId).then(setPayment).catch(() => setPayment(null))
    }).catch(() => setEvent(null))
  }, [eventId])
  useEffect(() => {
    if (!eventId || !me || me === 'loading') return
    fetchRegistrationWarnings(eventId).then((w) => {
      setWarnings(w.map((name) => `You already have ${name} on an overlapping date. You can still register.`))
    }).catch(() => {})
  }, [eventId, me])

  if (!eventId) return null
  const paid = Boolean(event?.fee_amount)
  const individualOnly = event?.max_team_size === 1
  const teamOnly = (event?.min_team_size || 1) > 1

  function addMember() { if (memberTokens.length < Math.max(0, (event?.max_team_size || 11) - 1)) setMemberTokens([...memberTokens, '']) }
  function updateMember(i: number, value: string) {
    const next=[...memberTokens]; next[i]=value.toUpperCase(); setMemberTokens(next)
    setMemberPreviews((prev) => { const copy={...prev}; delete copy[i]; return copy })
  }
  function removeMember(i: number) {
    setMemberTokens(memberTokens.filter((_, idx) => idx !== i))
    setMemberPreviews({})
  }
  async function previewMember(i: number) {
    const token=(memberTokens[i] || '').trim().toUpperCase()
    if (!token) return
    setMemberPreviews((prev)=>({...prev,[i]:'loading'}))
    try {
      const data=await fetchMemberPreview(token)
      setMemberPreviews((prev)=>({...prev,[i]:data}))
    } catch {
      setMemberPreviews((prev)=>({...prev,[i]:'not_found'}))
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setStatus('submitting'); setErrorMsg(''); setFieldErrors({})
    try {
      const result = await submitRegistration({
        event_id: eventId,
        participant_mode: mode,
        team_name: mode === 'team' ? teamName || undefined : undefined,
        member_tokens: mode === 'team' ? memberTokens.filter((t) => t.trim()) : [],
        transaction_id: paid ? transactionId.trim() : undefined,
      })
      setWarnings((prev) => [...prev, ...(result.warnings || [])])
      setResultStatus(result.status); setStatus('done')
    } catch (err) {
      setStatus('error')
      if (err instanceof ApiValidationError) { setErrorMsg(err.message); setFieldErrors(err.fields || {}) }
      else setErrorMsg('Something went wrong. Try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm px-4 py-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 md:p-8">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">✕</button>

        {me === 'loading' && <p className="py-10 text-center font-mono text-xs tracking-[.2em] text-muted-foreground">LOADING…</p>}
        {me === null && <div className="py-10 text-center">
          <p className="font-mono text-xs tracking-[.3em] text-primary">CYBERCARNIVAL TOKEN REQUIRED</p>
          <h3 className="mt-4 text-2xl font-bold">Create your account first</h3>
          <p className="mt-3 text-sm text-muted-foreground">Click register to get your CyberCarnival token, then come back to register for {eventName}.</p>
          <div className="mt-7 flex justify-center gap-3"><Link href="/register" className="bg-primary px-5 py-2 text-sm text-primary-foreground">GET TOKEN</Link><Link href="/login" className="border border-border px-5 py-2 text-sm">SIGN IN</Link></div>
        </div>}
        {me && me !== 'loading' && !me.profile_completed && <div className="py-10 text-center"><h3 className="text-2xl font-bold">Finish your profile</h3><p className="mt-3 text-sm text-muted-foreground">We use your saved profile details in event registrations.</p><Link href="/dashboard" className="mt-7 inline-flex bg-primary px-5 py-2 text-sm text-primary-foreground">COMPLETE PROFILE</Link></div>}

        {me && me !== 'loading' && me.profile_completed && status === 'done' && <div className="py-10 text-center">
          <p className="font-mono text-xs tracking-[.3em] text-primary">REGISTRATION RECEIVED</p>
          <h3 className="mt-4 text-2xl font-bold">{resultStatus === 'pending_verification' ? 'Payment verification pending' : "You're registered"}</h3>
          <p className="mt-3 text-sm text-muted-foreground">{resultStatus === 'pending_verification' ? 'Your transaction ID was submitted. The coordinator/admin will verify the payment before the registration becomes confirmed.' : 'Your registration is confirmed.'}</p>
          {warnings.length > 0 && <WarningBox warnings={warnings} />}
          <button type="button" onClick={onClose} className="mt-7 border border-primary/60 px-6 py-2 text-sm">CLOSE</button>
        </div>}

        {me && me !== 'loading' && me.profile_completed && status !== 'done' && <form onSubmit={handleSubmit} className="space-y-5">
          <div><p className="font-mono text-xs tracking-[.3em] text-primary">EVENT REGISTRATION</p><h3 className="mt-2 text-2xl font-bold">{eventName}</h3></div>
          {warnings.length > 0 && <WarningBox warnings={warnings} />}
          {errorMsg && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMsg}</p>}

          <section className="rounded-xl border border-border bg-background/30 p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Details loaded from your account</p>
            <div className="grid gap-3 md:grid-cols-2">
              <ReadOnly label="Name" value={me.full_name || me.username} /><ReadOnly label="CyberCarnival token" value={me.cybercarnival_token} />
              <ReadOnly label="Email" value={me.email} /><ReadOnly label="Mobile" value={me.phone || '—'} />
              <ReadOnly label="College" value={me.college || '—'} /><ReadOnly label="Register number" value={me.register_number || '—'} />
            </div>
          </section>

          <section>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Participation type</p>
            <div className="grid grid-cols-2 gap-3">
              <ModeCard label="Individual" selected={mode==='individual'} disabled={teamOnly} onClick={() => setMode('individual')} />
              <ModeCard label="Team" selected={mode==='team'} disabled={individualOnly} onClick={() => setMode('team')} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Allowed team size: {event?.min_team_size || 1}–{event?.max_team_size || 11}</p>
          </section>

          {mode === 'team' && <section className="space-y-3">
            <Field label="Team name" error={fieldErrors.team_name}><input value={teamName} onChange={(e)=>setTeamName(e.target.value)} maxLength={120} placeholder="Enter team name" /></Field>
            <div className="flex items-center justify-between"><label className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Teammates' CyberCarnival tokens</label><button type="button" onClick={addMember} className="text-xs text-primary">+ ADD MEMBER</button></div>
            {memberTokens.map((t,i)=><div key={i} className="rounded-lg border border-border/60 p-2"><div className="flex gap-2"><input value={t} onChange={(e)=>updateMember(i,e.target.value)} onBlur={()=>previewMember(i)} placeholder="CCXXXXXXXXXXXXX" className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm"/><button type="button" onClick={()=>removeMember(i)} className="px-2 text-muted-foreground">✕</button></div>{memberPreviews[i]==='loading'&&<p className="mt-2 text-xs text-muted-foreground">Checking token…</p>}{memberPreviews[i]==='not_found'&&<p className="mt-2 text-xs text-destructive">Token not found. Ask your teammate to check their CyberCarnival token.</p>}{memberPreviews[i]&&memberPreviews[i]!=='loading'&&memberPreviews[i]!=='not_found'&&<div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2"><p><span className="text-foreground">Name:</span> {memberPreviews[i].name}</p><p><span className="text-foreground">Register no:</span> {memberPreviews[i].register_number||'—'}</p><p className="md:col-span-2"><span className="text-foreground">College:</span> {memberPreviews[i].college||'—'}</p></div>}</div>)}
            {fieldErrors.member_tokens && <p className="text-xs text-destructive">{fieldErrors.member_tokens}</p>}
          </section>}

          {paid && <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="text-center"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Pay exact event amount</p><p className="mt-2 text-3xl font-bold">₹{((event?.fee_amount || 0)/100).toFixed(2)}</p></div>
            <div className="mt-4 flex flex-col items-center gap-3 md:flex-row md:items-start">
              <img src={paymentQrUrl(eventId)} alt={`UPI QR for ${eventName}`} className="h-44 w-44 rounded-lg bg-white p-2" />
              <div className="flex-1 text-sm text-muted-foreground"><p>Scan this QR in any UPI app. The exact event amount is encoded server-side.</p>{payment?.is_dummy && <p className="mt-2 font-semibold text-amber-500">DEV QR: replace UPI_ID before going live.</p>}<p className="mt-3 text-xs">After payment, enter the UPI/UTR reference below. Opening this modal or loading the QR does not create a registration.</p></div>
            </div>
            <div className="mt-4"><Field label="UPI transaction / reference ID *" error={fieldErrors.transaction_id}><input required value={transactionId} onChange={(e)=>setTransactionId(e.target.value.toUpperCase())} maxLength={80} placeholder="Enter UTR / UPI reference after payment" /></Field></div>
            <p className="mt-2 text-xs text-muted-foreground">Do not mark the registration confirmed just from this ID; your coordinator/admin should verify it against the receiving account.</p>
          </section>}

          <button type="submit" disabled={status==='submitting'} className="w-full rounded-lg bg-primary px-6 py-3 font-mono text-xs tracking-[.15em] text-primary-foreground disabled:opacity-50">{status==='submitting'?'SUBMITTING…':paid?'SUBMIT PAYMENT + REGISTRATION':'CONFIRM REGISTRATION'}</button>
        </form>}
      </div>
    </div>
  )
}

function WarningBox({warnings}:{warnings:string[]}) { return <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm"><p className="font-semibold">Schedule warning — registration is still allowed</p>{warnings.map((w,i)=><p key={i} className="mt-1 text-muted-foreground">• {w}</p>)}</div> }
function ReadOnly({label,value}:{label:string;value:string}) { return <div><p className="font-mono text-[9px] uppercase tracking-[.15em] text-muted-foreground">{label}</p><p className="mt-1 text-sm text-foreground">{value}</p></div> }
function ModeCard({label,selected,disabled,onClick}:{label:string;selected:boolean;disabled:boolean;onClick:()=>void}) { return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-lg border p-3 text-left text-sm ${selected?'border-primary bg-primary/10':'border-border'} disabled:cursor-not-allowed disabled:opacity-40`}>{label}</button> }
function Field({label,error,children}:{label:string;error?:string;children:React.ReactNode}) { return <div><label className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">{label}</label><div className="mt-1 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-input [&>input]:bg-transparent [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:outline-none [&>input]:focus:border-primary">{children}</div>{error&&<p className="mt-1 text-xs text-destructive">{error}</p>}</div> }
