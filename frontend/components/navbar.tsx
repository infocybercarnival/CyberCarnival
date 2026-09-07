'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { fetchMe, logout, type PublicUser } from '@/lib/api'

const LINKS = [
  { label: 'HOME', href: '/#home' },
  { label: 'EVENTS', href: '/events' },
  { label: 'SCHEDULE', href: '/schedule' },
  { label: 'WORKSHOPS', href: '/workshops' },
  { label: 'SPEAKERS', href: '/speakers' },
  {
    label: 'PORTFOLIO',
    href: 'https://portfolio.cybercarnival.in/',
    external: true,
  },
  { label: 'ABOUT', href: '/about' },
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

    window.addEventListener('scroll', onScroll, {
      passive: true,
    })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  /*
   * Refresh current user whenever the route changes.
   *
   * This fixes the issue where a user logs in successfully,
   * navigates back to the website, but Navbar still shows
   * LOGIN / REGISTER because fetchMe() had only run once.
   */
  useEffect(() => {
    let active = true

    fetchMe()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser)
        }
      })
      .catch(() => {
        if (active) {
          setUser(null)
        }
      })

    return () => {
      active = false
    }
  }, [pathname])

  // Close account dropdown when clicking outside.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)

    return () => {
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // close mobile drawer on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // silent catch
    } finally {
      setUser(null)
      setAccountMenuOpen(false)
      setOpen(false)
      setLoggingOut(false)
      router.push('/login')
    }
  }


  const displayName = user?.full_name || user?.username || ''

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled
          ? 'bg-background/90 backdrop-blur-md border-b border-border'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5 lg:px-10"
      >
        {/* Logo */}
        <Link
          href="/#home"
          className="group relative flex items-center"
          aria-label="CyberCarnival — home"
        >
          <div className="relative overflow-hidden rounded-sm transition-transform duration-500 hover:scale-[1.04] animate-logo-entrance">
            <Image
              src="/assets/branding/cybercarnival-logo-no-bg.png"
              alt="CyberCarnival"
              width={160}
              height={89}
              priority
              className="h-10 w-auto sm:h-12 lg:h-14 animate-logo-float transition-all duration-500 group-hover:brightness-110 group-hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.85)]"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-[sheen-sweep_1.2s_ease-in-out]"
            />
          </div>
        </Link>

        {/* Desktop Navigation */}
        <ul className="hidden items-center gap-6 lg:flex xl:gap-8">
          {LINKS.map((link) => {
            const isActive =
              !link.external &&
              (
                pathname === link.href ||
                (link.href !== '/' &&
                  link.href !== '/#home' &&
                  pathname.startsWith(link.href))
              )

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
                      isActive
                        ? 'font-bold text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            )
          })}

          {/* Only logged-in users should see MY EVENTS */}
          {user && (
            <li>
              <Link
                href="/dashboard"
                className={`font-mono text-[11px] tracking-[0.2em] transition-colors ${
                  pathname === '/dashboard'
                    ? 'font-bold text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                MY EVENTS
              </Link>
            </li>
          )}
        </ul>

        <div className="flex items-center gap-3 sm:gap-4">
          {user ? (
            <div
              ref={accountMenuRef}
              className="relative hidden lg:block"
            >
              <button
                type="button"
                onClick={() =>
                  setAccountMenuOpen((value) => !value)
                }
                aria-expanded={accountMenuOpen}
                className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {displayName}{' '}
                <span aria-hidden="true">
                  ▾
                </span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 border border-border bg-background/95 backdrop-blur-md shadow-xl rounded-sm">
                  <Link
                    href="/dashboard"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex min-h-[44px] items-center px-4 py-2.5 font-mono text-[11px] tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground hover:bg-primary/10"
                  >
                    MY EVENTS
                  </Link>

                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={handleLogout}
                    className="flex min-h-[44px] w-full items-center px-4 py-2.5 text-left font-mono text-[11px] tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground hover:bg-primary/10 disabled:opacity-50"
                  >
                    {loggingOut ? 'LOGGING OUT…' : 'LOG OUT'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden font-mono text-[11px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
              >
                LOGIN
              </Link>

              <Link
                href="/register"
                className="hidden items-center gap-2 border border-primary/60 px-5 py-2 font-mono text-[11px] tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground lg:inline-flex"
              >
                REGISTER
                <span aria-hidden="true">
                  →
                </span>
              </Link>
            </>
          )}

          {/* Touch-friendly Hamburger Toggle Button (Minimum 44x44px target) */}
          <button
            type="button"
            onClick={() =>
              setOpen((value) => !value)
            }
            aria-expanded={open}
            aria-label="Toggle menu"
            className="flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-sm border border-border/60 bg-card/60 lg:hidden"
          >
            <span
              className={`h-0.5 w-5 bg-foreground transition-transform duration-300 ${open ? 'translate-y-[4px] rotate-45' : ''}`}
            />

            <span
              className={`h-0.5 w-5 bg-foreground transition-transform duration-300 ${open ? '-translate-y-[4px] -rotate-45' : ''}`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Overlay Backdrop */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 top-[65px] z-40 bg-background/80 backdrop-blur-sm transition-opacity lg:hidden"
        />
      )}

      {/* Mobile Drawer Slide Menu */}
      {open && (
        <div className="relative z-50 max-h-[calc(100vh-65px)] overflow-y-auto border-b border-border bg-background/95 px-4 py-6 backdrop-blur-md lg:hidden">
          <ul className="flex flex-col space-y-1">
            {LINKS.map((link) => {
              const isActive = !link.external && pathname === link.href
              return (
                <li key={link.label}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                      className="flex min-h-[44px] items-center rounded-sm px-4 py-2.5 font-mono text-xs tracking-[0.2em] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-[44px] items-center rounded-sm px-4 py-2.5 font-mono text-xs tracking-[0.2em] transition-colors ${
                        isActive
                          ? 'bg-primary/15 font-bold text-primary border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'
                      }`}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              )
            })}

            <li className="pt-4 border-t border-border/40">
              {user ? (
                <>
                  <div className="px-4 py-2 font-mono text-xs tracking-[0.15em] text-foreground font-bold">
                    {displayName}
                  </div>
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={handleLogout}
                    className="flex min-h-[44px] w-full items-center rounded-sm px-4 py-2.5 font-mono text-xs tracking-[0.2em] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {loggingOut ? 'LOGGING OUT…' : 'LOG OUT'}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex min-h-[44px] items-center rounded-sm px-4 py-2.5 font-mono text-xs tracking-[0.2em] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                  >
                    LOGIN
                  </Link>

                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="mt-3 flex min-h-[44px] items-center justify-center gap-2 border border-primary/60 bg-primary/20 px-5 py-3 font-mono text-xs tracking-[0.2em] text-foreground transition-all hover:bg-primary hover:text-primary-foreground rounded-sm"
                  >
                    REGISTER <span aria-hidden="true">→</span>
                  </Link>
                </>
              )}
            </li>
          </ul>
        </div>
      )}
    </header>
  )
}
