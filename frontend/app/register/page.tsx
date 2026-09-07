'use client'

import { useEffect, useRef, useState } from 'react'
import { Navbar } from '@/components/navbar'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/turnstile-widget'
import { initiateGoogleLogin, ApiValidationError } from '@/lib/api'


export default function RegisterPage() {
  const [error, setError] = useState('')

  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileWidgetRef>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

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
      } else if (
        err === 'invalid_state' ||
        err === 'token_exchange_failed' ||
        err === 'invalid_id_token'
      ) {
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
      const authUrl = await initiateGoogleLogin(turnstileToken, 'register')
      window.location.href = authUrl
    } catch (err) {
      const errMsg = err instanceof ApiValidationError
        ? err.message
        : (err instanceof Error ? err.message : 'Google authentication initiation failed')
      setError(errMsg)
      turnstileRef.current?.reset()
      setTurnstileToken('')
      setGoogleLoading(false)
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 sm:px-6 py-28 sm:py-32">
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary">01 / REGISTER & LOGIN</p>
        <h1 className="mt-4 font-sans text-4xl font-bold leading-none tracking-tight text-foreground">
          Get your token
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Sign in with Google to create your CyberCarnival account and receive
          your unique token to participate in events.
        </p>

        {error && (
          <div className="mt-6 rounded-sm border border-destructive/50 bg-destructive/10 px-4 py-3 text-center font-mono text-xs tracking-[0.1em] text-destructive animate-shake">
            ⚠ {error}
          </div>
        )}

        <div className="mt-6">
          <TurnstileWidget
            ref={turnstileRef}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken('')}
            onError={() => setTurnstileToken('')}
          />
        </div>

        <div className="mt-8 flex flex-col">
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={!turnstileToken || googleLoading}
            className="flex items-center justify-center gap-3 rounded-sm border border-border bg-card px-6 py-4 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:border-primary hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
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

            {googleLoading ? 'REDIRECTING…' : 'CONTINUE WITH GOOGLE'}
          </button>
        </div>
      </main>
    </>
  )
}
