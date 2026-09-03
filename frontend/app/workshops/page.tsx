'use client'

import { useEffect, useState, useMemo } from 'react'
import { Navbar } from '@/components/navbar'
import { RegistrationModal } from '@/components/registration-modal'
import { ChromaGrid, type ChromaGridItem } from '@/components/ChromaGrid'
import { EVENTS, EVENT_DATES } from '@/lib/events-data'
import { fetchEvents, type ApiEvent } from '@/lib/api'

function formatTeamSize(min: number | null, max: number | null): string | null {
  if (min && max && min === max) return `${min} MEMBER${min > 1 ? 'S' : ''}`
  if (min && max) return `${min}–${max} MEMBERS`
  if (min) return `${min}+ MEMBERS`
  if (max) return `UP TO ${max} MEMBERS`
  return null
}

function isWorkshop(item: { name: string; tag?: string; category?: string; desc?: string }) {
  const name = (item.name || '').toUpperCase()
  const tag = (item.tag || '').toUpperCase()
  const category = (item.category || '').toUpperCase()
  const desc = (item.desc || '').toUpperCase()

  return (
    category.includes('WORKSHOP') ||
    tag.includes('WORKSHOP') ||
    tag.includes('HANDS-ON') ||
    name.includes('WORKSHOP') ||
    name.includes('SUPRAJA') ||
    name.includes('ALGORAND') ||
    desc.includes('WORKSHOP')
  )
}

function seatStatus(maxTeams: number | null, teamsRegistered: number): { label: string; ratio: number | null } {
  if (maxTeams == null) return { label: 'OPEN', ratio: null }
  const ratio = maxTeams > 0 ? Math.min(teamsRegistered / maxTeams, 1) : 1
  if (ratio >= 1) return { label: 'FULL', ratio }
  if (ratio >= 0.8) return { label: 'ALMOST FULL', ratio }
  if (ratio >= 0.5) return { label: 'FILLING FAST', ratio }
  return { label: 'OPEN', ratio }
}

export default function WorkshopsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [backendEvents, setBackendEvents] = useState<ApiEvent[]>([])
  const [backendError, setBackendError] = useState(false)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    fetchEvents()
      .then(setBackendEvents)
      .catch(() => setBackendError(true))
  }, [])

  const staticByName = useMemo(() => new Map(EVENTS.map((e) => [e.name, e])), [])

  // Filter ONLY workshop items from backend or static fallback
  const chromaItems: ChromaGridItem[] = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    if (backendError) {
      return EVENTS.filter((event) => {
        const matchesWorkshop = isWorkshop(event)
        const matchesSearch =
          !query ||
          event.name.toLowerCase().includes(query) ||
          event.tag.toLowerCase().includes(query) ||
          event.desc.toLowerCase().includes(query)
        return matchesWorkshop && matchesSearch
      }).map((event) => ({
        id: event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: event.name,
        tag: event.tag,
        category: 'WORKSHOP',
        description: event.desc,
        posterSrc: event.poster,
        posterAlt: event.posterAlt || `${event.name} poster`,
        fee: event.details.fee,
        date: event.details.date,
        venue: event.details.venue,
        teamSize: event.details.teamSize,
        seatsStatus: 'OPEN',
        seatsRatio: null,
        registrationOpen: true,
        isFallback: true,
      }))
    }

    // From backend API events, filter for workshop category/tags or match static workshop items
    const workshopsFromBackend = backendEvents.filter((event) => {
      const fallback = staticByName.get(event.name)
      const matchesWorkshop =
        isWorkshop(event) || (fallback ? isWorkshop(fallback) : false)

      const desc = event.description || fallback?.desc || ''
      const tag = event.tag || ''

      const matchesSearch =
        !query ||
        event.name.toLowerCase().includes(query) ||
        tag.toLowerCase().includes(query) ||
        desc.toLowerCase().includes(query)

      return matchesWorkshop && matchesSearch
    })

    // If backend returns events but no workshop tag matched yet, fallback to static workshop list
    const finalEventsList =
      workshopsFromBackend.length > 0
        ? workshopsFromBackend
        : EVENTS.filter(isWorkshop).map((ev) => ({
            id: ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            name: ev.name,
            tag: ev.tag,
            category: 'WORKSHOP',
            description: ev.desc,
            poster_url: ev.poster,
            fee: ev.details.fee,
            date: ev.details.date,
            venue: ev.details.venue,
            min_team_size: null,
            max_team_size: null,
            max_teams: null,
            seats_available: null,
            registration_open: true,
            teams_registered: 0,
          }))

    return finalEventsList.map((event) => {
      const fallback = staticByName.get(event.name)
      const posterSrc = event.poster_url || fallback?.poster || null
      const description = event.description || fallback?.desc || ''
      const teamSize =
        formatTeamSize(event.min_team_size ?? null, event.max_team_size ?? null) ||
        fallback?.details.teamSize ||
        'INDIVIDUAL'
      const { label: seatsStatus, ratio: seatsRatio } = seatStatus(event.max_teams, event.teams_registered)

      return {
        id: event.id || event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: event.name,
        tag: event.tag || 'HANDS-ON',
        category: 'WORKSHOP',
        description,
        posterSrc,
        posterAlt: fallback?.posterAlt || `${event.name} poster`,
        fee: event.fee || 'FREE',
        date: event.date || '7 OCTOBER',
        venue: event.venue || 'SRM RAMAPURAM',
        teamSize,
        seatsStatus,
        seatsRatio,
        registrationOpen: event.registration_open,
        isFallback: false,
      }
    })
  }, [backendError, backendEvents, searchQuery, staticByName])

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-32 pt-36 lg:px-10">
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary">
          WORKSHOPS / {EVENT_DATES}
        </p>

        {/* Heading & Active Count Indicator */}
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(2.5rem,6vw,5rem)] font-bold leading-none tracking-tight text-foreground">
              WORKSHOPS
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Hands-on sessions, guided labs, and deep technical dives led by industry practitioners.
            </p>
          </div>

          <div className="font-mono text-xs tracking-[0.25em] text-primary border border-primary/40 bg-primary/10 px-3.5 py-2 backdrop-blur-sm rounded-sm">
            {chromaItems.length} {chromaItems.length === 1 ? 'WORKSHOP FOUND' : 'ACTIVE WORKSHOPS'}
          </div>
        </div>

        {backendError && (
          <p className="mt-6 border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-mono tracking-[0.1em] text-destructive">
            Registration is temporarily unavailable — backend unreachable. Showing cached workshop details.
          </p>
        )}

        {/* Search Field Bar */}
        <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-primary font-mono text-xs font-bold">
              &gt;
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH WORKSHOPS..."
              className="w-full bg-card/60 border border-border/80 pl-8 pr-10 py-3 font-mono text-xs tracking-[0.15em] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors shadow-inner rounded-sm"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground font-mono text-xs"
              >
                ✕
              </button>
            ) : (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-primary/70 font-mono text-xs">
                ⌕
              </div>
            )}
          </div>
        </div>

        {/* ChromaGrid Workshops Presentation */}
        <div className="mt-12">
          {chromaItems.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center border border-border/60 bg-card/30 p-12 text-center font-mono rounded-[10px]">
              <span className="text-3xl text-primary animate-pulse">⌕</span>
              <h2 className="mt-4 text-base font-bold tracking-[0.2em] text-foreground">
                NO WORKSHOPS FOUND
              </h2>
              <p className="mt-2 text-xs tracking-[0.1em] text-muted-foreground">
                Workshop dossiers are being prepared. Check back soon.
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-6 border border-primary/60 px-5 py-2.5 text-[11px] tracking-[0.2em] text-foreground hover:bg-primary hover:text-primary-foreground transition-all rounded-sm"
                >
                  CLEAR SEARCH
                </button>
              )}
            </div>
          ) : (
            <ChromaGrid items={chromaItems} radius={320} damping={0.45} fadeOut={0.6} ease="power3.out" />
          )}
        </div>
      </main>

      {selected && (
        <RegistrationModal
          eventId={selected.id}
          eventName={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
