'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { fetchMe, logout, type PublicUser } from '@/lib/api'
import { usePathname } from 'next/navigation'

const LINKS = [
  { label: 'HOME', href: '/#home' },
  { label: 'EVENTS', href: '/events' },
  { label: 'SCHEDULE', href: '/schedule' },
  { label: 'WORKSHOPS', href: '/workshops' },
  { label: 'SPEAKERS', href: '/speakers' },
  { label: 'PORTFOLIO', href: 'https://portfolio.cybercarnival.in/', external: true },
  { label: 'ABOUT', href: '/about' },
  { label: 'MY EVENTS', href: '/dashboard' },
]

export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<PublicUser | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    fetchMe().then(setUser).catch(() => setUser(null))
  }, [])

  // close the account dropdown on an outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleLogout() {
    await logout()
    setUser(null)
    setAccountMenuOpen(false)
    setOpen(false)
    router.push('/')
  }

  const displayName = user?.full_name || user?.username || ''

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled
          ? 'bg-background/80 backdrop-blur-md border-b border-border'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10"
      >
        <Link href="/#home" className="group relative flex items-center" aria-label="CyberCarnival — home">
          <div className="relative overflow-hidden rounded-sm transition-transform duration-500 hover:scale-[1.04] animate-logo-entrance">
            <Image
              src="/assets/branding/cybercarnival-logo-no-bg.png"
              alt="CyberCarnival"
              width={160}
              height={89}
              priority
              className="h-11 w-auto lg:h-14 animate-logo-float transition-all duration-500 group-hover:brightness-110 group-hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.85)]"
            />
            {/* Subtle diagonal light sweep highlight on hover */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-[sheen-sweep_1.2s_ease-in-out]"
            />
          </div>
        </Link>

        <ul className="hidden items-center gap-6 xl:gap-8 lg:flex">
          {LINKS.map((link) => {
            const isActive = !link.external && pathname === link.href
            return (
              <li key={link.label}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    className={`font-mono text-[11px] tracking-[0.2em] transition-colors ${
                      isActive ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-4">
          {user ? (
            <div ref={accountMenuRef} className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-expanded={accountMenuOpen}
                className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {displayName} <span aria-hidden="true">▾</span>
              </button>
              {accountMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 border border-border bg-background/95 backdrop-blur-md">
                  <Link
                    href="/dashboard"
                    onClick={() => setAccountMenuOpen(false)}
                    className="block px-4 py-3 font-mono text-[11px] tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    MY EVENTS
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-3 text-left font-mono text-[11px] tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    LOG OUT
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden font-mono text-[11px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
            >
              LOGIN
            </Link>
          )}

          <Link
            href="/register"
            className="hidden items-center gap-2 border border-primary/60 px-5 py-2 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground lg:inline-flex"
          >
            REGISTER <span aria-hidden="true">→</span>
          </Link>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Toggle menu"
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
          >
            <span
              className={`h-px w-6 bg-foreground transition-transform ${open ? 'translate-y-[3.5px] rotate-45' : ''}`}
            />
            <span
              className={`h-px w-6 bg-foreground transition-transform ${open ? '-translate-y-[3.5px] -rotate-45' : ''}`}
            />
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-border bg-background/95 backdrop-blur-md lg:hidden">
          <ul className="flex flex-col px-6 py-6">
            {LINKS.map((link) => (
              <li key={link.label}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="block py-3 font-mono text-sm tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block py-3 font-mono text-sm tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
            <li className="pt-4">
              {user ? (
                <>
                  <p className="py-3 font-mono text-sm tracking-[0.2em] text-foreground">{displayName}</p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block py-3 font-mono text-sm tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    LOG OUT
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block py-3 font-mono text-sm tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  LOGIN
                </Link>
              )}
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex items-center gap-2 border border-primary/60 px-5 py-3 font-mono text-xs tracking-[0.2em] text-foreground"
              >
                REGISTER <span aria-hidden="true">→</span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  )
}
