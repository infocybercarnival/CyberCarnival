'use client'

import {
  forwardRef,
  useImperativeHandle,
  useRef,
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
    const turnstileRef = useRef<TurnstileInstance>(null)

    const siteKey =
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

    useImperativeHandle(ref, () => ({
      reset: () => {
        turnstileRef.current?.reset()
      },

      execute: () => {
        turnstileRef.current?.execute()
      },
    }))

    if (!siteKey) {
      return (
        <div className="w-full rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-center font-mono text-[10px] tracking-[0.1em] text-destructive">
          CLOUDFLARE TURNSTILE SITE KEY IS NOT CONFIGURED
        </div>
      )
    }

    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <Turnstile
          ref={turnstileRef}
          siteKey={siteKey}
          onSuccess={(token) => {
            onSuccess(token)
          }}
          onExpire={() => {
            onExpire?.()
          }}
          onError={() => {
            onError?.()
          }}
          options={{
            theme: 'dark',
            size: 'normal',
            execution: 'execute',
            appearance: 'interaction-only',
            refreshExpired: 'auto',
          }}
        />
      </div>
    )
  }
)

TurnstileWidget.displayName = 'TurnstileWidget'
