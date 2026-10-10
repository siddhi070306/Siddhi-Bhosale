"""Monte Carlo Econometric Forecast for Apex Zenith time-series layer.

Simulates future asset trajectories under macro shocks using Geometric Brownian
Motion (GBM) calibrated on empirical historical volatility (FRED / Yahoo Finance).
Provides quantile bands (p10, p25, p50, p75, p90) and parametric risk metrics
(VaR, Expected Shortfall, Prob of Loss).
"""

import math
import numpy as np

from . import timeseries as ts

TRADING_DAYS_PER_YEAR = 252


def simulate_monte_carlo(
    node_id: str,
    shock_pct: float = 0.0,
    horizon_days: int = 30,
    simulations: int = 500,
    live: bool = False,
    seed: int | None = 42
) -> dict:
    """Run a calibrated Monte Carlo forward simulation.

    Args:
        node_id: Knowledge graph node id (e.g. 'crude_oil', 'airlines').
        shock_pct: Event shock applied immediately at Day 0 (e.g., +5.0 or -8.5).
        horizon_days: Forecast horizon in trading days (default 30, clamped 10-90).
        simulations: Number of Monte Carlo stochastic paths (default 500).
        live: Whether to try fetching live series data.
        seed: Random seed for reproducibility (default 42).

    Returns:
        Dict with percentile bands, metrics, and parameters.
    """
    horizon = int(max(10, min(90, horizon_days)))
    n_sims = int(max(100, min(2000, simulations)))

    # Fetch historical returns for calibration
    ret_res = ts.get_returns(node_id, live=live)
    source_label = "Model Prior (Calibrated)"
    ticker = None

    if ret_res is not None:
        _, rets, info = ret_res
        source_label = info.get("source", "historical")
        ticker = info.get("ticker")
        clean_rets = [r for r in rets if math.isfinite(r)]
    else:
        clean_rets = []

    # Calibrate daily drift (mu) and daily volatility (sigma)
    if len(clean_rets) >= 30:
        mu_daily = float(np.mean(clean_rets))
        sigma_daily = float(np.std(clean_rets, ddof=1))
        # Protect against degenerate zero volatility
        if sigma_daily < 1e-4:
            sigma_daily = 0.015
    else:
        # Fallback prior: neutral drift, 1.5% daily vol (~23.8% ann vol)
        mu_daily = 0.0002
        sigma_daily = 0.015

    # Day 0 starting value incorporating immediate event shock
    # E.g. shock_pct = +5.0 -> S_0 = 105.0; shock_pct = 0.0 -> S_0 = 100.0
    s0 = 100.0 * (1.0 + float(shock_pct) / 100.0)

    # Simulation engine: Geometric Brownian Motion
    # dS_t = S_t * (mu * dt + sigma * dW_t)
    # log(S_t / S_0) = (mu - 0.5 * sigma^2) * t + sigma * W_t
    rng = np.random.default_rng(seed)

    # Standard normal increments: shape (n_sims, horizon)
    shocks = rng.standard_normal(size=(n_sims, horizon))

    drift_step = mu_daily - 0.5 * (sigma_daily ** 2)
    step_log_returns = drift_step + sigma_daily * shocks

    # Cumulative log returns from t=1 to horizon
    cum_log_returns = np.cumsum(step_log_returns, axis=1)

    # Matrix of simulated paths: shape (n_sims, horizon + 1)
    # Column 0 is Day 0 (S0)
    paths = np.empty((n_sims, horizon + 1), dtype=float)
    paths[:, 0] = s0
    paths[:, 1:] = s0 * np.exp(cum_log_returns)

    # Percentile extraction at each trading day t in [0..horizon]
    p10 = np.percentile(paths, 10, axis=0)
    p25 = np.percentile(paths, 25, axis=0)
    p50 = np.percentile(paths, 50, axis=0)  # median trajectory
    p75 = np.percentile(paths, 75, axis=0)
    p90 = np.percentile(paths, 90, axis=0)
    mean_path = np.mean(paths, axis=0)

    # Terminal distribution metrics at horizon (relative to initial base 100)
    terminal_prices = paths[:, -1]
    terminal_returns_pct = (terminal_prices / 100.0 - 1.0) * 100.0

    # Value at Risk (VaR 95%): 5th percentile loss from base 100
    p5_terminal = np.percentile(terminal_returns_pct, 5)
    var_95_pct = round(abs(min(0.0, float(p5_terminal))), 2)

    # Conditional VaR (Expected Shortfall 95%): average loss when loss exceeds VaR 95%
    tail_losses = terminal_returns_pct[terminal_returns_pct <= p5_terminal]
    cvar_95_pct = round(abs(min(0.0, float(np.mean(tail_losses)))), 2) if len(tail_losses) > 0 else var_95_pct

    prob_loss = round(float(np.mean(terminal_returns_pct < 0.0)) * 100.0, 1)
    median_return = round(float(np.percentile(terminal_returns_pct, 50)), 2)

    days = [f"D+{t}" for t in range(horizon + 1)]

    return {
        "node_id": node_id,
        "ticker": ticker,
        "source": source_label,
        "horizon_days": horizon,
        "simulations": n_sims,
        "shock_pct": round(float(shock_pct), 2),
        "params": {
            "mu_daily_pct": round(mu_daily * 100.0, 4),
            "sigma_daily_pct": round(sigma_daily * 100.0, 3),
            "sigma_annualized_pct": round(sigma_daily * math.sqrt(TRADING_DAYS_PER_YEAR) * 100.0, 2),
        },
        "days": days,
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
        "note": "Monte Carlo paths generated via calibrated Geometric Brownian Motion. For risk modeling only; past volatility does not guarantee future results."
    }
