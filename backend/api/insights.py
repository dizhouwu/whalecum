"""API endpoints for investment insights and actionable signals."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from api.insights_data import get_cached_changes, get_cached_holdings
from api.metrics import (
    holding_key,
    jaccard,
    normalize_name,
    price_proxy_return,
    top_n_keys,
)
from config import (
    ACTION_LIST_MAX,
    TOP_N_OVERLAP,
    get_funds,
    supermajority_threshold,
)
from services.ticker_map import attach_ticker, resolve_ticker

router = APIRouter()


def _names_from_holdings(holdings: list, *, share_adds_only: bool = False) -> set[str]:
    out: set[str] = set()
    for h in holdings:
        if share_adds_only and not h.get("share_driven", True):
            continue
        if h.get("name"):
            out.add(normalize_name(h["name"]))
    return out


def _first_holding(name_norm: str, all_changes: list, keys: list) -> dict | None:
    for ch in all_changes:
        for key in keys:
            for h in ch.get(key, []):
                if normalize_name(h.get("name", "")) == name_norm:
                    return h
    return None


def _fund_labels() -> list[str]:
    return [f["name"] for f in get_funds()]


@router.get("/consensus")
def get_consensus_holdings(min_funds: int | None = None):
    """
    Holdings overlap across funds.
    min_funds: minimum funds holding the name (default = all funds).
    """
    data = get_cached_holdings()
    all_holdings = data.get("holdings", [])
    fund_count = len([f for f in all_holdings if f.get("holdings")])
    threshold = min_funds if min_funds is not None else fund_count
    threshold = max(1, min(threshold, fund_count or 1))

    name_to_funds: dict[str, list[str]] = {}
    name_to_holding: dict[str, dict] = {}

    for f in all_holdings:
        fund_name = f["fund"]
        for h in f.get("holdings", []):
            n = normalize_name(h.get("name", ""))
            if not n:
                continue
            name_to_funds.setdefault(n, [])
            if fund_name not in name_to_funds[n]:
                name_to_funds[n].append(fund_name)
            if n not in name_to_holding:
                name_to_holding[n] = h

    consensus = []
    for n, funds in name_to_funds.items():
        if len(funds) >= threshold:
            row = attach_ticker(dict(name_to_holding[n]))
            row["funds_count"] = len(funds)
            row["funds"] = funds
            consensus.append(row)

    consensus.sort(key=lambda x: (-x.get("funds_count", 0), -x.get("value", 0)))

    return {
        "consensus": consensus,
        "funds_count": fund_count,
        "min_funds": threshold,
        "funds": _fund_labels(),
        "supermajority_threshold": supermajority_threshold(fund_count) if fund_count else 0,
    }


@router.get("/popular")
def get_popular_holdings():
    """Stocks held by the most funds."""
    data = get_cached_holdings()
    all_holdings = data.get("holdings", [])

    name_to_funds: dict[str, list[str]] = {}
    name_to_holding: dict[str, dict] = {}

    for f in all_holdings:
        fund_name = f["fund"]
        for h in f.get("holdings", []):
            n = normalize_name(h.get("name", ""))
            if not n:
                continue
            name_to_funds.setdefault(n, [])
            if fund_name not in name_to_funds[n]:
                name_to_funds[n].append(fund_name)
            if n not in name_to_holding:
                name_to_holding[n] = h

    popular = []
    for n in name_to_funds:
        h = name_to_holding[n]
        row = attach_ticker({
            "name": h["name"],
            "cusip": h.get("cusip"),
            "value": h.get("value", 0),
            "shares": h.get("shares", 0),
            "weight_pct": h.get("weight_pct"),
            "funds_count": len(name_to_funds[n]),
            "funds": name_to_funds[n],
        })
        popular.append(row)

    popular.sort(key=lambda x: (-x["funds_count"], -x["value"]))
    return {
        "popular": popular,
        "funds_count": len([f for f in all_holdings if f.get("holdings")]),
        "funds": _fund_labels(),
    }


@router.get("/changes")
def get_insights_changes():
    """Cross-fund change signals with supermajority (not all-or-nothing)."""
    all_changes = get_cached_changes()
    fund_count = len(all_changes)
    k = supermajority_threshold(fund_count) if fund_count else 0

    if not all_changes:
        return _empty_changes(fund_count, k)

    added_per_fund = []
    share_added_per_fund = []
    reduced_per_fund = []
    for ch in all_changes:
        added = _names_from_holdings(ch.get("double_downs", []) + ch.get("new_entries", []))
        share_added = _names_from_holdings(ch.get("share_adds", []) + ch.get("new_entries", []))
        reduced = _names_from_holdings(ch.get("exits", []) + ch.get("trims", []))
        added_per_fund.append(added)
        share_added_per_fund.append(share_added)
        reduced_per_fund.append(reduced)

    def _k_of_n(sets: list[set]) -> set:
        if not sets:
            return set()
        counts: dict[str, int] = {}
        for s in sets:
            for n in s:
                counts[n] = counts.get(n, 0) + 1
        return {n for n, c in counts.items() if c >= k}

    consensus_add = _k_of_n(added_per_fund)
    supermajority_share_add = _k_of_n(share_added_per_fund)
    consensus_exit = _k_of_n(reduced_per_fund)
    all_added = set().union(*added_per_fund) if added_per_fund else set()
    all_reduced = set().union(*reduced_per_fund) if reduced_per_fund else set()
    divergence = all_added & all_reduced

    def _list(names: set, keys: list) -> list:
        items = []
        for n in names:
            h = _first_holding(n, all_changes, keys) or {"name": n, "value": 0}
            items.append(attach_ticker(h))
        items.sort(key=lambda x: x.get("value", 0), reverse=True)
        return items

    high_conviction_flat = []
    for ch in all_changes:
        fund_name = ch.get("fund", "")
        for h in ch.get("high_conviction", []):
            high_conviction_flat.append({
                **attach_ticker(h),
                "fund": fund_name,
            })
    high_conviction_flat.sort(key=lambda x: (-x.get("quarters_added", 0), -x.get("value", 0)))

    cluster_flow = _cluster_flow(all_changes)

    return {
        "consensus_add": _list(consensus_add, ["double_downs", "new_entries", "share_adds"]),
        "supermajority_share_add": _list(supermajority_share_add, ["share_adds", "new_entries"]),
        "consensus_exit": _list(consensus_exit, ["exits", "trims", "share_trims"]),
        "divergence": _list(divergence, ["double_downs", "new_entries", "exits", "trims"]),
        "high_conviction": high_conviction_flat,
        "cluster_flow": cluster_flow,
        "funds_count": fund_count,
        "supermajority_k": k,
        "funds": [c["fund"] for c in all_changes],
    }


def _empty_changes(fund_count: int, k: int) -> dict:
    return {
        "consensus_add": [],
        "supermajority_share_add": [],
        "consensus_exit": [],
        "divergence": [],
        "high_conviction": [],
        "cluster_flow": [],
        "funds_count": fund_count,
        "supermajority_k": k,
        "funds": [],
    }


def _cluster_flow(all_changes: list) -> list[dict]:
    """Net $ flow (13F value units) per name across funds."""
    flow_by_name: dict[str, dict] = {}

    def _add(name: str, fund: str, delta: int, direction: str) -> None:
        n = normalize_name(name)
        if not n:
            return
        if n not in flow_by_name:
            flow_by_name[n] = {"name": name, "total_flow": 0, "funds": [], "funds_adding": 0, "funds_reducing": 0}
        flow_by_name[n]["total_flow"] += delta
        if direction == "add" and fund not in flow_by_name[n]["funds"]:
            flow_by_name[n]["funds"].append(fund)
            flow_by_name[n]["funds_adding"] += 1
        elif direction == "reduce":
            flow_by_name[n]["funds_reducing"] += 1

    for ch in all_changes:
        fund = ch.get("fund", "")
        for h in ch.get("double_downs", []) + ch.get("share_adds", []):
            _add(h.get("name", ""), fund, h.get("value_change", 0) or 0, "add")
        for h in ch.get("new_entries", []):
            _add(h.get("name", ""), fund, h.get("value", 0) or 0, "add")
        for h in ch.get("trims", []) + ch.get("share_trims", []):
            _add(h.get("name", ""), fund, h.get("value_change", 0) or 0, "reduce")
        for h in ch.get("exits", []):
            _add(h.get("name", ""), fund, -(h.get("value", 0) or 0), "reduce")

    rows = []
    for n, row in flow_by_name.items():
        r = attach_ticker(row)
        r["ticker"] = resolve_ticker(row) or r.get("ticker")
        rows.append(r)
    rows.sort(key=lambda x: abs(x.get("total_flow", 0)), reverse=True)
    return rows[:30]


def _idea_score(
    name_norm: str,
    all_changes: list,
    holdings_data: dict,
    k: int,
) -> dict[str, Any]:
    funds_adding = 0
    funds_share_adding = 0
    funds_trimming = 0
    max_quarters_added = 0
    max_weight = 0.0
    total_flow = 0
    reasons: list[str] = []

    for ch in all_changes:
        fund = ch.get("fund", "")
        added = _names_from_holdings(ch.get("double_downs", []) + ch.get("new_entries", []))
        share_added = _names_from_holdings(ch.get("share_adds", []))
        reduced = _names_from_holdings(ch.get("exits", []) + ch.get("trims", []))
        if name_norm in added:
            funds_adding += 1
        if name_norm in share_added:
            funds_share_adding += 1
        if name_norm in reduced:
            funds_trimming += 1
        for h in ch.get("high_conviction", []):
            if normalize_name(h.get("name", "")) == name_norm:
                max_quarters_added = max(max_quarters_added, h.get("quarters_added", 0))
        for h in ch.get("share_adds", []):
            if normalize_name(h.get("name", "")) == name_norm:
                total_flow += h.get("value_change", 0) or 0
        for h in ch.get("new_entries", []):
            if normalize_name(h.get("name", "")) == name_norm:
                total_flow += h.get("value", 0) or 0

    for f in holdings_data.get("holdings", []):
        for h in f.get("holdings", []):
            if normalize_name(h.get("name", "")) == name_norm:
                w = h.get("weight_pct", 0) or 0
                if w > max_weight:
                    max_weight = w

    score = 0.0
    score += funds_share_adding * 3
    score += funds_adding * 1.5
    score += max_quarters_added * 2
    score += max_weight * 0.5
    score -= funds_trimming * 4
    if funds_share_adding >= k:
        score += 5
        reasons.append(f"{funds_share_adding} funds added shares (≥{k})")
    if max_quarters_added >= 2:
        reasons.append(f"High conviction: {max_quarters_added}Q share adds")
    if max_weight >= 3:
        reasons.append(f"Up to {max_weight:.1f}% portfolio weight")
    if funds_trimming:
        reasons.append(f"{funds_trimming} fund(s) trimming/exiting")

    display = _first_holding(name_norm, all_changes, ["share_adds", "double_downs", "new_entries", "high_conviction"])
    if not display:
        for f in holdings_data.get("holdings", []):
            for h in f.get("holdings", []):
                if normalize_name(h.get("name", "")) == name_norm:
                    display = h
                    break

    row = attach_ticker(display or {"name": name_norm})
    row["idea_score"] = round(score, 1)
    row["funds_adding"] = funds_adding
    row["funds_share_adding"] = funds_share_adding
    row["funds_trimming"] = funds_trimming
    row["quarters_added_max"] = max_quarters_added
    row["max_weight_pct"] = max_weight
    row["cluster_flow"] = total_flow
    row["reasons"] = reasons
    row["signal"] = "buy" if score >= 6 and funds_trimming == 0 else ("watch" if score >= 3 else "avoid")
    return row


@router.get("/action-list")
def get_action_list(limit: int = ACTION_LIST_MAX):
    """Ranked trade ideas for the latest 13F season."""
    all_changes = get_cached_changes()
    holdings_data = get_cached_holdings()
    fund_count = len(all_changes)
    k = supermajority_threshold(fund_count) if fund_count else 0

    names: set[str] = set()
    for ch in all_changes:
        for key in ("share_adds", "high_conviction", "new_entries", "double_downs"):
            for h in ch.get(key, []):
                if h.get("name"):
                    names.add(normalize_name(h["name"]))

    ideas = [_idea_score(n, all_changes, holdings_data, k) for n in names]
    ideas = [i for i in ideas if i.get("signal") != "avoid" or i.get("funds_trimming", 0) == 0]
    ideas.sort(key=lambda x: (-x.get("idea_score", 0), -x.get("cluster_flow", 0)))

    latest_dates = [ch.get("latest_report_date") for ch in all_changes if ch.get("latest_report_date")]
    lags = [ch.get("filing_lag_days") for ch in all_changes if ch.get("filing_lag_days") is not None]

    return {
        "ideas": ideas[:limit],
        "funds_count": fund_count,
        "supermajority_k": k,
        "latest_report_date": max(latest_dates) if latest_dates else None,
        "avg_filing_lag_days": round(sum(lags) / len(lags), 1) if lags else None,
        "disclaimer": "13F data is 45–90 days stale; not investment advice. Verify share adds vs price drift.",
    }


@router.get("/overlap")
def get_overlap_matrix(top_n: int = TOP_N_OVERLAP):
    """Pairwise Jaccard overlap on top-N holdings by value."""
    data = get_cached_holdings()
    all_holdings = data.get("holdings", [])
    funds = [f["fund"] for f in all_holdings if f.get("holdings")]
    sets = [top_n_keys(f.get("holdings", []), top_n) for f in all_holdings if f.get("holdings")]

    matrix: list[dict] = []
    for i, a in enumerate(funds):
        for j, b in enumerate(funds):
            if j <= i:
                continue
            matrix.append({
                "fund_a": a,
                "fund_b": b,
                "overlap_pct": jaccard(sets[i], sets[j]),
                "shared_count": len(sets[i] & sets[j]),
            })

    matrix.sort(key=lambda x: -x["overlap_pct"])
    return {"top_n": top_n, "funds": funds, "pairs": matrix}


@router.get("/backtest")
def get_backtest_summary():
    """
    Naive hit-rate on prior-quarter share adds using 13F price proxy (value/shares).
    Uses historical quarters already cached — not live prices.
    """
    from api.funds import get_fund_changes_data
    from services.sec_client import get_13f_filings_last_n_quarters, get_13f_holdings

    hits = 0
    misses = 0
    samples: list[dict] = []

    for fund in get_funds():
        filings = get_13f_filings_last_n_quarters(fund["cik"], n=6)
        if len(filings) < 3:
            continue
        for q in range(len(filings) - 2):
            _, _rd_new, _ = filings[q]
            acc_old, _, _ = filings[q + 1]
            acc_older, _, _ = filings[q + 2]
            new_h = get_13f_holdings(fund["cik"], acc_old)
            old_h = get_13f_holdings(fund["cik"], acc_older)
            from api.series import compute_changes

            ch = compute_changes(new_h, old_h, material_only=True, share_only_lists=True)
            new_map = {holding_key(h): h for h in new_h}
            old_map = {holding_key(h): h for h in old_h}
            for sig in ch.get("double_downs", []):
                key = holding_key(sig)
                if key not in new_map or key not in old_map:
                    continue
                ret = price_proxy_return(old_map[key], new_map[key])
                if ret is None:
                    continue
                if ret > 0:
                    hits += 1
                else:
                    misses += 1
                if len(samples) < 15:
                    samples.append({
                        "fund": fund["name"],
                        "name": sig.get("name"),
                        "return_pct": ret,
                    })

    total = hits + misses
    return {
        "hit_rate_pct": round(100.0 * hits / total, 1) if total else None,
        "hits": hits,
        "misses": misses,
        "samples": samples,
        "note": "Proxy: QoQ change in 13F value/shares on prior share-add signals. Not true investable returns.",
    }
