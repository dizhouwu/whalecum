import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

interface SecurityHolder {
  fund: string
  cik: string
  report_date: string
  value: number
  shares: number
  weight_pct: number
}

interface SecurityFlowItem {
  fund: string
  cik: string
  flow: number
  direction: 'add' | 'reduce'
}

interface SecurityExit {
  fund: string
  cik: string
  value: number
  prev_report_date?: string
}

interface SecurityDetail {
  identifier: string
  type: 'cusip' | 'name'
  name?: string
  cusip?: string | null
  current_holders: SecurityHolder[]
  recent_exits: SecurityExit[]
  flows: {
    total: number
    per_fund: SecurityFlowItem[]
  }
}

import { formatValue, formatShort } from '../lib/format'

export default function SecurityPage() {
  const { id } = useParams()
  const [data, setData] = useState<SecurityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/security/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText)
        return r.json()
      })
      .then((res) => setData(res))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-[var(--muted)]">Loading security...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400">
        {error || 'Failed to load security'}
      </div>
    )
  }

  const title = data.name || data.identifier
  const netFlow = data.flows?.total ?? 0
  const flows = data.flows?.per_fund ?? []
  const addsCount = flows.filter((f) => f.flow > 0).length
  const reducesCount = flows.filter((f) => f.flow < 0).length

  return (
    <div>
      <Link to="/insights" className="text-[var(--muted)] text-sm hover:text-[var(--accent)] mb-4 inline-block">
        ← Insights
      </Link>

      <h1 className="font-display font-bold text-2xl mb-1">{title}</h1>
      <p className="text-[var(--muted)] text-sm mb-4">
        {data.cusip && <span className="mr-3">CUSIP: {data.cusip}</span>}
        <span className="mr-3">Identifier: {data.identifier}</span>
      </p>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 p-4">
          <p className="text-[var(--muted)] text-xs mb-1">Net flow this quarter (all funds)</p>
          <p
            className={`text-lg font-mono ${
              netFlow > 0 ? 'text-[var(--success)]' : netFlow < 0 ? 'text-red-400/90' : 'text-[var(--muted)]'
            }`}
          >
            {netFlow > 0 ? '+' : ''}
            {formatShort(Math.abs(netFlow))}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 p-4">
          <p className="text-[var(--muted)] text-xs mb-1">Funds adding vs reducing</p>
          <p className="text-sm">
            <span className="text-[var(--success)] font-semibold">{addsCount}</span> adding ·{' '}
            <span className="text-red-400/90 font-semibold">{reducesCount}</span> reducing
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 p-4">
          <p className="text-[var(--muted)] text-xs mb-1">Current holders</p>
          <p className="text-sm font-semibold">{data.current_holders.length}</p>
        </div>
      </div>

      {flows.length > 0 && (
        <section className="mb-10">
          <h2 className="font-semibold text-lg mb-2">Flow by fund (this quarter)</h2>
          <p className="text-[var(--muted)] text-sm mb-3">
            Positive bars = net buying (adds/new positions). Negative bars = net selling (trims/exits).
          </p>
          <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]/30">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={flows.map((f) => ({
                    fund: f.fund.length > 18 ? f.fund.slice(0, 17) + '…' : f.fund,
                    fullFund: f.fund,
                    flow: f.flow,
                  }))}
                  margin={{ bottom: 16, left: 8, right: 24 }}
                >
                  <XAxis dataKey="fund" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatShort(v)} />
                  <Tooltip
                    formatter={(v: number) => [formatValue(v), 'Net flow']}
                    labelFormatter={(_, payload) => payload[0]?.payload?.fullFund}
                  />
                  <Bar dataKey="flow">
                    {flows.map((f, index) => (
                      <cell
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        fill={f.flow >= 0 ? 'var(--success)' : 'rgb(248 113 113 / 0.9)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="font-semibold text-lg mb-2">Current holders</h2>
        {data.current_holders.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">No current holders in tracked funds.</p>
        ) : (
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="text-left py-3 px-4 font-medium">Fund</th>
                  <th className="text-right py-3 px-4 font-medium">Value</th>
                  <th className="text-right py-3 px-4 font-medium">% of 13F</th>
                  <th className="text-right py-3 px-4 font-medium">Shares</th>
                  <th className="text-right py-3 px-4 font-medium">As of</th>
                </tr>
              </thead>
              <tbody>
                {data.current_holders.map((h, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/50">
                    <td className="py-3 px-4">
                      <Link to={`/funds/${h.cik}`} className="hover:text-[var(--accent)]">
                        {h.fund}
                      </Link>
                    </td>
                    <td className="text-right py-3 px-4 font-mono">{formatValue(h.value)}</td>
                    <td className="text-right py-3 px-4 font-mono">{h.weight_pct.toFixed(2)}%</td>
                    <td className="text-right py-3 px-4 font-mono">{h.shares.toLocaleString()}</td>
                    <td className="text-right py-3 px-4 text-[var(--muted)]">{h.report_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.recent_exits.length > 0 && (
        <section className="mb-10">
          <h2 className="font-semibold text-lg mb-2">Recent exits (vs previous quarter)</h2>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="text-left py-3 px-4 font-medium">Fund</th>
                  <th className="text-right py-3 px-4 font-medium">Value when held</th>
                  <th className="text-right py-3 px-4 font-medium">Prev report date</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_exits.map((e, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    <td className="py-3 px-4">
                      <Link to={`/funds/${e.cik}`} className="hover:text-[var(--accent)]">
                        {e.fund}
                      </Link>
                    </td>
                    <td className="text-right py-3 px-4 font-mono">{formatValue(e.value)}</td>
                    <td className="text-right py-3 px-4 text-[var(--muted)]">{e.prev_report_date || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

