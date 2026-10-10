"""Historical analog chart: find past windows where the same asset experienced a
similar-magnitude shock, and return them rebased to 100 at the shock date.

All series come from the existing timeseries layer (FRED / yfinance). Nothing is
invented; if no data is available the response omits analogs gracefully.

This is for pattern illustration ONLY. Past analogs do not predict future moves.
"""

import math
from datetime import datetime

import numpy as np

from . import timeseries as ts

# ---------------------------------------------------------------------------
# Known macro shock windows (inclusive ISO dates) -> human-readable label.
# Used to auto-label detected analog windows. Order matters: first match wins.
# ---------------------------------------------------------------------------
_EVENTS = [
    ("2020-02-15", "2020-04-30", "COVID-19 Crash"),
    ("2022-02-15", "2022-04-30", "Ukraine Invasion"),
    ("2022-05-01", "2022-10-31", "Fed Rate Hike Cycle"),
    ("2023-03-01", "2023-03-31", "SVB Banking Crisis"),
    ("2023-09-01", "2023-10-31", "Bond Yield Surge"),
    ("2024-08-01", "2024-08-31", "Yen Carry Unwind"),
    ("2024-10-01", "2024-12-31", "US Election / Rate Pivot"),
    ("2019-09-01", "2020-01-31", "US-China Trade War"),
    ("2018-10-01", "2018-12-31", "Q4 2018 Risk-Off"),
]


def _event_label(iso_date: str) -> str:
    """Return a macro event label if the date falls in a known window, else 'Prior shock YYYY-MM-DD'."""
    for start, end, label in _EVENTS:
        if start <= iso_date <= end:
            return label
    return f"Prior shock {iso_date}"


def _find_analog_windows(dates: list, price_vals: np.ndarray, shock_threshold: float, max_windows: int = 4):
    """Sliding 5-day scan for windows where |cumulative return over 5 days| >= shock_threshold.

    Returns list of (shock_date_index, shock_pct) sorted by |shock_pct| descending.
    We skip the last 90 days so the 'current' period is not returned as its own analog.
    """
    n = len(price_vals)
    guard = 90 + 5  # don't look in the last 90 days
    results = []
    used = set()

    for i in range(5, n - guard):
        window_ret = (price_vals[i] / price_vals[i - 5] - 1) * 100.0
        if abs(window_ret) >= shock_threshold:
            # Avoid windows within 20 days of an already-picked one
            if any(abs(i - j) < 20 for j in used):
                continue
            used.add(i)
            results.append((i, float(window_ret)))

    # Sort by magnitude descending, take top N
    results.sort(key=lambda x: -abs(x[1]))
    return results[:max_windows]


def _rebase_series(prices: np.ndarray, start_idx: int, length: int = 90) -> list[float]:
    """Return a 'length'-point series rebased to 100 starting at start_idx.
    Clips to available data; pads with the last value if needed.
    """
    segment = prices[start_idx: start_idx + length]
    if len(segment) == 0:
        return []
    base = segment[0]
    if base == 0 or not math.isfinite(base):
        return []
    rebased = (segment / base * 100.0).tolist()
    # Pad to full length if near end of series
    if len(rebased) < length:
        rebased.extend([rebased[-1]] * (length - len(rebased)))
    return [round(v, 3) for v in rebased]


def _relative_dates(anchor_date: str, length: int = 90) -> list[str]:
    """Return day-offset labels: 'D+0', 'D+1', ..., 'D+89'."""
    return [f"D+{i}" for i in range(length)]


def historical_analogs(node_id: str, shock_pct: float = 5.0, live: bool = True) -> dict:
    """Compute historical analog windows for `node_id`.

    Args:
        node_id: Knowledge-graph node id (e.g. 'crude_oil', 'airlines').
        shock_pct: The current event's shock magnitude in percent (sign does not matter for threshold).
        live: Whether to attempt a live fetch.

    Returns:
        Dict with 'ticker', 'current', 'analogs', 'source', 'note'.
    """
    # ---- Fetch raw price series (not returns) ----------------------------
    node = ts.kb.NODES.get(node_id)
    if not node or not node.get("series"):
        return _empty(node_id, "No market series defined for this node in the knowledge base.")

    raw_dates: list | None = None
    raw_vals: np.ndarray | None = None
    source_label = "unknown"

    for src, sid, kind in node["series"]:
        ck = f"{src}_{sid}"
        data = None
        if live:
            hit = ts._cache_read(ck)
            if hit and len(hit.get("vals", [])) > 180:
                data = (hit["dates"], np.array(hit["vals"], dtype=float))
                source_label = f"{src.upper()}:{sid}"
            else:
                try:
                    fetched_dates, fetched_vals = ts.fetch_live(src, sid)
                    ts._cache_write(ck, fetched_dates, fetched_vals)
                    data = (fetched_dates, np.array(fetched_vals, dtype=float))
                    source_label = f"{src.upper()}:{sid}"
                except Exception:
                    old = ts._cache_read(ck, ignore_ttl=True)
                    if old and len(old.get("vals", [])) > 180:
                        data = (old["dates"], np.array(old["vals"], dtype=float))
                        source_label = f"{src.upper()}:{sid} (cached)"
        else:
            old = ts._cache_read(ck, ignore_ttl=True)
            if old and len(old.get("vals", [])) > 180:
                data = (old["dates"], np.array(old["vals"], dtype=float))
                source_label = f"{src.upper()}:{sid} (cached)"

        if data is not None:
            raw_dates, raw_vals = data
            break

    if raw_dates is None or raw_vals is None or len(raw_vals) < 180:
        return _empty(node_id, "Not enough historical price data available (need ≥ 180 days).")

    # Remove NaN / non-finite values
    valid_mask = np.isfinite(raw_vals) & (raw_vals > 0)
    if valid_mask.sum() < 180:
        return _empty(node_id, "Too many missing values in the price series.")
    clean_dates = [d for d, m in zip(raw_dates, valid_mask) if m]
    clean_vals = raw_vals[valid_mask]

    # ---- Current series (last 90 trading days, rebased to 100) -----------
    current_length = min(90, len(clean_vals))
    current_prices = clean_vals[-current_length:]
    current_base = float(current_prices[0])
    current_values = [round(float(v / current_base * 100.0), 3) for v in current_prices]
    current_dates = _relative_dates(clean_dates[-current_length], current_length)

    # ---- Find analog windows ---------------------------------------------
    threshold = max(0.5, 0.6 * abs(shock_pct))
    windows = _find_analog_windows(clean_dates, clean_vals, threshold, max_windows=4)

    analogs = []
    seen_labels: set[str] = set()

    for idx, window_shock_pct in windows:
        shock_date = clean_dates[idx]
        label = _event_label(shock_date)
        # Deduplicate same-label analogs (e.g. two windows in the Ukraine period)
        if label in seen_labels:
            label = f"{label} ({shock_date})"
        seen_labels.add(label)

        values = _rebase_series(clean_vals, idx, length=90)
        if not values:
            continue
        analogs.append({
            "label": label,
            "shock_date": shock_date,
            "shock_pct": round(window_shock_pct, 2),
            "dates": _relative_dates(shock_date, 90),
            "values": values,
        })

    return {
        "node_id": node_id,
        "ticker": source_label.split(":")[-1] if ":" in source_label else node_id,
        "current": {
            "label": "Now",
            "dates": current_dates,
            "values": current_values,
        },
        "analogs": analogs,
        "source": source_label,
        "shock_pct": round(float(shock_pct), 2),
        "threshold_used": round(threshold, 2),
        "note": (
            "All series rebased to 100 at the shock date. "
            "Past analogs illustrate historical patterns only and do not predict future moves. "
            "This is not investment advice."
        ),
    }


def _empty(node_id: str, reason: str) -> dict:
    return {
        "node_id": node_id,
        "ticker": node_id,
        "current": None,
        "analogs": [],
        "source": None,
        "shock_pct": 0.0,
        "threshold_used": 0.0,
        "note": reason,
    }
