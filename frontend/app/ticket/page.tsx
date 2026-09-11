'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { fetchTicket, getApiUrl, type Ticket, ApiValidationError } from '@/lib/api'

function TicketContent() {
  const params = useSearchParams()
  const id = params.get('id')
  const token = params.get('token')

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 sm:px-6 py-28 sm:py-32">
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
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] tracking-[0.3em] text-primary">
              {ticket.status === 'confirmed' ? 'YOU ARE REGISTERED' : `STATUS: ${ticket.status.toUpperCase()}`}
            </p>
            {ticket.status === 'confirmed' && (
              <span className={`font-mono text-[10px] font-bold px-2 py-0.5 border rounded ${ticket.checked_in ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-primary/20 text-primary border-primary/40'}`}>
                {ticket.checked_in ? 'CHECKED IN ✓' : 'OFFICIAL TICKET'}
              </span>
            )}
          </div>
          <h1 className="mt-4 font-sans text-3xl font-bold leading-tight text-foreground">
            {ticket.event_name}
          </h1>

          {/* QR Code Section for Confirmed Ticket */}
          {ticket.status === 'confirmed' && (
            <div className="mt-6 flex flex-col items-center justify-center p-6 border border-primary/40 bg-card/80 rounded-[12px] shadow-[0_0_25px_rgba(168,85,247,0.15)]">
              <img
                src={`${getApiUrl()}/api/registrations/${ticket.registration_id}/qr${token ? `?token=${encodeURIComponent(token)}` : ''}`}
                alt={`${ticket.event_name} Admission QR Code`}
                className="h-48 w-48 rounded border border-border bg-white p-2 object-contain shadow-[0_0_20px_rgba(168,85,247,0.25)]"
              />
              <p className="mt-3 font-mono text-xs tracking-widest text-muted-foreground uppercase text-center font-bold">
                {ticket.checked_in ? '✓ ATTENDANCE MARKED' : 'SCAN AT VENUE FOR ENTRY'}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-4 border border-border bg-card p-5 rounded-[8px]">
            {ticket.team_name && (
              <Row label="Team" value={ticket.team_name} />
            )}
            {(ticket.date || ticket.time) && (
              <Row label="Date" value={[ticket.date, ticket.time].filter(Boolean).join(' · ')} />
            )}
            {ticket.venue && <Row label="Venue" value={ticket.venue} />}
            <Row label="Ticket ID" value={ticket.registration_id} />
          </div>

          {ticket.members.length > 0 && (
            <div className="mt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Team roster</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ticket.members.map((m) => (
                  <span key={m.name} className="border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground rounded-sm">
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
