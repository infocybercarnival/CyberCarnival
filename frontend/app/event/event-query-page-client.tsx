'use client'

import { useSearchParams } from 'next/navigation'
import { EventDetailClient } from './event-detail-client'

export function EventQueryPageClient() {
  const searchParams = useSearchParams()
  const eventId = searchParams.get('eventId') || ''

  return <EventDetailClient eventId={eventId} />
}
