import { Suspense } from 'react'
import { AboutClient } from './about-client'

export default function AboutPage() {
  return (
    <Suspense fallback={null}>
      <AboutClient />
    </Suspense>
  )
}
