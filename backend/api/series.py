"""
Time-series and position-change logic for 13F.
Compares quarters to detect double-downs (added to), trims, exits, new entries,
and 5-quarter buckets: stalwarts, fading, new_in_5q.
"""
from __future__ import annotations

from typing import Any


def _holding_key(h: dict) -> str:
    """Stable key for matching same position across quarters. CUSIP preferred."""
    cusip = (h.get("cusip") or "").strip()
    if cusip and len(cusip) >= 9:
        return cusip
    return _normalize_name(h.get("name") or "")


def _normalize_name(name: str) -> str:
    n = (name or "").upper().strip()
    for suffix in (" INC", " CORP", " CO", " LTD", " PLC", " LP", " LLC", " CL A", " COM"):
        if n.endswith(suffix):
            n = n[: -len(suffix)].strip()
    return n


def _holdings_by_key(holdings: list[dict]) -> dict[str, dict]:
    return {_holding_key(h): h for h in holdings if _holding_key(h)}


def _pct_change(prev: float, curr: float) -> float | None:
    if prev is None or prev <= 0:
        return None
    return round(100.0 * (curr - prev) / prev, 1)


def compute_changes(
    latest_holdings: list[dict],
    prev_holdings: list[dict],
    holdings_5q_ago: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Compare latest vs previous quarter (and optionally vs 5 quarters ago).
    Returns:
      - double_downs: positions increased (sorted by value_change desc)
      - trims: positions decreased (in both quarters)
      - new_entries: in latest, not in prev
      - exits: in prev, not in latest (sorted by prev value desc)
      - exits_from_5q: in 5q_ago, not in latest
      - stalwarts: in both latest and 5q_ago, current value > 5q value (adding over 5q)
      - fading: in both latest and 5q_ago, current value < 5q value (reducing over 5q)
      - new_in_5q: in latest, not in 5q_ago (first appearance in 5-quarter window)
    """
    latest = _holdings_by_key(latest_holdings)
    prev = _holdings_by_key(prev_holdings)
    old5 = _holdings_by_key(holdings_5q_ago or [])

    double_downs = []
    trims = []
    for key, curr in latest.items():
        if key not in prev:
            continue
        p = prev[key]
        curr_val = curr.get("value", 0) or 0
        curr_shr = curr.get("shares", 0) or 0
        prev_val = p.get("value", 0) or 0
        prev_shr = p.get("shares", 0) or 0
        val_chg = curr_val - prev_val
        shr_chg = curr_shr - prev_shr
        if curr_val > prev_val or curr_shr > prev_shr:
            double_downs.append({
                **curr,
                "prev_value": prev_val,
                "prev_shares": prev_shr,
                "value_change": val_chg,
                "shares_change": shr_chg,
                "value_pct_change": _pct_change(prev_val, curr_val),
            })
        elif curr_val < prev_val or curr_shr < prev_shr:
            trims.append({
                **curr,
                "prev_value": prev_val,
                "prev_shares": prev_shr,
                "value_change": val_chg,
                "shares_change": shr_chg,
                "value_pct_change": _pct_change(prev_val, curr_val),
            })

    new_entries = [latest[k] for k in latest if k not in prev]
    exits = [prev[k] for k in prev if k not in latest]
    exits_from_5q = [old5[k] for k in old5 if k not in latest] if old5 else []

    stalwarts = []
    fading = []
    new_in_5q = []
    if old5:
        for key, curr in latest.items():
            if key not in old5:
                new_in_5q.append(curr)
                continue
            o = old5[key]
            curr_val = curr.get("value", 0) or 0
            old_val = o.get("value", 0) or 0
            if curr_val > old_val:
                stalwarts.append({**curr, "value_5q_ago": old_val, "value_change_5q": curr_val - old_val})
            elif curr_val < old_val:
                fading.append({**curr, "value_5q_ago": old_val, "value_change_5q": curr_val - old_val})
        stalwarts.sort(key=lambda h: h.get("value_change_5q", 0), reverse=True)
        fading.sort(key=lambda h: h.get("value_change_5q", 0))
        new_in_5q.sort(key=lambda h: h.get("value", 0), reverse=True)

    return {
        "double_downs": sorted(double_downs, key=lambda h: h.get("value_change", 0), reverse=True),
        "trims": sorted(trims, key=lambda h: h.get("value_change", 0)),
        "new_entries": sorted(new_entries, key=lambda h: h.get("value", 0), reverse=True),
        "exits": sorted(exits, key=lambda h: h.get("value", 0), reverse=True),
        "exits_from_5q": sorted(exits_from_5q, key=lambda h: h.get("value", 0), reverse=True),
        "stalwarts": stalwarts,
        "fading": fading,
        "new_in_5q": new_in_5q,
    }


def compute_high_conviction(
    quarters_holdings: list[list[dict]],
    min_consecutive_adds: int = 2,
) -> list[dict]:
    """
    High-conviction bets: positions the manager kept adding to in the same direction
    across multiple consecutive quarters. Requires at least min_consecutive_adds (default 2)
    quarter-over-quarter increases. quarters_holdings = [latest, q1_ago, q2_ago, ...] (most recent first).
    Returns list of holdings from latest quarter with quarters_added count.
    """
    if len(quarters_holdings) < 2 or min_consecutive_adds < 1:
        return []

    add_count: dict[str, int] = {}
    for i in range(len(quarters_holdings) - 1):
        curr = _holdings_by_key(quarters_holdings[i])
        prev = _holdings_by_key(quarters_holdings[i + 1])
        for key, c in curr.items():
            if key not in prev:
                continue
            p = prev[key]
            cv = c.get("value", 0) or 0
            pv = p.get("value", 0) or 0
            cs = c.get("shares", 0) or 0
            ps = p.get("shares", 0) or 0
            if cv > pv or cs > ps:
                add_count[key] = add_count.get(key, 0) + 1

    latest = _holdings_by_key(quarters_holdings[0])
    result = []
    for key, count in add_count.items():
        if count >= min_consecutive_adds and key in latest:
            result.append({**latest[key], "quarters_added": count})
    result.sort(key=lambda h: (-h.get("quarters_added", 0), -h.get("value", 0)))
    return result
