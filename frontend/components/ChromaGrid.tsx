'use client'

import React, { useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import './ChromaGrid.css'

export type ChromaGridItem = {
  id: string
  no?: string
  name: string
  tag: string
  category: string
  description?: string | null
  posterSrc: string | null
  posterAlt: string
  fee: string
  date: string
  venue: string
  teamSize?: string | null
  seatsStatus: string
  seatsRatio: number | null
  registrationOpen: boolean
  isFallback?: boolean
}

interface ChromaGridProps {
  items: ChromaGridItem[]
}

export function ChromaGrid({ items }: ChromaGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Scroll Reveal IntersectionObserver Animation
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('chroma-card-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 }
    )

    const cards = gridRef.current?.querySelectorAll('.chroma-card')
    cards?.forEach((card, idx) => {
      const delay = (idx % 3) * 80
      ;(card as HTMLElement).style.setProperty('--stagger-delay', `${delay}ms`)
      observer.observe(card)
    })

    return () => observer.disconnect()
  }, [items])

  const handleCardClick = (item: ChromaGridItem) => {
    if (item.isFallback) return
    router.push(`/event?eventId=${encodeURIComponent(item.id)}`)
  }

  // Smooth mouse tilt handler using requestAnimationFrame (rotateX: +-4deg, rotateY: +-6deg)
  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const width = rect.width
    const height = rect.height

    const normX = x / width - 0.5
    const normY = y / height - 0.5

    // Restrained, subtle 3D tilt (rotateX: +-4deg, rotateY: +-6deg)
    const rotateX = (-normY * 4).toFixed(2)
    const rotateY = (normX * 6).toFixed(2)

    requestAnimationFrame(() => {
      card.style.setProperty('--card-mouse-x', `${x}px`)
      card.style.setProperty('--card-mouse-y', `${y}px`)
      card.style.setProperty('--rotate-x', `${rotateX}deg`)
      card.style.setProperty('--rotate-y', `${rotateY}deg`)
    })
  }

  const handleCardPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    requestAnimationFrame(() => {
      card.style.setProperty('--rotate-x', '0deg')
      card.style.setProperty('--rotate-y', '0deg')
    })
  }

  return (
    <div ref={gridRef} className="chroma-grid">
      {items.map((item) => (
        <article
          key={item.id}
          className="chroma-card group collectible-slab h-full"
          onClick={() => handleCardClick(item)}
          onPointerMove={handleCardPointerMove}
          onPointerLeave={handleCardPointerLeave}
        >
          {/* Layer 4: Iridescent Refractive Edge Glow (Strictly inside card container) */}
          <div className="collectible-slab-glow" />

          {/* Layer 3: Thin Acrylic Glass Outer Case Container */}
          <div className="collectible-slab-case flex flex-col h-full">
            {/* Layer 5: Cursor Tracking Glass Spotlight (Strictly inside card) */}
            <div className="chroma-glass-spotlight" />

            {/* Layer 5: Continuous 6.5s Light Reflection Sheen Sweep (Strictly inside card) */}
            <div className="chroma-glass-shine" />

            {/* Film Grain Surface */}
            <div className="collectible-grain-overlay" />

            {/* Dedicated Framed Inset Poster Stage (Fixed 16:9 Landscape Aspect Ratio Wrapper) */}
            <div className="event-poster-wrapper">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[8px] bg-[rgba(10,5,22,0.95)] border border-[rgba(160,80,255,0.3)] shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
                {item.posterSrc ? (
                  <Image
                    src={item.posterSrc}
                    alt={item.posterAlt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-contain p-1 rounded-[7px] transition-transform duration-500 group-hover:scale-[1.025]"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center p-3 text-center font-mono bg-[radial-gradient(ellipse_at_center,rgba(155,77,255,0.15),rgba(5,0,8,0.95))]">
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.4)_51%)] bg-[length:100%_4px] pointer-events-none opacity-40" />
                    <div className="relative z-10 flex flex-col items-center gap-1.5">
                      <span className="text-xl text-primary animate-pulse">◈</span>
                      <span className="text-[10px] tracking-[0.3em] text-primary/80 font-bold">CYBERCARNIVAL</span>
                      <span className="my-0.5 border-y border-primary/30 py-0.5 text-[10px] font-bold tracking-[0.25em] text-foreground">
                        POSTER TBA
                      </span>
                      <span className="text-[8.5px] tracking-[0.2em] text-muted-foreground/70">
                        TRANSMISSION PENDING
                      </span>
                    </div>
                  </div>
                )}
                {/* Layer 2: Glass Surface Highlight Overlay */}
                <div className="collectible-glass-surface" />
              </div>
            </div>

            {/* Card Information Body (Flex 1 Column Layout) */}
            <div className="collectible-card-body flex flex-1 flex-col justify-between gap-3 p-5 pt-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-primary font-bold">
                  <span>{item.tag}</span>
                  <span className="text-foreground/40 font-normal">{item.category}</span>
                </div>

                <h3 className="font-display text-lg sm:text-xl font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
                  {item.name}
                </h3>

                {item.description && (
                  <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground line-clamp-3 font-sans">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Anchored Bottom Block: Metadata Grid + REGISTER Button (mt-auto) */}
              <div className="mt-auto pt-3 border-t border-border/40">
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground pb-3">
                  <div>
                    <dt className="inline text-foreground/60">FEE </dt>
                    <dd className="inline font-semibold text-primary">{item.fee}</dd>
                  </div>
                  {item.teamSize && (
                    <div>
                      <dt className="inline text-foreground/60">TEAM </dt>
                      <dd className="inline">{item.teamSize}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline text-foreground/60">VENUE </dt>
                    <dd className="inline">{item.venue}</dd>
                  </div>
                  <div>
                    <dt className="inline text-foreground/60">DATE </dt>
                    <dd className="inline">{item.date}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="inline text-foreground/60">SEATS </dt>
                    <dd className="inline">
                      <span className={item.seatsStatus === 'FULL' ? 'text-destructive' : item.seatsStatus === 'ALMOST FULL' ? 'text-amber-400' : ''}>
                        {item.seatsStatus}
                      </span>
                    </dd>
                  </div>
                  {item.seatsRatio != null && (
                    <div className="col-span-2 mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.seatsStatus === 'FULL' ? 'bg-destructive' : item.seatsStatus === 'ALMOST FULL' ? 'bg-amber-400' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.round(item.seatsRatio * 100)}%` }}
                      />
                    </div>
                  )}
                </dl>

                {/* Action Button anchored at exact bottom baseline across every row */}
                <div
                  className={`flex items-center justify-between rounded-[3px] border px-4 py-2.5 font-mono text-[11px] tracking-[0.2em] font-bold transition-all ${
                    item.registrationOpen
                      ? 'border-primary/60 text-foreground group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                      : 'border-border text-muted-foreground opacity-40 pointer-events-none'
                  }`}
                >
                  <span>{item.registrationOpen ? 'REGISTER' : 'REGISTRATION CLOSED'}</span>
                  <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
