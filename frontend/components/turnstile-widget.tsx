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

        /*
         * Wait until React makes the Turnstile container visible,
         * then start Cloudflare verification.
         */
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

        {showChallenge && (
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
                items-center
                justify-center
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
                  execution: 'execute',
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
        )}

        {!showChallenge && (
          <div
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
                execution: 'execute',
                appearance: 'execute',
                refreshExpired: 'auto',
              }}
            />
          </div>
        )}

      </div>
    )
  }
)

TurnstileWidget.displayName = 'TurnstileWidget'
