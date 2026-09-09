import dynamic from 'next/dynamic'
import { Navbar } from '@/components/navbar'
import { Hero } from '@/components/hero'

const Intro = dynamic(() => import('@/components/intro').then((m) => m.Intro))
const Events = dynamic(() => import('@/components/events').then((m) => m.Events))
const FeaturedEvent = dynamic(() => import('@/components/featured-event').then((m) => m.FeaturedEvent))
const Stats = dynamic(() => import('@/components/stats').then((m) => m.Stats))
const FinalCta = dynamic(() => import('@/components/final-cta').then((m) => m.FinalCta))

export default function Page() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Intro />
        <Events />
        <FeaturedEvent />
        <Stats />
        <FinalCta />
      </main>
    </>
  )
}
