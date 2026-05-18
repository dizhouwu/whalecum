import { useEffect, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import SecurityLink from '../components/SecurityLink'
import SignalBadge from '../components/SignalBadge'
import FilingLagBadge from '../components/FilingLagBadge'
import HoldingTable from '../components/HoldingTable'
import { formatValue, formatShort } from '../lib/format'

interface ActionIdea {
  name: string
  cusip?: string
  ticker?: string
  value: number
  idea_score: number
  signal: string
  funds_share_adding: number
  funds_trimming: number
  quarters_added_max: number
  max_weight_pct: number
  reasons: string[]
}

interface InsightsChanges {
  consensus_add: { name: string; value?: number }[]
  supermajority_share_add: { name: string; value?: number }[]
  consensus_exit: { name: string; value?: number }[]
  divergence: { name: string; value?: number }[]
  high_conviction?: { name: string; value: number; quarters_added: number; fund: string; ticker?: string }[]
  cluster_flow: { name: string; total_flow: number; funds_adding: number; funds_reducing: number; ticker?: string }[]
  funds_count: number
  supermajority_k: number
  funds: string[]
}

export default function InsightsPage() {
  const [actionList, setActionList] = useState<{
    ideas: ActionIdea[]
    supermajority_k: number
    latest_report_date?: string
    avg_filing_lag_days?: number
    disclaimer?: string
  } | null>(null)
  const [consensus, setConsensus] = useState<{
    consensus: { name: string; value: number; funds_count: number; funds: string[]; ticker?: string }[]
    funds_count: number
    min_funds: number
    funds: string[]
  } | null>(null)
  const [popular, setPopular] = useState<{ popular: { name: string; funds_count: number; value: number; ticker?: string }[] } | null>(null)
  const [insightsChanges, setInsightsChanges] = useState<InsightsChanges | null>(null)
  const [overlap, setOverlap] = useState<{ pairs: { fund_a: string; fund_b: string; overlap_pct: number; shared_count: number }[] } | null>(null)
  const [backtest, setBacktest] = useState<{ hit_rate_pct?: number; hits: number; misses: number; note?: string } | null>(null)
  const [holdings, setHoldings] = useState<{ holdings: { fund: string; total_value: number }[] } | null>(null)
  const [consensusMin, setConsensusMin] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (minFunds?: number) => {
    setLoading(true)
    const consensusUrl =
      minFunds != null ? `/api/insights/consensus?min_funds=${minFunds}` : '/api/insights/consensus'
    Promise.all([
      fetch('/api/insights/action-list').then((r) => r.json()),
      fetch(consensusUrl).then((r) => r.json()),
      fetch('/api/insights/popular').then((r) => r.json()),
      fetch('/api/insights/changes').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/insights/overlap').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/insights/backtest').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/holdings').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([actions, c, p, ch, ov, bt, h]) => {
        setActionList(actions)
        setConsensus(c)
        if (consensusMin == null && c.supermajority_threshold) {
          setConsensusMin(c.supermajority_threshold)
        }
        setPopular(p)
        setInsightsChanges(ch)
        setOverlap(ov)
        setBacktest(bt)
        setHoldings(h)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (consensusMin != null) load(consensusMin)
  }, [consensusMin])

  if (loading && !actionList) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-[var(--muted)]">Loading insights…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400">{error}</div>
    )
  }

  const k = actionList?.supermajority_k ?? insightsChanges?.supermajority_k ?? 3
  const fundNames = consensus?.funds?.join(', ') ?? 'tracked funds'

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display font-bold text-2xl mb-2">Investment Insights</h1>
        <p className="text-[var(--muted)] text-sm max-w-2xl">
          Ranked ideas from {fundNames}. Share-count adds, portfolio weights, and supermajority ({k}+ funds) — not
          price-only drift.
        </p>
        {actionList?.avg_filing_lag_days != null && (
          <div className="mt-3">
            <FilingLagBadge
              lagDays={Math.round(actionList.avg_filing_lag_days)}
              reportDate={actionList.latest_report_date}
              stale={actionList.avg_filing_lag_days > 50}
            />
          </div>
        )}
      </header>

      {/* Action list */}
      <section className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-6">
        <h2 className="font-semibold text-lg mb-1">This quarter — action list</h2>
        <p className="text-[var(--muted)] text-xs mb-4">{actionList?.disclaimer}</p>
        {actionList?.ideas?.length ? (
          <div className="space-y-3">
            {actionList.ideas.map((idea, i) => (
              <div
                key={i}
                className="flex flex-wrap items-start gap-3 justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-3"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[var(--muted)] text-xs font-mono w-5">{i + 1}</span>
                    <SecurityLink holding={idea} className="font-medium" />
                    <SignalBadge signal={idea.signal} />
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-1 ml-7">
                    Score {idea.idea_score} · {idea.funds_share_adding} funds adding shares
                    {idea.quarters_added_max >= 2 && ` · ${idea.quarters_added_max}Q conviction`}
                    {idea.max_weight_pct > 0 && ` · up to ${idea.max_weight_pct.toFixed(1)}% weight`}
                  </p>
                  {idea.reasons?.length > 0 && (
                    <ul className="text-xs text-[var(--muted)] mt-1 ml-7 list-disc list-inside">
                      {idea.reasons.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className="font-mono text-sm text-[var(--accent)]">{formatValue(idea.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--muted)] text-sm">No ideas passed filters this quarter.</p>
        )}
      </section>

      {backtest?.hit_rate_pct != null && (
        <section className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/30">
          <h2 className="font-semibold text-sm mb-1">Historical share-add proxy</h2>
          <p className="text-2xl font-mono text-[var(--accent)]">{backtest.hit_rate_pct}%</p>
          <p className="text-xs text-[var(--muted)]">
            Next-quarter positive price proxy on prior share-adds ({backtest.hits}W / {backtest.misses}L).{' '}
            {backtest.note}
          </p>
        </section>
      )}

      {(holdings?.holdings?.length ?? 0) > 0 && holdings && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Portfolio value by fund</h2>
          <div className="rounded-lg border border-[var(--border)] p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={holdings.holdings.map((f) => ({
                  fund: f.fund.length > 18 ? f.fund.slice(0, 17) + '…' : f.fund,
                  value: f.total_value,
                }))}
              >
                <XAxis dataKey="fund" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => formatShort(v)} />
                <Tooltip formatter={(v: number) => [formatValue(v), 'Value']} />
                <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {insightsChanges && (
        <section className="space-y-6 rounded-lg border border-[var(--border)] p-6">
          <h2 className="font-semibold text-lg">Cross-fund signals</h2>
          <p className="text-[var(--muted)] text-sm">
            Supermajority = {k} of {insightsChanges.funds_count} funds (not all-or-nothing).
          </p>

          {insightsChanges.cluster_flow?.length > 0 && (
            <div>
              <h3 className="font-medium text-[var(--accent)] mb-2">Cluster flow (net $ across funds)</h3>
              <div className="h-52 mb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={insightsChanges.cluster_flow.slice(0, 12).map((r) => ({
                      name: (r.ticker || r.name).slice(0, 12),
                      flow: r.total_flow,
                    }))}
                    layout="vertical"
                    margin={{ left: 8 }}
                  >
                    <XAxis type="number" tickFormatter={(v) => formatShort(Math.abs(v))} />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [formatValue(Math.abs(v)), 'Net flow']} />
                    <Bar dataKey="flow" fill="var(--success)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="text-sm space-y-1">
                {insightsChanges.cluster_flow.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <SecurityLink holding={r} />
                    <span className="font-mono text-[var(--success)]">{formatValue(Math.abs(r.total_flow))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <SignalSection title={`Supermajority share-adds (≥${k} funds)`} items={insightsChanges.supermajority_share_add} />
          <SignalSection title={`Funds adding (≥${k})`} items={insightsChanges.consensus_add} />
          <SignalSection title={`Funds reducing (≥${k})`} items={insightsChanges.consensus_exit} negative />
          <SignalSection title="Divergence" items={insightsChanges.divergence} />

          {(insightsChanges.high_conviction?.length ?? 0) > 0 && (
            <div>
              <h3 className="font-medium text-[var(--accent)] mb-2">High conviction (2+ quarters of share adds)</h3>
              <HoldingTable
                rows={insightsChanges.high_conviction!.map((h) => ({
                  name: h.name,
                  ticker: h.ticker,
                  value: h.value,
                  shares: 0,
                  quarters_added: h.quarters_added,
                }))}
                showWeight={false}
                showFlags
              />
            </div>
          )}
        </section>
      )}

      {(overlap?.pairs?.length ?? 0) > 0 && overlap && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Top-20 overlap (Jaccard)</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {overlap.pairs.slice(0, 6).map((p, i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm flex justify-between"
              >
                <span className="text-[var(--muted)]">
                  {p.fund_a.split(' ')[0]} × {p.fund_b.split(' ')[0]}
                </span>
                <span className="font-mono text-[var(--accent)]">{p.overlap_pct}% · {p.shared_count} names</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-lg">Consensus holdings</h2>
          <label className="text-xs text-[var(--muted)] flex items-center gap-2">
            Min funds
            <select
              className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text)]"
              value={consensusMin ?? consensus?.min_funds ?? 3}
              onChange={(e) => setConsensusMin(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {consensus?.consensus?.length ? (
          <HoldingTable
            rows={consensus.consensus.map((h) => ({
              name: h.name,
              ticker: h.ticker,
              value: h.value,
              shares: 0,
              weight_pct: undefined,
            }))}
            showWeight={false}
          />
        ) : (
          <p className="text-[var(--muted)] text-sm">No names held by {consensusMin}+ funds.</p>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-lg mb-3">Most popular</h2>
        {popular?.popular?.length ? (
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="text-left py-3 px-4">Issuer</th>
                  <th className="text-center py-3 px-4">Funds</th>
                  <th className="text-right py-3 px-4">Value</th>
                </tr>
              </thead>
              <tbody>
                {popular.popular.slice(0, 25).map((h, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/40">
                    <td className="py-3 px-4">
                      <SecurityLink holding={h} />
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs">
                        {h.funds_count}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 font-mono">{formatValue(h.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function SignalSection({
  title,
  items,
  negative,
}: {
  title: string
  items: { name: string; value?: number }[]
  negative?: boolean
}) {
  if (!items?.length) return null
  return (
    <div>
      <h3 className={`font-medium mb-2 ${negative ? 'text-red-400/90' : 'text-[var(--accent)]'}`}>{title}</h3>
      <ul className="text-sm space-y-1">
        {items.map((h, i) => (
          <li key={i} className="flex justify-between gap-2">
            <SecurityLink holding={h} />
            {h.value != null && h.value > 0 && (
              <span className="text-[var(--muted)] font-mono shrink-0">{formatValue(h.value)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
