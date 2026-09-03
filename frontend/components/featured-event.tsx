'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Reveal } from './reveal'
import { PosterFrame } from './poster-frame'
import { EVENTS } from '@/lib/events-data'
import { fetchEvents } from '@/lib/api'

const DEFAULT_CTF_ID = 'fb2393db-06d8-402b-8b33-c527edf1e88e'

const ctfEvent = EVENTS.find((e) => e.no === '01') || EVENTS[0]

const DETAILS = [
  { label: 'DATE', value: ctfEvent.details.date || '7 — 8 OCTOBER' },
  { label: 'DURATION', value: ctfEvent.duration || '6 HOURS' },
  { label: 'VENUE', value: ctfEvent.details.venue || 'SRM RAMAPURAM' },
  { label: 'TEAM SIZE', value: ctfEvent.details.teamSize || 'MAX 2 MEMBERS' },
]

export function FeaturedEvent() {
  const [ctfId, setCtfId] = useState<string>(DEFAULT_CTF_ID)

  useEffect(() => {
    fetchEvents()
      .then((events) => {
        const ctf = events.find(
          (e) =>
            e.name.toUpperCase() === 'CAPTURE THE FLAG' ||
            e.name.toUpperCase().includes('CTF')
        )
        if (ctf?.id) {
          setCtfId(ctf.id)
        }
      })
      .catch(() => {
        setCtfId('capture-the-flag')
      })
  }, [])

  const ctfRegistrationHref = `/event?eventId=${encodeURIComponent(ctfId)}&autoRegister=true`

  return (
    <section
      id="featured"
      className="relative z-20 overflow-hidden border-y border-border py-28 lg:py-40"
    >
      {/* Soft atmospheric purple ambient glow — clean & dark background behind hero poster */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/2 h-[60vmin] w-[60vmin] -translate-y-1/2 rounded-full bg-primary/10 blur-[150px]"
      />

      <div className="relative z-20 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left Column (5 cols, ~42% width): Unchanged Editorial Heading, Info Details & Action */}
          <div className="lg:col-span-5 flex flex-col items-start max-w-xl relative z-20">
            <Reveal>
              <p className="font-mono text-xs tracking-[0.3em] text-primary font-bold">
                03 / FEATURED EVENT
              </p>
            </Reveal>

            <Reveal delay={100}>
              <h2 className="mt-6 font-display text-[clamp(3.2rem,5vw,6rem)] font-extrabold leading-[0.92] tracking-tight text-foreground text-balance">
                CAPTURE
                <br />
                THE FLAG
              </h2>
            </Reveal>

            <Reveal delay={200}>
              <dl className="mt-10 grid w-full grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {DETAILS.map((d) => (
                  <div key={d.label}>
                    <dt className="font-mono text-xs tracking-[0.25em] text-muted-foreground font-medium">
                      {d.label}
                    </dt>
                    <dd className="mt-2 font-sans text-base font-semibold leading-relaxed text-foreground">
                      {d.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal delay={300} className="w-full">
              <Link
                href={ctfRegistrationHref}
                className="mt-8 sm:mt-10 inline-flex h-[56px] sm:h-[62px] w-full sm:w-auto sm:min-w-[310px] items-center justify-center gap-3 border border-primary bg-primary/10 px-6 sm:px-9 font-mono text-xs tracking-[0.2em] sm:tracking-[0.25em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] font-bold"
              >
                ENTER THE CHALLENGE <span aria-hidden="true">→</span>
              </Link>
            </Reveal>
          </div>

          {/* Right Column (7 cols, ~58% width): Dominant Hero CTF Poster Showcase using PosterFrame */}
          <div className="lg:col-span-7 flex justify-center lg:justify-end w-full relative z-20">
            <Reveal delay={250} className="w-full max-w-[850px]">
              <Link href={ctfRegistrationHref} className="block w-full">
                <PosterFrame
                  src={ctfEvent.poster || '/assets/posters/0f2f13717f064841b9ea6c0cea057590.jpg'}
                  alt={ctfEvent.posterAlt || 'Capture The Flag official event poster'}
                  width={900}
                  height={1200}
                  dossierTitle="CAPTURE THE FLAG 2026"
                  priority
                />
              </Link>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
