import { Reveal } from './reveal'

const STATS = [
  { value: '500+', label: 'PARTICIPANTS' },
  { value: '10+', label: 'EVENTS' },
  { value: '01', label: 'CYBERSECURITY SYMPOSIUM' },
]

export function Stats() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-32 lg:px-10 lg:py-48">
      <div className="flex flex-col gap-24 lg:gap-32">
        {STATS.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 100}>
            <div
              className={`flex flex-col gap-2 ${
                i % 2 === 1 ? 'lg:items-end lg:text-right' : ''
              }`}
            >
              <span className="font-display text-[clamp(5rem,18vw,16rem)] font-bold leading-[0.8] tracking-tight text-foreground">
                {stat.value}
              </span>
              <span className="font-mono text-[11px] tracking-[0.35em] text-primary">
                {stat.label}
              </span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
