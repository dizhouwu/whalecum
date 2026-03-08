import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line } from 'recharts'

interface Holding {
  name: string
  cusip?: string
  value: number
  shares: number
  prev_value?: number
  prev_shares?: number
  value_change?: number
  shares_change?: number
  value_pct_change?: number
  value_5q_ago?: number
  value_change_5q?: number
  quarters_added?: number
}

interface QuarterRow {
  report_date: string
  total_value: number
  concentration_pct_top5?: number
  concentration_pct_top10?: number
  holdings: Holding[]
}

interface ChangesData {
  fund: string
  cik: string
  latest_report_date: string
  prev_report_date: string
  double_downs: Holding[]
  trims?: Holding[]
  new_entries: Holding[]
  exits: Holding[]
  exits_from_5q: Holding[]
  stalwarts?: Holding[]
  fading?: Holding[]
  new_in_5q?: Holding[]
  high_conviction?: Holding[]
}

interface HoldingsResponse {
  fund: string
  report_date: string
  total_value: number
  concentration_pct_top5?: number
  concentration_pct_top10?: number
  holdings: Holding[]
}

const formatValue = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const formatShort = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)

export default function FundDetailPage() {
  const { cik } = useParams()
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null)
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
        <section className="space-y-6">
          <p className="text-[var(--muted)] text-sm">
            Report date: {holdings.report_date} · Portfolio value: {formatValue(holdings.total_value)}
            {holdings.concentration_pct_top5 != null && (
              <> · Top 5: {holdings.concentration_pct_top5}% · Top 10: {holdings.concentration_pct_top10 ?? '—'}%</>
            )}
          </p>
          {holdings.holdings.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/30">
              <h3 className="text-sm font-medium text-[var(--muted)] mb-3">Top 10 concentration (% of portfolio)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={holdings.holdings.slice(0, 10).map((h) => ({
                      name: h.name.length > 18 ? h.name.slice(0, 17) + '…' : h.name,
                      pct: holdings.total_value ? (100 * h.value) / holdings.total_value : 0,
                    }))}
                    layout="vertical"
                    margin={{ left: 8, right: 24 }}
                  >
                    <XAxis type="number" domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${Number(v).toFixed(1)}%`, '']} />
                    <Bar dataKey="pct" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
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
        <section className="space-y-6">
          <p className="text-[var(--muted)] text-sm">Last 5 quarters (time-series)</p>
          {history.quarters.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/30">
              <h3 className="text-sm font-medium text-[var(--muted)] mb-3">Portfolio value over time</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={[...history.quarters].reverse().map((q) => ({ quarter: q.report_date, value: q.total_value }))}
                    margin={{ top: 8, right: 24, left: 8 }}
                  >
                    <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatShort(v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [formatValue(v), 'Value']} />
                    <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="space-y-6">
            {history.quarters.map((q, i) => (
              <div key={i} className="rounded-lg border border-[var(--border)] overflow-hidden">
                <div className="bg-[var(--surface)] px-4 py-2 flex justify-between items-center flex-wrap gap-2">
                  <span className="font-medium">{q.report_date}</span>
                  <span className="font-mono text-[var(--accent)]">{formatValue(q.total_value)}</span>
                  {q.concentration_pct_top5 != null && (
                    <span className="text-xs text-[var(--muted)]">Top 5: {q.concentration_pct_top5}% · Top 10: {q.concentration_pct_top10 ?? '—'}%</span>
                  )}
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
            <p className="text-[var(--muted)] text-xs mb-2">Positions the fund increased vs previous quarter — sorted by $ added</p>
            {changes.double_downs.length === 0 ? (
              <p className="text-[var(--muted)] text-sm">None</p>
            ) : (
              <>
                {changes.double_downs.length > 0 && (
                  <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/30 mb-4">
                    <h3 className="text-sm font-medium text-[var(--muted)] mb-2">$ added (top 12)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={changes.double_downs.slice(0, 12).map((h) => ({
                            name: h.name.length > 14 ? h.name.slice(0, 13) + '…' : h.name,
                            change: h.value_change ?? 0,
                          }))}
                          margin={{ bottom: 8, right: 24 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v) => formatShort(v)} />
                          <Tooltip formatter={(v: number) => [formatValue(v), 'Added']} />
                          <Bar dataKey="change" fill="var(--success)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                        <th className="text-left py-2 px-4">Issuer</th>
                        <th className="text-right py-2 px-4">Value</th>
                        <th className="text-right py-2 px-4">$ Change</th>
                        <th className="text-right py-2 px-4">%</th>
                        <th className="text-right py-2 px-4">Shares Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.double_downs.map((h, i) => (
                        <tr key={i} className="border-b border-[var(--border)]/50">
                          <td className="py-2 px-4">{h.name}</td>
                          <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                          <td className="text-right py-2 px-4 font-mono text-[var(--success)]">+{formatValue(h.value_change ?? 0)}</td>
                          <td className="text-right py-2 px-4 font-mono text-[var(--success)]">{h.value_pct_change != null ? `+${h.value_pct_change}%` : '—'}</td>
                          <td className="text-right py-2 px-4 font-mono">+{(h.shares_change ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
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

          {(changes.trims?.length ?? 0) > 0 && (
            <div>
              <h3 className="font-semibold text-[var(--accent)] mb-2">Trims (reduced)</h3>
              <p className="text-[var(--muted)] text-xs mb-2">Positions the fund reduced vs previous quarter</p>
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-right py-2 px-4">Value</th>
                      <th className="text-right py-2 px-4">$ Change</th>
                      <th className="text-right py-2 px-4">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.trims!.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                        <td className="text-right py-2 px-4 font-mono text-red-400/90">{formatValue(h.value_change ?? 0)}</td>
                        <td className="text-right py-2 px-4 font-mono text-red-400/90">{h.value_pct_change != null ? `${h.value_pct_change}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-[var(--accent)] mb-2">Exits (vs prev quarter)</h3>
            <p className="text-[var(--muted)] text-xs mb-2">Positions closed since last quarter — sorted by value when held</p>
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

          {(changes.high_conviction?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/20">
              <h3 className="font-semibold text-[var(--accent)] mb-2">High conviction</h3>
              <p className="text-[var(--muted)] text-xs mb-3">Positions the manager kept adding to in the same direction across 2+ consecutive quarters</p>
              <div className="rounded border border-[var(--border)]/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]/50">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-right py-2 px-4">Value</th>
                      <th className="text-right py-2 px-4">Quarters added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.high_conviction!.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                        <td className="text-right py-2 px-4 font-mono text-[var(--accent)]">{h.quarters_added ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(changes.high_conviction?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/20">
              <h3 className="font-semibold text-[var(--accent)] mb-2">High conviction</h3>
              <p className="text-[var(--muted)] text-xs mb-3">Positions the manager kept adding to in the same direction across 2+ consecutive quarters</p>
              <div className="rounded border border-[var(--border)]/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]/50">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-right py-2 px-4">Value</th>
                      <th className="text-right py-2 px-4">Quarters added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.high_conviction!.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                        <td className="text-right py-2 px-4 font-mono text-[var(--accent)]">{h.quarters_added ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {((changes.stalwarts?.length ?? 0) > 0 || (changes.fading?.length ?? 0) > 0 || (changes.new_in_5q?.length ?? 0) > 0) && (
            <div className="space-y-6 rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/20">
              <h3 className="font-semibold text-[var(--accent)]">5-quarter view</h3>
              {(changes.stalwarts?.length ?? 0) > 0 && (
                <div>
                  <p className="text-sm font-medium text-[var(--muted)] mb-1">Stalwarts — held 5q and still adding</p>
                  <div className="rounded border border-[var(--border)]/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface)]/50">
                          <th className="text-left py-2 px-4">Issuer</th>
                          <th className="text-right py-2 px-4">Value</th>
                          <th className="text-right py-2 px-4">Δ vs 5q ago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.stalwarts!.map((h, i) => (
                          <tr key={i} className="border-b border-[var(--border)]/50">
                            <td className="py-2 px-4">{h.name}</td>
                            <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                            <td className="text-right py-2 px-4 font-mono text-[var(--success)]">+{formatValue(h.value_change_5q ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {(changes.fading?.length ?? 0) > 0 && (
                <div>
                  <p className="text-sm font-medium text-[var(--muted)] mb-1">Fading — held 5q but reducing</p>
                  <div className="rounded border border-[var(--border)]/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface)]/50">
                          <th className="text-left py-2 px-4">Issuer</th>
                          <th className="text-right py-2 px-4">Value</th>
                          <th className="text-right py-2 px-4">Δ vs 5q ago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.fading!.map((h, i) => (
                          <tr key={i} className="border-b border-[var(--border)]/50">
                            <td className="py-2 px-4">{h.name}</td>
                            <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                            <td className="text-right py-2 px-4 font-mono text-red-400/90">{formatValue(h.value_change_5q ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {(changes.new_in_5q?.length ?? 0) > 0 && (
                <div>
                  <p className="text-sm font-medium text-[var(--muted)] mb-1">New in 5q — first appearance in 5-quarter window</p>
                  <div className="rounded border border-[var(--border)]/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface)]/50">
                          <th className="text-left py-2 px-4">Issuer</th>
                          <th className="text-right py-2 px-4">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.new_in_5q!.map((h, i) => (
                          <tr key={i} className="border-b border-[var(--border)]/50">
                            <td className="py-2 px-4">{h.name}</td>
                            <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
