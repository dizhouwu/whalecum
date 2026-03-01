"""
SEC EDGAR API client for fetching 13F filings.
SEC requires User-Agent header - see https://www.sec.gov/developer
"""
from typing import Any

import httpx

from config import SEC_ARCHIVES_URL, SEC_BASE_URL, USER_AGENT

HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}


def get_submissions(cik: str) -> dict[str, Any] | None:
    """Fetch company submissions (filing history) from SEC."""
    cik_padded = cik.zfill(10)
    url = f"{SEC_BASE_URL}/submissions/CIK{cik_padded}.json"
    with httpx.Client(timeout=30.0, headers=HEADERS) as client:
        resp = client.get(url)
        if resp.status_code != 200:
            return None
        return resp.json()


def get_latest_13f_accession(cik: str) -> tuple[str | None, str | None]:
    """
    Get the accession number and report date for the latest 13F-HR filing.
    Returns (accession_number, report_date) or (None, None).
    """
    data = get_submissions(cik)
    if not data:
        return None, None

    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    accessions = filings.get("accessionNumber", [])
    report_dates = filings.get("reportDate", [])

    for i, form in enumerate(forms):
        if form == "13F-HR":
            acc = accessions[i] if i < len(accessions) else None
            report_date = report_dates[i] if i < len(report_dates) else report_dates[i] or ""
            if acc:
                return acc, report_date or None
    return None, None


def get_13f_filings_last_n_quarters(cik: str, n: int = 5) -> list[tuple[str, str]]:
    """
    Get the last n quarters of 13F-HR filings (by report date, most recent first).
    Returns list of (accession_number, report_date). Deduplicates by report_date.
    """
    data = get_submissions(cik)
    if not data:
        return []

    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    accessions = filings.get("accessionNumber", [])
    report_dates = filings.get("reportDate", [])

    seen_dates: set[str] = set()
    result: list[tuple[str, str]] = []
    for i, form in enumerate(forms):
        if form != "13F-HR":
            continue
        acc = accessions[i] if i < len(accessions) else None
        report_date = (report_dates[i] or "").strip() if i < len(report_dates) else ""
        if not acc or not report_date or report_date in seen_dates:
            continue
        seen_dates.add(report_date)
        result.append((acc, report_date))
        if len(result) >= n:
            break
    return result


def _accession_to_path(accession: str) -> str:
    """Convert accession number (e.g. 0001172661-25-005025) to URL path (no dashes)."""
    return accession.replace("-", "")


def get_13f_holdings(cik: str, accession: str) -> list[dict]:
    """
    Fetch and parse 13F holdings from infotable.xml.
    Returns list of holdings with: name, cusip, value, shares, title_of_class
    """
    cik_stripped = cik.lstrip("0") or "0"
    path = _accession_to_path(accession)
    # Try X02 format first (newer), fall back to X01
    for subdir in ["xslForm13F_X02", "xslForm13F_X01"]:
        url = f"{SEC_ARCHIVES_URL}/data/{cik_stripped}/{path}/{subdir}/infotable.xml"
        with httpx.Client(timeout=30.0, headers=HEADERS) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                return _parse_infotable_xml(resp.text)
    return []


def _parse_infotable_xml(html_text: str) -> list[dict]:
    """
    Parse SEC 13F infotable. SEC serves XSLT-transformed HTML, so we parse the table.
    Columns: Name, Title of Class, CUSIP, FIGI, Value, Shares, SH/PRN, Put/Call, ...
    """
    from bs4 import BeautifulSoup

    holdings_list = []
    try:
        soup = BeautifulSoup(html_text, "html.parser")
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows:
                all_cells = row.find_all("td")
                if len(all_cells) < 6:
                    continue
                # Structure: name, title, cusip, (figi), value, shares, ...
                name = all_cells[0].get_text(strip=True)
                if not name or name.upper() in (
                    "NAME OF ISSUER", "COLUMN 1", "VALUE", "SHRS OR", "PRN AMT",
                ):
                    continue
                title_of_class = all_cells[1].get_text(strip=True) if len(all_cells) > 1 else ""
                cusip = all_cells[2].get_text(strip=True) if len(all_cells) > 2 else ""
                # all_cells[3] is often FIGI (empty), [4]=value, [5]=shares
                value_str = all_cells[4].get_text(strip=True).replace(",", "") if len(all_cells) > 4 else "0"
                shares_str = all_cells[5].get_text(strip=True).replace(",", "") if len(all_cells) > 5 else "0"
                try:
                    value = int(value_str) if value_str else 0
                except ValueError:
                    value = 0
                try:
                    shares = int(shares_str) if shares_str else 0
                except ValueError:
                    shares = 0
                holdings_list.append({
                    "name": name,
                    "title_of_class": title_of_class,
                    "cusip": cusip,
                    "value": value,
                    "shares": shares,
                })
    except Exception:
        pass
    return holdings_list
