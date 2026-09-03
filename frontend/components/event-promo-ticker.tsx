'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { EVENTS } from '@/lib/events-data'
import { fetchEvents, type ApiEvent } from '@/lib/api'

const DEFAULT_POSTER_FALLBACK = '/assets/posters/0f2f13717f064841b9ea6c0cea057590.jpg'

/** Guaranteed safe poster URL fallback helper */
function getSafePoster(poster?: string | null): string {
  if (typeof poster === 'string' && poster.trim().length > 0) {
    return poster.trim()
  }
  return DEFAULT_POSTER_FALLBACK
}

export function EventPromoTicker() {
  const router = useRouter()
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [backendEvents, setBackendEvents] = useState<ApiEvent[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch backend events once globally for promo carousel
  useEffect(() => {
    fetchEvents()
      .then(setBackendEvents)
      .catch(() => {})
  }, [])

  // Detect prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReducedMotion(mediaQuery.matches)
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }
  }, [])

  // Explicitly check if user is on Home landing page ('/')
  const isHomePage = pathname === '/'

  // Determine current event ID from pathname (if on /events/[eventId])
  const currentEventId = useMemo(() => {
    if (pathname && pathname.startsWith('/events/')) {
      const parts = pathname.split('/events/')
      return parts[1] ? decodeURIComponent(parts[1]) : ''
    }
    return ''
  }, [pathname])

  // Filter out current event from promotional list
  const promoEvents = useMemo(() => {
    if (backendEvents.length > 0) {
      return backendEvents
        .filter(
          (e) =>
            !currentEventId ||
            (e.id.toLowerCase() !== currentEventId.toLowerCase() &&
              e.name.toLowerCase() !== currentEventId.toLowerCase())
        )
        .map((e) => {
          const fallback = EVENTS.find((se) => se.name.toLowerCase() === e.name.toLowerCase())
          return {
            id: e.id,
            name: e.name,
            tag: e.tag || fallback?.tag || 'COMPETITION',
            fee: e.fee || fallback?.details.fee || 'FREE',
            venue: e.venue || fallback?.details.venue || 'SRM RAMAPURAM',
            poster: getSafePoster(e.poster_url || fallback?.poster),
          }
        })
    }

    return EVENTS.filter((e) => {
      if (!currentEventId) return true
      const id = e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      return id !== currentEventId.toLowerCase() && e.name.toLowerCase() !== currentEventId.toLowerCase()
    }).map((e) => ({
      id: e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: e.name,
      tag: e.tag,
      fee: e.details.fee,
      venue: e.details.venue,
      poster: getSafePoster(e.poster),
    }))
  }, [currentEventId, backendEvents])

  // 2-Second Display Pause Timer with Discrete Slide
  useEffect(() => {
    if (isHomePage || dismissed || isPaused || reducedMotion || promoEvents.length === 0) return

    timerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % promoEvents.length)
    }, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [currentIndex, isPaused, dismissed, reducedMotion, promoEvents.length, isHomePage])

  // DO NOT RENDER ON HOME PAGE
  if (isHomePage || dismissed || promoEvents.length === 0) return null

  const handleNext = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setCurrentIndex((prev) => (prev + 1) % promoEvents.length)
  }

  const handlePrev = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setCurrentIndex((prev) => (prev - 1 + promoEvents.length) % promoEvents.length)
  }

  const handleEventClick = (id: string) => {
    router.push(`/event?eventId=${encodeURIComponent(id)}`)
  }

  return (
    <aside
      aria-label="Promotional Event Spotlight"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="fixed bottom-[10px] right-[10px] sm:bottom-5 sm:right-5 z-40 w-[245px] max-w-[calc(100vw-20px)] min-[370px]:w-[260px] min-[370px]:max-w-[calc(100vw-24px)] sm:w-[320px] sm:max-w-[320px] animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-[7px] sm:rounded-[8px] border border-[rgba(168,85,247,0.3)] bg-[rgba(10,5,20,0.94)] p-2 sm:p-2.5 backdrop-blur-md shadow-[0_4px_14px_rgba(155,77,255,0.12)] transition-all hover:border-[rgba(168,85,247,0.5)]"
    >
      {/* Top Bar: Live Status Badge, Header & Subtle Close Button (Height ~26px) */}
      <div className="flex items-center justify-between border-b border-border/40 pb-1 mb-1 font-mono text-[7.5px] sm:text-[8.5px] tracking-[0.1em] sm:tracking-[0.14em]">
        <div className="flex items-center gap-1 text-primary/90 font-bold truncate">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <span className="truncate">FEATURED ARENA</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Manual Controls */}
          <div className="flex items-center gap-0.5 text-muted-foreground/80">
            <button
              type="button"
              onClick={handlePrev}
              className="px-0.5 hover:text-primary transition-colors text-[9px] sm:text-[10px] font-bold"
              title="Previous Event"
            >
              ‹
            </button>
            <span className="text-[7px] sm:text-[8px]">
              {currentIndex + 1}/{promoEvents.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="px-0.5 hover:text-primary transition-colors text-[9px] sm:text-[10px] font-bold"
              title="Next Event"
            >
              ›
            </button>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground/70 hover:text-foreground transition-colors px-0.5 font-mono text-[9px] sm:text-[10px]"
            title="Dismiss Spotlight"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Discrete Carousel Stage (Smooth Horizontal Slide Left Transition ~700ms) */}
      <div className="relative overflow-hidden rounded-[4px] sm:rounded-[5px] bg-card/20 border border-border/30">
        <div
          className="flex transition-transform duration-700 ease-in-out w-full"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {promoEvents.map((item) => {
            const safePosterSrc = getSafePoster(item.poster)
            return (
              <div
                key={item.id}
                className="group flex-none w-full flex items-center gap-2 p-1 sm:p-2 transition-all"
              >
                {/* Left Side: Landscape Horizontal Poster Stage (70px x 48px on mobile / 110px x 68px on desktop) */}
                <div
                  onClick={() => handleEventClick(item.id)}
                  className="relative flex h-[48px] w-[70px] sm:h-[68px] sm:w-[110px] shrink-0 items-center justify-center cursor-pointer overflow-hidden rounded-[4px] border border-purple-500/30 bg-black/40 p-0.5 sm:p-1 shadow-[0_0_8px_rgba(168,85,247,0.2)] transition-transform duration-300 group-hover:scale-[1.025]"
                >
                  <Image
                    src={safePosterSrc}
                    alt={`${item.name} poster`}
                    fill
                    sizes="(max-width: 640px) 70px, 110px"
                    className="object-contain p-0.5"
                  />
                </div>

                {/* Right Side: Event Details & Clickable CTA Button */}
                <div className="flex flex-col flex-1 min-w-0 text-left overflow-hidden">
                  <span className="font-mono text-[7px] sm:text-[8px] tracking-[0.12em] text-primary font-semibold truncate">
                    {item.tag}
                  </span>
                  <h4
                    onClick={() => handleEventClick(item.id)}
                    className="mt-0.5 font-sans text-[10px] sm:text-xs font-bold tracking-tight text-foreground line-clamp-1 truncate cursor-pointer transition-colors hover:text-primary"
                  >
                    {item.name}
                  </h4>
                  <p className="mt-0.5 font-mono text-[7px] sm:text-[8px] text-muted-foreground tracking-[0.03em] truncate">
                    {item.fee} · {item.venue}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleEventClick(item.id)}
                    className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[7.5px] sm:text-[8.5px] font-bold text-primary transition-transform duration-300 group-hover:translate-x-1 text-left w-max hover:text-primary/90"
                  >
                    <span>VIEW EVENT</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tiny Pagination Dots */}
      <div className="mt-1 sm:mt-1.5 flex items-center justify-center gap-1">
        {promoEvents.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current)
              setCurrentIndex(idx)
            }}
            className={`h-0.5 sm:h-1 rounded-full transition-all duration-300 ${
              idx === currentIndex
                ? 'w-2.5 sm:w-3 bg-primary shadow-[0_0_4px_#a855f7]'
                : 'w-1 bg-muted-foreground/25 hover:bg-muted-foreground/50'
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </aside>
  )
}
