import { Suspense } from 'react'
import { SpeakersClient } from './speakers-client'

export default function SpeakersPage() {
  return (
    <Suspense fallback={null}>
      <SpeakersClient />
    </Suspense>
  )
}
