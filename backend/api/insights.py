"""API endpoints for investment insights"""
from collections import Counter
from fastapi import APIRouter

from api.holdings import get_all_holdings

router = APIRouter()


def _normalize_name(name: str) -> str:
    """Normalize issuer name for matching across funds (e.g. ALPHABET INC vs GOOGLE)"""
    # Strip common suffixes and normalize
    n = name.upper().strip()
    for suffix in (" INC", " CORP", " CO", " LTD", " PLC", " LP", " LLC", " CL A", " COM"):
        if n.endswith(suffix):
            n = n[: -len(suffix)].strip()
    return n


@router.get("/consensus")
def get_consensus_holdings():
    """
    Get consensus holdings - stocks held by ALL tracked funds in latest quarter.
    'What are all of them buying' = overlap across funds.
    """
    data = get_all_holdings()
    all_holdings = data["holdings"]

    if not all_holdings:
        return {"consensus": [], "funds_count": 0}

    # Build set of normalized names per fund
    fund_holdings: dict[str, set[str]] = {}
    for f in all_holdings:
        holdings = f.get("holdings", [])
        if not holdings:
            continue
        names = {_normalize_name(h["name"]) for h in holdings if h.get("name")}
        fund_holdings[f["fund"]] = names

    if not fund_holdings:
        return {"consensus": [], "funds_count": 0}

    # Intersection: held by ALL funds
    consensus_names = set.intersection(*fund_holdings.values()) if fund_holdings else set()

    # Get full holding details from first fund that has them
    consensus_list = []
    for f in all_holdings:
        for h in f.get("holdings", []):
            if _normalize_name(h.get("name", "")) in consensus_names:
                # Avoid duplicates (same stock from different funds)
                if not any(c["name"] == h["name"] for c in consensus_list):
                    consensus_list.append(h)
        if len(consensus_list) >= len(consensus_names):
            break

    return {
        "consensus": sorted(consensus_list, key=lambda x: x.get("value", 0), reverse=True),
        "funds_count": len(fund_holdings),
        "funds": list(fund_holdings.keys()),
    }


@router.get("/popular")
def get_popular_holdings():
    """
    Get most popular holdings - stocks held by the most funds.
    Ranked by how many funds hold each stock.
    """
    data = get_all_holdings()
    all_holdings = data["holdings"]

    # Count how many funds hold each (normalized) name
    name_to_funds: dict[str, list[str]] = {}
    name_to_holding: dict[str, dict] = {}

    for f in all_holdings:
        fund_name = f["fund"]
        for h in f.get("holdings", []):
            n = _normalize_name(h.get("name", ""))
            if not n:
                continue
            if n not in name_to_funds:
                name_to_funds[n] = []
                name_to_holding[n] = h
            if fund_name not in name_to_funds[n]:
                name_to_funds[n].append(fund_name)

    # Sort by number of funds holding, then by value
    popular = [
        {
            "name": name_to_holding[n]["name"],
            "cusip": name_to_holding[n].get("cusip"),
            "value": name_to_holding[n].get("value", 0),
            "shares": name_to_holding[n].get("shares", 0),
            "funds_count": len(name_to_funds[n]),
            "funds": name_to_funds[n],
        }
        for n in name_to_funds
    ]
    popular.sort(key=lambda x: (-x["funds_count"], -x["value"]))

    return {
        "popular": popular,
        "funds_count": len([f for f in all_holdings if f.get("holdings")]),
    }
