"""Configuration for WhaleCum 13F Tracker"""
import json
from pathlib import Path

# Default list; override by placing funds.json in backend/
_DEFAULT_FUNDS = [
    {"name": "Whale Rock Capital Management", "cik": "0001387322", "style": "long_only_growth"},
    {"name": "Pershing Square Capital Management", "cik": "0001336528", "style": "concentrated_activist"},
    {"name": "D1 Capital Partners", "cik": "0001747057", "style": "crossover"},
]

_CONFIG_DIR = Path(__file__).resolve().parent
_FUNDS_JSON = _CONFIG_DIR / "funds.json"
_TICKER_OVERRIDES_JSON = _CONFIG_DIR / "ticker_overrides.json"


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


# Hedge funds to track (name, SEC CIK, optional style). Edit funds.json to customize.
HEDGE_FUNDS = _load_funds()


def get_funds() -> list[dict]:
    """Return current fund list (re-reads funds.json so edits apply without restart)."""
    return _load_funds()


SEC_BASE_URL = "https://data.sec.gov"
SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar"
USER_AGENT = "WhaleCum AdminContact@whalecum.local"

# History & analysis windows
DEFAULT_HISTORY_QUARTERS = 8
DEFAULT_CHANGES_QUARTERS = 8
TOP_N_OVERLAP = 20

# Supermajority: min funds (of N tracked) for cross-fund signals; None = ceil(2N/3)
SUPERMAJORITY_MIN_FUNDS: int | None = None

# Materiality (13F values are in thousands USD)
MATERIALITY_MIN_VALUE_CHANGE_K = 10_000  # $10M
MATERIALITY_MIN_WEIGHT_PCT = 0.25  # portfolio weight points

# Idea list
ACTION_LIST_MAX = 25

# Cache
CACHE_DIR = _CONFIG_DIR / ".cache"
CACHE_SUBMISSIONS_TTL_DAYS = 1
CACHE_HOLDINGS_TTL_DAYS = 90
CACHE_ENABLED = True
INSIGHTS_CACHE_TTL_SECONDS = 300


def supermajority_threshold(fund_count: int) -> int:
    if SUPERMAJORITY_MIN_FUNDS is not None:
        return min(SUPERMAJORITY_MIN_FUNDS, fund_count)
    if fund_count <= 2:
        return fund_count
    return max(2, (2 * fund_count + 2) // 3)
