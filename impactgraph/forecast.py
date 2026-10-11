"""Monte Carlo volatility fan for an asset, calibrated on its REAL historical returns.

What this is, and is not
  * It shows how wide the range of outcomes could plausibly be, given how volatile the series has actually been
    (geometric Brownian motion, zero drift). It is not a prediction of direction and not a price target.
  * The day-0 shock is an ASSUMPTION supplied by the caller (what-if). The knowledge graph's plausibility scores are
    not price moves and must never be passed in as one.
  * It refuses to run, and says why, when the only data would be invented: a simulated series, a series that is not
    a return series (yields and expectations are stored as changes in percentage points), or no series at all.
"""
from __future__ import annotations

import math

import numpy as np

from . import timeseries as ts

TRADING_DAYS_PER_YEAR = 252
MIN_OBSERVATIONS = 120


def _unavailable(node_id, reason, shock_pct, horizon):
    return {"available": False, "node_id": node_id, "reason": reason, "shock_pct": round(float(shock_pct), 2),
            "horizon_days": horizon,
            "note": "No forecast is shown rather than one built on invented data. " + reason}


def simulate_monte_carlo(
    node_id: str,
    shock_pct: float = 0.0,
    horizon_days: int = 30,
    simulations: int = 500,
    live: bool = False,
    seed: int | None = 42,
) -> dict:
    """Run a volatility-calibrated Monte Carlo fan.

    Args:
        node_id: knowledge graph node id (e.g. 'crude_oil', 'airlines').
        shock_pct: the day-0 jump to ASSUME (e.g. +5.0 or -8.5). 0 means no event shock.
        horizon_days: trading days ahead (clamped to 10-90).
        simulations: number of paths (clamped to 100-2000).
        live: allow a live fetch of the series if it is not cached.
        seed: random seed for reproducible fans.
    """
    horizon = int(max(10, min(90, horizon_days)))
    n_sims = int(max(100, min(2000, simulations)))

    ret_res = ts.get_returns(node_id, live=live)
    if ret_res is None:
        return _unavailable(node_id, "This node has no market price series in the knowledge base.", shock_pct, horizon)
    _, rets, info = ret_res
    if info.get("simulated"):
        return _unavailable(node_id, "Only simulated data is available for this node%s." % (
            "" if live else " (turn on live market data and re-run the analysis to fetch the real series)"), shock_pct, horizon)
    if info.get("kind") != "ret":
        return _unavailable(node_id, "This series is a level measured in percentage points (a yield or an expectation), "
                                     "so a return-based simulation does not apply to it.", shock_pct, horizon)
    clean = [r for r in rets if math.isfinite(r)]
    if len(clean) < MIN_OBSERVATIONS:
        return _unavailable(node_id, "Only %d usable daily returns; at least %d are needed." % (len(clean), MIN_OBSERVATIONS),
                            shock_pct, horizon)

    sigma_daily = float(np.std(clean, ddof=1))
    if not math.isfinite(sigma_daily) or sigma_daily < 1e-6:
        return _unavailable(node_id, "The series is flat, so its volatility cannot be estimated.", shock_pct, horizon)
    mu_daily = 0.0        # no drift: the sample mean of a short history says nothing reliable about direction

    # Day 0 level: pre-event level = 100, plus the assumed shock
    s0 = 100.0 * (1.0 + float(shock_pct) / 100.0)

    # Geometric Brownian motion: log(S_t / S_0) = (mu - 0.5 sigma^2) t + sigma W_t
    rng = np.random.default_rng(seed)
    shocks = rng.standard_normal(size=(n_sims, horizon))
    step_log_returns = (mu_daily - 0.5 * sigma_daily ** 2) + sigma_daily * shocks
    cum_log_returns = np.cumsum(step_log_returns, axis=1)

    paths = np.empty((n_sims, horizon + 1), dtype=float)
    paths[:, 0] = s0
    paths[:, 1:] = s0 * np.exp(cum_log_returns)

    pct = lambda q: np.percentile(paths, q, axis=0)
    p10, p25, p50, p75, p90 = pct(10), pct(25), pct(50), pct(75), pct(90)
    mean_path = np.mean(paths, axis=0)

    # terminal outcomes relative to the PRE-EVENT level (100)
    terminal_returns_pct = (paths[:, -1] / 100.0 - 1.0) * 100.0
    p5_terminal = np.percentile(terminal_returns_pct, 5)
    var_95_pct = round(abs(min(0.0, float(p5_terminal))), 2)
    tail = terminal_returns_pct[terminal_returns_pct <= p5_terminal]
    cvar_95_pct = round(abs(min(0.0, float(np.mean(tail)))), 2) if len(tail) else var_95_pct
    prob_loss = round(float(np.mean(terminal_returns_pct < 0.0)) * 100.0, 1)
    median_return = round(float(np.percentile(terminal_returns_pct, 50)), 2)

    return {
        "available": True,
        "node_id": node_id,
        "ticker": info.get("source", "").split(":")[-1] or None,
        "source": info.get("source", "historical"),
        "data_mode": info.get("mode"),
        "observations": len(clean),
        "horizon_days": horizon,
        "simulations": n_sims,
        "shock_pct": round(float(shock_pct), 2),
        "params": {
            "mu_daily_pct": 0.0,
            "sigma_daily_pct": round(sigma_daily * 100.0, 3),
            "sigma_annualized_pct": round(sigma_daily * math.sqrt(TRADING_DAYS_PER_YEAR) * 100.0, 2),
        },
        "days": ["D+%d" % t for t in range(horizon + 1)],
        "bands": {
            "p10": [round(float(v), 2) for v in p10],
            "p25": [round(float(v), 2) for v in p25],
            "p50": [round(float(v), 2) for v in p50],
            "p75": [round(float(v), 2) for v in p75],
            "p90": [round(float(v), 2) for v in p90],
            "mean": [round(float(v), 2) for v in mean_path],
        },
        "metrics": {
            "median_terminal_pct": median_return,
            "var_95_pct": var_95_pct,
            "cvar_95_pct": cvar_95_pct,
            "prob_loss_pct": prob_loss,
            "s0": round(s0, 2),
        },
        "note": ("A volatility fan, not a forecast of direction: geometric Brownian motion with zero drift, volatility measured on "
                 "%d real daily returns of %s. The day-0 shock (%+.1f%%) is an assumption you set, not a model estimate. "
                 "Real markets have fatter tails than this model, so the bands understate extreme moves. Not investment advice."
                 % (len(clean), info.get("source", "the series"), float(shock_pct))),
    }
