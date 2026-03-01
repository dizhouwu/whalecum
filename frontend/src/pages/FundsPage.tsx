import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface Fund {
  name: string
  cik: string
  latest_13f_accession: string | null
  latest_report_date: string | null
}

export default function FundsPage() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/funds')
      .then((r) => r.json())
      .then((data) => {
        setFunds(data.funds || [])
      })
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
      <p className="text-[var(--muted)] text-sm mb-8">
        Your fund list (edit backend/funds.json). Cross-section: same quarter across funds. Time-series: 5 quarters per fund, double-downs & exits.
      </p>
      <div className="grid gap-4">
        {funds.map((fund) => (
          <Link
            key={fund.cik}
            to={`/funds/${fund.cik}`}
            className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)]/50 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">{fund.name}</h2>
                <p className="text-[var(--muted)] text-sm">CIK: {fund.cik}</p>
              </div>
              <div className="text-right">
                <span className="text-[var(--accent)] text-sm">
                  {fund.latest_report_date || '—'}
                </span>
                <p className="text-[var(--muted)] text-xs">Latest report</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
