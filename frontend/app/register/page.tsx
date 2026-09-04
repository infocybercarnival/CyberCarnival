'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/turnstile-widget'
import { initiateGoogleLogin, requestOtp, verifyOtp, ApiValidationError } from '@/lib/api'

type OtpStep = 'email' | 'otp' | 'done'

export default function RegisterPage() {
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

  // Turnstile security widget
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileWidgetRef>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Registration OTP state
  const [otpStep, setOtpStep] = useState<OtpStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'resending'>('idle')

  // Handle URL query errors and session restoration on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const err = params.get('error')
      if (err === 'unverified_email') {
        setError('Your Google email could not be verified.')
      } else if (err === 'oauth_cancelled') {
        setError('Google authentication was cancelled.')
      } else if (err === 'config_missing') {
        setError('Google login is currently not configured on the server. Please contact support.')
      } else if (err === 'invalid_state' || err === 'token_exchange_failed' || err === 'invalid_id_token') {
        setError('Google authentication failed. Please try again.')
      } else if (err === 'captcha_failed') {
        setError('Security verification failed. Please try again.')
      } else if (err === 'account_disabled') {
        setError('Your account is currently disabled.')
      } else if (err) {
        setError('Authentication error occurred. Please try again.')
      }

      // Check if user refreshed the page with an active pending registration OTP
      const savedEmail = sessionStorage.getItem('pending_register_email')
      const savedTimestamp = sessionStorage.getItem('pending_register_timestamp')
      if (savedEmail) {
        setEmail(savedEmail)
        setOtpStep('otp')
        if (savedTimestamp) {
          const elapsedSeconds = Math.floor((Date.now() - Number(savedTimestamp)) / 1000)
          const remaining = Math.max(0, 60 - elapsedSeconds)
          setCooldown(remaining)
        } else {
          setCooldown(60)
        }
        setInfoMessage('An active verification code was sent to your email. Enter it below to complete registration.')
      }
    }
  }, [])

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function handleGoogleClick() {
    if (!turnstileToken) return
    setGoogleLoading(true)
    setError('')
    try {
      const authUrl = await initiateGoogleLogin(turnstileToken, 'register')
      window.location.href = authUrl
    } catch (err) {
      setError(err instanceof ApiValidationError ? err.message : 'Something went wrong. Try again.')
      turnstileRef.current?.reset()
      setTurnstileToken('')
      setGoogleLoading(false)
    }
  }

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('PLEASE ENTER A VALID EMAIL ADDRESS')
      return
    }
    if (!turnstileToken) {
      setError('Please complete the security verification.')
      return
    }
    setStatus('submitting')
    setError('')
    setInfoMessage('')

    try {
      const res = await requestOtp(email.trim(), turnstileToken)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pending_register_email', email.trim())
        sessionStorage.setItem('pending_register_timestamp', String(Date.now()))
      }
      setOtpStep('otp')
      setCooldown(60)

      if (res.cooldown_active) {
        setInfoMessage('An active verification code was already sent to your email. Enter the code below.')
      }
    } catch (err) {
      if (err instanceof ApiValidationError) {
        const msg = err.message.toLowerCase()
        if (msg.includes('wait a minute') || msg.includes('cooldown') || err.status === 429) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('pending_register_email', email.trim())
            sessionStorage.setItem('pending_register_timestamp', String(Date.now()))
          }
          setOtpStep('otp')
          setCooldown(60)
          setInfoMessage('An active verification code was already sent to your email. Enter the code below.')
          return
        }
        setError(err.message.toUpperCase())
      } else {
        setError('SOMETHING WENT WRONG. PLEASE TRY AGAIN.')
      }
      turnstileRef.current?.reset()
      setTurnstileToken('')
    } finally {
      setStatus('idle')
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('PLEASE ENTER THE 6-DIGIT VERIFICATION CODE')
      return
    }

    setStatus('submitting')
    setError('')
    setInfoMessage('')

    try {
      await verifyOtp(email.trim(), otp.trim())
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pending_register_email')
        sessionStorage.removeItem('pending_register_timestamp')
      }
      setOtpStep('done')
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setError(err.message.toUpperCase())
      } else {
        setError('SOMETHING WENT WRONG. PLEASE TRY AGAIN.')
      }
    } finally {
      setStatus('idle')
    }
  }

  async function handleResendOtp() {
    if (cooldown > 0 || !turnstileToken) {
      if (!turnstileToken) {
        setError('Please complete the security verification before requesting a new code.')
      }
      return
    }

    setStatus('resending')
    setError('')
    setInfoMessage('')

    try {
      const res = await requestOtp(email.trim(), turnstileToken)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pending_register_timestamp', String(Date.now()))
      }
      setCooldown(60)
      setOtp('')
      if (res.cooldown_active) {
        setInfoMessage('An active verification code was already sent to your email. Enter the code below.')
      } else {
        setInfoMessage('A new 6-digit verification code has been sent to your email.')
      }
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setError(err.message.toUpperCase())
      } else {
        setError('FAILED TO RESEND OTP. PLEASE TRY AGAIN.')
      }
      turnstileRef.current?.reset()
      setTurnstileToken('')
    } finally {
      setStatus('idle')
    }
  }

  function handleUseDifferentEmail() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pending_register_email')
      sessionStorage.removeItem('pending_register_timestamp')
    }
    setOtpStep('email')
    setEmail('')
    setOtp('')
    setError('')
    setInfoMessage('')
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-32">
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary">01 / REGISTER & LOGIN</p>
        <h1 className="mt-4 font-sans text-4xl font-bold leading-none tracking-tight text-foreground">
          {otpStep === 'done' ? 'Account Created' : 'Get your token'}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {otpStep === 'done'
            ? 'Your CyberCarnival credentials have been generated and sent to your email address.'
            : "Sign in with Google, or use your email instead — either way you'll get your unique CyberCarnival token to participate in events."}
        </p>

        {/* Error notification */}
        {error && (
          <div className="mt-6 border border-destructive/50 bg-destructive/10 px-4 py-3 text-center font-mono text-xs tracking-[0.1em] text-destructive rounded-sm animate-shake">
            ⚠ {error}
          </div>
        )}

        {/* Informational notification */}
        {infoMessage && !error && (
          <div className="mt-6 border border-primary/40 bg-primary/10 px-4 py-3 text-center font-mono text-xs tracking-[0.05em] text-primary rounded-sm">
            ℹ {infoMessage}
          </div>
        )}

        {/* Captcha Widget */}
        {otpStep !== 'done' && (
          <div className="mt-6">
            <TurnstileWidget
              ref={turnstileRef}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken('')}
              onError={() => setTurnstileToken('')}
            />
          </div>
        )}

        {/* Google OAuth Signup Button */}
        {otpStep === 'email' && (
          <>
            <div className="mt-8 flex flex-col">
              <button
                type="button"
                onClick={handleGoogleClick}
                disabled={!turnstileToken || googleLoading}
                className="flex items-center justify-center gap-3 border border-border bg-card px-6 py-4 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:border-primary hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 rounded-sm"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                {googleLoading ? 'REDIRECTING…' : 'CONTINUE WITH GOOGLE'}
              </button>
            </div>

            {/* Divider */}
            <div className="my-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        {/* STEP 1: Enter Email */}
        {otpStep === 'email' && (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-4 font-mono text-xs">
            <Field label="Email Address">
              <input
                type="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-background/60 border border-border/80 px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors rounded-sm"
              />
            </Field>
            <button
              type="submit"
              disabled={status === 'submitting' || !turnstileToken}
              className="border border-primary bg-primary px-6 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:cursor-not-allowed disabled:opacity-40 rounded-sm"
            >
              {status === 'submitting' ? 'SENDING OTP…' : 'CONTINUE WITH EMAIL →'}
            </button>
          </form>
        )}

        {/* STEP 2: Email OTP Verification */}
        {otpStep === 'otp' && (
          <div className="mt-8 flex flex-col gap-6 rounded-[10px] border border-primary/40 bg-card/70 p-6 md:p-8 backdrop-blur-md shadow-[0_0_35px_rgba(168,85,247,0.15)]">
            <div>
              <span className="font-mono text-[10px] tracking-[0.3em] text-primary font-bold uppercase">
                EMAIL OTP VERIFICATION
              </span>
              <h2 className="mt-2 font-sans text-xl font-bold tracking-tight text-foreground">
                We sent a verification code to:
              </h2>
              <p className="mt-1 font-mono text-xs font-semibold text-primary break-all">
                {email}
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 font-mono text-xs">
              <Field label="6-Digit Verification Code">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full bg-background/60 border border-border/80 px-3.5 py-3 text-center text-lg font-bold tracking-[0.4em] text-foreground placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors rounded-sm"
                />
              </Field>

              <button
                type="submit"
                disabled={status === 'submitting' || otp.length !== 6}
                className="group relative mt-2 w-full overflow-hidden border border-primary bg-primary px-6 py-3.5 font-mono text-xs font-bold tracking-[0.25em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:opacity-50 rounded-[3px]"
              >
                <span>{status === 'submitting' ? 'VERIFYING OTP…' : 'VERIFY OTP →'}</span>
              </button>

              <div className="flex flex-col gap-3 pt-2 text-[10px] sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleUseDifferentEmail}
                  className="text-muted-foreground hover:text-foreground tracking-[0.1em] text-left"
                >
                  ← USE A DIFFERENT EMAIL
                </button>

                <button
                  type="button"
                  disabled={cooldown > 0 || status === 'resending' || !turnstileToken}
                  onClick={handleResendOtp}
                  className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline font-semibold tracking-[0.1em] text-right"
                >
                  {cooldown > 0
                    ? `RESEND AVAILABLE IN ${cooldown}S`
                    : status === 'resending'
                    ? 'SENDING…'
                    : 'RESEND OTP'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: Verification Done */}
        {otpStep === 'done' && (
          <div className="mt-8 rounded-[10px] border border-emerald-500/40 bg-card/70 p-6 md:p-8 backdrop-blur-md shadow-[0_0_35px_rgba(16,185,129,0.15)]">
            <span className="rounded bg-emerald-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em]">
              VERIFIED ✓
            </span>
            <h3 className="mt-4 font-sans text-2xl font-bold text-foreground">Check your email.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your CyberCarnival token, username, and temporary password were just sent to{' '}
              <strong className="text-foreground font-mono">{email}</strong>.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 border border-primary bg-primary px-6 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 rounded-[3px]"
            >
              GO TO LOGIN →
            </Link>
          </div>
        )}
      </main>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground block mb-1">{label}</label>
      <div>
        {children}
      </div>
    </div>
  )
}
