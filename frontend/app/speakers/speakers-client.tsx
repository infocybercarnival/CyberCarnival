'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import { Navbar } from '@/components/navbar'
import { fetchSpeakers } from '@/lib/api'

type CategoryFilter = 'ALL' | 'INDUSTRY' | 'SECURITY' | 'RESEARCH' | 'COMMUNITY'

type Speaker = {
  id: string
  no: string
  name: string
  designation: string
  organization: string
  category: CategoryFilter
  portrait: string
  bio: string
  expertise: string[]
  sessionTitle?: string
  sessionTime?: string
  sessionVenue?: string
  socials?: {
    twitter?: string
    linkedin?: string
    github?: string
  }
  isFeatured?: boolean
}

const SPEAKERS_DATA: Speaker[] = [
  {
    id: 'alexander-reed',
    no: 'SPEAKER 01',
    name: 'ALEXANDER REED',
    designation: 'Principal Security Researcher',
    organization: 'Apex Threat Labs',
    category: 'SECURITY',
    portrait: '/assets/branding/cybercarnival-logo-no-bg.png',
    bio: 'Specializing in offensive security, zero-day research, and kernel-level exploit mitigation. Alexander leads red team operations and vulnerability intelligence for global enterprises.',
    expertise: ['OFFENSIVE SECURITY', 'THREAT RESEARCH', 'KERNEL EXPLOITATION'],
    sessionTitle: 'Building Resilient Adversarial Defense Systems',
    sessionTime: '7 OCT · 10:30 AM',
    sessionVenue: 'MAIN AUDITORIUM · SRM RAMAPURAM',
    socials: { twitter: 'https://twitter.com', linkedin: 'https://linkedin.com', github: 'https://github.com' },
    isFeatured: true,
  },
  {
    id: 'dr-elena-vance',
    no: 'SPEAKER 02',
    name: 'DR. ELENA VANCE',
    designation: 'Head of AI & Cyber Defense',
    organization: 'Synthetix Cyber',
    category: 'RESEARCH',
    portrait: '/assets/branding/cybercarnival-logo-no-bg.png',
    bio: 'Pioneering machine learning techniques for real-time anomaly detection and neural network adversarial hardening against novel cyber threats.',
    expertise: ['AI SECURITY', 'NEURAL HARDENING', 'THREAT DETECTION'],
    sessionTitle: 'Inside Modern Neural Attacks & Cyber Defenses',
    sessionTime: '7 OCT · 01:30 PM',
    sessionVenue: 'TECH HALL A · SRM RAMAPURAM',
    socials: { twitter: 'https://twitter.com', linkedin: 'https://linkedin.com' },
  },
  {
    id: 'marcus-thorne',
    no: 'SPEAKER 03',
    name: 'MARCUS THORNE',
    designation: 'Chief Information Security Officer',
    organization: 'Aegis Sentinel Systems',
    category: 'INDUSTRY',
    portrait: '/assets/branding/cybercarnival-logo-no-bg.png',
    bio: 'Veteran enterprise CISO steering cloud security architecture, zero-trust engineering, and compliance frameworks across Fortune 500 infrastructure.',
    expertise: ['ZERO TRUST', 'CLOUD SECURITY', 'ENTERPRISE GOVERNANCE'],
    sessionTitle: 'Zero-Trust Architecture in High-Velocity Environments',
    sessionTime: '7 OCT · 03:30 PM',
    sessionVenue: 'MAIN AUDITORIUM · SRM RAMAPURAM',
    socials: { linkedin: 'https://linkedin.com', github: 'https://github.com' },
  },
  {
    id: 'sarah-chen',
    no: 'SPEAKER 04',
    name: 'SARAH CHEN',
    designation: 'Lead Incident Responder',
    organization: 'Chronos IR Group',
    category: 'SECURITY',
    portrait: '/assets/branding/cybercarnival-logo-no-bg.png',
    bio: 'Frontline digital forensics expert investigating nation-state intrusions, ransomware incidents, and sophisticated APT campaign teardowns.',
    expertise: ['DIGITAL FORENSICS', 'INCIDENT RESPONSE', 'MALWARE ANALYSIS'],
    sessionTitle: 'Digital Footprints: Dissecting State-Sponsored Intrusions',
    sessionTime: '8 OCT · 11:00 AM',
    sessionVenue: 'TECH HALL B · SRM RAMAPURAM',
    socials: { twitter: 'https://twitter.com', linkedin: 'https://linkedin.com' },
  },
  {
    id: 'vikram-patel',
    no: 'SPEAKER 05',
    name: 'VIKRAM PATEL',
    designation: 'OSINT & Recon Lead',
    organization: 'OpenIntel Collective',
    category: 'COMMUNITY',
    portrait: '/assets/branding/cybercarnival-logo-no-bg.png',
    bio: 'Open source intelligence practitioner teaching ethical recon, threat landscape mapping, and darknet investigation methodologies.',
    expertise: ['OSINT RECON', 'DARKNET MAPPING', 'ETHICAL HACKING'],
    sessionTitle: 'Open Source Intelligence: Mapping Hidden Digital Assets',
    sessionTime: '8 OCT · 02:00 PM',
    sessionVenue: 'LAB BLOCK 3 · SRM RAMAPURAM',
    socials: { twitter: 'https://twitter.com', github: 'https://github.com' },
  },
  {
    id: 'clara-oswald',
    no: 'SPEAKER 06',
    name: 'CLARA OSWALD',
    designation: 'DevSecOps Architect',
    organization: 'Pipeline Cyber',
    category: 'INDUSTRY',
    portrait: '/assets/branding/cybercarnival-logo-no-bg.png',
    bio: 'Automating security scanning into CI/CD continuous deployment workflows. Expert in container security and Kubernetes cluster protection.',
    expertise: ['DEVSECOPS', 'KUBERNETES SECURITY', 'CI/CD HARDENING'],
    sessionTitle: 'Automated Container Security in Cloud Pipelines',
    sessionTime: '8 OCT · 04:00 PM',
    sessionVenue: 'TECH HALL A · SRM RAMAPURAM',
    socials: { linkedin: 'https://linkedin.com', github: 'https://github.com' },
  },
]

export function SpeakersClient() {
  const headerRef = useRef<HTMLDivElement>(null)
  const lineupRef = useRef<HTMLDivElement>(null)

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL')
  const [selectedSpeaker, setSelectedSpeaker] = useState<Speaker | null>(null)
  const [speakerModalOpen, setSpeakerModalOpen] = useState(false)

  // Live from the admin panel now — SPEAKERS_DATA above only remains as the
  // shown set until at least one real speaker exists, so the page never
  // renders completely empty before anyone's been added.
  const [liveSpeakers, setLiveSpeakers] = useState<Speaker[] | null>(null)
  useEffect(() => {
    fetchSpeakers()
      .then((list) => {
        if (list.length === 0) return // keep placeholders
        setLiveSpeakers(
          list.map((s, i) => ({
            id: s.id,
            no: `SPEAKER ${String(i + 1).padStart(2, '0')}`,
            name: s.name,
            designation: s.designation || '',
            organization: s.organization || '',
            category: (s.category as CategoryFilter) || 'INDUSTRY',
            portrait: s.portrait_url || '/assets/branding/cybercarnival-logo-no-bg.png',
            bio: s.bio || '',
            expertise: s.expertise,
            sessionTitle: s.session_title || undefined,
            sessionTime: s.session_time || undefined,
            sessionVenue: s.session_venue || undefined,
            socials: {
              twitter: s.socials.twitter || undefined,
              linkedin: s.socials.linkedin || undefined,
              github: s.socials.github || undefined,
            },
            isFeatured: s.is_featured,
          }))
        )
      })
      .catch(() => {}) // keep placeholders on failure too
  }, [])

  const speakersList = liveSpeakers ?? SPEAKERS_DATA

  const featuredSpeaker = useMemo(() => speakersList.find((s) => s.isFeatured) || speakersList[0], [speakersList])

  const filteredSpeakers = useMemo(() => {
    if (categoryFilter === 'ALL') return speakersList
    return speakersList.filter((s) => s.category === categoryFilter)
  }, [categoryFilter, speakersList])

  // Header Reveal GSAP Animation
  useEffect(() => {
    if (!headerRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        headerRef.current!.querySelectorAll('.anim-header'),
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out' }
      )
    }, headerRef)
    return () => ctx.revert()
  }, [])

  // Lineup Scroll Observer
  useEffect(() => {
    if (!lineupRef.current) return

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
      { threshold: 0.1 }
    )

    const cards = lineupRef.current.querySelectorAll('.speaker-card')
    cards.forEach((c) => observer.observe(c))

    return () => observer.disconnect()
  }, [filteredSpeakers])

  const handleOpenSpeaker = (speaker: Speaker) => {
    setSelectedSpeaker(speaker)
    setSpeakerModalOpen(true)
  }

  return (
    <>
      <Navbar />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-32 pt-36 lg:px-10">
        {/* Hero Section */}
        <div ref={headerRef} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] tracking-[0.3em] text-primary">
              SPEAKERS
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-3 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              ● SPEAKER LINEUP · 2026 EDITION
            </span>
          </div>

          <h1 className="anim-header font-display text-[clamp(2.8rem,7.5vw,5.5rem)] font-bold leading-[0.95] tracking-tight text-foreground">
            THE MINDS <br className="hidden sm:inline" />
            BEHIND THE MISSION
          </h1>

          <p className="anim-header max-w-2xl text-base leading-relaxed text-muted-foreground">
            Meet the security leaders, researchers, practitioners, and innovators shaping the conversations and technical workshops at CyberCarnival 2026.
          </p>

          <div className="anim-header mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('lineup-section')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="border border-primary bg-primary px-6 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] rounded-[3px]"
            >
              VIEW SPEAKERS →
            </button>
          </div>
        </div>

        {/* Featured Speaker Dossier Card */}
        {featuredSpeaker && (
          <div className="mt-16 border border-primary/40 bg-card/60 p-6 md:p-10 backdrop-blur-md rounded-[10px] shadow-[0_0_35px_rgba(168,85,247,0.15)]">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-center">
              {/* Left Portrait */}
              <div className="lg:col-span-5 relative aspect-[4/5] w-full overflow-hidden rounded-[10px] border border-primary/40 bg-background/80 group">
                {/* Cyber Scanline Overlay */}
                <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(168,85,247,0.05)_1px,transparent_1px)] bg-[size:100%_4px]" />

                <Image
                  src={featuredSpeaker.portrait}
                  alt={featuredSpeaker.name}
                  fill
                  className="object-contain p-8 filter grayscale contrast-125 brightness-90 transition-all duration-500 group-hover:grayscale-0 group-hover:brightness-100 group-hover:scale-105"
                  priority
                />
                <div className="absolute bottom-3 left-3 z-20 rounded-sm bg-background/90 border border-primary/40 px-2.5 py-1 font-mono text-[9px] tracking-[0.2em] text-primary">
                  FEATURED KEYNOTE
                </div>
              </div>

              {/* Right Details */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <span className="font-mono text-xs tracking-[0.25em] text-primary font-bold">
                  FEATURED SPEAKER
                </span>

                <h2 className="font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {featuredSpeaker.name}
                </h2>

                <p className="font-mono text-xs text-muted-foreground tracking-[0.1em]">
                  {featuredSpeaker.designation} — <span className="text-foreground">{featuredSpeaker.organization}</span>
                </p>

                <p className="text-sm leading-relaxed text-muted-foreground border-l-2 border-primary/60 pl-4 py-1 italic">
                  "{featuredSpeaker.bio}"
                </p>

                {/* Expertise Tags */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {featuredSpeaker.expertise.map((tag) => (
                    <span
                      key={tag}
                      className="border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] tracking-[0.15em] text-primary rounded-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between">
                  <div className="font-mono text-xs text-muted-foreground">
                    <span>SESSION: </span>
                    <span className="text-foreground font-semibold">{featuredSpeaker.sessionTitle}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenSpeaker(featuredSpeaker)}
                    className="border border-primary/60 px-5 py-2 font-mono text-[10px] tracking-[0.2em] text-primary transition-all hover:bg-primary hover:text-primary-foreground rounded-sm"
                  >
                    VIEW DOSSIER →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conference Statistics Counter */}
        <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4 border-y border-border/60 py-8 text-center">
          <div className="p-4">
            <span className="font-sans text-3xl font-bold text-primary sm:text-4xl">20+</span>
            <span className="block mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">WORLD-CLASS SPEAKERS</span>
          </div>
          <div className="p-4 border-l border-border/40">
            <span className="font-sans text-3xl font-bold text-foreground sm:text-4xl">08</span>
            <span className="block mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">KEYNOTE SESSIONS</span>
          </div>
          <div className="p-4 border-l border-border/40">
            <span className="font-sans text-3xl font-bold text-primary sm:text-4xl">05</span>
            <span className="block mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">SPECIALIZATIONS</span>
          </div>
          <div className="p-4 border-l border-border/40">
            <span className="font-sans text-3xl font-bold text-foreground sm:text-4xl">01</span>
            <span className="block mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">CYBERCARNIVAL 2026</span>
          </div>
        </div>

        {/* Speaker Grid Section: THE LINEUP */}
        <div id="lineup-section" className="mt-20">
          <div className="flex flex-col gap-2">
            <h2 className="font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              THE LINEUP
            </h2>
            <p className="max-w-xl text-xs text-muted-foreground font-mono tracking-[0.1em]">
              Experts from across cybersecurity, technology, research, and open-source intelligence.
            </p>
          </div>

          {/* Category Filter Buttons */}
          <div className="mt-6 flex flex-wrap gap-2.5 border-b border-border/60 pb-6">
            {(['ALL', 'INDUSTRY', 'SECURITY', 'RESEARCH', 'COMMUNITY'] as CategoryFilter[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`border px-5 py-2.5 font-mono text-[11px] tracking-[0.2em] transition-all rounded-sm ${
                  categoryFilter === c
                    ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_20px_rgba(168,85,247,0.35)] font-bold'
                    : 'border-border bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Speaker Cards Grid */}
          <div ref={lineupRef} className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSpeakers.map((speaker) => (
              <div
                key={speaker.id}
                className="speaker-card group relative flex flex-col justify-between border border-border/80 bg-card/60 p-6 rounded-[10px] transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/60 hover:shadow-[0_0_25px_rgba(168,85,247,0.18)] opacity-0 translate-y-8"
              >
                <div>
                  {/* Top Badge */}
                  <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground pb-4 border-b border-border/40">
                    <span className="text-primary font-semibold">{speaker.no}</span>
                    <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-primary">{speaker.category}</span>
                  </div>

                  {/* Speaker Portrait */}
                  <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-[8px] border border-border/60 bg-background/80">
                    <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(168,85,247,0.04)_1px,transparent_1px)] bg-[size:100%_4px]" />
                    <Image
                      src={speaker.portrait}
                      alt={speaker.name}
                      fill
                      className="object-contain p-6 filter grayscale contrast-125 brightness-90 transition-all duration-500 group-hover:grayscale-0 group-hover:scale-105 group-hover:brightness-100"
                    />
                  </div>

                  {/* Speaker Info */}
                  <h3 className="mt-5 font-sans text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                    {speaker.name}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {speaker.designation}
                  </p>
                  <p className="font-mono text-xs text-foreground/80 font-medium">
                    {speaker.organization}
                  </p>

                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                    {speaker.bio}
                  </p>

                  {/* Expertise Tags */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {speaker.expertise.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="border border-border bg-background/50 px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-muted-foreground group-hover:border-primary/40 group-hover:text-primary transition-colors rounded-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleOpenSpeaker(speaker)}
                    className="group/btn inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-primary transition-all hover:text-foreground"
                  >
                    <span>VIEW DOSSIER</span>
                    <span className="transition-transform group-hover/btn:translate-x-1">→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WHERE TO FIND THEM: Scheduled Sessions Section */}
        <div className="mt-24 border-t border-border/60 pt-16">
          <h2 className="font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            WHERE TO FIND THEM
          </h2>
          <p className="mt-2 max-w-xl text-xs text-muted-foreground font-mono tracking-[0.1em]">
            Keynote presentations and technical sessions led by CyberCarnival speakers.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {speakersList.slice(0, 3).map((sp) => (
              <div key={sp.id} className="border border-border/80 bg-card/40 p-5 rounded-[10px]">
                <span className="font-mono text-[10px] tracking-[0.2em] text-primary font-semibold block">
                  {sp.sessionTime}
                </span>
                <h4 className="mt-2 font-sans text-base font-bold text-foreground">
                  "{sp.sessionTitle}"
                </h4>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  By {sp.name} ({sp.organization})
                </p>
                <Link
                  href="/schedule"
                  className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] text-primary hover:text-foreground transition-colors"
                >
                  <span>VIEW ON TIMELINE</span>
                  <span>→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA Section */}
        <div className="mt-32 border-t border-border/60 pt-16 text-center">
          <p className="font-mono text-xs tracking-[0.3em] text-primary">CYBERCARNIVAL 2026</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            READY TO MEET THE EXPERTS?
          </h2>
          <p className="mt-3 max-w-md mx-auto text-sm text-muted-foreground">
            Explore the sessions, workshops, and conversations happening throughout CyberCarnival.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/events"
              className="border border-primary bg-primary px-8 py-4 font-mono text-xs font-bold tracking-[0.25em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] rounded-[3px]"
            >
              EXPLORE EVENTS →
            </Link>
            <Link
              href="/schedule"
              className="border border-primary/50 bg-card/40 px-8 py-4 font-mono text-xs tracking-[0.25em] text-primary transition-all hover:border-primary hover:bg-primary/10 rounded-[3px]"
            >
              VIEW SCHEDULE →
            </Link>
          </div>
        </div>
      </main>

      {/* Speaker Dossier Modal */}
      {speakerModalOpen && selectedSpeaker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-2xl border border-primary/60 bg-card p-6 md:p-8 rounded-[10px] shadow-[0_0_50px_rgba(168,85,247,0.3)]">
            <button
              type="button"
              onClick={() => setSpeakerModalOpen(false)}
              className="absolute right-4 top-4 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              ✕ CLOSE
            </button>

            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="relative aspect-square w-32 flex-shrink-0 overflow-hidden rounded-[8px] border border-primary/40 bg-background/80">
                <Image
                  src={selectedSpeaker.portrait}
                  alt={selectedSpeaker.name}
                  fill
                  className="object-contain p-4 filter contrast-125"
                />
              </div>

              <div>
                <span className="font-mono text-[10px] tracking-[0.2em] text-primary font-semibold">
                  {selectedSpeaker.no} / {selectedSpeaker.category}
                </span>
                <h3 className="font-sans text-2xl font-bold text-foreground">
                  {selectedSpeaker.name}
                </h3>
                <p className="font-mono text-xs text-muted-foreground">
                  {selectedSpeaker.designation} — <span className="text-foreground">{selectedSpeaker.organization}</span>
                </p>

                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  {selectedSpeaker.bio}
                </p>

                <div className="mt-4">
                  <span className="font-mono text-[10px] tracking-[0.15em] text-primary font-bold block mb-1.5">
                    EXPERT DOSSIER TAGS
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSpeaker.expertise.map((tag) => (
                      <span key={tag} className="border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[9px] text-primary rounded-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedSpeaker.sessionTitle && (
                  <div className="mt-4 border-t border-border/50 pt-3">
                    <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground block">SCHEDULED SESSION</span>
                    <span className="font-sans text-xs font-bold text-foreground block">{selectedSpeaker.sessionTitle}</span>
                    <span className="font-mono text-[10px] text-primary block mt-0.5">{selectedSpeaker.sessionTime} · {selectedSpeaker.sessionVenue}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
