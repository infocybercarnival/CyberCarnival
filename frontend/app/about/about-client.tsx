'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { Navbar } from '@/components/navbar'
import { Events as ArenasSection } from '@/components/events'

const HELP_EMAIL = process.env.NEXT_PUBLIC_HELP_EMAIL || 'cybercarnival.help@srmist.edu.in'

export function AboutClient() {
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!heroRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        heroRef.current!.querySelectorAll('.anim-hero'),
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out' }
      )
    }, heroRef)
    return () => ctx.revert()
  }, [])

  return (
    <>
      <Navbar />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-32 pt-36 lg:px-10">
        {/* 1. Hero Section */}
        <div ref={heroRef} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] tracking-[0.3em] text-primary">
              ABOUT CYBERCARNIVAL
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-0.5 font-mono text-[10px] font-semibold text-primary">
              CYBERCARNIVAL 2026 · 07 — 08 OCTOBER · SRM RAMAPURAM
            </span>
          </div>

          <h1 className="anim-hero font-display text-[clamp(2.8rem,7.5vw,5.5rem)] font-bold leading-[0.95] tracking-tight text-foreground">
            MORE THAN <br className="hidden sm:inline" />
            A CYBER EVENT
          </h1>

          <p className="anim-hero max-w-2xl text-base leading-relaxed text-muted-foreground">
            CyberCarnival is a cybersecurity-focused technical and cultural experience bringing together competitions, workshops, research, industry conversations, and the people shaping the future of security.
          </p>

          <div className="anim-hero mt-4 flex flex-wrap items-center gap-4">
            <Link
              href="/events"
              className="border border-primary bg-primary px-7 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] rounded-[3px]"
            >
              EXPLORE EVENTS →
            </Link>
            <Link
              href="/schedule"
              className="border border-primary/50 bg-card/40 px-7 py-3.5 font-mono text-xs tracking-[0.2em] text-primary transition-all hover:border-primary hover:bg-primary/10 rounded-[3px]"
            >
              VIEW SCHEDULE →
            </Link>
          </div>
        </div>

        {/* 2. Mission Section */}
        <div className="mt-24 border-t border-border/60 pt-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <span className="font-mono text-4xl font-bold text-primary">01</span>
              <h2 className="mt-2 font-sans text-3xl font-bold tracking-tight text-foreground">
                THE MISSION
              </h2>
              <p className="mt-2 font-mono text-xs tracking-[0.2em] text-primary">
                WHY CYBERCARNIVAL?
              </p>
            </div>

            <div className="lg:col-span-8 border-l border-primary/30 pl-6 lg:pl-10">
              <p className="text-lg leading-relaxed text-muted-foreground">
                CyberCarnival is built around the idea that cybersecurity is not just about tools and vulnerabilities. It is about people, ideas, competition, collaboration, and the ability to think differently.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground/80">
                From live jeopardy CTFs and security tooling exhibitions to hands-on labs and keynote panel discussions, CyberCarnival bridges academia and enterprise security discipline.
              </p>
            </div>
          </div>
        </div>

        {/* 3. What CyberCarnival Offers (The Experience) */}
        <div className="mt-24">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs tracking-[0.25em] text-primary">WHAT WE OFFER</span>
            <h2 className="font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              THE EXPERIENCE
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="group border border-border/80 bg-card/50 p-6 rounded-[10px] transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/60 hover:shadow-[0_0_25px_rgba(168,85,247,0.18)]">
              <span className="font-mono text-2xl font-bold text-primary">01</span>
              <h3 className="mt-3 font-sans text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                COMPETE
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Challenge yourself through live CTFs, bug bounty hunts, and adversarial exercises.
              </p>
            </div>

            <div className="group border border-border/80 bg-card/50 p-6 rounded-[10px] transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/60 hover:shadow-[0_0_25px_rgba(168,85,247,0.18)]">
              <span className="font-mono text-2xl font-bold text-primary">02</span>
              <h3 className="mt-3 font-sans text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                BUILD
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Learn through hands-on workshops, guided labs, and practical tool-building sessions.
              </p>
            </div>

            <div className="group border border-border/80 bg-card/50 p-6 rounded-[10px] transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/60 hover:shadow-[0_0_25px_rgba(168,85,247,0.18)]">
              <span className="font-mono text-2xl font-bold text-primary">03</span>
              <h3 className="mt-3 font-sans text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                CONNECT
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Meet researchers, practitioners, security leaders, and fellow student hackers.
              </p>
            </div>

            <div className="group border border-border/80 bg-card/50 p-6 rounded-[10px] transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/60 hover:shadow-[0_0_25px_rgba(168,85,247,0.18)]">
              <span className="font-mono text-2xl font-bold text-primary">04</span>
              <h3 className="mt-3 font-sans text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                EXPLORE
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Discover new research papers, security tooling, OSINT frameworks, and threat intelligence.
              </p>
            </div>
          </div>
        </div>

        {/* 4. Statistics / Identity Section */}
        <div className="mt-20 grid grid-cols-2 gap-4 md:grid-cols-4 border-y border-border/60 py-10 text-center">
          <div className="p-4">
            <span className="font-sans text-4xl font-bold text-primary sm:text-5xl">01</span>
            <span className="block mt-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">FLAGSHIP FESTIVAL</span>
          </div>
          <div className="p-4 border-l border-border/40">
            <span className="font-sans text-4xl font-bold text-foreground sm:text-5xl">02</span>
            <span className="block mt-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">INTENSIVE DAYS</span>
          </div>
          <div className="p-4 border-l border-border/40">
            <span className="font-sans text-4xl font-bold text-primary sm:text-5xl">08+</span>
            <span className="block mt-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">EXPERIENCES & ARENAS</span>
          </div>
          <div className="p-4 border-l border-border/40">
            <span className="font-sans text-4xl font-bold text-foreground sm:text-5xl">∞</span>
            <span className="block mt-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">POSSIBILITIES</span>
          </div>
        </div>

        {/* 5. Cybersecurity Philosophy */}
        <div className="mt-24 text-center border-y border-purple-500/20 bg-purple-950/10 py-12 backdrop-blur-xs rounded-xl">
          <span className="font-mono text-xs font-bold tracking-[0.3em] text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]">
            OUR PHILOSOPHY
          </span>
          <div className="mt-6 flex items-center justify-center flex-wrap md:flex-nowrap whitespace-nowrap gap-3 sm:gap-5 md:gap-8 lg:gap-10 font-sans text-[clamp(1.8rem,4.2vw,4.5rem)] font-extrabold tracking-tight">
            <span className="text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">THINK</span>
            <span className="text-purple-400 font-bold drop-shadow-[0_0_18px_rgba(168,85,247,0.8)]">•</span>
            <span className="text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">BUILD</span>
            <span className="text-purple-400 font-bold drop-shadow-[0_0_18px_rgba(168,85,247,0.8)]">•</span>
            <span className="text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">BREAK</span>
            <span className="text-purple-400 font-bold drop-shadow-[0_0_18px_rgba(168,85,247,0.8)]">•</span>
            <span className="text-purple-400 drop-shadow-[0_0_25px_rgba(168,85,247,0.9)] drop-shadow-[0_0_50px_rgba(168,85,247,0.4)]">
              DEFEND
            </span>
          </div>
        </div>

        {/* 6. PROTECTED ARENAS SECTION — Embedded directly without modifying its code */}
        <div className="mt-24 border-t border-border/60 pt-12">
          <ArenasSection />
        </div>

        {/* 7. Ecosystem Navigation */}
        <div className="mt-24 border-t border-border/60 pt-16">
          <span className="font-mono text-xs tracking-[0.25em] text-primary">NAVIGATE THE FESTIVAL</span>
          <h2 className="mt-2 font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            THE CARNIVAL ECOSYSTEM
          </h2>

          <div className="mt-8 flex flex-col divide-y divide-border/60 border-y border-border/60">
            {[
              { num: '01', title: 'EVENTS', desc: 'Competitions, CTFs, bug bounty, and technical challenges.', href: '/events' },
              { num: '02', title: 'WORKSHOPS', desc: 'Hands-on guided deep-dives led by industry practitioners.', href: '/workshops' },
              { num: '03', title: 'SCHEDULE', desc: 'Interactive mission timeline and scheduled slots.', href: '/schedule' },
              { num: '04', title: 'SPEAKERS', desc: 'Meet the security leaders and keynote researchers.', href: '/speakers' },
              { num: '05', title: 'ARENAS', desc: 'Explore all CyberCarnival challenge experience zones.', href: '/#events' },
            ].map((item) => (
              <Link
                key={item.num}
                href={item.href}
                className="group flex flex-wrap items-center justify-between gap-4 py-6 transition-all hover:pl-4 hover:bg-primary/5"
              >
                <div className="flex items-center gap-6">
                  <span className="font-mono text-xs text-primary font-bold">{item.num}</span>
                  <div>
                    <h3 className="font-sans text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                      {item.desc}
                    </p>
                  </div>
                </div>
                <span className="font-sans text-2xl text-muted-foreground transition-transform group-hover:translate-x-2 group-hover:text-primary">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* 8. Values Section */}
        <div className="mt-24">
          <span className="font-mono text-xs tracking-[0.25em] text-primary">WHAT WE VALUE</span>
          <h2 className="mt-2 font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            CORE PRINCIPLES
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-border/80 bg-card/40 p-6 rounded-[10px]">
              <h3 className="font-mono text-sm font-bold text-primary tracking-[0.15em]">CURIOSITY</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Keep questioning assumptions and probing edge cases.</p>
            </div>
            <div className="border border-border/80 bg-card/40 p-6 rounded-[10px]">
              <h3 className="font-mono text-sm font-bold text-primary tracking-[0.15em]">CRAFT</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Build robust tooling and execute defenses with discipline.</p>
            </div>
            <div className="border border-border/80 bg-card/40 p-6 rounded-[10px]">
              <h3 className="font-mono text-sm font-bold text-primary tracking-[0.15em]">COLLABORATION</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Share threat intelligence and learn together across domains.</p>
            </div>
            <div className="border border-border/80 bg-card/40 p-6 rounded-[10px]">
              <h3 className="font-mono text-sm font-bold text-primary tracking-[0.15em]">RESPONSIBILITY</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Apply offensive knowledge ethically to protect infrastructure.</p>
            </div>
          </div>
        </div>

        {/* 9. Final CTA */}
        <div className="mt-32 border-t border-border/60 pt-16 text-center">
          <p className="font-mono text-xs tracking-[0.3em] text-primary">CYBERCARNIVAL 2026</p>
          <h2 className="mt-3 font-sans text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            ENTER THE CARNIVAL
          </h2>
          <p className="mt-3 max-w-md mx-auto text-sm text-muted-foreground">
            Explore the competitions, workshops, speakers, and experiences waiting inside CyberCarnival.
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

        {/* 10. Help & Contact Section */}
        <section
          aria-labelledby="help-contact-heading"
          className="mt-24 sm:mt-32 border-t border-purple-500/20 pt-12 sm:pt-16 w-full max-w-full"
        >
          <div className="flex flex-col items-center justify-between gap-6 sm:gap-8 rounded-xl border border-purple-500/20 bg-purple-950/10 p-5 sm:p-8 md:p-12 backdrop-blur-xs md:flex-row md:text-left text-center w-full max-w-full box-border">
            <div className="max-w-xl w-full">
              <span className="font-mono text-xs font-bold tracking-[0.3em] text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]">
                SUPPORT
              </span>
              <h2
                id="help-contact-heading"
                className="mt-2 font-display text-xl sm:text-3xl font-bold tracking-tight text-foreground"
              >
                HELP &amp; CONTACT
              </h2>
              <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm leading-relaxed text-muted-foreground font-mono">
                Need help with registration, events, or anything related to Cyber Carnival?
              </p>
            </div>

            <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-auto max-w-full">
              <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                OFFICIAL SUPPORT EMAIL
              </span>
              <a
                href={`mailto:${HELP_EMAIL}`}
                aria-label={`Send email to ${HELP_EMAIL}`}
                className="inline-flex items-center justify-center gap-2.5 sm:gap-3 rounded-md border border-purple-500/40 bg-card/60 px-3.5 sm:px-6 py-3 sm:py-3.5 font-mono text-[11px] sm:text-sm font-bold tracking-wider text-purple-400 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.15)] transition-all hover:border-purple-400 hover:bg-purple-500/10 hover:text-white hover:shadow-[0_0_30px_rgba(168,85,247,0.35)] w-full sm:w-auto max-w-full min-w-0"
              >
                <svg
                  className="h-4 w-4 shrink-0 text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className="break-all sm:break-normal">{HELP_EMAIL}</span>
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
