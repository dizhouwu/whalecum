import { useEffect, useState } from 'react'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/insights/consensus').then((r) => r.json()),
      fetch('/api/insights/popular').then((r) => r.json()),
    ])
      .then(([c, p]) => {
        setConsensus(c)
        setPopular(p)
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
        Consensus holdings (all funds) and most popular stocks across funds
      </p>

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

      <section>
        <h2 className="font-semibold text-lg mb-2">Most Popular</h2>
        <p className="text-[var(--muted)] text-sm mb-4">
          Stocks held by the most funds (ranked by fund count, then value)
        </p>
        {popular?.popular && popular.popular.length > 0 ? (
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
        ) : (
          <p className="text-[var(--muted)] py-4">No data</p>
        )}
      </section>
    </div>
  )
}
