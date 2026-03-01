"""
Time-series and position-change logic for 13F.
Compares quarters to detect double-downs (added to), exits, new entries.
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


def compute_changes(
    latest_holdings: list[dict],
    prev_holdings: list[dict],
    holdings_5q_ago: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Compare latest vs previous quarter (and optionally vs 5 quarters ago).
    Returns:
      - double_downs: positions in both latest and prev where value or shares increased
      - new_entries: in latest, not in prev
      - exits: in prev, not in latest
      - exits_from_5q: in 5q_ago, not in latest (positions closed since 5q ago)
    """
    latest = _holdings_by_key(latest_holdings)
    prev = _holdings_by_key(prev_holdings)
    old5 = _holdings_by_key(holdings_5q_ago or [])

    double_downs = []
    for key, curr in latest.items():
        if key not in prev:
            continue
        p = prev[key]
        curr_val = curr.get("value", 0) or 0
        curr_shr = curr.get("shares", 0) or 0
        prev_val = p.get("value", 0) or 0
        prev_shr = p.get("shares", 0) or 0
        if curr_val > prev_val or curr_shr > prev_shr:
            double_downs.append({
                **curr,
                "prev_value": prev_val,
                "prev_shares": prev_shr,
                "value_change": curr_val - prev_val,
                "shares_change": curr_shr - prev_shr,
            })

    new_entries = [latest[k] for k in latest if k not in prev]
    exits = [prev[k] for k in prev if k not in latest]
    exits_from_5q = [old5[k] for k in old5 if k not in latest] if old5 else []

    return {
        "double_downs": sorted(double_downs, key=lambda h: h.get("value", 0), reverse=True),
        "new_entries": sorted(new_entries, key=lambda h: h.get("value", 0), reverse=True),
        "exits": sorted(exits, key=lambda h: h.get("value", 0), reverse=True),
        "exits_from_5q": sorted(exits_from_5q, key=lambda h: h.get("value", 0), reverse=True),
    }
