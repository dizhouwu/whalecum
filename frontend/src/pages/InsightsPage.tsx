import { useEffect, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

interface ConsensusHolding {
  name: string
  cusip?: string
  value: number
  shares: number
}

interface PopularHolding {
  name: string
  cusip?: string
  value: number
  shares: number
  funds_count: number
  funds: string[]
}

interface ChangeHolding {
  name: string
  value?: number
}

interface HighConvictionItem {
  name: string
  value: number
  quarters_added: number
  fund: string
}

interface InsightsChanges {
  consensus_add: ChangeHolding[]
  consensus_exit: ChangeHolding[]
  divergence: ChangeHolding[]
  high_conviction?: HighConvictionItem[]
  funds_count: number
  funds: string[]
}

export default function InsightsPage() {
  const [consensus, setConsensus] = useState<{
    consensus: ConsensusHolding[]
    funds_count: number
    funds: string[]
  } | null>(null)
  const [popular, setPopular] = useState<{
    popular: PopularHolding[]
    funds_count: number
  } | null>(null)
  const [insightsChanges, setInsightsChanges] = useState<InsightsChanges | null>(null)
  const [holdings, setHoldings] = useState<{ holdings: { fund: string; total_value: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/insights/consensus').then((r) => r.json()),
      fetch('/api/insights/popular').then((r) => r.json()),
      fetch('/api/insights/changes').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/holdings').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([c, p, ch, h]) => {
        setConsensus(c)
        setPopular(p)
        setInsightsChanges(ch)
        setHoldings(h)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const formatValue = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(v)
  const formatShort = (v: number) =>
    v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-[var(--muted)]">Loading insights...</div>
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

  return (
    <div>
      <h1 className="font-display font-bold text-2xl mb-2">Investment Insights</h1>
      <p className="text-[var(--muted)] text-sm mb-8">
        Consensus holdings, popular names, cross-fund change signals, and portfolio size
      </p>

      {holdings?.holdings?.length > 0 && (
        <section className="mb-10">
          <h2 className="font-semibold text-lg mb-2">Portfolio value by fund (latest 13F)</h2>
          <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/30 mb-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={holdings.holdings.map((f) => ({ fund: f.fund.length > 20 ? f.fund.slice(0, 19) + '…' : f.fund, value: f.total_value }))}
                  margin={{ bottom: 8, right: 24 }}
                >
                  <XAxis dataKey="fund" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatShort(v)} />
                  <Tooltip formatter={(v: number) => [formatValue(v), 'Total value']} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      <section className="mb-12">
        <h2 className="font-semibold text-lg mb-2">
          Consensus — Held by all {consensus?.funds_count || 0} funds
        </h2>
        <p className="text-[var(--muted)] text-sm mb-4">
          Stocks that Whale Rock, Pershing Square, and D1 Capital all hold
        </p>
        {consensus?.consensus && consensus.consensus.length > 0 ? (
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
                {consensus.consensus.map((h, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/50"
                  >
                    <td className="py-3 px-4">{h.name}</td>
                    <td className="text-right py-3 px-4 font-mono">
                      {formatValue(h.value)}
                    </td>
                    <td className="text-right py-3 px-4 font-mono">
                      {h.shares.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[var(--muted)] py-4">
            No consensus holdings — funds don't overlap on any single stock
          </p>
        )}
      </section>

      <section className="mb-12">
        <h2 className="font-semibold text-lg mb-2">Most Popular</h2>
        <p className="text-[var(--muted)] text-sm mb-4">
          Stocks held by the most funds (ranked by fund count, then value)
        </p>
        {popular?.popular && popular.popular.length > 0 ? (
          <>
            <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/30 mb-4">
              <h3 className="text-sm font-medium text-[var(--muted)] mb-2">Fund count (top 15)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={popular.popular.slice(0, 15).map((h) => ({
                      name: h.name.length > 16 ? h.name.slice(0, 15) + '…' : h.name,
                      funds: h.funds_count,
                    }))}
                    layout="vertical"
                    margin={{ left: 8, right: 24 }}
                  >
                    <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [v, 'Funds']} />
                    <Bar dataKey="funds" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                    <th className="text-left py-3 px-4 font-medium">Issuer</th>
                    <th className="text-center py-3 px-4 font-medium">Funds</th>
                    <th className="text-right py-3 px-4 font-medium">Value</th>
                    <th className="text-right py-3 px-4 font-medium">Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {popular.popular.slice(0, 30).map((h, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/50"
                    >
                      <td className="py-3 px-4">{h.name}</td>
                      <td className="text-center py-3 px-4">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-medium">
                          {h.funds_count}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 font-mono">
                        {formatValue(h.value)}
                      </td>
                      <td className="text-right py-3 px-4 font-mono">
                        {h.shares.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-[var(--muted)] py-4">No data</p>
        )}
      </section>

      {insightsChanges && insightsChanges.funds_count > 0 && (
        <section className="space-y-8 rounded-lg border border-[var(--border)] p-6 bg-[var(--surface)]/10">
          <h2 className="font-semibold text-lg">Cross-fund change signals</h2>
          <p className="text-[var(--muted)] text-sm">
            This quarter vs previous — names where all funds added, all reduced, or funds disagree (divergence).
          </p>
          {insightsChanges.consensus_add.length > 0 && (
            <div>
              <h3 className="font-medium text-[var(--accent)] mb-2">Consensus add — all {insightsChanges.funds_count} funds added or initiated</h3>
              <ul className="list-disc list-inside text-sm space-y-1">
                {insightsChanges.consensus_add.map((h, i) => (
                  <li key={i}>
                    {h.name}
                    {h.value != null && h.value > 0 && <span className="text-[var(--muted)] ml-2">({formatValue(h.value)})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insightsChanges.consensus_exit.length > 0 && (
            <div>
              <h3 className="font-medium text-[var(--accent)] mb-2">Consensus exit — all funds reduced or exited</h3>
              <ul className="list-disc list-inside text-sm space-y-1">
                {insightsChanges.consensus_exit.map((h, i) => (
                  <li key={i}>
                    {h.name}
                    {h.value != null && h.value > 0 && <span className="text-[var(--muted)] ml-2">({formatValue(h.value)})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insightsChanges.divergence.length > 0 && (
            <div>
              <h3 className="font-medium text-[var(--accent)] mb-2">Divergence — at least one fund added, one reduced/exited</h3>
              <ul className="list-disc list-inside text-sm space-y-1">
                {insightsChanges.divergence.map((h, i) => (
                  <li key={i}>
                    {h.name}
                    {h.value != null && h.value > 0 && <span className="text-[var(--muted)] ml-2">({formatValue(h.value)})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insightsChanges.consensus_add.length === 0 && insightsChanges.consensus_exit.length === 0 && insightsChanges.divergence.length === 0 && (
            <p className="text-[var(--muted)] text-sm">No cross-fund consensus add/exit or divergence this quarter.</p>
          )}

          {(insightsChanges.high_conviction?.length ?? 0) > 0 && (
            <div className="pt-4 border-t border-[var(--border)]">
              <h3 className="font-medium text-[var(--accent)] mb-2">High conviction — managers adding across 2+ consecutive quarters</h3>
              <p className="text-[var(--muted)] text-xs mb-3">Positions that at least one fund kept adding to in the same direction</p>
              <div className="rounded border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]/50">
                      <th className="text-left py-2 px-4">Issuer</th>
                      <th className="text-left py-2 px-4">Fund</th>
                      <th className="text-right py-2 px-4">Value</th>
                      <th className="text-right py-2 px-4">Quarters added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insightsChanges.high_conviction!.slice(0, 25).map((h, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-2 px-4">{h.name}</td>
                        <td className="py-2 px-4 text-[var(--muted)]">{h.fund}</td>
                        <td className="text-right py-2 px-4 font-mono">{formatValue(h.value)}</td>
                        <td className="text-right py-2 px-4 font-mono text-[var(--accent)]">{h.quarters_added}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {insightsChanges.high_conviction!.length > 25 && (
                <p className="text-[var(--muted)] text-xs mt-2">Showing 25 of {insightsChanges.high_conviction!.length}</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
