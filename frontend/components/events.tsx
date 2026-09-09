'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Reveal } from './reveal'
import { EVENTS } from '@/lib/events-data'

export function Events() {
  const [active, setActive] = useState<number | null>(null)

  return (
    <section id="events" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-32 lg:px-10">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary">
          02 / EVENTS
        </p>
        <h2 className="mt-8 font-display text-[clamp(2.5rem,6vw,5rem)] font-bold leading-none tracking-tight text-foreground">
          THE ARENAS
        </h2>
      </Reveal>

      <ul className="mt-20 border-t border-border">
        {EVENTS.slice(0, 7).map((event, i) => {
          const isActive = active === i
          return (
            <Reveal key={event.no} as="div" delay={i * 60}>
              <li
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group relative overflow-hidden border-b border-border"
              >
                {/* poster shown behind the row, revealed on hover — falls back to a
                    placeholder when no official poster has been uploaded yet */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 -z-20 transition-opacity duration-500 ${
                    isActive ? 'opacity-70' : 'opacity-0'
                  }`}
                >
                  <Image
                    src={event.poster || '/placeholder.jpg'}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="100vw"
                  />
                  <div className="absolute inset-0 bg-background/15" />
                </div>

                <a
                  href="/events"
                  className="flex flex-col sm:grid sm:grid-cols-[auto_1fr_auto] items-start sm:items-baseline gap-2 sm:gap-x-6 py-6 sm:py-8 lg:grid-cols-[6rem_1fr_16rem_auto] lg:gap-x-10 lg:py-10"
                >
                  <span
                    className={`font-mono text-sm transition-colors duration-300 ${
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {event.no}
                  </span>

                  <span
                    className={`font-display text-[clamp(1.5rem,4vw,3.25rem)] font-bold leading-none tracking-tight transition-all duration-500 ${
                      isActive ? 'translate-x-3 text-foreground' : 'text-foreground/70'
                    }`}
                  >
                    {event.name}
                  </span>

                  <span className="hidden font-mono text-[11px] tracking-[0.25em] text-muted-foreground lg:block">
                    {event.tag}
                  </span>

                  <span
                    aria-hidden="true"
                    className={`font-sans text-2xl transition-all duration-300 ${
                      isActive ? 'translate-x-1 text-primary opacity-100' : 'opacity-30'
                    }`}
                  >
                    →
                  </span>
                </a>

                {/* expanding detail */}
                <div
                  className={`grid overflow-hidden transition-all duration-500 ease-out ${
                    isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="min-h-0">
                    <p className="max-w-2xl pb-8 pl-0 text-base leading-relaxed text-muted-foreground lg:pl-[10rem]">
                      {event.desc}
                    </p>
                  </div>
                </div>

                {/* purple illumination on hover */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0 left-0 w-px bg-primary transition-all duration-500 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-primary/8 to-transparent transition-opacity duration-500 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </li>
            </Reveal>
          )
        })}
      </ul>
    </section>
  )
}
