'use client'

import { useEffect, useState, useMemo } from 'react'
import { Navbar } from '@/components/navbar'
import { RegistrationModal } from '@/components/registration-modal'
import { ChromaGrid, type ChromaGridItem } from '@/components/ChromaGrid'
import { EVENTS, EVENT_DATES } from '@/lib/events-data'
import { fetchEvents, type ApiEvent } from '@/lib/api'

type CategoryFilter = 'ALL' | 'TECHNICAL' | 'NON-TECHNICAL'

function formatTeamSize(min: number | null, max: number | null): string | null {
  if (min && max && min === max) return `${min} MEMBER${min > 1 ? 'S' : ''}`
  if (min && max) return `${min}–${max} MEMBERS`
  if (min) return `${min}+ MEMBERS`
  if (max) return `UP TO ${max} MEMBERS`
  return null
}

function seatStatus(maxTeams: number | null, teamsRegistered: number): { label: string; ratio: number | null } {
  if (maxTeams == null) return { label: 'OPEN', ratio: null }
  const ratio = maxTeams > 0 ? Math.min(teamsRegistered / maxTeams, 1) : 1
  if (ratio >= 1) return { label: 'FULL', ratio }
  if (ratio >= 0.8) return { label: 'ALMOST FULL', ratio }
  if (ratio >= 0.5) return { label: 'FILLING FAST', ratio }
  return { label: 'OPEN', ratio }
}

export default function EventsPage() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL')
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

  // Filter backend or fallback events based on category and search query
  const chromaItems: ChromaGridItem[] = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    if (backendError) {
      return EVENTS.filter((event) => {
        const cat = event.tag === 'NON-TECHNICAL' ? 'NON-TECHNICAL' : 'TECHNICAL'
        const matchesCategory = categoryFilter === 'ALL' || cat === categoryFilter
        const matchesSearch =
          !query ||
          event.name.toLowerCase().includes(query) ||
          event.tag.toLowerCase().includes(query) ||
          event.desc.toLowerCase().includes(query)
        return matchesCategory && matchesSearch
      }).map((event) => ({
        id: event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        no: event.no,
        name: event.name,
        tag: event.tag,
        category: event.tag === 'NON-TECHNICAL' ? 'NON-TECHNICAL' : 'TECHNICAL',
        description: event.desc,
        posterSrc: event.poster,
        posterAlt: event.posterAlt || `${event.name} poster`,
        fee: event.details.fee,
        date: event.details.date,
        venue: event.details.venue,
        teamSize: event.details.teamSize,
        seatsStatus: 'OPEN',
        seatsRatio: null,
        registrationOpen: false,
        isFallback: true,
      }))
    }

    return backendEvents
      .filter((event) => {
        const cat = event.category || 'TECHNICAL'
        const matchesCategory = categoryFilter === 'ALL' || cat === categoryFilter
        const fallback = staticByName.get(event.name)
        const desc = event.description || fallback?.desc || ''
        const tag = event.tag || ''

        const matchesSearch =
          !query ||
          event.name.toLowerCase().includes(query) ||
          cat.toLowerCase().includes(query) ||
          tag.toLowerCase().includes(query) ||
          desc.toLowerCase().includes(query)

        return matchesCategory && matchesSearch
      })
      .map((event, idx) => {
        const fallback = staticByName.get(event.name)
        const posterSrc = event.poster_url || fallback?.poster || null
        const description = event.description || fallback?.desc || ''
        const teamSize = formatTeamSize(event.min_team_size, event.max_team_size) || fallback?.details.teamSize || null
        const { label: seatsStatus, ratio: seatsRatio } = seatStatus(event.max_teams, event.teams_registered)

        return {
          id: event.id,
          no: fallback?.no || String(idx + 1).padStart(2, '0'),
          name: event.name,
          tag: event.tag || 'COMPETITION',
          category: event.category || 'TECHNICAL',
          description,
          posterSrc,
          posterAlt: fallback?.posterAlt || `${event.name} poster`,
          fee: event.fee || 'FREE',
          date: event.date || 'TBA',
          venue: event.venue || 'TBA',
          teamSize,
          seatsStatus,
          seatsRatio,
          registrationOpen: event.registration_open,
          isFallback: false,
        }
      })
  }, [backendError, backendEvents, categoryFilter, searchQuery, staticByName])

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-[1440px] px-6 pb-32 pt-36 lg:px-12">
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary font-bold">EVENTS / {EVENT_DATES}</p>

        {/* Heading & Active Count Indicator */}
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-[clamp(2.5rem,6vw,5rem)] font-bold leading-none tracking-tight text-foreground">
            ALL EVENTS
          </h1>
          <div className="font-mono text-xs tracking-[0.25em] text-primary border border-primary/40 bg-primary/10 px-4 py-2.5 backdrop-blur-sm font-semibold">
            {chromaItems.length} {chromaItems.length === 1 ? 'EVENT FOUND' : 'ACTIVE EVENTS'}
          </div>
        </div>

        {backendError && (
          <p className="mt-6 border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-mono tracking-[0.1em] text-destructive">
            Registration is temporarily unavailable — backend unreachable. Showing cached event details.
          </p>
        )}

        {/* Controls Bar: Search & Category Filter */}
        <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          {/* Category Filter Bar */}
          <div className="flex flex-wrap gap-3">
            {(['ALL', 'TECHNICAL', 'NON-TECHNICAL'] as CategoryFilter[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`border px-6 py-3 font-mono text-[11px] tracking-[0.2em] transition-all ${
                  categoryFilter === c
                    ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_20px_rgba(168,85,247,0.35)]'
                    : 'border-border bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Cyberpunk Search Field */}
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-primary font-mono text-xs font-bold">
              &gt;
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH EVENTS..."
              className="w-full bg-card/60 border border-border/80 pl-8 pr-10 py-3 font-mono text-xs tracking-[0.15em] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors shadow-inner"
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

        {/* ChromaGrid Events Presentation */}
        <div className="mt-12">
          {chromaItems.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center border border-border/60 bg-card/30 p-12 text-center font-mono">
              <span className="text-3xl text-primary animate-pulse">⌕</span>
              <h2 className="mt-4 text-base font-bold tracking-[0.2em] text-foreground">
                NO MATCHING EVENTS
              </h2>
              <p className="mt-2 text-xs tracking-[0.1em] text-muted-foreground">
                No events matched your search query "{searchQuery}".
              </p>
              <button
                onClick={() => {
                  setSearchQuery('')
                  setCategoryFilter('ALL')
                }}
                className="mt-6 border border-primary/60 px-5 py-2.5 text-[11px] tracking-[0.2em] text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
              >
                CLEAR FILTERS
              </button>
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
