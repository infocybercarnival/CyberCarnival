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
    }))

    if (!siteKey) {
      return (
        <div className="w-full rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-center font-mono text-[10px] text-destructive">
          CLOUDFLARE TURNSTILE SITE KEY IS NOT CONFIGURED
        </div>
      )
    }

    return (
      <div className="flex w-full justify-center">
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
            execution: 'render',
            appearance: 'always',
            refreshExpired: 'auto',
          }}

          style={{
            width: '300px',
          }}
        />
      </div>
    )
  }
)

TurnstileWidget.displayName = 'TurnstileWidget'
