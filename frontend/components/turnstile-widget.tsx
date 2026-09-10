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
    const turnstileRef =
      useRef<TurnstileInstance>(null)

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
        <div className="w-full font-mono text-xs">
          <label
            className="
              mb-1.5
              block
              text-[10px]
              font-bold
              uppercase
              tracking-[0.2em]
              text-primary
            "
          >
            SECURITY VERIFICATION
          </label>

          <div
            className="
              flex
              min-h-[78px]
              w-full
              items-center
              justify-center
              rounded-sm
              border
              border-destructive/40
              bg-destructive/10
              px-4
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
      <div className="w-full font-mono text-xs">

        <label
          className="
            mb-1.5
            block
            text-[10px]
            font-bold
            uppercase
            tracking-[0.2em]
            text-primary
          "
        >
          SECURITY VERIFICATION
        </label>

        <div
          className="
            flex
            w-full
            max-w-full
            items-center
            justify-center
            overflow-visible
            rounded-sm
            border
            border-primary/30
            bg-background/60
            p-3
            shadow-[0_0_15px_rgba(168,85,247,0.12)]
          "
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
              appearance: 'always',
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
