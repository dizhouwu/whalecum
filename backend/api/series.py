"""
Time-series and position-change logic for 13F.
Share-driven vs price-driven moves, portfolio weights, materiality filters.
"""
from __future__ import annotations

from typing import Any

from api.metrics import (
    enrich_holdings,
    holding_key,
    is_material_change,
    normalize_name,
    price_proxy_return,
    total_portfolio_value,
)


def _holdings_by_key(holdings: list[dict]) -> dict[str, dict]:
    return {holding_key(h): h for h in holdings if holding_key(h)}


def _pct_change(prev: float, curr: float) -> float | None:
    if prev is None or prev <= 0:
        return None
    return round(100.0 * (curr - prev) / prev, 1)


def _weight_pct(value: int, total: int) -> float:
    return round(100.0 * value / total, 2) if total else 0.0


def _classify_position_change(
    curr: dict,
    prev: dict,
    total_latest: int,
    total_prev: int,
) -> dict[str, Any] | None:
    """Build change row with share/price/material flags. Returns None if no change."""
    curr_val = curr.get("value", 0) or 0
    prev_val = prev.get("value", 0) or 0
    curr_shr = curr.get("shares", 0) or 0
    prev_shr = prev.get("shares", 0) or 0
    val_chg = curr_val - prev_val
    shr_chg = curr_shr - prev_shr

    w_curr = _weight_pct(curr_val, total_latest)
    w_prev = _weight_pct(prev_val, total_prev)
    w_chg = round(w_curr - w_prev, 2)

    share_up = curr_shr > prev_shr
    share_down = curr_shr < prev_shr
    value_up = curr_val > prev_val
    value_down = curr_val < prev_val

    if not (value_up or value_down or share_up or share_down):
        return None

    share_driven = share_up or share_down
    price_driven = (value_up and not share_up) or (value_down and not share_down)
    if share_up and value_up:
        direction = "add"
    elif share_down and value_down:
        direction = "trim"
    elif share_up:
        direction = "add"
    elif share_down:
        direction = "trim"
    elif value_up:
        direction = "add"
        price_driven = True
        share_driven = False
    else:
        direction = "trim"
        price_driven = True
        share_driven = False

    material = is_material_change(val_chg, w_chg)

    return {
        **curr,
        "prev_value": prev_val,
        "prev_shares": prev_shr,
        "prev_weight_pct": w_prev,
        "weight_pct": w_curr,
        "weight_pct_change": w_chg,
        "value_change": val_chg,
        "shares_change": shr_chg,
        "value_pct_change": _pct_change(prev_val, curr_val),
        "price_proxy_return_pct": price_proxy_return(prev, curr),
        "share_driven": share_driven,
        "price_driven": price_driven,
        "material": material,
        "direction": direction,
    }


def compute_changes(
    latest_holdings: list[dict],
    prev_holdings: list[dict],
    holdings_oldest: list[dict] | None = None,
    *,
    material_only: bool = True,
    share_only_lists: bool = False,
) -> dict[str, Any]:
    """
    Compare latest vs previous quarter (and optionally vs oldest in window).
    share_only_lists: if True, double_downs/trims only include share-driven moves.
    """
    total_latest = total_portfolio_value(latest_holdings)
    total_prev = total_portfolio_value(prev_holdings)
    latest = _holdings_by_key(enrich_holdings(latest_holdings, total_latest))
    prev = _holdings_by_key(enrich_holdings(prev_holdings, total_prev))
    old = _holdings_by_key(holdings_oldest or [])

    double_downs: list[dict] = []
    trims: list[dict] = []
    price_driven_adds: list[dict] = []

    for key, curr in latest.items():
        if key not in prev:
            continue
        row = _classify_position_change(curr, prev[key], total_latest, total_prev)
        if not row:
            continue
        if material_only and not row["material"]:
            continue
        if row["direction"] == "add":
            if share_only_lists and not row["share_driven"]:
                if row["price_driven"]:
                    price_driven_adds.append(row)
                continue
            double_downs.append(row)
        else:
            if share_only_lists and not row["share_driven"]:
                continue
            trims.append(row)

    new_entries_raw = [latest[k] for k in latest if k not in prev]
    new_entries = []
    for h in new_entries_raw:
        row = dict(h)
        row["weight_pct"] = _weight_pct(h.get("value", 0) or 0, total_latest)
        if not material_only or is_material_change(h.get("value", 0) or 0, row["weight_pct"]):
            new_entries.append(row)

    exits = []
    for key in prev:
        if key not in latest:
            h = dict(prev[key])
            h["weight_pct"] = _weight_pct(h.get("value", 0) or 0, total_prev)
            if not material_only or is_material_change(h.get("value", 0) or 0, h["weight_pct"]):
                exits.append(h)

    exits_from_old = []
    if old:
        for key in old:
            if key not in latest:
                h = dict(old[key])
                if not material_only or is_material_change(h.get("value", 0) or 0, None):
                    exits_from_old.append(h)

    stalwarts = []
    fading = []
    new_in_window = []
    if old:
        total_old = total_portfolio_value(holdings_oldest or [])
        for key, curr in latest.items():
            if key not in old:
                new_in_window.append(curr)
                continue
            o = old[key]
            curr_val = curr.get("value", 0) or 0
            old_val = o.get("value", 0) or 0
            if curr_val > old_val:
                stalwarts.append({
                    **curr,
                    "value_oldest": old_val,
                    "value_change_window": curr_val - old_val,
                    "weight_pct": _weight_pct(curr_val, total_latest),
                })
            elif curr_val < old_val:
                fading.append({
                    **curr,
                    "value_oldest": old_val,
                    "value_change_window": curr_val - old_val,
                    "weight_pct": _weight_pct(curr_val, total_latest),
                })
        stalwarts.sort(key=lambda h: h.get("value_change_window", 0), reverse=True)
        fading.sort(key=lambda h: h.get("value_change_window", 0))
        new_in_window.sort(key=lambda h: h.get("value", 0), reverse=True)

    return {
        "double_downs": sorted(double_downs, key=lambda h: h.get("value_change", 0), reverse=True),
        "trims": sorted(trims, key=lambda h: h.get("value_change", 0)),
        "price_driven_adds": sorted(price_driven_adds, key=lambda h: h.get("value_change", 0), reverse=True),
        "new_entries": sorted(new_entries, key=lambda h: h.get("value", 0), reverse=True),
        "exits": sorted(exits, key=lambda h: h.get("value", 0), reverse=True),
        "exits_from_5q": sorted(exits_from_old, key=lambda h: h.get("value", 0), reverse=True),
        "stalwarts": stalwarts,
        "fading": fading,
        "new_in_5q": new_in_window,
    }


def compute_high_conviction(
    quarters_holdings: list[list[dict]],
    min_consecutive_adds: int = 2,
    *,
    share_only: bool = True,
) -> list[dict]:
    """Positions with consecutive share-count increases across quarters."""
    if len(quarters_holdings) < 2 or min_consecutive_adds < 1:
        return []

    add_count: dict[str, int] = {}
    for i in range(len(quarters_holdings) - 1):
        curr = _holdings_by_key(quarters_holdings[i])
        prev = _holdings_by_key(quarters_holdings[i + 1])
        for key, c in curr.items():
            if key not in prev:
                continue
            cs = c.get("shares", 0) or 0
            ps = prev[key].get("shares", 0) or 0
            cv = c.get("value", 0) or 0
            pv = prev[key].get("value", 0) or 0
            if share_only:
                if cs > ps:
                    add_count[key] = add_count.get(key, 0) + 1
            elif cv > pv or cs > ps:
                add_count[key] = add_count.get(key, 0) + 1

    total = total_portfolio_value(quarters_holdings[0])
    latest = _holdings_by_key(enrich_holdings(quarters_holdings[0], total))
    result = []
    for key, count in add_count.items():
        if count >= min_consecutive_adds and key in latest:
            result.append({**latest[key], "quarters_added": count})
    result.sort(key=lambda h: (-h.get("quarters_added", 0), -h.get("value", 0)))
    return result
