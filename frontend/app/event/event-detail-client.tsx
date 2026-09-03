'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import gsap from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'
import { Navbar } from '@/components/navbar'
import { RegistrationModal } from '@/components/registration-modal'
import { EVENTS } from '@/lib/events-data'
import { fetchEvent, fetchEvents, fetchMe, type ApiEvent } from '@/lib/api'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(TextPlugin)
}

function formatTeamSize(min: number | null, max: number | null): string | null {
  if (min && max && min === max) return `${min} MEMBER${min > 1 ? 'S' : ''}`
  if (min && max) return `${min}–${max} MEMBERS`
  if (min) return `${min}+ MEMBERS`
  if (max) return `UP TO ${max} MEMBERS`
  return null
}

interface EventDetailClientProps {
  eventId: string
}

export function EventDetailClient({ eventId }: EventDetailClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // =========================================================================
  // 1. ALL REACT HOOKS DECLARED UNCONDITIONALLY AT TOP LEVEL
  // =========================================================================
  const titleRef = useRef<HTMLHeadingElement>(null)
  const posterRef = useRef<HTMLDivElement>(null)
  const scanLineRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [event, setEvent] = useState<ApiEvent | null>(null)
  const [, setBackendEvents] = useState<ApiEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [, setNotFound] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [openAccordion, setOpenAccordion] = useState<number | null>(0)
  const [showAllRules, setShowAllRules] = useState(false)

  const [countdown, setCountdown] = useState<{
    days: string
    hours: string
    mins: string
    secs: string
    live: boolean
  } | null>(null)

  // Find static fallback by matching ID or name if API is down
  const staticFallback = EVENTS.find(
    (e) =>
      e.name.toLowerCase() === eventId.toLowerCase() ||
      e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === eventId.toLowerCase() ||
      (eventId.toLowerCase().includes('conclave') && e.name.toLowerCase().includes('conclave'))
  )

  // Fetch event data & backend events list
  useEffect(() => {
    setLoading(true)
    setNotFound(false)

    fetchEvent(eventId)
      .then((data) => {
        setEvent(data)
        setLoading(false)
      })
      .catch((err) => {
        if (err?.status === 404) {
          if (staticFallback) {
            setNotFound(false)
          } else {
            setNotFound(true)
          }
        }
        setLoading(false)
      })

    fetchEvents()
      .then(setBackendEvents)
      .catch(() => {})
  }, [eventId, staticFallback])

  // Auto-register query param handler
  useEffect(() => {
    if (searchParams.get('autoRegister') === 'true' && event) {
      setShowModal(true)
    }
  }, [searchParams, event])

  // Derived event fields
  const matchingStatic = EVENTS.find(
    (e) => event && e.name.toUpperCase() === event.name.toUpperCase()
  ) || staticFallback

  const eventName = event?.name || matchingStatic?.name || ''

  // GSAP Title Decode animation hook
  useEffect(() => {
    if (!eventName || !titleRef.current || loading) return

    const element = titleRef.current
    const ctx = gsap.context(() => {
      gsap.set(element, { text: '▓▒░█▓▒░█▓▒░█▓▒░' })
      gsap.to(element, {
        text: { value: eventName, chars: 'XO!#' },
        duration: 1.1,
        ease: 'none',
      })
    }, element)

    return () => ctx.revert()
  }, [eventName, loading])

  // GSAP Poster Materialize & Scan Line Animation Hook
  useEffect(() => {
    if (!posterRef.current || loading) return

    const poster = posterRef.current
    const scanLine = scanLineRef.current

    const ctx = gsap.context(() => {
      // Entrance Materialize
      gsap.fromTo(
        poster,
        { opacity: 0, scale: 1.02, filter: 'blur(8px)' },
        { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.9, ease: 'power2.out' }
      )

      // Cyber Scan Line
      if (scanLine) {
        gsap.fromTo(
          scanLine,
          { top: '0%', opacity: 1 },
          { top: '100%', opacity: 0, duration: 1.4, ease: 'power1.inOut', delay: 0.3 }
        )
      }
    })

    return () => ctx.revert()
  }, [loading])

  // Countdown timer hook
  useEffect(() => {
    const targetDate = new Date('2026-10-07T09:00:00+05:30').getTime()

    const updateTimer = () => {
      const now = new Date().getTime()
      const diff = targetDate - now

      if (diff <= 0) {
        setCountdown({ days: '00', hours: '00', mins: '00', secs: '00', live: true })
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24)).toString().padStart(2, '0')
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, '0')
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0')
      const secs = Math.floor((diff % (1000 * 60)) / 1000).toString().padStart(2, '0')

      setCountdown({ days, hours, mins, secs, live: false })
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [])

  // Section Scroll Reveal Observer hook
  useEffect(() => {
    if (loading || !containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0')
            entry.target.classList.remove('opacity-0', 'translate-y-6')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 }
    )

    const revealElements = containerRef.current.querySelectorAll('.reveal-on-scroll')
    revealElements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [loading])

  // Remaining derived fields
  const posterSrc = event?.poster_url || matchingStatic?.poster || null
  const extraPosterSrc = matchingStatic?.extraPoster || null
  const tag = event?.tag || matchingStatic?.tag || 'COMPETITION'
  const category = event?.category || (matchingStatic?.tag === 'NON-TECHNICAL' ? 'NON-TECHNICAL' : 'TECHNICAL')
  const description = event?.description || matchingStatic?.desc || 'Event description coming soon.'
  const venue = event?.venue || matchingStatic?.details.venue || 'SRM RAMAPURAM'
  const date = event?.date || matchingStatic?.details.date || '7 — 8 OCTOBER 2026'
  const time = event?.time || matchingStatic?.details.time || '09:00 AM ONWARDS'
  const fee = event?.fee || matchingStatic?.details.fee || 'FREE'
  const prize = event?.prize || matchingStatic?.details.prize || 'TBA'
  const teamSize = formatTeamSize(event?.min_team_size ?? null, event?.max_team_size ?? null) || matchingStatic?.details.teamSize || 'INDIVIDUAL / TEAM'
  const isOpen = event ? event.registration_open : true

  const duration = matchingStatic?.duration
  const rounds = matchingStatic?.rounds
  const expectedRegistrations = matchingStatic?.expectedRegistrations
  const facultyCoordinators = matchingStatic?.facultyCoordinators
  const studentCoordinators = matchingStatic?.studentCoordinators
  const customRules = matchingStatic?.rules
  const prerequisites = matchingStatic?.prerequisites
  const prizesList = matchingStatic?.prizesList
  const evaluationCriteria = matchingStatic?.evaluationCriteria
  const eventRounds = matchingStatic?.eventRounds
  const toolsRequired = matchingStatic?.toolsRequired
  const additionalInfo = matchingStatic?.additionalInfo

  const seatsLabel =
    !event || event.max_teams == null
      ? 'UNLIMITED'
      : `${event.seats_available ?? 0} / ${event.max_teams} LEFT`

  const handleRegisterClick = async () => {
    try {
      const user = await fetchMe()
      if (!user) {
        router.push(`/register?redirect=${encodeURIComponent(`/event?eventId=${eventId}&autoRegister=true`)}`)
        return
      }
      setShowModal(true)
    } catch {
      router.push(`/register?redirect=${encodeURIComponent(`/event?eventId=${eventId}&autoRegister=true`)}`)
    }
  }

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // =========================================================================
  // 2. EARLY CONDITIONAL RETURNS (DECLARED STRICTLY AFTER ALL HOOKS)
  // =========================================================================
  if (loading) {
    return (
      <>
        <Navbar />
        <main className="mx-auto flex min-h-[70vh] max-w-[1300px] flex-col items-center justify-center px-6 pt-36">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-8 w-8 animate-spin border-2 border-primary border-t-transparent" />
            <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground">
              INITIALIZING CYBER DOSSIER...
            </p>
          </div>
        </main>
      </>
    )
  }

  // How It Works Steps
  const howItWorksSteps = [
    { num: '01', title: 'REGISTER', desc: 'Secure your spot for the event.' },
    { num: '02', title: 'PARTICIPATE', desc: 'Report to venue or portal at scheduled time.' },
    { num: '03', title: 'COMPETE', desc: 'Demonstrate your skills during event rounds.' },
    { num: '04', title: 'WIN', desc: 'Claim recognition, certificates & prize pool.' },
  ]

  // Accordion Sections (Fallback)
  const rulesSections = [
    {
      title: 'ELIGIBILITY & REGISTRATION',
      content: 'Open to registered college students with valid student ID cards. Team members must meet size criteria. Registrations close prior to event commencement or upon seat exhaustion.',
    },
    {
      title: 'JUDGING CRITERIA',
      content: 'Evaluated based on innovation, technical execution, clarity, adherence to event rules, and final presentation performance by designated faculty and industry judges.',
    },
    {
      title: 'EVENT CODE OF CONDUCT',
      content: 'Participants must maintain professional decorum, respect fellow competitors, and follow event coordinator instructions. Misconduct or plagiarism results in immediate disqualification.',
    },
    {
      title: 'TERMS & CONDITIONS',
      content: 'CyberCarnival organizers reserve rights to alter schedules, rules, or prizes if required. Decision of judges and core committee remains final.',
    },
  ]

  // =========================================================================
  // 3. MAIN COMPONENT JSX (BALANCED TWO-COLUMN DESKTOP LAYOUT)
  // =========================================================================
  return (
    <>
      <Navbar />
      <main ref={containerRef} className="relative z-20 mx-auto max-w-[1340px] px-6 lg:px-10 pb-32 pt-32">
        {/* Top Header Bar & Breadcrumb Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
          <Link
            href="/events"
            className="group flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="transition-transform group-hover:-translate-x-1">←</span>
            <span>BACK TO ALL EVENTS</span>
          </Link>

          {/* Share Event & Copy Link Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-2 rounded-[3px] border border-primary/40 bg-card/80 px-4 py-2 font-mono text-[10px] tracking-[0.2em] text-primary transition-all hover:border-primary hover:bg-primary/10"
            >
              <span>{copied ? 'LINK COPIED ✓' : 'SHARE DOSSIER'}</span>
              <span className="text-[12px]">⎘</span>
            </button>
          </div>
        </div>

        {/* Category & Status Indicator Bar */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-primary">
            <span className="rounded-sm bg-primary/10 px-2.5 py-1 font-semibold">{category}</span>
            <span>/</span>
            <span className="text-foreground/70">{tag}</span>
          </div>

          {/* Dynamic Status Badge */}
          <div>
            {isOpen ? (
              <span className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-1 font-mono text-[10px] font-semibold text-emerald-400 shadow-[0_0_12px_rgba(10,185,129,0.2)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                ● REGISTRATION OPEN
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-950/40 px-3.5 py-1 font-mono text-[10px] font-semibold text-rose-400">
                ● REGISTRATION CLOSED
              </span>
            )}
          </div>
        </div>

        {/* Title with GSAP TextPlugin Decode Effect */}
        <h1
          ref={titleRef}
          className="mt-3 min-h-[1.2em] font-sans text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
        >
          {eventName}
        </h1>

        {/* Main 2-Column Dossier Content Grid (Balanced Desktop Columns & Responsive Mobile Ordering) */}
        <div className="mt-10 flex flex-col lg:grid lg:grid-cols-12 items-start gap-8 lg:gap-12">
          {/* LEFT COLUMN (Desktop: 6 cols / Mobile: Stacked with flex orders) */}
          <div className="lg:col-span-6 flex flex-col gap-6 md:gap-8 w-full relative z-20">
            {/* 1. Framed Cyberpunk Poster Container (Mobile Order: 1) */}
            <div
              ref={posterRef}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left - rect.width / 2
                const y = e.clientY - rect.top - rect.height / 2
                const rotX = (-y / rect.height) * 2.5
                const rotY = (x / rect.width) * 2.5
                e.currentTarget.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.01)`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)'
              }}
              className="group relative z-20 h-auto w-full rounded-[14px] border border-[rgba(168,85,247,0.5)] bg-[linear-gradient(155deg,rgba(20,10,35,0.96),rgba(7,3,14,0.98))] p-4 sm:p-5 lg:p-6 backdrop-blur-md shadow-[0_0_35px_rgba(155,77,255,0.22)] transition-all duration-300 ease-out hover:border-primary hover:shadow-[0_0_45px_rgba(168,85,247,0.4)] order-1 lg:order-none"
            >
              {/* Scan Line Overlay */}
              <div
                ref={scanLineRef}
                className="pointer-events-none absolute left-0 right-0 z-20 h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_15px_#a855f7]"
              />

              {/* Natural Aspect Ratio Uncropped Poster Stage (QR Code 100% Visible & Readable) */}
              <div className="relative w-full h-auto overflow-hidden rounded-[8px] bg-[rgba(10,5,22,0.95)] border border-[rgba(160,80,255,0.25)]">
                {posterSrc ? (
                  <Image
                    src={posterSrc}
                    alt={matchingStatic?.posterAlt || `${eventName} official poster`}
                    width={750}
                    height={1000}
                    className="block h-auto w-full object-contain rounded-[7px] transition-transform duration-500 group-hover:scale-[1.015]"
                    priority
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 p-6 text-center font-mono text-[11px] tracking-[0.2em] text-muted-foreground bg-[radial-gradient(ellipse_at_center,rgba(155,77,255,0.15),rgba(5,0,8,0.95))]">
                    <span className="text-2xl text-primary animate-pulse">◈</span>
                    <span className="font-bold text-foreground">CYBERCARNIVAL POSTER</span>
                    <span>TRANSMISSION PENDING</span>
                  </div>
                )}
              </div>
            </div>

            {/* Extra Poster (If Workshop / Dual Poster exists) (Mobile Order: 2) */}
            {extraPosterSrc && (
              <div className="group relative z-20 h-auto w-full rounded-[14px] border border-[rgba(168,85,247,0.4)] bg-[linear-gradient(155deg,rgba(20,10,35,0.96),rgba(7,3,14,0.98))] p-4 sm:p-5 lg:p-6 backdrop-blur-md shadow-xl order-2 lg:order-none">
                <div className="relative w-full h-auto overflow-hidden rounded-[8px] bg-[rgba(10,5,22,0.95)] border border-[rgba(160,80,255,0.25)]">
                  <Image
                    src={extraPosterSrc}
                    alt={matchingStatic?.extraPosterAlt || `${eventName} secondary poster`}
                    width={750}
                    height={1000}
                    className="block h-auto w-full object-contain rounded-[7px]"
                  />
                </div>
              </div>
            )}

            {/* 2. Countdown Timer Widget (Mobile Order: 5) */}
            {countdown && (
              <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-primary/40 bg-card/80 p-5 backdrop-blur-md rounded-[10px] order-5 lg:order-none">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.25em] text-primary">
                    EVENT STARTS IN
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center font-mono">
                  <div className="border border-border bg-background/50 p-2 rounded-sm">
                    <span className="text-xl font-bold text-foreground">{countdown.days}</span>
                    <span className="block text-[9px] text-muted-foreground">DAYS</span>
                  </div>
                  <div className="border border-border bg-background/50 p-2 rounded-sm">
                    <span className="text-xl font-bold text-foreground">{countdown.hours}</span>
                    <span className="block text-[9px] text-muted-foreground">HOURS</span>
                  </div>
                  <div className="border border-border bg-background/50 p-2 rounded-sm">
                    <span className="text-xl font-bold text-foreground">{countdown.mins}</span>
                    <span className="block text-[9px] text-muted-foreground">MIN</span>
                  </div>
                  <div className="border border-border bg-background/50 p-2 rounded-sm">
                    <span className="text-xl font-bold text-primary">{countdown.secs}</span>
                    <span className="block text-[9px] text-muted-foreground">SEC</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. How It Works Workflow Section (Mobile Order: 6) */}
            <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-6 lg:order-none">
              <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold">
                HOW IT WORKS
              </h2>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {howItWorksSteps.map((step) => (
                  <div key={step.num} className="flex flex-col justify-between border border-border/60 bg-background/40 p-4 transition-all hover:border-primary/50 rounded-sm">
                    <div>
                      <span className="font-mono text-xs font-bold text-primary">{step.num}</span>
                      <h3 className="mt-1 font-mono text-xs font-bold text-foreground tracking-[0.15em]">{step.title}</h3>
                      <p className="mt-2 text-xs text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Event Coordinators Section (Mobile Order: 7) */}
            <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-7 lg:order-none">
              <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold mb-4">
                EVENT COORDINATORS
              </h2>

              {facultyCoordinators && facultyCoordinators.length > 0 && (
                <div className="mb-5">
                  <h3 className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-bold mb-2.5">
                    FACULTY COORDINATORS
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                    {facultyCoordinators.map((fc) => (
                      <div key={fc.name} className="border border-border/60 bg-background/50 p-3.5 rounded-sm flex flex-col justify-between">
                        <div>
                          <span className="block font-bold text-foreground">{fc.name}</span>
                          <span className="text-primary text-[10.5px] tracking-wide block mt-0.5">{fc.role}</span>
                        </div>
                        {fc.phone && (
                          <a href={`tel:${fc.phone.replace(/\s+/g, '')}`} className="mt-2.5 text-muted-foreground hover:text-primary transition-colors text-[11px] font-mono block">
                            {fc.phone}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {studentCoordinators && studentCoordinators.length > 0 && (
                <div>
                  <h3 className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-bold mb-2.5">
                    STUDENT COORDINATORS
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                    {studentCoordinators.map((sc) => (
                      <div key={sc.name} className="border border-border/60 bg-background/50 p-3.5 rounded-sm flex flex-col justify-between">
                        <div>
                          <span className="block font-bold text-foreground">{sc.name}</span>
                          <span className="text-primary text-[10.5px] tracking-wide block mt-0.5">{sc.role}</span>
                        </div>
                        {sc.phone && (
                          <a href={`tel:${sc.phone.replace(/\s+/g, '')}`} className="mt-2.5 text-muted-foreground hover:text-primary transition-colors text-[11px] font-mono block">
                            {sc.phone}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!facultyCoordinators && !studentCoordinators && (
                <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
                  <div>
                    <span className="block font-semibold text-foreground">GOWTHAM (STUDENT COORDINATOR)</span>
                    <span className="text-muted-foreground">+91 91501 84920</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-foreground">RITHIKA (EVENT HEAD)</span>
                    <span className="text-muted-foreground">+91 91501 92841</span>
                  </div>
                </div>
              )}
            </div>

            {/* Event Rounds Section (Mobile Order: 8) */}
            {eventRounds && eventRounds.length > 0 && (
              <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-8 lg:order-none">
                <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold mb-4">
                  EVENT ROUNDS
                </h2>
                <div className="flex flex-col gap-3 font-mono text-xs">
                  {eventRounds.map((rd) => (
                    <div key={rd.name} className="border border-border/60 bg-background/50 p-4 rounded-sm">
                      <span className="block font-bold text-primary tracking-[0.1em]">{rd.name}</span>
                      <p className="mt-1.5 text-muted-foreground leading-relaxed whitespace-pre-line">{rd.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Additional Information (Mobile Order: 8.5) */}
            {additionalInfo && additionalInfo.length > 0 && (
              <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-8 lg:order-none">
                <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold mb-4">
                  ADDITIONAL INFORMATION
                </h2>
                <ul className="flex flex-col gap-2.5 font-mono text-xs leading-relaxed text-muted-foreground">
                  {additionalInfo.map((info, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="text-primary font-bold">•</span>
                      <span className="text-foreground/90">{info}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 6. Prerequisites Section (Mobile Order: 9) */}
            {prerequisites && prerequisites.length > 0 && (
              <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-9 lg:order-none">
                <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold mb-4">
                  PREREQUISITES
                </h2>
                <ul className="flex flex-col gap-2.5 font-mono text-xs leading-relaxed text-muted-foreground">
                  {prerequisites.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="text-primary font-bold">✓</span>
                      <span className="text-foreground/90">{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Software / Tools Required Section (Mobile Order: 9.5) */}
            {toolsRequired && (
              <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-9 lg:order-none">
                <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold mb-2">
                  SOFTWARE / TOOLS REQUIRED
                </h2>
                <p className="font-mono text-xs text-foreground/90 font-semibold whitespace-pre-line">{toolsRequired}</p>
              </div>
            )}

            {/* 7. Evaluation Criteria Section (Mobile Order: 9.5) */}
            {evaluationCriteria && evaluationCriteria.length > 0 && (
              <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-primary/40 bg-card p-6 md:p-8 rounded-[10px] shadow-[0_0_20px_rgba(168,85,247,0.1)] order-9 lg:order-none">
                <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold mb-4">
                  EVALUATION CRITERIA
                </h2>
                <div className="flex flex-col gap-2.5 font-mono text-xs">
                  {evaluationCriteria.map((c) => (
                    <div key={c.category} className="flex items-center justify-between border border-border/60 bg-background/50 p-3 rounded-sm">
                      <span className="text-foreground/90 font-medium">{c.category}</span>
                      <span className="font-bold text-primary shrink-0 ml-3">{c.marks}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between border border-primary/40 bg-primary/10 p-3 rounded-sm font-bold">
                    <span className="text-foreground">TOTAL SCORE</span>
                    <span className="text-primary">100 MARKS</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (Desktop: 6 cols / Mobile: Stacked with flex orders) */}
          <div className="lg:col-span-6 flex flex-col gap-6 md:gap-8 w-full relative z-20">
            {/* 1. About the Event (Mobile Order: 3) */}
            <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] shadow-lg order-3 lg:order-none">
              <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold">
                ABOUT THE EVENT
              </h2>
              <div className="mt-4 text-base leading-relaxed text-muted-foreground whitespace-pre-line">
                {description}
              </div>
            </div>

            {/* 2. Event Specifications (Mobile Order: 4) */}
            <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-4 lg:order-none">
              <h2 className="font-mono text-xs tracking-[0.25em] text-primary font-bold">
                EVENT SPECIFICATIONS
              </h2>

              <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs tracking-[0.1em]">
                <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                  <dt className="text-foreground/50">DATE</dt>
                  <dd className="mt-1 font-semibold text-foreground">{date}</dd>
                </div>
                <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                  <dt className="text-foreground/50">TIME</dt>
                  <dd className="mt-1 font-semibold text-foreground">{time}</dd>
                </div>
                <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                  <dt className="text-foreground/50">VENUE</dt>
                  <dd className="mt-1 font-semibold text-foreground">{venue}</dd>
                </div>
                <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                  <dt className="text-foreground/50">REGISTRATION FEE</dt>
                  <dd className="mt-1 font-semibold text-primary">{fee}</dd>
                </div>
                <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                  <dt className="text-foreground/50">TEAM FORMAT</dt>
                  <dd className="mt-1 font-semibold text-foreground">{teamSize}</dd>
                </div>
                <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                  <dt className="text-foreground/50">PRIZE POOL</dt>
                  <dd className="mt-1 font-semibold text-emerald-400">{prize}</dd>
                </div>
                {duration && (
                  <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                    <dt className="text-foreground/50">DURATION</dt>
                    <dd className="mt-1 font-semibold text-foreground">{duration}</dd>
                  </div>
                )}
                {rounds && (
                  <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                    <dt className="text-foreground/50">EVENT ROUNDS</dt>
                    <dd className="mt-1 font-semibold text-foreground">{rounds}</dd>
                  </div>
                )}
                {expectedRegistrations && (
                  <div className="group border-b border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                    <dt className="text-foreground/50">EXPECTED REGISTRATIONS</dt>
                    <dd className="mt-1 font-semibold text-foreground">{expectedRegistrations}</dd>
                  </div>
                )}
                <div className="group col-span-1 sm:col-span-2 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 rounded-sm">
                  <dt className="text-foreground/50">SEATS AVAILABLE</dt>
                  <dd className="mt-1 font-semibold text-foreground">{seatsLabel}</dd>
                </div>
              </dl>

              {/* Venue Map Link */}
              <div className="mt-6 border-t border-border/60 pt-4">
                <a
                  href="https://maps.google.com/?q=SRM+University+Ramapuram+Chennai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-primary transition-colors hover:text-foreground"
                >
                  <span>VIEW VENUE LOCATION ON MAP</span>
                  <span>↗</span>
                </a>
              </div>
            </div>

            {/* 3. Prize Breakdown (if prizesList provided) (Mobile Order: 10) */}
            {prizesList && prizesList.length > 0 && (
              <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-emerald-500/40 bg-card p-6 md:p-8 rounded-[10px] shadow-[0_0_20px_rgba(16,185,129,0.08)] order-10 lg:order-none">
                <h2 className="font-mono text-xs tracking-[0.25em] text-emerald-400 font-bold">
                  PRIZE DETAILS
                </h2>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                  {prizesList.map((p) => (
                    <div key={p.rank} className="flex items-center justify-between border border-emerald-500/30 bg-emerald-950/20 p-3.5 rounded-sm">
                      <span className="font-bold text-foreground">{p.rank}</span>
                      <span className="font-extrabold text-emerald-400 text-sm">{p.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Event Rules & Regulations (Mobile Order: 11) */}
            <div className="reveal-on-scroll opacity-0 translate-y-6 transition-all duration-700 w-full border border-border/80 bg-card p-6 md:p-8 rounded-[10px] order-11 lg:order-none">
              <h2 className="font-mono text-xs tracking-[0.25em] text-primary mb-4 font-bold">
                RULES & REGULATIONS
              </h2>
              {customRules && customRules.length > 0 ? (
                <div>
                  <ol
                    id="rules-list"
                    className="flex flex-col gap-3 font-mono text-xs leading-relaxed text-muted-foreground transition-all duration-300 ease-in-out"
                  >
                    {(showAllRules ? customRules : customRules.slice(0, 4)).map((rule, idx) => (
                      <li key={idx} className="flex gap-3 border-b border-border/40 pb-2.5 last:border-b-0 animate-in fade-in duration-300">
                        <span className="font-bold text-primary shrink-0">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <span className="text-foreground/90">{rule}</span>
                      </li>
                    ))}
                  </ol>

                  {customRules.length > 4 && (
                    <div className="mt-5 pt-3 border-t border-border/40 flex justify-center">
                      <button
                        type="button"
                        aria-expanded={showAllRules}
                        aria-controls="rules-list"
                        onClick={() => setShowAllRules((prev) => !prev)}
                        className="group flex items-center gap-2 rounded-[3px] border border-primary/40 bg-primary/10 px-5 py-2.5 font-mono text-[11px] font-bold tracking-[0.2em] text-primary transition-all hover:border-primary hover:bg-primary/20 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <span>{showAllRules ? '− SHOW LESS' : '+ SHOW ALL RULES'}</span>
                        <span className={`inline-block transition-transform duration-300 ${showAllRules ? 'rotate-180' : 'rotate-0'}`}>
                          ↓
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {rulesSections.map((sec, idx) => (
                    <div key={sec.title} className="border border-border/70 bg-background/50 rounded-sm">
                      <button
                        type="button"
                        onClick={() => setOpenAccordion(openAccordion === idx ? null : idx)}
                        className="flex w-full items-center justify-between p-4 text-left font-mono text-xs tracking-[0.15em] font-semibold text-foreground transition-colors hover:text-primary"
                      >
                        <span>{sec.title}</span>
                        <span className="text-primary font-bold">{openAccordion === idx ? '−' : '+'}</span>
                      </button>
                      {openAccordion === idx && (
                        <div className="border-t border-border/50 px-4 pb-4 pt-2 text-xs leading-relaxed text-muted-foreground font-mono">
                          {sec.content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Registration Action Button (Mobile Order: 12) */}
            <div className="w-full order-12 lg:order-none">
              <button
                type="button"
                disabled={!isOpen}
                onClick={handleRegisterClick}
                className="group relative w-full overflow-hidden rounded-[3px] border border-primary bg-primary px-8 py-5 text-center font-mono text-xs font-bold tracking-[0.25em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {/* Button Moving Glass Highlight */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                <span>{isOpen ? 'REGISTER NOW →' : 'REGISTRATION CLOSED'}</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Registration Modal */}
      {showModal && (
        <RegistrationModal
          eventId={event?.id || eventId}
          eventName={eventName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
