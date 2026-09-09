import { Suspense } from 'react'
import { ScheduleClient } from './schedule-client'

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <ScheduleClient />
    </Suspense>
  )
}
