"""API endpoints for 13F holdings"""
import time

from fastapi import APIRouter, HTTPException

from api.metrics import enrich_holdings, filing_meta, total_portfolio_value
from config import get_funds
from services.sec_client import get_13f_holdings, get_latest_13f_filing
from services.ticker_map import attach_ticker

router = APIRouter()


def _find_fund(cik: str):
    for f in get_funds():
        if f["cik"] == cik or f["cik"].lstrip("0") == cik.lstrip("0"):
            return f
    return None


def _build_holdings_response(fund: dict, accession: str, report_date: str, filing_date: str | None) -> dict:
    holdings = get_13f_holdings(fund["cik"], accession)
    total_value = total_portfolio_value(holdings)
    enriched = [attach_ticker(h) for h in enrich_holdings(holdings, total_value)]
    sorted_holdings = sorted(enriched, key=lambda h: h.get("value", 0), reverse=True)
    top5_val = sum(h.get("value", 0) for h in sorted_holdings[:5])
    top10_val = sum(h.get("value", 0) for h in sorted_holdings[:10])
    meta = filing_meta(report_date, filing_date)
    return {
        "fund": fund["name"],
        "cik": fund["cik"],
        "style": fund.get("style"),
        "report_date": report_date,
        "accession": accession,
        "total_value": total_value,
        "concentration_pct_top5": round(100.0 * top5_val / total_value, 1) if total_value else 0,
        "concentration_pct_top10": round(100.0 * top10_val / total_value, 1) if total_value else 0,
        "holdings": sorted_holdings,
        **meta,
    }


@router.get("/{cik}")
def get_holdings(cik: str):
    """Get latest quarter 13F holdings for a fund by CIK"""
    fund = _find_fund(cik)
    if not fund:
        raise HTTPException(404, f"Fund with CIK {cik} not found")

    accession, report_date, filing_date = get_latest_13f_filing(fund["cik"])
    if not accession:
        raise HTTPException(404, f"No 13F filing found for {fund['name']}")

    return _build_holdings_response(fund, accession, report_date or "", filing_date)


@router.get("")
def get_all_holdings():
    """Get latest quarter holdings for all tracked funds"""
    results = []
    for i, fund in enumerate(get_funds()):
        if i > 0:
            time.sleep(0.2)
        accession, report_date, filing_date = get_latest_13f_filing(fund["cik"])
        if not accession:
            results.append({
                "fund": fund["name"],
                "cik": fund["cik"],
                "style": fund.get("style"),
                "report_date": report_date,
                "holdings": [],
                "error": "No 13F filing found",
            })
            continue
        time.sleep(0.2)
        results.append(_build_holdings_response(fund, accession, report_date or "", filing_date))
    return {"holdings": results}
