import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

interface Holding {
  name: string
  cusip?: string
  value: number
  shares: number
  title_of_class?: string
}

interface HoldingsData {
  fund: string
  cik: string
  report_date: string
  total_value?: number
  holdings: Holding[]
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
      .then((res) => {
        setData(cik ? { holdings: [res] } : res)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [cik])

  const formatValue = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(v)

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
        Latest quarter holdings from SEC filings
      </p>
      {data.holdings.map((h) => (
        <div key={h.cik} className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">
                {h.fund}
                <span className="text-[var(--muted)] font-normal ml-2">
                  ({h.report_date})
                </span>
              </h2>
              {h.total_value != null && (
                <p className="text-[var(--muted)] text-sm mt-1">
                  Portfolio value: {formatValue(h.total_value)}
                </p>
              )}
            </div>
            {!cik && (
              <Link
                to={`/holdings/${h.cik}`}
                className="text-sm text-[var(--accent)] hover:underline"
              >
                View details →
              </Link>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="text-left py-3 px-4 font-medium">Issuer</th>
                  <th className="text-right py-3 px-4 font-medium">Value</th>
                  <th className="text-right py-3 px-4 font-medium">Shares</th>
                </tr>
              </thead>
              <tbody>
                {h.holdings.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-[var(--muted)]">
                      No holdings found
                    </td>
                  </tr>
                ) : (
                  h.holdings.map((holding, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/50"
                    >
                      <td className="py-3 px-4">{holding.name}</td>
                      <td className="text-right py-3 px-4 font-mono">
                        {formatValue(holding.value)}
                      </td>
                      <td className="text-right py-3 px-4 font-mono">
                        {holding.shares.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
