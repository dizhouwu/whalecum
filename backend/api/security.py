"""Security-level drilldown across funds."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from api.funds import get_fund_changes_data
from api.holdings import get_all_holdings
from api.metrics import normalize_name
from config import get_funds
from services.ticker_map import attach_ticker, resolve_ticker

router = APIRouter()


def _matches_security(h: dict[str, Any], identifier: str, is_cusip: bool) -> bool:
    name = (h.get("name") or "").strip()
    cusip = (h.get("cusip") or "").replace(" ", "").upper()
    ident = identifier.replace(" ", "").upper()
    if is_cusip and cusip and len(ident) == 9:
        return cusip == ident
    if not name:
        return False
    return normalize_name(name) == normalize_name(identifier)


@router.get("/{identifier}")
def get_security(identifier: str):
    """Security drilldown by CUSIP or issuer name."""
    ident = (identifier or "").strip()
    if not ident:
        raise HTTPException(400, "Empty security identifier")

    simple = ident.replace(" ", "")
    is_cusip = len(simple) == 9 and simple.isalnum()

    all_holdings_data = get_all_holdings()
    all_holdings = all_holdings_data.get("holdings", [])

    current_holders: list[dict[str, Any]] = []
    display_name: str | None = None
    display_cusip: str | None = None

    for f in all_holdings:
        fund_name = f.get("fund", "")
        cik = f.get("cik", "")
        report_date = f.get("report_date")
        filing_lag_days = f.get("filing_lag_days")
        total_value = f.get("total_value", 0) or 0
        for h in f.get("holdings", []):
            if _matches_security(h, ident, is_cusip):
                value = h.get("value", 0) or 0
                shares = h.get("shares", 0) or 0
                weight_pct = h.get("weight_pct")
                if weight_pct is None:
                    weight_pct = round(100.0 * value / total_value, 2) if total_value else 0.0
                current_holders.append({
                    "fund": fund_name,
                    "cik": cik,
                    "style": f.get("style"),
                    "report_date": report_date,
                    "filing_lag_days": filing_lag_days,
                    "value": value,
                    "shares": shares,
                    "weight_pct": weight_pct,
                })
                if not display_name:
                    display_name = h.get("name")
                if not display_cusip and h.get("cusip"):
                    display_cusip = h["cusip"]
                break

    flows_per_fund: list[dict[str, Any]] = []
    recent_exits: list[dict[str, Any]] = []
    total_flow = 0.0

    for fund in get_funds():
        changes = get_fund_changes_data(fund["cik"])
        if not changes:
            continue
        fund_name = changes.get("fund", fund["name"])
        cik = changes.get("cik", fund["cik"])
        flow = 0.0

        for key in ("share_adds", "double_downs"):
            for h in changes.get(key, []):
                if _matches_security(h, ident, is_cusip):
                    flow += h.get("value_change", 0) or 0

        for h in changes.get("trims", []) + changes.get("share_trims", []):
            if _matches_security(h, ident, is_cusip):
                flow += h.get("value_change", 0) or 0

        for h in changes.get("new_entries", []):
            if _matches_security(h, ident, is_cusip):
                flow += h.get("value", 0) or 0

        for h in changes.get("exits", []):
            if _matches_security(h, ident, is_cusip):
                exit_val = h.get("value", 0) or 0
                flow -= exit_val
                recent_exits.append({
                    "fund": fund_name,
                    "cik": cik,
                    "value": exit_val,
                    "prev_report_date": changes.get("prev_report_date"),
                })

        if flow != 0:
            flows_per_fund.append({
                "fund": fund_name,
                "cik": cik,
                "flow": flow,
                "direction": "add" if flow > 0 else "reduce",
            })
            total_flow += flow

    if not current_holders and not recent_exits and not flows_per_fund:
        raise HTTPException(404, f"Security '{identifier}' not found in tracked funds")

    flows_per_fund.sort(key=lambda x: abs(x.get("flow", 0)), reverse=True)
    ticker = resolve_ticker({"name": display_name or "", "cusip": display_cusip or ""})

    return {
        "identifier": ident,
        "type": "cusip" if is_cusip else "name",
        "name": display_name,
        "cusip": display_cusip if is_cusip or display_cusip else None,
        "ticker": ticker,
        "current_holders": current_holders,
        "recent_exits": recent_exits,
        "flows": {"total": total_flow, "per_fund": flows_per_fund},
    }
