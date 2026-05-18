"""API endpoints for hedge fund list, history, and position changes"""
import time

from fastapi import APIRouter, HTTPException

from api.metrics import enrich_holdings, filing_meta, total_portfolio_value
from api.series import compute_changes, compute_high_conviction
from config import DEFAULT_CHANGES_QUARTERS, DEFAULT_HISTORY_QUARTERS, get_funds
from services.sec_client import get_13f_filings_last_n_quarters, get_13f_holdings, get_latest_13f_filing
from services.ticker_map import attach_ticker

router = APIRouter()


def _find_fund(cik: str):
    cik_norm = (cik or "").lstrip("0") or "0"
    for f in get_funds():
        if (f.get("cik") or "").lstrip("0") == cik_norm:
            return f
    return None


@router.get("/{cik}/history")
def get_fund_history(cik: str, quarters: int = DEFAULT_HISTORY_QUARTERS):
    """Last N quarters of 13F holdings (time-series view)."""
    fund = _find_fund(cik)
    if not fund:
        raise HTTPException(404, f"Fund with CIK {cik} not found")

    filings = get_13f_filings_last_n_quarters(fund["cik"], n=quarters)
    if not filings:
        return {"fund": fund["name"], "cik": fund["cik"], "quarters": [], "quarters_count": 0}

    quarters_data = []
    for i, (accession, report_date) in enumerate(filings):
        if i > 0:
            time.sleep(0.2)
        holdings = get_13f_holdings(fund["cik"], accession)
        total_value = total_portfolio_value(holdings)
        enriched = [attach_ticker(h) for h in enrich_holdings(holdings, total_value)]
        sorted_h = sorted(enriched, key=lambda h: h.get("value", 0), reverse=True)
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
        "style": fund.get("style"),
        "quarters": quarters_data,
        "quarters_count": len(quarters_data),
    }


def get_fund_changes_data(cik: str, quarters: int = DEFAULT_CHANGES_QUARTERS) -> dict | None:
    """
    Position changes for one fund: share-driven adds/trims, weights, high conviction.
    """
    fund = _find_fund(cik)
    if not fund:
        return None

    filings = get_13f_filings_last_n_quarters(fund["cik"], n=quarters)

    empty = {
        "fund": fund["name"],
        "cik": fund["cik"],
        "style": fund.get("style"),
        "latest_report_date": filings[0][1] if filings else None,
        "prev_report_date": None,
        "window_quarters": quarters,
        **filing_meta(filings[0][1] if filings else None, None),
        "double_downs": [],
        "trims": [],
        "price_driven_adds": [],
        "new_entries": [],
        "exits": [],
        "exits_from_5q": [],
        "stalwarts": [],
        "fading": [],
        "new_in_5q": [],
        "high_conviction": [],
    }

    if len(filings) < 2:
        return empty

    acc_latest, date_latest = filings[0]
    acc_prev, date_prev = filings[1]
    _, _, filing_latest = get_latest_13f_filing(fund["cik"])
    meta = filing_meta(date_latest, filing_latest)
    time.sleep(0.2)
    latest_holdings = get_13f_holdings(fund["cik"], acc_latest)
    time.sleep(0.2)
    prev_holdings = get_13f_holdings(fund["cik"], acc_prev)

    holdings_oldest = None
    quarters_holdings_for_hc = [latest_holdings, prev_holdings]

    if len(filings) >= 5:
        oldest_idx = len(filings) - 1
        time.sleep(0.2)
        holdings_oldest = get_13f_holdings(fund["cik"], filings[oldest_idx][0])
        for idx in range(2, oldest_idx):
            time.sleep(0.2)
            quarters_holdings_for_hc.append(get_13f_holdings(fund["cik"], filings[idx][0]))
        quarters_holdings_for_hc.append(holdings_oldest)

    changes = compute_changes(
        latest_holdings,
        prev_holdings,
        holdings_oldest,
        material_only=True,
        share_only_lists=False,
    )
    share_changes = compute_changes(
        latest_holdings,
        prev_holdings,
        holdings_oldest,
        material_only=True,
        share_only_lists=True,
    )
    high_conviction = (
        compute_high_conviction(quarters_holdings_for_hc, min_consecutive_adds=2, share_only=True)
        if len(quarters_holdings_for_hc) >= 2
        else []
    )
    high_conviction = [attach_ticker(h) for h in high_conviction]

    def _attach_list(lst: list) -> list:
        return [attach_ticker(h) for h in lst]

    return {
        "fund": fund["name"],
        "cik": fund["cik"],
        "style": fund.get("style"),
        "latest_report_date": date_latest,
        "prev_report_date": date_prev,
        "window_quarters": quarters,
        **meta,
        "double_downs": _attach_list(changes["double_downs"]),
        "share_adds": _attach_list(share_changes["double_downs"]),
        "trims": _attach_list(changes["trims"]),
        "share_trims": _attach_list(share_changes["trims"]),
        "price_driven_adds": _attach_list(changes["price_driven_adds"]),
        "new_entries": _attach_list(changes["new_entries"]),
        "exits": _attach_list(changes["exits"]),
        "exits_from_5q": _attach_list(changes["exits_from_5q"]),
        "stalwarts": _attach_list(changes["stalwarts"]),
        "fading": _attach_list(changes["fading"]),
        "new_in_5q": _attach_list(changes["new_in_5q"]),
        "high_conviction": high_conviction,
    }


@router.get("/{cik}/changes")
def get_fund_changes(cik: str, quarters: int = DEFAULT_CHANGES_QUARTERS):
    """Position changes vs previous quarter with weights and share-driven flags."""
    data = get_fund_changes_data(cik, quarters=quarters)
    if data is None:
        raise HTTPException(404, f"Fund with CIK {cik} not found")
    return data


@router.get("")
def list_funds():
    """List tracked hedge funds with their latest 13F info."""
    funds_with_filings = []
    for fund in get_funds():
        accession, report_date, filing_date = get_latest_13f_filing(fund["cik"])
        meta = filing_meta(report_date, filing_date)
        funds_with_filings.append({
            "name": fund["name"],
            "cik": fund["cik"],
            "style": fund.get("style"),
            "latest_13f_accession": accession,
            "latest_report_date": report_date,
            **meta,
        })
    return {"funds": funds_with_filings}
