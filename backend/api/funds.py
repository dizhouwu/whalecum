"""API endpoints for hedge fund list, history, and position changes"""
import time

from fastapi import APIRouter, HTTPException

from config import get_funds
from services.sec_client import (
    get_13f_filings_last_n_quarters,
    get_13f_holdings,
    get_latest_13f_accession,
)

router = APIRouter()


def _find_fund(cik: str):
    cik_norm = (cik or "").lstrip("0") or "0"
    for f in get_funds():
        if (f.get("cik") or "").lstrip("0") == cik_norm:
            return f
    return None


@router.get("/{cik}/history")
def get_fund_history(cik: str, quarters: int = 5):
    """Last N quarters of 13F holdings (time-series view)."""
    fund = _find_fund(cik)
    if not fund:
        raise HTTPException(404, f"Fund with CIK {cik} not found")

    filings = get_13f_filings_last_n_quarters(fund["cik"], n=quarters)
    if not filings:
        return {"fund": fund["name"], "cik": fund["cik"], "quarters": []}

    quarters_data = []
    for i, (accession, report_date) in enumerate(filings):
        if i > 0:
            time.sleep(0.2)
        holdings = get_13f_holdings(fund["cik"], accession)
        sorted_h = sorted(holdings, key=lambda h: h.get("value", 0), reverse=True)
        total_value = sum(h.get("value", 0) for h in holdings)
        top5_val = sum(h.get("value", 0) for h in sorted_h[:5])
        top10_val = sum(h.get("value", 0) for h in sorted_h[:10])
        quarters_data.append({
            "report_date": report_date,
            "accession": accession,
            "total_value": total_value,
            "concentration_pct_top5": round(100.0 * top5_val / total_value, 1) if total_value else 0,
            "concentration_pct_top10": round(100.0 * top10_val / total_value, 1) if total_value else 0,
            "holdings": sorted_h,
        })

    return {
        "fund": fund["name"],
        "cik": fund["cik"],
        "quarters": quarters_data,
    }


def get_fund_changes_data(cik: str) -> dict | None:
    """
    Returns position changes for one fund (double-downs, trims, new entries, exits, etc.)
    or None if fund not found / insufficient data. Used by GET /funds/{cik}/changes and insights.
    Includes high_conviction: positions the manager kept adding to across 2+ consecutive quarters.
    """
    from api.series import compute_changes, compute_high_conviction

    fund = _find_fund(cik)
    if not fund:
        return None

    filings = get_13f_filings_last_n_quarters(fund["cik"], n=5)
    if len(filings) < 2:
        return {
            "fund": fund["name"],
            "cik": fund["cik"],
            "latest_report_date": filings[0][1] if filings else None,
            "prev_report_date": None,
            "double_downs": [],
            "trims": [],
            "new_entries": [],
            "exits": [],
            "exits_from_5q": [],
            "stalwarts": [],
            "fading": [],
            "new_in_5q": [],
            "high_conviction": [],
        }

    acc_latest, date_latest = filings[0]
    acc_prev, date_prev = filings[1]
    time.sleep(0.2)
    latest_holdings = get_13f_holdings(fund["cik"], acc_latest)
    time.sleep(0.2)
    prev_holdings = get_13f_holdings(fund["cik"], acc_prev)
    holdings_5q = None
    quarters_holdings_for_hc = [latest_holdings, prev_holdings]

    if len(filings) >= 5:
        time.sleep(0.2)
        holdings_5q = get_13f_holdings(fund["cik"], filings[4][0])
        # Fetch middle quarters for high-conviction (adds in 2+ consecutive quarters)
        for idx in (2, 3):
            time.sleep(0.2)
            quarters_holdings_for_hc.append(get_13f_holdings(fund["cik"], filings[idx][0]))
        quarters_holdings_for_hc.append(holdings_5q)

    changes = compute_changes(latest_holdings, prev_holdings, holdings_5q)
    high_conviction = compute_high_conviction(quarters_holdings_for_hc, min_consecutive_adds=2) if len(quarters_holdings_for_hc) >= 2 else []
    return {
        "fund": fund["name"],
        "cik": fund["cik"],
        "latest_report_date": date_latest,
        "prev_report_date": date_prev,
        **changes,
        "high_conviction": high_conviction,
    }


@router.get("/{cik}/changes")
def get_fund_changes(cik: str):
    """
    Position changes vs previous quarter: double-downs (added to), trims, new entries, exits.
    Also exits_from_5q, stalwarts, fading, new_in_5q.
    """
    data = get_fund_changes_data(cik)
    if data is None:
        raise HTTPException(404, f"Fund with CIK {cik} not found")
    return data


@router.get("")
def list_funds():
    """List tracked hedge funds with their latest 13F info. Fund list from funds.json."""
    funds_with_filings = []
    for fund in get_funds():
        accession, report_date = get_latest_13f_accession(fund["cik"])
        funds_with_filings.append({
            "name": fund["name"],
            "cik": fund["cik"],
            "latest_13f_accession": accession,
            "latest_report_date": report_date,
        })
    return {"funds": funds_with_filings}
