'use client'

import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import {
  fetchPaymentDetails, submitPaymentProof, ApiValidationError,
  type PaymentPageData
} from '@/lib/api'

type Props = {
  eventId?: string
  registrationId?: string
}

export function PaymentClient(props: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const eventId = props.eventId || searchParams.get('eventId') || searchParams.get('event_id') || ''
  const registrationId = props.registrationId || searchParams.get('registrationId') || searchParams.get('registration_id') || ''

  const [data, setData] = useState<PaymentPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [transactionId, setTransactionId] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId || !registrationId) {
      setError('Invalid payment link. Missing event or registration ID.')
      setLoading(false)
      return
    }

    fetchPaymentDetails(eventId, registrationId)
      .then((res) => {
        setData(res)
        setTransactionId(res.transaction_id || '')
        setDisclaimerAccepted(res.disclaimer_accepted || false)
        if (res.status === 'pending_verification') {
          setSubmitSuccess('Payment details submitted successfully! Your registration is currently pending admin verification.')
        } else if (res.status === 'confirmed') {
          setSubmitSuccess('Payment details verified! Your registration is confirmed.')
        }
      })
      .catch((err) => {
        setError(err instanceof ApiValidationError ? err.message : 'Could not load payment details for this registration.')
      })
      .finally(() => setLoading(false))
  }, [eventId, registrationId])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setSubmitError('')
    setFieldErrors((prev) => { const copy = { ...prev }; delete copy.payment_proof; return copy })

    if (!file) {
      setProofFile(null)
      setFilePreview(null)
      return
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowedExtensions = ['jpg', 'jpeg', 'png']

    if (!ext || !allowedExtensions.includes(ext)) {
      setSubmitError('Invalid file type. Only JPG, JPEG, and PNG image files are allowed.')
      setProofFile(null)
      setFilePreview(null)
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setSubmitError('File is too large. Maximum allowed file size is 5 MB.')
      setProofFile(null)
      setFilePreview(null)
      return
    }

    setProofFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setFilePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError('')
    setFieldErrors({})

    if (!disclaimerAccepted) {
      setSubmitError('You must check the confirmation checkbox to verify that your transaction ID and proof screenshot are accurate.')
      return
    }

    if (!data?.has_proof && !proofFile) {
      setSubmitError('Please upload a valid payment proof screenshot (JPG, JPEG, or PNG, max 5 MB).')
      setFieldErrors({ payment_proof: 'Payment proof image is required.' })
      return
    }

    setSubmitting(true)
    const formData = new FormData()
    formData.append('transaction_id', transactionId.trim())
    formData.append('disclaimer_accepted', 'true')
    if (proofFile) {
      formData.append('payment_proof', proofFile)
    }

    try {
      const res = await submitPaymentProof(registrationId, formData)
      setSubmitSuccess(res.message || 'Payment submitted successfully! Your registration is now pending admin verification.')
      if (data) {
        setData({
          ...data,
          status: 'pending_verification',
          transaction_id: transactionId.trim(),
          disclaimer_accepted: true,
          has_proof: true,
        })
      }
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setSubmitError(err.message)
        if (err.fields) setFieldErrors(err.fields)
      } else {
        setSubmitError('Failed to submit payment proof. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-transparent text-foreground selection:bg-primary selection:text-primary-foreground overflow-hidden">
      <Navbar />

      {/* Cyberpunk Home Page Ambient Glow Highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[600px] w-full max-w-7xl -translate-x-1/2 bg-[radial-gradient(ellipse_55%_50%_at_50%_20%,rgba(168,85,247,0.22),transparent_70%)]"
      />

      <div className="container relative z-20 mx-auto px-4 py-8 md:py-14">
        <div className="mx-auto max-w-4xl">
          {/* Top Back Navigation Link */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary mb-8"
          >
            <span>←</span> <span>BACK TO DASHBOARD</span>
          </Link>

          {/* Loading State */}
          {loading && (
            <div className="my-24 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
              <p className="font-mono text-xs tracking-[0.3em] text-primary font-bold">LOADING PAYMENT DETAILS…</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="my-16 rounded-[10px] border border-destructive/40 bg-card/60 p-8 text-center backdrop-blur-md">
              <span className="font-mono text-xs tracking-[0.3em] text-destructive font-bold uppercase block mb-2">
                UNABLE TO LOAD PAYMENT
              </span>
              <p className="mt-2 font-mono text-sm text-muted-foreground">{error}</p>
              <div className="mt-8">
                <Link
                  href="/events"
                  className="group relative inline-flex overflow-hidden rounded-[3px] border border-primary bg-primary px-8 py-3 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  <span>BROWSE EVENTS →</span>
                </Link>
              </div>
            </div>
          )}

          {/* Main Payment Checkout View */}
          {!loading && !error && data && (
            <div className="space-y-8">
              {/* Hero / Header Section */}
              <div className="relative overflow-hidden rounded-[10px] border border-primary/30 bg-card/60 p-6 md:p-8 backdrop-blur-md shadow-[0_0_40px_rgba(168,85,247,0.12)]">
                {/* Moving accent glow line */}
                <div className="pointer-events-none absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-transparent via-primary to-transparent" />

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-mono text-[11px] leading-relaxed tracking-[0.3em] text-muted-foreground uppercase mb-1">
                      <span>SRM RAMAPURAM · PAYMENT CHECKOUT</span>
                    </div>
                    <h1 className="font-sans text-3xl font-extrabold tracking-tight text-foreground md:text-4xl drop-shadow-[0_0_25px_rgba(168,85,247,0.35)]">
                      {data.event_name}
                    </h1>
                    <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                      Complete your registration payment to secure your spot.
                    </p>
                  </div>

                  <div className="flex flex-col items-start md:items-end">
                    <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                      TOTAL REGISTRATION FEE
                    </span>
                    <span className="font-mono text-3xl font-black text-primary tracking-tight drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                      ₹{data.fee_amount_rupees}
                    </span>
                  </div>
                </div>

                {/* Status & Details Banner */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-4 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">STATUS:</span>
                    <span
                      className={`rounded-[3px] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider ${
                        data.status === 'confirmed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-primary/10 text-primary border border-primary/40'
                      }`}
                    >
                      {data.status.replace('_', ' ')}
                    </span>
                  </div>

                  {data.team_name && (
                    <div className="text-muted-foreground">
                      TEAM: <strong className="text-foreground">{data.team_name}</strong>
                    </div>
                  )}

                  <div className="text-muted-foreground text-[11px]">
                    REG ID: <code className="text-primary font-bold">{data.registration_id.slice(0, 8)}</code>
                  </div>
                </div>
              </div>

              {/* Participant Details Summary (Certificate & Wallet Data) */}
              <div className="rounded-[10px] border border-primary/40 bg-card/60 p-6 backdrop-blur-md shadow-[0_0_25px_rgba(168,85,247,0.1)]">
                <div className="flex items-center justify-between mb-4 border-b border-border/60 pb-3">
                  <div>
                    <h2 className="font-mono text-xs font-bold tracking-[0.25em] text-primary uppercase">
                      VERIFIED PARTICIPANT DETAILS
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      Certificate & Digital Wallet credentials for this registration.
                    </p>
                  </div>
                  <span className="rounded bg-primary/20 px-2.5 py-1 font-mono text-[10px] font-bold text-primary uppercase">
                    {data.members.length} {data.members.length === 1 ? 'PARTICIPANT' : 'PARTICIPANTS'}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {data.members.map((m, i) => (
                    <div key={i} className="rounded-lg border border-border/80 bg-background/40 p-4 space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between text-muted-foreground mb-2">
                        <span className="text-[10px] uppercase font-bold text-primary">PARTICIPANT {i + 1}</span>
                        {m.is_leader && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary font-bold">LEADER</span>}
                      </div>
                      <p><span className="text-muted-foreground">NAME:</span> <strong className="text-foreground font-sans">{m.name}</strong></p>
                      <p><span className="text-muted-foreground">EMAIL:</span> <span className="text-primary font-medium">{m.email || '—'}</span></p>
                      <p><span className="text-muted-foreground">COLLEGE:</span> <span className="text-foreground">{m.college || '—'}</span></p>
                      <p><span className="text-muted-foreground">CONTACT:</span> <span className="text-foreground">{m.phone || '—'}</span></p>
                      <p><span className="text-muted-foreground">EVENT:</span> <span className="text-primary">{data.event_name}</span></p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 01 — UPI Payment Terminal */}
              <div className="rounded-[10px] border border-border/80 bg-card/60 p-6 md:p-8 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-6">
                  <span className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-primary/40 bg-primary/10 font-mono text-xs font-bold text-primary">
                    01
                  </span>
                  <div>
                    <h2 className="font-mono text-xs font-bold tracking-[0.25em] text-primary uppercase">
                      SCAN & PAY VIA UPI
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      Scan the QR code below using GPay, PhonePe, Paytm, BHIM, or any UPI app.
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-12 md:items-center">
                  {/* QR Code Container with Static Image Asset */}
                  <div className="md:col-span-5 flex justify-center">
                    <div className="relative group overflow-hidden rounded-[10px] border-2 border-primary/40 bg-white p-4 shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-all hover:border-primary hover:shadow-[0_0_40px_rgba(168,85,247,0.3)]">
                      {/* Scanline overlay effect */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent opacity-50" />
                      {/* eslint-disable-next-html-element */}
                      <img
                        src="/payment-qr.jpeg"
                        alt="CyberCarnival UPI Payment QR Code"
                        width={240}
                        height={240}
                        className="h-56 w-56 object-contain"
                      />
                    </div>
                  </div>

                  {/* Payment Details Column */}
                  <div className="md:col-span-7 space-y-4 font-mono text-xs border-t border-border/60 pt-4 md:border-t-0 md:border-l md:border-border/60 md:pl-8 md:pt-0">
                    <div className="border border-border/60 bg-background/50 p-3.5 rounded-[4px]">
                      <span className="block font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                        PAYEE NAME
                      </span>
                      <span className="mt-1 block font-bold text-foreground text-sm">
                        {data.upi_payee_name}
                      </span>
                    </div>

                    <div className="border border-border/60 bg-background/50 p-3.5 rounded-[4px]">
                      <span className="block font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                        UPI VPA / ID
                      </span>
                      <code className="mt-1 block rounded-[3px] border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary w-fit">
                        {data.upi_id}
                      </code>
                    </div>

                    <div className="border border-border/60 bg-background/50 p-3.5 rounded-[4px]">
                      <span className="block font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                        EXACT AMOUNT TO PAY
                      </span>
                      <span className="mt-1 block font-bold text-emerald-400 text-lg">
                        ₹{data.fee_amount_rupees}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 02 — Payment Verification Form */}
              <div className="rounded-[10px] border border-border/80 bg-card/60 p-6 md:p-8 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-6">
                  <span className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-primary/40 bg-primary/10 font-mono text-xs font-bold text-primary">
                    02
                  </span>
                  <div>
                    <h2 className="font-mono text-xs font-bold tracking-[0.25em] text-primary uppercase">
                      SUBMIT TRANSACTION DETAILS
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      Enter your 12-digit UPI Reference / UTR Number and upload the payment proof screenshot.
                    </p>
                  </div>
                </div>

                {submitSuccess && (
                  <div className="mb-6 rounded-[6px] border border-primary/40 bg-primary/10 p-5 text-primary font-mono text-xs">
                    <p className="font-bold flex items-center gap-2 text-sm">✓ {submitSuccess}</p>
                    <p className="mt-1 text-muted-foreground text-[11px]">
                      {data.status === 'confirmed'
                        ? 'Your payment proof has been verified and your event registration is officially confirmed.'
                        : 'Your payment proof has been submitted and is currently awaiting admin verification.'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {data.status === 'confirmed' && (
                        <Link
                          href={`/ticket?id=${data.registration_id}`}
                          className="inline-flex items-center gap-2 rounded-[3px] border border-emerald-500/60 bg-emerald-500/20 px-4 py-2.5 font-mono text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/30"
                        >
                          VIEW TICKET →
                        </Link>
                      )}
                      <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 rounded-[3px] border border-border bg-background/60 px-4 py-2.5 font-mono text-xs font-bold text-foreground transition-colors hover:border-primary"
                      >
                        GO TO DASHBOARD →
                      </Link>
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="mb-6 rounded-[6px] border border-destructive/40 bg-destructive/10 p-4 text-destructive font-mono text-xs">
                    <p className="font-bold">⚠ {submitError}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* UTR / Transaction ID Field */}
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">
                      UPI TRANSACTION / UTR ID <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="e.g. 424512345678"
                      className="w-full rounded-[4px] border border-border/80 bg-background/60 px-4 py-3 font-mono text-xs uppercase tracking-wider text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    {fieldErrors.transaction_id && (
                      <p className="mt-1 font-mono text-[11px] text-destructive">{fieldErrors.transaction_id}</p>
                    )}
                  </div>

                  {/* Payment Proof File Upload Dropzone */}
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">
                      PAYMENT PROOF SCREENSHOT (JPG / PNG, MAX 5 MB) <span className="text-destructive">*</span>
                    </label>

                    <div className="relative group cursor-pointer rounded-[8px] border-2 border-dashed border-primary/30 bg-background/40 p-6 text-center transition-all hover:border-primary/60 hover:bg-primary/5">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg"
                        onChange={handleFileChange}
                        className="absolute inset-0 z-20 h-full w-full opacity-0 cursor-pointer"
                      />
                      <div className="pointer-events-none flex flex-col items-center justify-center">
                        <span className="font-mono text-2xl text-primary mb-2">📷</span>
                        <span className="font-mono text-xs font-bold text-foreground">
                          {proofFile ? proofFile.name : 'CLICK OR DRAG SCREENSHOT HERE TO UPLOAD'}
                        </span>
                        <span className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {proofFile
                            ? `${(proofFile.size / (1024 * 1024)).toFixed(2)} MB · Click to change file`
                            : 'Supported formats: JPG, JPEG, PNG (Max 5 MB)'}
                        </span>
                      </div>
                    </div>

                    {fieldErrors.payment_proof && (
                      <p className="mt-1 font-mono text-[11px] text-destructive">{fieldErrors.payment_proof}</p>
                    )}

                    {filePreview && (
                      <div className="mt-4 rounded-[6px] border border-border/60 bg-background/50 p-3">
                        <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                          PREVIEW SELECTED IMAGE:
                        </span>
                        {/* eslint-disable-next-html-element */}
                        <img
                          src={filePreview}
                          alt="Selected proof preview"
                          className="max-h-52 rounded-[4px] border border-border object-contain"
                        />
                      </div>
                    )}
                  </div>

                  {/* Disclaimer Card */}
                  <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/5 p-4 font-mono text-xs">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={disclaimerAccepted}
                        onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-muted-foreground leading-relaxed text-[11px]">
                        I confirm that the entered UPI Transaction/UTR ID and uploaded payment proof image
                        are authentic and belong to my registration for{' '}
                        <strong className="text-foreground">{data.event_name}</strong>. I understand that
                        providing false or forged payment details will lead to immediate cancellation of my
                        registration.
                      </span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submitting || data.status === 'confirmed' || data.status === 'pending_verification'}
                    className="group relative w-full overflow-hidden rounded-[3px] border border-primary bg-primary px-8 py-4 font-mono text-xs font-bold tracking-[0.25em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                    <span>
                      {data.status === 'confirmed'
                        ? 'REGISTRATION CONFIRMED'
                        : data.status === 'pending_verification'
                        ? 'PAYMENT VERIFICATION PENDING'
                        : submitting
                        ? 'SUBMITTING PROOF…'
                        : 'SUBMIT PAYMENT DETAILS →'}
                    </span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
