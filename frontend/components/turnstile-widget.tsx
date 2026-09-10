'use client'

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import {
  Turnstile,
  type TurnstileInstance,
} from '@marsidev/react-turnstile'

export interface TurnstileWidgetRef {
  reset: () => void
  execute: () => void
}

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

export const TurnstileWidget = forwardRef<
  TurnstileWidgetRef,
  TurnstileWidgetProps
>(
  function TurnstileWidget(
    {
      onSuccess,
      onExpire,
      onError,
    },
    ref
  ) {
    const turnstileRef =
      useRef<TurnstileInstance>(null)

    const [showChallenge, setShowChallenge] =
      useState(false)

    const siteKey =
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

    useImperativeHandle(ref, () => ({
      reset: () => {
        setShowChallenge(false)
        turnstileRef.current?.reset()
      },

      execute: () => {
        setShowChallenge(true)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            turnstileRef.current?.execute()
          })
        })
      },
    }))

    if (!siteKey) {
      return (
        <div className="w-full font-mono text-xs">
          <div
            className="
              flex
              w-full
              items-center
              justify-center
              rounded-sm
              border
              border-destructive/40
              bg-destructive/10
              px-4
              py-4
              text-center
              text-[10px]
              tracking-[0.1em]
              text-destructive
            "
          >
            CLOUDFLARE TURNSTILE SITE KEY IS NOT CONFIGURED
          </div>
        </div>
      )
    }

    return (
      <div className="w-full">

        <div
          className={
            showChallenge
              ? 'flex w-full items-center justify-center'
              : 'absolute h-px w-px overflow-hidden opacity-0 pointer-events-none'
          }
        >
          <Turnstile
            ref={turnstileRef}
            siteKey={siteKey}

            onSuccess={(token) => {
              setShowChallenge(false)
              onSuccess(token)
            }}

            onExpire={() => {
              setShowChallenge(false)
              onExpire?.()
            }}

            onError={() => {
              setShowChallenge(false)
              onError?.()
            }}

            options={{
              theme: 'dark',
              size: 'normal',

              // Wait for your VERIFY HUMAN button.
              execution: 'execute',

              // Show Cloudflare only once execution begins.
              appearance: 'execute',

              refreshExpired: 'auto',
            }}

            style={{
              width: '100%',
              maxWidth: '300px',
              overflow: 'visible',
            }}
          />
        </div>

      </div>
    )
  }
)

TurnstileWidget.displayName = 'TurnstileWidget'
