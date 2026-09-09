import { Suspense } from 'react'
import { PaymentClient } from './payment-client'

export default function PaymentPage() {
  return (
    <Suspense fallback={null}>
      <PaymentClient />
    </Suspense>
  )
}
