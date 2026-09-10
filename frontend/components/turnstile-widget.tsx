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

    const [executing, setExecuting] =
      useState(false)

    const siteKey =
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''


    useImperativeHandle(ref, () => ({
      reset: () => {
        setExecuting(false)
        turnstileRef.current?.reset()
      },

      execute: () => {
        setExecuting(true)

        // Allow the visible container to render first
        requestAnimationFrame(() => {
          turnstileRef.current?.execute()
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
              min-h-[60px]
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
      <div
        className={
          executing
            ? 'w-full font-mono text-xs'
            : 'h-0 w-full overflow-hidden'
        }
      >

        <div
          className={
            executing
              ? `
                  flex
                  w-full
                  items-center
                  justify-center
                  overflow-visible
                  rounded-sm
                  border
                  border-primary/30
                  bg-background/60
                  p-3
                  shadow-[0_0_15px_rgba(168,85,247,0.12)]
                `
              : 'h-0 overflow-hidden'
          }
        >

          <Turnstile
            ref={turnstileRef}

            siteKey={siteKey}

            onSuccess={(token) => {
              setExecuting(false)
              onSuccess(token)
            }}

            onExpire={() => {
              setExecuting(false)
              onExpire?.()
            }}

            onError={() => {
              setExecuting(false)
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

      </div>
    )
  }
)


TurnstileWidget.displayName =
  'TurnstileWidget'
