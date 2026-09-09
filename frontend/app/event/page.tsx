import { Suspense } from 'react'
import { EventQueryPageClient } from './event-query-page-client'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EventQueryPageClient />
    </Suspense>
  )
}
