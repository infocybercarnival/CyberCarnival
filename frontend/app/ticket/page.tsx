'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { fetchTicket, type Ticket, ApiValidationError } from '@/lib/api'

function TicketContent() {
  const params = useSearchParams()
  const id = params.get('id')

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      setError('No ticket ID in this link.')
      setLoading(false)
      return
    }
    fetchTicket(id)
      .then(setTicket)
      .catch((err) => setError(err instanceof ApiValidationError ? err.message : 'Could not load this ticket.'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-32">
      {loading && (
        <p className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground">LOADING…</p>
      )}

      {!loading && error && (
        <div>
          <p className="font-mono text-[11px] tracking-[0.3em] text-destructive">TICKET NOT FOUND</p>
          <h1 className="mt-4 font-sans text-3xl font-bold text-foreground">{error}</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Double check the link, or check your dashboard for your registered events.
          </p>
        </div>
      )}

      {!loading && ticket && (
        <div>
          <p className="font-mono text-[11px] tracking-[0.3em] text-primary">
            {ticket.status === 'confirmed' ? 'YOU ARE REGISTERED' : `STATUS: ${ticket.status.toUpperCase()}`}
          </p>
          <h1 className="mt-4 font-sans text-3xl font-bold leading-tight text-foreground">
            {ticket.event_name}
          </h1>

          <div className="mt-8 flex flex-col gap-4 border border-border bg-card p-5">
            {ticket.team_name && (
              <Row label="Team" value={ticket.team_name} />
            )}
            {(ticket.date || ticket.time) && (
              <Row label="Date" value={[ticket.date, ticket.time].filter(Boolean).join(' · ')} />
            )}
            {ticket.venue && <Row label="Venue" value={ticket.venue} />}
          </div>

          {ticket.members.length > 0 && (
            <div className="mt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Team roster</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ticket.members.map((m) => (
                  <span key={m.name} className="border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {m.name}{m.is_leader ? ' (leader)' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}

export default function TicketPage() {
  return (
    <>
      <Navbar />
      <Suspense fallback={null}>
        <TicketContent />
      </Suspense>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  )
}
