import { Suspense } from 'react'
import { EventDetailClient } from './event-detail-client'

export function generateStaticParams() {
  return [
    { eventId: 'fb2393db-06d8-402b-8b33-c527edf1e88e' },
    { eventId: 'edbc917c-c125-4b7d-a2c7-6e8d830adcf7' },
    { eventId: 'a48cfd98-9c73-49cc-a21c-e4bb8b5167d8' },
    { eventId: '356ce45f-df7b-46e3-bdc7-5a8b60b22d60' },
    { eventId: 'd2342631-468b-41aa-af4a-438de969a143' },
    { eventId: 'd533da79-cdfe-4613-8e22-0f6dbc3b1d55' },
    { eventId: '5c56adab-d90b-4453-8606-d369d093a598' },
    { eventId: 'ee8bd226-4927-4744-8e8a-16f527491621' },
    { eventId: 'b53f2de8-21f2-4aff-b7f0-9bcee54fe559' },
    { eventId: '48fad75c-3c07-4239-a949-21aa6a397c6a' },
    { eventId: 'b3134714-7195-4109-a18f-fbbdee218f90' },
  ]
}

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    <Suspense fallback={null}>
      <EventDetailClient eventId={eventId} />
    </Suspense>
  )
}
