import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

interface Holding {
  name: string
  cusip?: string
  value: number
  shares: number
  prev_value?: number
  prev_shares?: number
  value_change?: number
  shares_change?: number
}

interface QuarterRow {
  report_date: string
  total_value: number
  holdings: Holding[]
}

interface ChangesData {
  fund: string
  cik: string
  latest_report_date: string
  prev_report_date: string
  double_downs: Holding[]
  new_entries: Holding[]
  exits: Holding[]
  exits_from_5q: Holding[]
}

const formatValue = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export default function FundDetailPage() {
  const { cik } = useParams()
  const [holdings, setHoldings] = useState<{ fund: string; report_date: string; total_value: number; holdings: Holding[] } | null>(null)
  const [history, setHistory] = useState<{ fund: string; quarters: QuarterRow[] } | null>(null)
  const [changes, setChanges] = useState<ChangesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'holdings' | 'history' | 'changes'>('holdings')

  useEffect(() => {
    if (!cik) return
    setLoading(true)
    Promise.all([
      fetch(`/api/holdings/${cik}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/funds/${cik}/history?quarters=5`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/funds/${cik}/changes`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([h, hist, ch]) => {
        setHoldings(h)
        setHistory(hist)
        setChanges(ch)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [cik])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-[var(--muted)]">Loading...</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400">
        {error}
      </div>
    )
  }

  const name = holdings?.fund || history?.fund || changes?.fund || 'Fund'

  return (
    <div>
      <Link to="/" className="text-[var(--muted)] text-sm hover:text-[var(--accent)] mb-4 inline-block">
        ← Funds
      </Link>
      <h1 className="font-display font-bold text-2xl mb-2">{name}</h1>
      <p className="text-[var(--muted)] text-sm mb-6">
        Cross-section: latest quarter. Time-series: 5 quarters, double-downs & exits.
      </p>

      <div className="flex gap-2 border-b border-[var(--border)] mb-6">
        {(['holdings', 'history', 'changes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition ${
              activeTab === tab
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'holdings' && holdings && (
        <section>
          <p className="text-[var(--muted)] text-sm mb-2">
            Report date: {holdings.report_date} · Portfolio value: {formatValue(holdings.total_value)}
          </p>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="text-left py-3 px-4 font-medium">Issuer</th>
                  <th className="text-right py-3 px-4 font-medium">Value</th>
                  <th className="text-right py-3 px-4 font-medium">Shares</th>
                </tr>
              </thead>
              <tbody>
                {holdings.holdings.map((h, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/50">
                    <td className="py-3 px-4">{h.name}</td>
                    <td className="text-right py-3 px-4 font-mono">{formatValue(h.value)}</td>
                    <td className="text-right py-3 px-4 font-mono">{h.shares.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'history' && history && (
        <section>
          <p className="text-[var(--muted)] text-sm mb-4">Last 5 quarters (time-series)</p>
          <div className="space-y-6">
            {history.quarters.map((q, i) => (
              <div key={i} className="rounded-lg border border-[var(--border)] overflow-hidden">
                <div className="bg-[var(--surface)] px-4 py-2 flex justify-between items-center">
                  <span className="font-medium">{q.report_date}</span>
                  <span className="font-mono text-[var(--accent)]">{formatValue(q.total_value)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-2 px-4 font-medium text-[var(--muted)]">Issuer</th>
                      <th className="text-right py-2 px-4 font-medium text-[var(--muted)]">Value</th>
                      <th className="text-right py-2 px-4 font-medium text-[var(--muted)]">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.holdings.slice(0, 15).map((h, j) => (
                      <tr key={j} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                        <td className="text-right py-2 px-4 font-mono">{h.shares.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {q.holdings.length > 15 && (
                  <p className="text-[var(--muted)] text-xs px-4 py-2">+{q.holdings.length - 15} more</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'changes' && changes && (
        <section className="space-y-8">
          <p className="text-[var(--muted)] text-sm">
            Latest: {changes.latest_report_date} vs prev: {changes.prev_report_date}
          </p>

          <div>
            <h3 className="font-semibold text-[var(--accent)] mb-2">Double-downs (added to)</h3>
            <p className="text-[var(--muted)] text-xs mb-2">Positions the fund increased vs previous quarter</p>
            {changes.double_downs.length === 0 ? (
              <p className="text-[var(--muted)] text-sm">None</p>
            ) : (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-right py-2 px-4">Value</th>
                      <th className="text-right py-2 px-4">Change</th>
                      <th className="text-right py-2 px-4">Shares Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.double_downs.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                        <td className="text-right py-2 px-4 font-mono text-[var(--success)]">
                          +{formatValue(h.value_change ?? 0)}
                        </td>
                        <td className="text-right py-2 px-4 font-mono">+{(h.shares_change ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-[var(--accent)] mb-2">New entries</h3>
            <p className="text-[var(--muted)] text-xs mb-2">Positions opened this quarter</p>
            {changes.new_entries.length === 0 ? (
              <p className="text-[var(--muted)] text-sm">None</p>
            ) : (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-right py-2 px-4">Value</th>
                      <th className="text-right py-2 px-4">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.new_entries.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                        <td className="text-right py-2 px-4 font-mono">{h.shares.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-[var(--accent)] mb-2">Exits (vs prev quarter)</h3>
            <p className="text-[var(--muted)] text-xs mb-2">Positions closed since last quarter</p>
            {changes.exits.length === 0 ? (
              <p className="text-[var(--muted)] text-sm">None</p>
            ) : (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-right py-2 px-4">Value (when held)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.exits.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-[var(--accent)] mb-2">Exits from 5 quarters ago</h3>
            <p className="text-[var(--muted)] text-xs mb-2">Positions that were in the portfolio 5 quarters ago and are now closed (profit-taking or view change)</p>
            {!changes.exits_from_5q || changes.exits_from_5q.length === 0 ? (
              <p className="text-[var(--muted)] text-sm">None or data not available</p>
            ) : (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-right py-2 px-4">Value (when held)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.exits_from_5q.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
