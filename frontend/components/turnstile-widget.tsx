'use client'

import {
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
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

    const [started, setStarted] = useState(false)
    const [verified, setVerified] = useState(false)

    useImperativeHandle(ref, () => ({
      reset: () => {
        turnstileRef.current?.reset()
        setStarted(false)
        setVerified(false)
      },
    }))

    function startVerification() {
      if (started) return

      setStarted(true)
      setVerified(false)

      // execution="execute" prevents Turnstile from running
      // automatically when the component first appears.
      setTimeout(() => {
        turnstileRef.current?.execute()
      }, 0)
    }

    function handleSuccess(token: string) {
      setVerified(true)
      onSuccess(token)
    }

    function handleExpire() {
      setVerified(false)
      setStarted(false)

      onExpire?.()
    }

    function handleError() {
      setVerified(false)
      setStarted(false)

      onError?.()
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
            flex-col
            items-center
            justify-center
            gap-3
            overflow-visible
            rounded-sm
            border
            border-primary/30
            bg-background/60
            p-3
            transition-all
            shadow-[0_0_15px_rgba(168,85,247,0.12)]
          "
        >

          {!started && !verified && (
            <button
              type="button"
              onClick={startVerification}
              className="
                flex
                w-full
                items-center
                justify-center
                gap-3
                rounded-sm
                border
                border-primary/50
                bg-primary/10
                px-4
                py-3
                font-mono
                text-[11px]
                font-bold
                tracking-[0.16em]
                text-foreground
                transition-all
                hover:border-primary
                hover:bg-primary/20
                hover:shadow-[0_0_18px_rgba(168,85,247,0.25)]
              "
            >
              <span
                className="
                  flex
                  h-4
                  w-4
                  items-center
                  justify-center
                  border
                  border-primary
                "
              />

              VERIFY I'M HUMAN
            </button>
          )}

          {started && !verified && (
            <p
              className="
                text-center
                text-[10px]
                tracking-[0.15em]
                text-muted-foreground
              "
            >
              COMPLETE CLOUDFLARE VERIFICATION
            </p>
          )}

          {verified && (
            <div
              className="
                flex
                w-full
                items-center
                justify-center
                gap-2
                border
                border-emerald-500/40
                bg-emerald-500/10
                px-4
                py-3
                text-[10px]
                font-bold
                tracking-[0.15em]
                text-emerald-400
              "
            >
              ✓ SECURITY VERIFIED
            </div>
          )}

          <div
            className={
              started && !verified
                ? 'flex w-full items-center justify-center'
                : 'absolute h-0 w-0 overflow-hidden opacity-0 pointer-events-none'
            }
          >
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={handleSuccess}
              onExpire={handleExpire}
              onError={handleError}
              options={{
                theme: 'dark',
                size: 'normal',

                // Do NOT run automatically on page render.
                execution: 'execute',

                // Show Cloudflare UI once execution begins.
                appearance: 'execute',

                // Do not silently refresh an expired challenge.
                refreshExpired: 'manual',
              }}
              style={{
                width: '100%',
                minWidth: '300px',
                height: 'auto',
                overflow: 'visible',
              }}
            />
          </div>

        </div>
      </div>
    )
  }
)
