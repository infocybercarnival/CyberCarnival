'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const GatewayCanvas = dynamic(
  () => import('./three/gateway-canvas').then((m) => m.GatewayCanvas),
  { ssr: false },
)

export function Hero() {
  const contentRef = useRef<HTMLDivElement>(null)
  const [isGlitching, setIsGlitching] = useState(false)

  // Periodic randomized cybersecurity glitch burst (every ~2-4s for ~350ms)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const triggerGlitch = () => {
      setIsGlitching(true)
      setTimeout(() => {
        setIsGlitching(false)
      }, 350)

      const nextDelay = Math.floor(Math.random() * 2000) + 2000
      timeoutId = setTimeout(triggerGlitch, nextDelay)
    }

    timeoutId = setTimeout(triggerGlitch, 2000)
    return () => clearTimeout(timeoutId)
  }, [])

  // as the camera dollies through the gateway, the typography
  // transitions away — fading and lifting out of the frame
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = contentRef.current
        if (!el) return
        const p = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1)
        el.style.opacity = String(Math.max(1 - p * 1.6, 0))
        el.style.transform = `translateY(${-p * 70}px) scale(${1 - p * 0.06})`
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section
      id="home"
      className="relative flex h-svh min-h-[640px] w-full items-center justify-center overflow-hidden bg-background"
    >
      {/* BACKGROUND + MIDGROUND — the architectural gateway environment.
          It occupies the edges and recedes into depth; the center stays open. */}
      <GatewayCanvas
        className="absolute inset-0 z-0"
        dolly={1}
        cameraPosition={[0, 0.2, 9.5]}
        target={[0, 0.1, -6]}
        parallax={1}
      />

      {/* subtle vignette so the edges fall away and the center reads clean */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_55%_50%_at_50%_50%,transparent_45%,rgba(10,10,15,0.55)_100%)]"
      />

      {/* FOREGROUND — the typography. Always on top, always readable. */}
      <div
        ref={contentRef}
        className="pointer-events-none relative z-20 flex h-full w-full max-w-7xl flex-col justify-between px-4 sm:px-6 lg:px-10 pb-8 sm:pb-12 pt-24 sm:pt-28 will-change-transform"
      >
        {/* top label */}
        <div className="font-mono text-[11px] leading-relaxed tracking-[0.3em] text-muted-foreground">
          <p>SRM RAMAPURAM</p>
          <p>CYBERSECURITY SYMPOSIUM</p>
          <p className="text-primary font-bold">2026</p>
        </div>

        {/* Custom CYBER CARNIVAL 26 Brand Wordmark Lockup with Scoped Chakra Petch 700 Font & Subtle Glitch Burst */}
        <div className="flex flex-1 items-center justify-center">
          <h1 className={`text-center hero-carnival-title uppercase leading-[0.88] tracking-tight ${isGlitching ? 'is-glitching' : ''}`}>
            <span
              data-text="CYBER"
              className="cyber-glitch-wrapper block text-[clamp(2.4rem,10vw,9.5rem)] font-bold tracking-[0.08em] text-primary/95 drop-shadow-[0_0_35px_rgba(168,85,247,0.5)]"
            >
              CYBER
            </span>
            <span
              data-text="CARNIVAL 26"
              className="cyber-glitch-wrapper block text-[clamp(2.6rem,11vw,11.5rem)] font-bold tracking-[0.02em] text-foreground drop-shadow-[0_0_50px_rgba(168,85,247,0.35)]"
            >
              CARNIVAL 26
            </span>
          </h1>
        </div>

        {/* bottom row */}
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-sans text-lg sm:text-xl font-medium leading-tight tracking-tight text-foreground lg:text-2xl text-balance">
              WHERE CYBERSECURITY
              <br />
              MEETS INNOVATION
            </p>
            <p className="mt-3 sm:mt-4 font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.3em] text-muted-foreground">
              7 &amp; 8 OCTOBER &nbsp;|&nbsp; SRM RAMAPURAM
            </p>
          </div>

          <div className="pointer-events-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <a
              href="/events"
              className="inline-flex h-12 sm:h-auto items-center justify-center gap-3 bg-primary px-6 sm:px-8 py-3.5 sm:py-4 font-mono text-xs tracking-[0.2em] text-primary-foreground transition-transform hover:-translate-y-0.5 text-center font-bold"
            >
              REGISTER NOW
            </a>
            <a
              href="#events"
              className="inline-flex h-12 sm:h-auto items-center justify-center gap-3 border border-border px-6 sm:px-8 py-3.5 sm:py-4 font-mono text-xs tracking-[0.2em] text-foreground transition-colors hover:border-primary text-center"
            >
              EXPLORE EVENTS
            </a>
          </div>
        </div>
      </div>

      {/* scroll hint */}
      <div
        aria-hidden="true"
        className="absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 lg:block"
      >
        <div className="h-10 w-px animate-pulse bg-gradient-to-b from-primary to-transparent" />
      </div>
    </section>
  )
}
