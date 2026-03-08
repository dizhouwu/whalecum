"""Security-level drilldown across funds.

Given a CUSIP or issuer name, show which funds hold it, how big it is for
each fund, and the cross-fund flow (adds vs trims/exits) this quarter.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from api.funds import get_fund_changes_data
from api.holdings import get_all_holdings
from config import get_funds

router = APIRouter()


def _normalize_name(name: str) -> str:
  n = (name or "").upper().strip()
  for suffix in (" INC", " CORP", " CO", " LTD", " PLC", " LP", " LLC", " CL A", " COM"):
    if n.endswith(suffix):
      n = n[: -len(suffix)].strip()
  return n


def _matches_security(h: dict[str, Any], identifier: str, is_cusip: bool) -> bool:
  name = (h.get("name") or "").strip()
  cusip = (h.get("cusip") or "").replace(" ", "").upper()
  ident = identifier.replace(" ", "").upper()
  if is_cusip and cusip and len(ident) == 9:
    return cusip == ident
  if not name:
    return False
  return _normalize_name(name) == _normalize_name(identifier)


@router.get("/{identifier}")
def get_security(identifier: str):
  """
  Security-level drilldown by CUSIP (preferred) or issuer name.

  Response:
    - type: "cusip" or "name"
    - name, cusip: best-known identifiers
    - current_holders: latest holders across funds with value, shares, weight_pct
    - recent_exits: funds that exited the name vs previous quarter
    - flows: per-fund and total $ flow this quarter (adds minus trims/exits)
  """
  ident = (identifier or "").strip()
  if not ident:
    raise HTTPException(400, "Empty security identifier")

  # Heuristic: 9-char alphanumeric -> CUSIP, otherwise treat as name
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
    total_value = f.get("total_value", 0) or 0
    for h in f.get("holdings", []):
      if _matches_security(h, ident, is_cusip):
        value = h.get("value", 0) or 0
        shares = h.get("shares", 0) or 0
        weight_pct = round(100.0 * value / total_value, 2) if total_value else 0.0
        current_holders.append(
          {
            "fund": fund_name,
            "cik": cik,
            "report_date": report_date,
            "value": value,
            "shares": shares,
            "weight_pct": weight_pct,
          }
        )
        if not display_name:
          display_name = h.get("name")
        if not display_cusip and h.get("cusip"):
          display_cusip = h["cusip"]
        break

  # Cross-fund flows and recent exits from changes endpoint data
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

    # Double-downs / trims: use value_change (already signed)
    for h in changes.get("double_downs", []):
      if _matches_security(h, ident, is_cusip):
        flow += h.get("value_change", 0) or 0
    for h in changes.get("trims", []):
      if _matches_security(h, ident, is_cusip):
        flow += h.get("value_change", 0) or 0

    # New entries: full current value is new flow
    for h in changes.get("new_entries", []):
      if _matches_security(h, ident, is_cusip):
        flow += h.get("value", 0) or 0

    # Exits: subtract prior value
    for h in changes.get("exits", []):
      if _matches_security(h, ident, is_cusip):
        exit_val = h.get("value", 0) or 0
        flow -= exit_val
        recent_exits.append(
          {
            "fund": fund_name,
            "cik": cik,
            "value": exit_val,
            "prev_report_date": changes.get("prev_report_date"),
          }
        )

    if flow != 0:
      direction = "add" if flow > 0 else "reduce"
      flows_per_fund.append(
        {
          "fund": fund_name,
          "cik": cik,
          "flow": flow,
          "direction": direction,
        }
      )
      total_flow += flow

  if not current_holders and not recent_exits and not flows_per_fund:
    raise HTTPException(404, f"Security '{identifier}' not found in tracked funds")

  flows_per_fund.sort(key=lambda x: abs(x.get("flow", 0)), reverse=True)

  return {
    "identifier": ident,
    "type": "cusip" if is_cusip else "name",
    "name": display_name,
    "cusip": display_cusip if is_cusip or display_cusip else None,
    "current_holders": current_holders,
    "recent_exits": recent_exits,
    "flows": {
      "total": total_flow,
      "per_fund": flows_per_fund,
    },
  }

