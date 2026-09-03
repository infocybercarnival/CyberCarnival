import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Oxanium, JetBrains_Mono, Orbitron, Chakra_Petch } from 'next/font/google'
import dynamic from 'next/dynamic'
import './globals.css'
import { BackgroundField } from '@/components/background-field'

const EventPromoTicker = dynamic(
  () => import('@/components/event-promo-ticker').then((m) => m.EventPromoTicker),
)

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const oxanium = Oxanium({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-oxanium',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-orbitron',
  display: 'swap',
})

const chakraPetch = Chakra_Petch({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-chakra-petch',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CyberCarnival 2026 — SRM Ramapuram',
  description:
    'CyberCarnival 2026 — the cybersecurity symposium of SRM Ramapuram. Where cybersecurity meets innovation. 7-8 October 2026.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#151119',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`bg-background ${spaceGrotesk.variable} ${oxanium.variable} ${jetbrainsMono.variable} ${orbitron.variable} ${chakraPetch.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased font-sans">
        {/* Layer 2 Background Field (Stars, Nebulas & Spiders at z-10) */}
        <BackgroundField />

        {/* Layer 3 Foreground UI Stacking Context (z-20+) */}
        <div className="relative z-20 min-h-screen">
          {children}
        </div>

        {/* Global Floating Event Promo Ticker (Auto-hides on Home '/') */}
        <EventPromoTicker />

        <Analytics />
      </body>
    </html>
  )
}