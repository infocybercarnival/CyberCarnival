'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/turnstile-widget'
import { initiateGoogleLogin, loginWithPassword, verifyLoginOtp, resendLoginOtp, ApiValidationError } from '@/lib/api'

export function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const [otp, setOtp] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileWidgetRef>(null)

  const [status, setStatus] = useState<'idle' | 'authenticating' | 'verifying_otp' | 'resending_otp' | 'google_connecting' | 'success'>('idle')
  const [error, setError] = useState('')

  // Handle URL Query error parameters from Google OAuth Callback / Server
  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'authorized_email_required') {
      setError('AUTHORIZED EMAIL REQUIRED — Please use an authorized educational email.')
    } else if (err === 'unverified_email') {
      setError('Google email could not be verified.')
    } else if (err === 'oauth_cancelled') {
      setError('Google authentication was cancelled.')
    } else if (err === 'config_missing') {
      setError('Google authentication is currently not configured on the server.')
    } else if (err === 'account_disabled') {
      setError('Your account is currently disabled.')
    } else if (err === 'captcha_failed') {
      setError('Security verification failed. Please try again.')
    } else if (err) {
      setError('GOOGLE AUTHENTICATION FAILED — Please try again.')
    }
  }, [searchParams])

  // Cooldown countdown timer for resend OTP
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('INVALID CREDENTIALS')
      return
    }
    if (!turnstileToken) {
      setError('PLEASE COMPLETE THE SECURITY VERIFICATION')
      return
    }

    setStatus('authenticating')
    setError('')

    try {
      const res = await loginWithPassword({ username: username.trim(), password, turnstileToken })
      if (res.otp_required) {
        setMaskedEmail(res.masked_email || '')
        setStep('otp')
        setCooldown(60)
        setStatus('idle')
      } else {
        setStatus('success')
        const redirectUrl = searchParams.get('redirect') || '/dashboard'
        setTimeout(() => {
          router.push(redirectUrl)
        }, 600)
      }
    } catch (err) {
      setStatus('idle')
      turnstileRef.current?.reset()
      setTurnstileToken('')
      if (err instanceof ApiValidationError) {
        setError(err.message.toUpperCase())
      } else {
        setError('INVALID CREDENTIALS')
      }
    }
  }

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('PLEASE ENTER THE 6-DIGIT VERIFICATION CODE')
      return
    }

    setStatus('verifying_otp')
    setError('')

    try {
      await verifyLoginOtp(otp.trim())
      setStatus('success')
      const redirectUrl = searchParams.get('redirect') || '/dashboard'
      setTimeout(() => {
        router.push(redirectUrl)
      }, 600)
    } catch (err) {
      setStatus('idle')
      if (err instanceof ApiValidationError) {
        setError(err.message.toUpperCase())
      } else {
        setError('INVALID VERIFICATION CODE')
      }
    }
  }

  const handleResendOtp = async () => {
    if (cooldown > 0) return
    setStatus('resending_otp')
    setError('')
    try {
      await resendLoginOtp()
      setCooldown(60)
      setError('')
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setError(err.message.toUpperCase())
      } else {
        setError('FAILED TO RESEND OTP')
      }
    } finally {
      setStatus('idle')
    }
  }

  const handleGoogleClick = async () => {
    if (!turnstileToken) {
      setError('PLEASE COMPLETE THE SECURITY VERIFICATION')
      return
    }
    setStatus('google_connecting')
    setError('')
    try {
      window.location.href =
        `https://cybercarnival.onrender.com/api/auth/google/login` +
        `?turnstile_token=${encodeURIComponent(turnstileToken)}` +
        `&source=login`
    } catch (err) {
      setStatus('idle')
      turnstileRef.current?.reset()
      setTurnstileToken('')
      setError(err instanceof ApiValidationError ? err.message.toUpperCase() : 'GOOGLE AUTHENTICATION FAILED')
    }
  }

  return (
    <>
      <Navbar />
      <main className="relative z-10 mx-auto flex min-h-[85vh] max-w-7xl flex-col items-center justify-center px-6 pb-32 pt-36 lg:px-10">
        {/* Authentication Card Panel */}
        <div className="w-full max-w-md border border-primary/40 bg-card/70 p-6 md:p-8 backdrop-blur-md rounded-[10px] shadow-[0_0_35px_rgba(168,85,247,0.15)] transition-all">
          <div className="text-center">
            <span className="font-mono text-[10px] tracking-[0.3em] text-primary font-bold">
              {step === 'credentials' ? 'SECURE ACCESS' : '2FA VERIFICATION'}
            </span>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {step === 'credentials' ? 'AUTHENTICATE PROFILE' : 'ENTER LOGIN OTP'}
            </h1>
            <p className="mt-2 font-mono text-xs text-muted-foreground tracking-[0.1em]">
              {step === 'credentials'
                ? 'AUTHENTICATE TO ACCESS YOUR CYBERCARNIVAL PROFILE.'
                : `A 6-DIGIT OTP WAS SENT TO ${maskedEmail || 'YOUR EMAIL'}.`}
            </p>
          </div>

          {/* Error / Status Notification */}
          {error && (
            <div className="mt-6 border border-destructive/50 bg-destructive/10 px-4 py-3 text-center font-mono text-xs tracking-[0.1em] text-destructive rounded-sm animate-shake">
              ⚠ {error}
            </div>
          )}

          {status === 'success' && (
            <div className="mt-6 border border-emerald-500/50 bg-emerald-950/40 px-4 py-3 text-center font-mono text-xs tracking-[0.1em] text-emerald-400 rounded-sm">
              ✓ AUTHENTICATION SUCCESSFUL — REDIRECTING...
            </div>
          )}

          {/* STEP 1: Username / Password Form */}
          {step === 'credentials' && (
            <>
              <form onSubmit={handlePasswordLogin} className="mt-6 flex flex-col gap-4 font-mono text-xs">
                <div>
                  <label className="block tracking-[0.2em] text-muted-foreground uppercase text-[10px] mb-1">
                    USERNAME / EMAIL
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username or email"
                    className="w-full bg-background/60 border border-border/80 px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors rounded-sm"
                  />
                </div>

                <div>
                  <label className="block tracking-[0.2em] text-muted-foreground uppercase text-[10px] mb-1">
                    PASSWORD
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full bg-background/60 border border-border/80 pl-3.5 pr-10 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors rounded-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-muted-foreground hover:text-foreground text-sm"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password Row */}
                <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                  <label className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="accent-primary"
                    />
                    <span>REMEMBER ME</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setError('Password reset requests are managed by event organizers.')}
                    className="hover:text-primary transition-colors"
                  >
                    FORGOT PASSWORD?
                  </button>
                </div>

                {/* CAPTCHA — gates both the password submit and the Google button below */}
                <TurnstileWidget
                  ref={turnstileRef}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                />

                {/* Submit Password Button */}
                <button
                  type="submit"
                  disabled={status !== 'idle' || !turnstileToken}
                  className="group relative mt-2 w-full overflow-hidden border border-primary bg-primary px-6 py-3.5 font-mono text-xs font-bold tracking-[0.25em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:opacity-50 rounded-[3px]"
                >
                  <span>
                    {status === 'authenticating'
                      ? 'VERIFYING CREDENTIALS...'
                      : status === 'success'
                      ? 'SUCCESS ✓'
                      : 'CONTINUE →'}
                  </span>
                </button>
              </form>

              {/* Divider */}
              <div className="my-6 flex items-center justify-center gap-3 text-[10px] font-mono tracking-[0.15em] text-muted-foreground/70">
                <span className="h-px flex-1 bg-border/60" />
                <span>OR CONTINUE WITH</span>
                <span className="h-px flex-1 bg-border/60" />
              </div>

              {/* Google OAuth Button */}
              <button
                type="button"
                disabled={status !== 'idle' || !turnstileToken}
                onClick={handleGoogleClick}
                className="flex w-full items-center justify-center gap-3 border border-border bg-card/80 px-6 py-3.5 font-mono text-xs tracking-[0.2em] text-foreground transition-all hover:border-primary hover:bg-primary/10 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] disabled:opacity-50 rounded-[3px]"
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
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>
                  {status === 'google_connecting'
                    ? 'CONNECTING TO GOOGLE...'
                    : 'CONTINUE WITH GOOGLE'}
                </span>
              </button>

              {/* Register Callout Footer */}
              <div className="mt-6 pt-4 border-t border-border/40 text-center font-mono text-[11px]">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link
                  href="/register"
                  className="text-primary hover:underline font-semibold tracking-[0.1em]"
                >
                  REGISTER →
                </Link>
              </div>
            </>
          )}

          {/* STEP 2: Login OTP Verification Form */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="mt-6 flex flex-col gap-4 font-mono text-xs">
              <div>
                <label className="block tracking-[0.2em] text-muted-foreground uppercase text-[10px] mb-1">
                  6-DIGIT VERIFICATION CODE
                </label>
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
              </div>

              <button
                type="submit"
                disabled={status !== 'idle' || otp.length !== 6}
                className="group relative mt-2 w-full overflow-hidden border border-primary bg-primary px-6 py-3.5 font-mono text-xs font-bold tracking-[0.25em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:opacity-50 rounded-[3px]"
              >
                <span>
                  {status === 'verifying_otp'
                    ? 'VERIFYING OTP...'
                    : status === 'success'
                    ? 'SUCCESS ✓'
                    : 'VERIFY & LOGIN →'}
                </span>
              </button>

              <div className="flex items-center justify-between pt-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setStep('credentials')
                    setOtp('')
                    setError('')
                  }}
                  className="text-muted-foreground hover:text-foreground tracking-[0.1em]"
                >
                  ← BACK TO LOGIN
                </button>

                <button
                  type="button"
                  disabled={cooldown > 0 || status === 'resending_otp'}
                  onClick={handleResendOtp}
                  className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline font-semibold tracking-[0.1em]"
                >
                  {cooldown > 0 ? `RESEND IN ${cooldown}S` : status === 'resending_otp' ? 'SENDING...' : 'RESEND OTP'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  )
}
