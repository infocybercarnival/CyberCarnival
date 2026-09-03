'use client'

import { Reveal } from './reveal'
import { PosterFrame } from './poster-frame'

export function Intro() {
  return (
    <section id="about" className="relative z-20 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-32 lg:px-10 lg:py-48">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary font-bold">
          01 / INTRODUCTION
        </p>
      </Reveal>

      <Reveal delay={100}>
        <h2 className="mt-8 font-display text-[clamp(2.75rem,8vw,7rem)] font-bold leading-[0.95] tracking-tight text-foreground text-balance">
          EVERY SYSTEM
          <br />
          HAS AN ENTRY POINT.
        </h2>
      </Reveal>

      <div className="mt-16 grid gap-10 lg:grid-cols-12 items-center lg:gap-12">
        {/* Left Column (6 cols, ~50% width): Enlarged Second Poster Showcase (30% display size increase) */}
        <Reveal delay={150} className="lg:col-span-6 lg:col-start-1 w-full max-w-[720px]">
          <PosterFrame
            src="/assets/branding/cybercarnival-poster.png"
            alt="CyberCarnival 2026 official event poster"
            width={954}
            height={536}
            dossierTitle="CYBERCARNIVAL 2026"
            priority
          />
        </Reveal>

        {/* Right Column (6 cols): Unchanged Editorial Copy */}
        <Reveal delay={200} className="lg:col-span-6 lg:col-start-7">
          <div className="group cursor-default border-l-2 border-transparent pl-0 transition-all duration-500 hover:border-primary hover:pl-6 max-w-xl">
            <p className="text-lg leading-relaxed text-muted-foreground transition-colors duration-500 text-pretty group-hover:text-foreground">
              CyberCarnival is SRM Ramapuram&apos;s flagship cybersecurity
              symposium — a full day where students, researchers, and industry
              operators break systems, defend them, and rebuild them better. From
              live capture-the-flag arenas to red team exercises and hands-on
              workshops, this is where offensive curiosity meets defensive
              discipline.
            </p>
            <p className="mt-6 font-mono text-[11px] tracking-[0.25em] text-muted-foreground transition-colors duration-500 group-hover:text-primary">
              ONE DAY. SEVEN ARENAS. ZERO SANDBOXES.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
