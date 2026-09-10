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
      <div className="w-full font-mono text-xs">

        <label
          className="
            mb-2
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
            items-center
            justify-center
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

              // Cloudflare widget starts normally
              execution: 'render',

              // Cloudflare box stays visible
              appearance: 'always',

              refreshExpired: 'auto',
            }}

            style={{
              width: '100%',
              maxWidth: '300px',
            }}
          />
        </div>

      </div>
    )
  }
)

TurnstileWidget.displayName = 'TurnstileWidget'
