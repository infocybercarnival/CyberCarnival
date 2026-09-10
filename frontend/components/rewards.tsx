'use client'

import { Key, ShieldCheck, Gift, Award } from 'lucide-react'
import { Reveal } from './reveal'

const REWARDS = [
  {
    id: 'security-keys',
    highlight: '1200+',
    title: '1200+ Security Keys',
    description: 'Security resources and benefits for CyberCarnival participants.',
    icon: Key,
    badge: 'EVERY PARTICIPANT',
  },
  {
    id: 'antivirus',
    highlight: 'ALL',
    title: 'Antivirus for All Participants',
    description: 'Security and antivirus benefits available for every participant.',
    icon: ShieldCheck,
    badge: 'GUARANTEED BENEFIT',
  },
  {
    id: 'gift-boxes',
    highlight: '1ST PLACE',
    title: 'Gift Boxes for 1st Place Winners',
    description: 'Gift boxes for all first-place winners across technical events.',
    icon: Gift,
    badge: 'WINNER REWARD',
  },
  {
    id: 'vouchers',
    highlight: '₹5K',
    title: '₹5K Vouchers for Technical Champions',
    description: '₹5,000 vouchers for first-place winners in technical events.',
    icon: Award,
    badge: 'TECHNICAL CHAMPIONS',
  },
]

export function Rewards() {
  return (
    <section
      id="rewards"
      className="relative z-20 overflow-hidden border-b border-border/80 py-24 lg:py-36 bg-background/50"
    >
      {/* Ambient background purple glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[50vmin] w-[50vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]"
      />

      <div className="relative z-20 mx-auto max-w-7xl px-6 lg:px-10">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <p className="font-mono text-xs tracking-[0.3em] text-primary font-bold">
              04 / REWARDS & BENEFITS
            </p>
          </Reveal>

          <Reveal delay={100}>
            <h2 className="mt-4 font-display text-[clamp(2.2rem,4vw,3.8rem)] font-extrabold leading-none tracking-tight text-foreground uppercase">
              REWARDS & PARTICIPANT BENEFITS
            </h2>
          </Reveal>

          <Reveal delay={150}>
            <p className="mt-4 max-w-2xl font-mono text-xs sm:text-sm tracking-[0.08em] text-muted-foreground leading-relaxed">
              More than just a competition — CyberCarnival rewards participation, innovation, and excellence.
            </p>
          </Reveal>
        </div>

        {/* Rewards Cards Grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {REWARDS.map((item, index) => {
            const Icon = item.icon
            return (
              <Reveal key={item.id} delay={200 + index * 100}>
                <div className="group relative flex h-full flex-col justify-between rounded-[12px] border border-primary/30 bg-card/60 p-6 sm:p-7 backdrop-blur-md shadow-[0_0_25px_rgba(168,85,247,0.08)] transition-all duration-300 hover:border-primary hover:bg-card/80 hover:shadow-[0_0_35px_rgba(168,85,247,0.22)] hover:-translate-y-1">
                  <div>
                    {/* Card Top Row: Badge & Icon */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-primary border border-primary/40 bg-primary/10 px-2.5 py-1 rounded-sm">
                        {item.badge}
                      </span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    {/* Prominent Value / Number */}
                    <div className="mt-6 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-primary transition-colors duration-300 group-hover:text-foreground">
                      {item.highlight}
                    </div>

                    {/* Title */}
                    <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-foreground">
                      {item.title}
                    </h3>

                    {/* Supporting Text */}
                    <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>

                  {/* Bottom Accent Line */}
                  <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span className="tracking-[0.15em] text-primary/80 group-hover:text-primary font-semibold transition-colors">
                      CYBERCARNIVAL 2026
                    </span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1 text-primary">
                      →
                    </span>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
