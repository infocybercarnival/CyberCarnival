'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/turnstile-widget'
import { initiateGoogleLogin, requestOtp, verifyOtp, ApiValidationError } from '@/lib/api'

type OtpStep = 'email' | 'otp' | 'done'

export default function RegisterPage() {
  const [error, setError] = useState('')

  // one captcha solve gates either path below — Google or email
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileWidgetRef>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

  // email/OTP flow state
  const [otpStep, setOtpStep] = useState<OtpStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle')

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
    }
  }, [])

  async function handleGoogleClick() {
    if (!turnstileToken) return
    setGoogleLoading(true)
    setError('')
    try {
      const authUrl = await initiateGoogleLogin(turnstileToken)
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
    if (!turnstileToken) {
      setError('Please complete the security verification.')
      return
    }
    setStatus('submitting')
    setError('')
    try {
      await requestOtp(email, turnstileToken)
      setOtpStep('otp')
    } catch (err) {
      setError(err instanceof ApiValidationError ? err.message : 'Something went wrong. Try again.')
      turnstileRef.current?.reset()
      setTurnstileToken('')
    } finally {
      setStatus('idle')
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    try {
      await verifyOtp(email, otp)
      setOtpStep('done')
    } catch (err) {
      setError(err instanceof ApiValidationError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-32">
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary">01 / REGISTER & LOGIN</p>
        <h1 className="mt-4 font-sans text-4xl font-bold leading-none tracking-tight text-foreground">
          Get your token
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Sign in with Google, or use your email instead — either way you'll get your
          unique CyberCarnival token to participate in events.
        </p>

        {error && (
          <p className="mt-6 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

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

        {/* Option 1 — Google */}
        <div className="mt-8 flex flex-col">
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={!turnstileToken || googleLoading}
            className="flex items-center justify-center gap-3 border border-border bg-card px-6 py-4 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:border-primary hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
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

        {/* divider */}
        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Option 2 — Email + OTP */}
        {otpStep === 'email' && (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
            <Field label="Email">
              <input
                type="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <button
              type="submit"
              disabled={status === 'submitting' || !turnstileToken}
              className="border border-primary/60 px-6 py-3 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'submitting' ? 'SENDING…' : 'CONTINUE WITH EMAIL'}
            </button>
          </form>
        )}

        {otpStep === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to <span className="text-foreground">{email}</span>.
            </p>
            <Field label="Verification code">
              <input
                inputMode="numeric"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="tracking-[0.5em]"
              />
            </Field>
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="border border-primary/60 px-6 py-3 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            >
              {status === 'submitting' ? 'VERIFYING…' : 'VERIFY'}
            </button>
            <button
              type="button"
              onClick={() => setOtpStep('email')}
              className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground hover:text-foreground"
            >
              ← use a different email
            </button>
          </form>
        )}

        {otpStep === 'done' && (
          <div>
            <p className="font-mono text-[11px] tracking-[0.3em] text-primary">VERIFIED</p>
            <h3 className="mt-3 font-sans text-2xl font-bold text-foreground">Check your email.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your CyberCarnival token, username, and a temporary password were just sent to{' '}
              <span className="text-foreground">{email}</span>.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex items-center gap-2 border border-primary/60 px-6 py-3 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground"
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
      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</label>
      <div className="mt-1 [&>input]:w-full [&>input]:border [&>input]:border-input [&>input]:bg-transparent [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:text-foreground [&>input]:outline-none [&>input]:focus:border-primary">
        {children}
      </div>
    </div>
  )
}
