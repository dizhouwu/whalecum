"""Configuration for WhaleCum 13F Tracker"""
import json
from pathlib import Path

# Default list; override by placing funds.json in backend/
_DEFAULT_FUNDS = [
    {"name": "Whale Rock Capital Management", "cik": "0001387322"},
    {"name": "Pershing Square Capital Management", "cik": "0001336528"},
    {"name": "D1 Capital Partners", "cik": "0001747057"},
]

_CONFIG_DIR = Path(__file__).resolve().parent
_FUNDS_JSON = _CONFIG_DIR / "funds.json"


def _load_funds() -> list[dict]:
    if _FUNDS_JSON.exists():
        try:
            with open(_FUNDS_JSON) as f:
                data = json.load(f)
            if isinstance(data, list) and data:
                return data
        except (json.JSONDecodeError, OSError):
            pass
    return _DEFAULT_FUNDS.copy()


# Hedge funds to track (name, SEC CIK). Edit funds.json to use your own list.
HEDGE_FUNDS = _load_funds()


def get_funds() -> list[dict]:
    """Return current fund list (re-reads funds.json so edits apply without restart)."""
    return _load_funds()

SEC_BASE_URL = "https://data.sec.gov"
SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar"
# SEC requires User-Agent with format "Company AdminContact@domain" - see sec.gov/developer
USER_AGENT = "WhaleCum AdminContact@whalecum.local"

# Cache: 13F filings are final after 45d past quarter end; we cache to avoid repeated SEC requests.
# Submissions: short TTL so we pick up new quarters. Holdings: long TTL (filing never changes).
CACHE_DIR = _CONFIG_DIR / ".cache"
CACHE_SUBMISSIONS_TTL_DAYS = 1   # refresh filing list daily
CACHE_HOLDINGS_TTL_DAYS = 90     # 13F data is final once filed; long cache OK
CACHE_ENABLED = True
