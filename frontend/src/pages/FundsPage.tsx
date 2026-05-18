import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FilingLagBadge from '../components/FilingLagBadge'

interface Fund {
  name: string
  cik: string
  style?: string
  latest_report_date: string | null
  filing_date?: string | null
  filing_lag_days?: number | null
  filing_stale_warning?: boolean
}

export default function FundsPage() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/funds')
      .then((r) => r.json())
      .then((data) => setFunds(data.funds || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-[var(--muted)]">Loading funds...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400">
        Error: {error}. Make sure the backend is running on port 8000.
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display font-bold text-2xl mb-2">Hedge Funds</h1>
      <p className="text-[var(--muted)] text-sm mb-8 max-w-xl">
        Edit <code className="text-[var(--accent)]">backend/funds.json</code> to track managers. 8-quarter
        history, share-driven signals, and ranked ideas on Insights.
      </p>
      <div className="grid gap-4">
        {funds.map((fund) => (
          <Link
            key={fund.cik}
            to={`/funds/${fund.cik}`}
            className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)]/50 transition"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-semibold text-lg">{fund.name}</h2>
                <p className="text-[var(--muted)] text-sm">CIK {fund.cik}</p>
                {fund.style && (
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">
                    {fund.style.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div className="text-right space-y-2">
                <FilingLagBadge
                  reportDate={fund.latest_report_date}
                  filingDate={fund.filing_date}
                  lagDays={fund.filing_lag_days}
                  stale={fund.filing_stale_warning}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
