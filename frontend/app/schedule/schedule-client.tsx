'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import { Navbar } from '@/components/navbar'
import { EVENTS, EVENT_DATES } from '@/lib/events-data'
import { fetchEvents, type ApiEvent } from '@/lib/api'

type CategoryFilter = 'ALL' | 'COMPETITIONS' | 'WORKSHOPS' | 'NON-TECHNICAL'
type DayFilter = 'ALL' | 'DAY 01' | 'DAY 02'

const VB_WIDTH = 900
const ROW_HEIGHT = 280
const LEFT_X = 260
const RIGHT_X = 640

function buildPath(count: number): string {
  if (count <= 0) return ''
  const points = Array.from({ length: count }, (_, i) => ({
    x: i % 2 === 0 ? LEFT_X : RIGHT_X,
    y: i * ROW_HEIGHT + ROW_HEIGHT / 2,
  }))
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const midY = (prev.y + curr.y) / 2
    d += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`
  }
  return d
}

function formatTeamSize(min: number | null, max: number | null): string | null {
  if (min && max && min === max) return `${min} MEMBER${min > 1 ? 'S' : ''}`
  if (min && max) return `${min}–${max} MEMBERS`
  if (min) return `${min}+ MEMBERS`
  if (max) return `UP TO ${max} MEMBERS`
  return null
}

function scrambleText(name: string): string {
  const glyphs = 'X0!#%&*░█'
  return name
    .split('')
    .map((ch, i) => {
      if (ch === ' ' || ch === '×') return ch
      return glyphs[(i * 3) % glyphs.length]
    })
    .join('')
}

export function ScheduleClient() {
  const headerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<SVGPathElement>(null)

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL')
  const [dayFilter, setDayFilter] = useState<DayFilter>('ALL')
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)
  const [glitchingId, setGlitchingId] = useState<string | null>(null)
  const [tooltipItem, setTooltipItem] = useState<{ id: string; name: string; date: string; time: string; venue: string } | null>(null)

  const [backendEvents, setBackendEvents] = useState<ApiEvent[]>([])
  const [backendError, setBackendError] = useState(false)

  useEffect(() => {
    fetchEvents()
      .then(setBackendEvents)
      .catch(() => setBackendError(true))
  }, [])

  const staticByName = useMemo(() => new Map(EVENTS.map((e) => [e.name, e])), [])

  // Derived list of all scheduled events
  const allEvents = useMemo(() => {
    if (backendError || backendEvents.length === 0) {
      return EVENTS.map((event, idx) => ({
        id: event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        no: String(idx + 1).padStart(2, '0'),
        name: event.name,
        tag: event.tag,
        category: event.tag === 'NON-TECHNICAL' ? 'NON-TECHNICAL' : event.tag === 'HANDS-ON' ? 'WORKSHOPS' : 'COMPETITIONS',
        poster: event.poster,
        date: event.details.date,
        time: event.details.time,
        venue: event.details.venue,
        teamSize: event.details.teamSize,
        fee: event.details.fee,
        registrationOpen: true,
      }))
    }

    return backendEvents.map((event, idx) => {
      const fallback = staticByName.get(event.name)
      const tag = event.tag || fallback?.tag || 'COMPETITION'
      const category =
        event.category === 'NON-TECHNICAL'
          ? 'NON-TECHNICAL'
          : tag.includes('HANDS-ON') || tag.includes('WORKSHOP') || event.name.includes('WORKSHOP')
          ? 'WORKSHOPS'
          : 'COMPETITIONS'

      return {
        id: event.id,
        no: String(idx + 1).padStart(2, '0'),
        name: event.name,
        tag,
        category,
        poster: event.poster_url || fallback?.poster || null,
        date: event.date || fallback?.details.date || '7 — 8 OCTOBER',
        time: event.time || fallback?.details.time || '10:00 AM',
        venue: event.venue || fallback?.details.venue || 'SRM RAMAPURAM',
        teamSize: formatTeamSize(event.min_team_size, event.max_team_size) || fallback?.details.teamSize || 'INDIVIDUAL',
        fee: event.fee || fallback?.details.fee || 'FREE',
        registrationOpen: event.registration_open,
      }
    })
  }, [backendError, backendEvents, staticByName])

  // Filtered events
  const filteredEvents = useMemo(() => {
    return allEvents.filter((event) => {
      const matchesCategory =
        categoryFilter === 'ALL' ||
        (categoryFilter === 'COMPETITIONS' && event.category === 'COMPETITIONS') ||
        (categoryFilter === 'WORKSHOPS' && event.category === 'WORKSHOPS') ||
        (categoryFilter === 'NON-TECHNICAL' && event.category === 'NON-TECHNICAL')

      const matchesDay =
        dayFilter === 'ALL' ||
        (dayFilter === 'DAY 01' && event.date.includes('7')) ||
        (dayFilter === 'DAY 02' && event.date.includes('8'))

      return matchesCategory && matchesDay
    })
  }, [allEvents, categoryFilter, dayFilter])

  // Next Event recommendation
  const nextEvent = useMemo(() => {
    return allEvents.find((e) => e.registrationOpen) || allEvents[0]
  }, [allEvents])

  // GSAP Header Entrance Animation
  useEffect(() => {
    if (!headerRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        headerRef.current!.querySelectorAll('.anim-header'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out' }
      )
    }, headerRef)
    return () => ctx.revert()
  }, [])

  // GSAP Scroll Reveal for timeline events
  useEffect(() => {
    if (!timelineRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0')
            entry.target.classList.remove('opacity-0', 'translate-y-8')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )

    const items = timelineRef.current.querySelectorAll('.timeline-card')
    items.forEach((item) => observer.observe(item))

    return () => observer.disconnect()
  }, [filteredEvents])

  // Glitch effect handler
  const handleTitleHover = (id: string) => {
    setGlitchingId(id)
    setTimeout(() => setGlitchingId(null), 350)
  }

  const count = filteredEvents.length
  const svgHeight = Math.max(count * ROW_HEIGHT, 400)
  const pathD = buildPath(count)

  return (
    <>
      <Navbar />
      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-40 pt-36 lg:px-10">
        {/* Header Section */}
        <div ref={headerRef} className="flex flex-col gap-3">
          <p className="anim-header font-mono text-[11px] tracking-[0.3em] text-primary">
            SCHEDULE
          </p>
          <h1 className="anim-header font-display text-[clamp(2.8rem,8vw,6rem)] font-bold leading-none tracking-tight text-foreground">
            THE TIMELINE
          </h1>
          <p className="anim-header max-w-md text-sm leading-relaxed text-muted-foreground">
            {EVENT_DATES} · SRM Ramapuram. Interactive event schedule and live mission timeline.
          </p>

          {/* Filters Bar: Category & Day Filter */}
          <div className="anim-header mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-border/60 py-4">
            {/* Category Filters */}
            <div className="flex flex-wrap gap-2">
              {(['ALL', 'COMPETITIONS', 'WORKSHOPS', 'NON-TECHNICAL'] as CategoryFilter[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`border px-4 py-2 font-mono text-[10px] tracking-[0.2em] transition-all rounded-sm ${
                    categoryFilter === c
                      ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_15px_rgba(168,85,247,0.35)] font-bold'
                      : 'border-border bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Day Selector */}
            <div className="flex items-center gap-2">
              {(['ALL', 'DAY 01', 'DAY 02'] as DayFilter[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDayFilter(d)}
                  className={`border px-3.5 py-1.5 font-mono text-[10px] tracking-[0.2em] transition-all rounded-sm ${
                    dayFilter === d
                      ? 'border-primary/80 bg-primary/20 text-primary font-bold shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                      : 'border-border/60 bg-card/20 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d === 'DAY 01' ? 'DAY 01 · 07 OCT' : d === 'DAY 02' ? 'DAY 02 · 08 OCT' : 'ALL DAYS'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* NEXT EVENT Spotlight Panel */}
        {nextEvent && (
          <div className="mt-8 border border-primary/40 bg-card/60 p-5 backdrop-blur-md rounded-[10px] shadow-[0_0_25px_rgba(168,85,247,0.12)] transition-all hover:border-primary/70">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <span className="font-mono text-[10px] tracking-[0.25em] text-primary font-bold">
                  NEXT EVENT SPOTLIGHT
                </span>
              </div>
              <span className="rounded-sm bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                {nextEvent.tag}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-sans text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {nextEvent.name}
                </h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground tracking-[0.1em]">
                  {nextEvent.date} · {nextEvent.time} · {nextEvent.venue}
                </p>
              </div>
              <Link
                href={`/event?eventId=${encodeURIComponent(nextEvent.id)}`}
                className="border border-primary bg-primary px-5 py-2.5 font-mono text-[11px] font-bold tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(168,85,247,0.35)] rounded-[3px]"
              >
                VIEW EVENT →
              </Link>
            </div>
          </div>
        )}

        {/* Curved Interactive Timeline Presentation */}
        <div ref={timelineRef} className="relative mt-20 min-h-[500px]">
          {/* Desktop Curved SVG Beam ($\ge 768\text{px}$) */}
          <div className="hidden md:block" style={{ height: `${(svgHeight / VB_WIDTH) * 100}vw`, maxHeight: svgHeight }}>
            <svg
              viewBox={`0 0 ${VB_WIDTH} ${svgHeight}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth="14" opacity="0.25" style={{ filter: 'blur(6px)' }} />
              <path
                ref={pathRef}
                d={pathD}
                fill="none"
                stroke="url(#timelineGradient)"
                strokeWidth="4"
                className="timeline-energy-pulse"
                style={{ filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.85)) drop-shadow(0 0 3px rgba(255,255,255,0.9))' }}
              />
            </svg>

            {filteredEvents.map((event, i) => {
              const onLeft = i % 2 === 0
              const nodeXPct = (onLeft ? LEFT_X : RIGHT_X) / VB_WIDTH * 100
              const topPct = ((i * ROW_HEIGHT + ROW_HEIGHT / 2) / svgHeight) * 100
              const isHovered = hoveredEventId === event.id
              const isGlitching = glitchingId === event.id

              return (
                <div
                  key={event.id}
                  onMouseEnter={() => setHoveredEventId(event.id)}
                  onMouseLeave={() => setHoveredEventId(null)}
                  className={`timeline-card absolute -translate-x-1/2 -translate-y-1/2 opacity-0 translate-y-8 transition-all duration-700 ${
                    hoveredEventId && !isHovered ? 'opacity-40 scale-95' : 'opacity-100 scale-100'
                  }`}
                  style={{ left: `${nodeXPct}%`, top: `${topPct}%` }}
                >
                  {/* Interactive Pulsing Node */}
                  <span
                    onMouseEnter={() =>
                      setTooltipItem({
                        id: event.id,
                        name: event.name,
                        date: event.date,
                        time: event.time,
                        venue: event.venue,
                      })
                    }
                    onMouseLeave={() => setTooltipItem(null)}
                    aria-hidden="true"
                    className="group relative left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    <span className="timeline-node-pulse absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30" />
                    <span
                      className={`relative block h-6 w-6 rounded-full transition-transform duration-300 ${
                        isHovered ? 'scale-125 bg-primary shadow-[0_0_30px_#a855f7]' : 'bg-white'
                      }`}
                      style={{ boxShadow: '0 0 24px 6px rgba(168,85,247,0.9), 0 0 8px 2px rgba(255,255,255,1)' }}
                    />
                  </span>

                  {/* Node Tooltip Card */}
                  {tooltipItem?.id === event.id && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 z-30 w-48 border border-primary/50 bg-background/95 p-3 text-center font-mono text-[10px] shadow-2xl backdrop-blur-md rounded-sm">
                      <span className="font-bold text-foreground block">{event.name}</span>
                      <span className="text-primary block mt-1">{event.date} · {event.time}</span>
                      <span className="text-muted-foreground block">{event.venue}</span>
                    </div>
                  )}

                  {/* Event Dossier Card */}
                  <div
                    className={`absolute top-1/2 flex w-72 -translate-y-1/2 items-center gap-4 sm:w-96 ${
                      onLeft ? 'left-12 flex-row text-left' : 'right-12 flex-row-reverse text-right'
                    }`}
                  >
                    <Link href={`/event?eventId=${encodeURIComponent(event.id)}`}>
                      {event.poster ? (
                        <div
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const x = e.clientX - rect.left - rect.width / 2
                            const y = e.clientY - rect.top - rect.height / 2
                            e.currentTarget.style.transform = `perspective(800px) rotateX(${(-y / rect.height) * 4}deg) rotateY(${(x / rect.width) * 4}deg) scale(1.02)`
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)'
                          }}
                          className="relative h-[122px] w-[90px] flex-shrink-0 overflow-hidden rounded border border-primary/40 shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-transform duration-300 ease-out"
                        >
                          <Image
                            src={event.poster}
                            alt={`${event.name} poster`}
                            fill
                            className="object-cover"
                            sizes="90px"
                          />
                        </div>
                      ) : (
                        <div className="flex h-[122px] w-[90px] flex-shrink-0 items-center justify-center rounded border border-dashed border-border bg-card/40 font-mono text-[9px] text-muted-foreground p-2 text-center">
                          POSTER TBA
                        </div>
                      )}
                    </Link>

                    <div className="min-w-0">
                      <span className="inline-block border border-primary/40 px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] text-primary rounded-sm">
                        {event.tag}
                      </span>

                      <Link href={`/event?eventId=${encodeURIComponent(event.id)}`}>
                        <h2
                          onMouseEnter={() => handleTitleHover(event.id)}
                          className="mt-2 font-sans text-2xl font-bold leading-[1.05] tracking-tight text-foreground transition-colors hover:text-primary sm:text-3xl"
                        >
                          {isGlitching ? scrambleText(event.name) : event.name}
                        </h2>
                      </Link>

                      <p className="mt-2 font-mono text-[11px] tracking-[0.1em] text-muted-foreground">
                        {event.time} · {event.venue}
                      </p>
                      <p className="font-mono text-[11px] tracking-[0.1em] text-primary">
                        {event.fee} · {event.teamSize}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile Straight Vertical Timeline (<768px) */}
          <div className="block md:hidden space-y-8 pl-6 border-l border-primary/40">
            {filteredEvents.map((event) => (
              <div key={event.id} className="relative pl-4">
                <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background" />
                <span className="inline-block border border-primary/40 px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] text-primary rounded-sm">
                  {event.tag}
                </span>
                <Link href={`/event?eventId=${encodeURIComponent(event.id)}`}>
                  <h3 className="mt-1 font-sans text-xl font-bold text-foreground hover:text-primary">
                    {event.name}
                  </h3>
                </Link>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {event.date} · {event.time} · {event.venue}
                </p>
                <p className="font-mono text-xs text-primary font-semibold">
                  {event.fee} · {event.teamSize}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Final Ending Section */}
        <div className="mt-32 border-t border-border/60 pt-16 text-center">
          <p className="font-mono text-xs tracking-[0.3em] text-primary">MISSION BRIEFING COMPLETE</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            THE CARNIVAL AWAITS
          </h2>
          <p className="mt-3 max-w-md mx-auto text-sm text-muted-foreground">
            Explore all competitions, workshops, and experiences at CyberCarnival.
          </p>
          <Link
            href="/events"
            className="mt-8 inline-flex items-center gap-2 border border-primary bg-primary px-8 py-4 font-mono text-xs font-bold tracking-[0.25em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] rounded-[3px]"
          >
            <span>VIEW ALL EVENTS</span>
            <span>→</span>
          </Link>
        </div>
      </main>

      <style>{`
        @keyframes timeline-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.55; }
          50%      { transform: translate(-50%, -50%) scale(1.4); opacity: 0; }
        }
        .timeline-node-pulse { animation: timeline-pulse 2.4s ease-out infinite; }

        @keyframes energy-flow {
          0% { stroke-dashoffset: 1000; }
          100% { stroke-dashoffset: 0; }
        }
        .timeline-energy-pulse {
          stroke-dasharray: 40 200;
          animation: energy-flow 6s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .timeline-node-pulse, .timeline-energy-pulse { animation: none; }
        }
      `}</style>
    </>
  )
}
