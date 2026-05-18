"""
SEC EDGAR API client for fetching 13F filings.
SEC requires User-Agent header - see https://www.sec.gov/developer
Caches submissions and holdings locally (13F data is final after 45d past quarter end).
"""
import json
import time
from pathlib import Path
from typing import Any

import httpx

from config import (
    CACHE_DIR,
    CACHE_ENABLED,
    CACHE_HOLDINGS_TTL_DAYS,
    CACHE_SUBMISSIONS_TTL_DAYS,
    SEC_ARCHIVES_URL,
    SEC_BASE_URL,
    USER_AGENT,
)

HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}


def _cache_path(subdir: str, name: str) -> Path:
    p = CACHE_DIR / subdir
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{name}.json"


def _cache_read(path: Path, ttl_days: int | None) -> Any | None:
    if not CACHE_ENABLED or not path.exists():
        return None
    try:
        with open(path) as f:
            entry = json.load(f)
        if ttl_days is not None:
            fetched = entry.get("fetched_at", 0)
            if time.time() - fetched > ttl_days * 86400:
                return None
        return entry.get("data")
    except (json.JSONDecodeError, OSError):
        return None


def _cache_write(path: Path, data: Any) -> None:
    if not CACHE_ENABLED:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump({"data": data, "fetched_at": time.time()}, f, separators=(",", ":"))
    except OSError:
        pass


def get_submissions(cik: str) -> dict[str, Any] | None:
    """Fetch company submissions (filing history) from SEC. Uses cache (1d TTL)."""
    cik_padded = cik.zfill(10)
    cache_file = _cache_path("submissions", cik_padded)
    cached = _cache_read(cache_file, CACHE_SUBMISSIONS_TTL_DAYS)
    if cached is not None:
        return cached
    url = f"{SEC_BASE_URL}/submissions/CIK{cik_padded}.json"
    with httpx.Client(timeout=30.0, headers=HEADERS) as client:
        resp = client.get(url)
        if resp.status_code != 200:
            return None
        data = resp.json()
    _cache_write(cache_file, data)
    return data


def _recent_13f_rows(data: dict) -> list[tuple[str, str, str]]:
    """(accession, report_date, filing_date) for each 13F-HR in recent filings."""
    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    accessions = filings.get("accessionNumber", [])
    report_dates = filings.get("reportDate", [])
    filing_dates = filings.get("filingDate", [])
    rows: list[tuple[str, str, str]] = []
    for i, form in enumerate(forms):
        if form != "13F-HR":
            continue
        acc = accessions[i] if i < len(accessions) else None
        report_date = (report_dates[i] or "").strip() if i < len(report_dates) else ""
        filing_date = (filing_dates[i] or "").strip() if i < len(filing_dates) else ""
        if acc and report_date:
            rows.append((acc, report_date, filing_date))
    return rows


def get_latest_13f_accession(cik: str) -> tuple[str | None, str | None]:
    """
    Get the accession number and report date for the latest 13F-HR filing.
    Returns (accession_number, report_date) or (None, None).
    """
    acc, report_date, _ = get_latest_13f_filing(cik)
    return acc, report_date


def get_latest_13f_filing(cik: str) -> tuple[str | None, str | None, str | None]:
    """Latest 13F-HR: (accession, report_date, filing_date)."""
    data = get_submissions(cik)
    if not data:
        return None, None, None
    rows = _recent_13f_rows(data)
    if not rows:
        return None, None, None
    acc, report_date, filing_date = rows[0]
    return acc, report_date, filing_date or None


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


def _discover_infotable_url(cik_norm: str, accession: str) -> str | None:
    """
    Fetch the filing index page and find the INFORMATION TABLE document URL.
    Falls back to None if not found.
    """
    from bs4 import BeautifulSoup

    path = _accession_to_path(accession)
    index_url = f"{SEC_ARCHIVES_URL}/data/{cik_norm}/{path}/{accession}-index.htm"
    try:
        with httpx.Client(timeout=30.0, headers=HEADERS) as client:
            resp = client.get(index_url)
            if resp.status_code != 200:
                return None
        soup = BeautifulSoup(resp.text, "html.parser")
        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            for cell in cells:
                if "INFORMATION TABLE" in cell.get_text(strip=True).upper():
                    link = row.find("a", href=True)
                    if link:
                        href = link["href"]
                        # href is an absolute path like /Archives/edgar/data/...
                        if href.startswith("/"):
                            return f"https://www.sec.gov{href}"
                        return href
    except Exception:
        pass
    return None


def get_13f_holdings(cik: str, accession: str) -> list[dict]:
    """
    Fetch and parse 13F holdings from the information table XML.
    Tries infotable.xml first (most common name), then discovers the real
    filename from the filing index (some filers use custom names).
    Returns list of holdings with: name, cusip, value, shares, title_of_class.
    Cached by (cik, accession); 13F data is final once filed so long TTL.
    """
    cik_norm = cik.lstrip("0") or "0"
    accession_safe = accession.replace("-", "_")
    cache_file = _cache_path("holdings", f"{cik_norm}_{accession_safe}")
    cached = _cache_read(cache_file, CACHE_HOLDINGS_TTL_DAYS)
    if cached is not None:
        return cached
    path = _accession_to_path(accession)
    # Try the standard infotable.xml name first
    with httpx.Client(timeout=30.0, headers=HEADERS) as client:
        for subdir in ["xslForm13F_X02", "xslForm13F_X01"]:
            url = f"{SEC_ARCHIVES_URL}/data/{cik_norm}/{path}/{subdir}/infotable.xml"
            resp = client.get(url)
            if resp.status_code == 200:
                holdings = _parse_infotable_xml(resp.text)
                _cache_write(cache_file, holdings)
                return holdings
    # Fall back: discover the actual filename from the filing index
    discovered_url = _discover_infotable_url(cik_norm, accession)
    if discovered_url:
        with httpx.Client(timeout=30.0, headers=HEADERS) as client:
            resp = client.get(discovered_url)
            if resp.status_code == 200:
                holdings = _parse_infotable_xml(resp.text)
                _cache_write(cache_file, holdings)
                return holdings
    return []


def _is_boilerplate_name(name: str) -> bool:
    """Filter out SEC/OMB footer text and other non-issuer rows."""
    if not name or len(name) > 200:
        return True
    n = name.upper()
    if n in (
        "NAME OF ISSUER", "COLUMN 1", "VALUE", "SHRS OR", "PRN AMT",
    ):
        return True
    # OMB / burden / form boilerplate
    if "OMB NUMBER" in n or "OMB Number" in name:
        return True
    if "ESTIMATED AVERAGE BURDEN" in n or "BURDEN HOURS" in n or "HOURS PER RESPONSE" in n:
        return True
    if "3235-0006" in name or "3235-0007" in name:
        return True
    if "PAPERWORK REDUCTION" in n or "DISCLOSURE" in n and "INFORMATION" in n and len(name) > 80:
        return True
    # Row that looks like a form disclaimer (long, no typical company pattern)
    if len(name) > 100 and not any(s in n for s in ("INC", "CORP", "CO", "LTD", "PLC", "LP", "LLC", "COM")):
        return True
    return False


def _parse_infotable_xml(html_text: str) -> list[dict]:
    """
    Parse SEC 13F infotable. SEC serves XSLT-transformed HTML, so we parse the table.
    Columns: Name, Title of Class, CUSIP, FIGI, Value, Shares, SH/PRN, Put/Call, ...
    Skips header rows and OMB/boilerplate text that sometimes appears in the table.
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
                if _is_boilerplate_name(name):
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
                # Skip rows with no economic content (avoid footer/empty lines)
                if value <= 0 and shares <= 0:
                    continue
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
