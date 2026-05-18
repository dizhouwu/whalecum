import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import FilingLagBadge from '../components/FilingLagBadge'
import HoldingTable, { HoldingRow } from '../components/HoldingTable'
import { formatValue } from '../lib/format'

interface HoldingsData {
  fund: string
  cik: string
  report_date: string
  filing_date?: string
  filing_lag_days?: number
  filing_stale_warning?: boolean
  total_value?: number
  concentration_pct_top5?: number
  concentration_pct_top10?: number
  holdings: HoldingRow[]
}

export default function HoldingsPage() {
  const { cik } = useParams()
  const [data, setData] = useState<{ holdings: HoldingsData[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = cik ? `/api/holdings/${cik}` : '/api/holdings'
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText)
        return r.json()
      })
      .then((res) => setData(cik ? { holdings: [res] } : res))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [cik])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-[var(--muted)]">Loading holdings...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400">
        {error || 'Failed to load holdings'}
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display font-bold text-2xl mb-2">13F Holdings</h1>
      <p className="text-[var(--muted)] text-sm mb-8">
        Latest quarter · click a name for cross-fund flow
      </p>
      {data.holdings.map((h) => (
        <div key={h.cik} className="mb-10">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-lg">{h.fund}</h2>
              <FilingLagBadge
                reportDate={h.report_date}
                filingDate={h.filing_date}
                lagDays={h.filing_lag_days}
                stale={h.filing_stale_warning}
              />
              {h.total_value != null && (
                <p className="text-[var(--muted)] text-sm mt-2">
                  Portfolio {formatValue(h.total_value)}
                  {h.concentration_pct_top5 != null && (
                    <> · Top 5 {h.concentration_pct_top5}% · Top 10 {h.concentration_pct_top10}%</>
                  )}
                </p>
              )}
            </div>
            {!cik && (
              <Link to={`/holdings/${h.cik}`} className="text-sm text-[var(--accent)] hover:underline">
                Details →
              </Link>
            )}
          </div>
          <HoldingTable rows={h.holdings} showWeight />
        </div>
      ))}
    </div>
  )
}
