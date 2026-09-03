'use client'

import dynamic from 'next/dynamic'
import { Reveal } from './reveal'

const GatewayCanvas = dynamic(
  () => import('./three/gateway-canvas').then((m) => m.GatewayCanvas),
  { ssr: false },
)

export function FinalCta() {
  return (
    <section
      id="register"
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background py-32"
    >
      {/* the gateway returns — the user stands before the entrance again */}
      <GatewayCanvas
        className="absolute inset-0 opacity-60"
        dolly={0}
        cameraPosition={[0, 0.4, 7.5]}
        target={[0, 0.1, -6]}
        parallax={0.5}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_50%,transparent_40%,rgba(10,10,15,0.6)_100%)]"
      />

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <Reveal>
          <h2 className="font-display text-[clamp(4rem,15vw,14rem)] font-bold leading-[0.85] tracking-tight text-foreground">
            READY
            <br />
            TO ENTER?
          </h2>
        </Reveal>

        <Reveal delay={150}>
          <p className="mt-10 font-mono text-xs tracking-[0.35em] text-muted-foreground">
            CYBERCARNIVAL 2026
          </p>
        </Reveal>

        <Reveal delay={250}>
          <a
            href="/register"
            className="mt-8 sm:mt-12 inline-flex items-center gap-3 bg-primary px-8 sm:px-12 py-4 sm:py-6 font-mono text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.25em] text-primary-foreground transition-transform hover:-translate-y-1 font-bold"
          >
            REGISTER NOW <span aria-hidden="true">→</span>
          </a>
        </Reveal>
      </div>

      {/* footer strip */}
      <footer className="absolute bottom-0 z-10 w-full border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 font-mono text-[10px] tracking-[0.25em] text-muted-foreground lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <p>CYBERCARNIVAL 2026 — SRM RAMAPURAM</p>
          <p>WHERE CYBERSECURITY MEETS INNOVATION</p>
          <p>7 &amp; 8 OCTOBER</p>
        </div>
      </footer>
    </section>
  )
}
