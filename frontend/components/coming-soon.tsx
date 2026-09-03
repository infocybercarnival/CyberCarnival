import Link from 'next/link'
import { Navbar } from '@/components/navbar'

export function ComingSoon({ label }: { label: string }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-start justify-center px-6 lg:px-10">
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary">{label}</p>
        <h1 className="mt-6 font-sans text-[clamp(2.5rem,8vw,6rem)] font-bold leading-none tracking-tight text-foreground">
          COMING SOON
        </h1>
        <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
          This section is being built. Check back soon — or head back to explore the rest of CyberCarnival.
        </p>
        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 border border-primary/60 px-5 py-3 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground"
        >
          ← BACK TO HOME
        </Link>
      </main>
    </>
  )
}
