'use client'

import { useRef, useImperativeHandle, forwardRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

export interface TurnstileWidgetRef {
  reset: () => void
}

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  function TurnstileWidget({ onSuccess, onExpire, onError }, ref) {
    const turnstileRef = useRef<TurnstileInstance>(null)
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

    useImperativeHandle(ref, () => ({
      reset: () => {
        turnstileRef.current?.reset()
      },
    }))

    return (
      <div className="w-full font-mono text-xs">
        <label className="block tracking-[0.2em] text-primary uppercase text-[10px] mb-1.5 font-bold">
          SECURITY VERIFICATION
        </label>
        <div className="flex w-full max-w-full items-center justify-center overflow-hidden rounded-sm bg-background/60 border border-primary/30 hover:border-primary/60 p-1.5 transition-all shadow-[0_0_15px_rgba(168,85,247,0.12)]">
          <div className="flex items-center justify-center max-w-full overflow-hidden scale-[0.92] min-[380px]:scale-100 origin-center transition-transform">
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={onSuccess}
              onExpire={onExpire}
              onError={onError}
              options={{
                theme: 'dark',
                size: 'normal',
              }}
            />
          </div>
        </div>
      </div>
    )
  }
)
