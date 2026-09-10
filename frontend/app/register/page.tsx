'use client'

import { useEffect, useRef, useState } from 'react'

import { Navbar } from '@/components/navbar'

import {
  TurnstileWidget,
  type TurnstileWidgetRef,
} from '@/components/turnstile-widget'

import {
  initiateGoogleLogin,
  requestOtp,
  verifyOtp,
  ApiValidationError,
} from '@/lib/api'

export default function RegisterPage() {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileWidgetRef>(null)

  const [googleLoading, setGoogleLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')

    if (err === 'unverified_email') {
      setError('Your Google email could not be verified.')
    } else if (err === 'oauth_cancelled') {
      setError('Google authentication was cancelled.')
    } else if (err === 'config_missing') {
      setError(
        'Google login is currently not configured on the server.'
      )
    } else if (
      err === 'invalid_state' ||
      err === 'token_exchange_failed' ||
      err === 'invalid_id_token'
    ) {
      setError(
        'Google authentication failed. Please try again.'
      )
    } else if (err === 'captcha_failed') {
      setError(
        'Security verification failed. Please try again.'
      )
    } else if (err === 'account_disabled') {
      setError('Your account is currently disabled.')
    } else if (err) {
      setError(
        'Authentication error occurred. Please try again.'
      )
    }
  }, [])

  function handleTurnstileVerify() {
    setError('')
    setMessage('')
    turnstileRef.current?.execute()
  }

  async function handleGoogleClick() {
    if (!turnstileToken) {
      setError(
        'Please complete the security verification.'
      )
      return
    }

    setGoogleLoading(true)
    setError('')
    setMessage('')

    try {
      const authUrl = await initiateGoogleLogin(
        turnstileToken,
        'register'
      )

      window.location.href = authUrl
    } catch (err) {
      setError(
        err instanceof ApiValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Google authentication failed.'
      )

      turnstileRef.current?.reset()
      setTurnstileToken('')
      setGoogleLoading(false)
    }
  }

  async function handleGenerateOtp() {
    const cleanEmail = email.trim().toLowerCase()

    if (!turnstileToken) {
      setError(
        'Please complete the security verification.'
      )
      return
    }

    if (!cleanEmail) {
      setError('Please enter your email.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const result = await requestOtp(
        cleanEmail,
        turnstileToken
      )

      setOtpSent(true)

      if (result.cooldown_active) {
        setMessage(
          'An OTP was already sent. Enter the active OTP below.'
        )
      } else {
        setMessage(
          `OTP sent successfully to ${cleanEmail}`
        )
      }
    } catch (err) {
      setError(
        err instanceof ApiValidationError
          ? err.message
          : 'Could not send OTP. Please try again.'
      )

      turnstileRef.current?.reset()
      setTurnstileToken('')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    const cleanEmail = email.trim().toLowerCase()
    const cleanOtp = otp.trim()

    if (!cleanEmail) {
      setError('Please enter your email.')
      return
    }

    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit OTP.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      await verifyOtp(cleanEmail, cleanOtp)

      setMessage(
        'Account created successfully. Check your email for your CyberCarnival token, username and password.'
      )
    } catch (err) {
      setError(
        err instanceof ApiValidationError
          ? err.message
          : 'OTP verification failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar />

      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-28 sm:px-6 sm:py-32">

        <p className="font-mono text-[11px] tracking-[0.3em] text-primary">
          01 / REGISTER & LOGIN
        </p>

        <h1 className="mt-4 font-sans text-4xl font-bold leading-none tracking-tight text-foreground">
          Get your token
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Sign in with Google or verify your email using OTP
          to create your CyberCarnival account and receive
          your unique participant token.
        </p>

        {error && (
          <div className="mt-6 rounded-sm border border-destructive/50 bg-destructive/10 px-4 py-3 text-center font-mono text-xs tracking-[0.1em] text-destructive">
            ⚠ {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center font-mono text-[11px] leading-relaxed tracking-[0.08em] text-emerald-300">
            ✓ {message}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {!turnstileToken && (
            <button
              type="button"
              onClick={handleTurnstileVerify}
              disabled={googleLoading || loading}
              className="w-full rounded-sm border border-primary/50 bg-primary/10 px-5 py-3 font-mono text-[10px] font-bold tracking-[0.22em] text-primary transition-all hover:border-primary hover:bg-primary/20 hover:shadow-[0_0_18px_rgba(168,85,247,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              VERIFY HUMAN →
            </button>
          )}

          {turnstileToken && (
            <div className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center font-mono text-[10px] font-bold tracking-[0.18em] text-emerald-300">
              ✓ SECURITY VERIFIED
            </div>
          )}

          <TurnstileWidget
            ref={turnstileRef}
            onSuccess={(token) => {
              setTurnstileToken(token)
              setError('')
            }}
            onExpire={() => {
              setTurnstileToken('')
            }}
            onError={() => {
              setTurnstileToken('')
              setError('Security verification failed. Please try again.')
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={!turnstileToken || googleLoading}
          className="mt-8 flex items-center justify-center gap-3 rounded-sm border border-border bg-card px-6 py-4 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:border-primary hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />

            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />

            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />

            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>

          {googleLoading
            ? 'REDIRECTING…'
            : 'CONTINUE WITH GOOGLE'}
        </button>

        <div className="my-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />

          <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
            OR
          </span>

          <div className="h-px flex-1 bg-border" />
        </div>

        <div>
          <label
            htmlFor="register-email"
            className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-muted-foreground"
          >
            ENTER YOUR EMAIL
          </label>

          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            disabled={otpSent}
            onChange={(event) => {
              setEmail(event.target.value)
              setError('')
            }}
            placeholder="you@example.com"
            className="h-12 w-full rounded-sm border border-border bg-card px-4 font-mono text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary disabled:opacity-60"
          />
        </div>

        {!otpSent ? (
          <button
            type="button"
            onClick={handleGenerateOtp}
            disabled={
              !turnstileToken ||
              !email.trim() ||
              loading
            }
            className="mt-3 flex h-12 w-full items-center justify-center rounded-sm border border-primary bg-primary/10 px-5 font-mono text-[11px] font-bold tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading
              ? 'SENDING OTP…'
              : 'GENERATE OTP →'}
          </button>
        ) : (
          <>
            <div className="mt-4">
              <label
                htmlFor="register-otp"
                className="mb-2 block font-mono text-[10px] tracking-[0.2em] text-muted-foreground"
              >
                ENTER OTP
              </label>

              <input
                id="register-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => {
                  setOtp(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  )

                  setError('')
                }}
                placeholder="000000"
                className="h-14 w-full rounded-sm border border-border bg-card px-4 text-center font-mono text-xl font-bold tracking-[0.45em] text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary"
              />
            </div>

            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={
                otp.length !== 6 ||
                loading
              }
              className="mt-3 flex h-12 w-full items-center justify-center rounded-sm bg-primary px-5 font-mono text-[11px] font-bold tracking-[0.18em] text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? 'VERIFYING…'
                : 'VERIFY OTP →'}
            </button>
          </>
        )}
      </main>
    </>
  )
}
