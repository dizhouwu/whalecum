"""API endpoints for investment insights"""
from fastapi import APIRouter

from api.funds import get_fund_changes_data
from api.holdings import get_all_holdings
from config import get_funds

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


@router.get("/changes")
def get_insights_changes():
    """
    Cross-fund change signals:
    - consensus_add: names that ALL funds added to (double-down or new entry) this quarter
    - consensus_exit: names that ALL funds reduced or exited (exit or trim) this quarter
    - divergence: names where at least one fund added and at least one fund reduced/exited
    """
    import time

    all_changes = []
    for i, fund in enumerate(get_funds()):
        if i > 0:
            time.sleep(0.2)
        data = get_fund_changes_data(fund["cik"])
        if not data:
            continue
        all_changes.append(data)

    if not all_changes:
        return {
            "consensus_add": [],
            "consensus_exit": [],
            "divergence": [],
            "high_conviction": [],
            "funds_count": 0,
            "funds": [],
        }

    def names_from_holdings(holdings: list) -> set:
        return {_normalize_name(h.get("name", "")) for h in holdings if h.get("name")}

    added_per_fund = []
    reduced_per_fund = []
    for ch in all_changes:
        added = names_from_holdings(ch.get("double_downs", []) + ch.get("new_entries", []))
        reduced = names_from_holdings(ch.get("exits", []) + ch.get("trims", []))
        added_per_fund.append(added)
        reduced_per_fund.append(reduced)

    consensus_add = set.intersection(*added_per_fund) if added_per_fund else set()
    consensus_exit = set.intersection(*reduced_per_fund) if reduced_per_fund else set()
    all_added = set().union(*added_per_fund)
    all_reduced = set().union(*reduced_per_fund)
    divergence = all_added & all_reduced

    def first_holding(name_norm: str, keys: list) -> dict | None:
        for ch in all_changes:
            for key in keys:
                for h in ch.get(key, []):
                    if _normalize_name(h.get("name", "")) == name_norm:
                        return h
        return None

    consensus_add_list = [first_holding(n, ["double_downs", "new_entries"]) or {"name": n, "value": 0} for n in consensus_add]
    consensus_exit_list = [first_holding(n, ["exits", "trims"]) or {"name": n, "value": 0} for n in consensus_exit]
    divergence_list = [first_holding(n, ["double_downs", "new_entries", "exits", "trims"]) or {"name": n, "value": 0} for n in divergence]
    for lst in (consensus_add_list, consensus_exit_list, divergence_list):
        lst.sort(key=lambda x: x.get("value", 0), reverse=True)

    high_conviction_flat = []
    for ch in all_changes:
        fund_name = ch.get("fund", "")
        for h in ch.get("high_conviction", []):
            high_conviction_flat.append({
                "name": h.get("name", ""),
                "value": h.get("value", 0),
                "quarters_added": h.get("quarters_added", 0),
                "fund": fund_name,
            })
    high_conviction_flat.sort(key=lambda x: (-x.get("quarters_added", 0), -x.get("value", 0)))

    return {
        "consensus_add": consensus_add_list,
        "consensus_exit": consensus_exit_list,
        "divergence": divergence_list,
        "high_conviction": high_conviction_flat,
        "funds_count": len(all_changes),
        "funds": [c["fund"] for c in all_changes],
    }
