"""Portfolio Contagion Stress-Testing & Optimal Counter-Hedge Finder.

Computes:
1. Holding-by-holding contagion shock and dollar P&L under active market shocks.
2. Net Portfolio Value-at-Risk (VaR 95%) and risk factor concentration.
3. Automated Counter-Hedge Discovery: identifies negatively correlated/opposing DAG assets
   to calculate optimal hedge sizing, coverage offset ratio, and economic mechanism.
"""
import math
import numpy as np
from . import kb, timeseries as ts

# Default institutional mock portfolio presets
PORTFOLIO_PRESETS = {
    "aviation_transport": {
        "id": "aviation_transport",
        "name": "✈️ Global Aviation & Transport Fund",
        "description": "Heavy exposure to passenger airlines, air freight, and commercial logistics.",
        "holdings": [
            {"node": "airlines", "ticker": "DAL", "label": "Delta Air Lines", "weight": 0.45},
            {"node": "airlines", "ticker": "UAL", "label": "United Airlines", "weight": 0.25},
            {"node": "semis", "ticker": "NVDA", "label": "Nvidia (Supply Chain)", "weight": 0.20},
            {"node": "usd", "ticker": "UUP", "label": "US Dollar Cash Buffer", "weight": 0.10},
        ],
    },
    "tech_growth": {
        "id": "tech_growth",
        "name": "💻 Tech & Semiconductor Growth",
        "description": "Long tech and hardware manufacturing with heavy interest rate sensitivity.",
        "holdings": [
            {"node": "semis", "ticker": "NVDA", "label": "Nvidia", "weight": 0.40},
            {"node": "semis", "ticker": "TSM", "label": "TSMC", "weight": 0.30},
            {"node": "sp500", "ticker": "SPY", "label": "S&P 500 Index", "weight": 0.20},
            {"node": "usd", "ticker": "UUP", "label": "Cash Reserve", "weight": 0.10},
        ],
    },
    "balanced_6040": {
        "id": "balanced_6040",
        "name": "🌐 Balanced Institutional 60/40",
        "description": "Classic diversified equity and fixed income allocation.",
        "holdings": [
            {"node": "sp500", "ticker": "SPY", "label": "S&P 500 Equity Core", "weight": 0.50},
            {"node": "banks", "ticker": "JPM", "label": "JPMorgan Chase", "weight": 0.15},
            {"node": "reits", "ticker": "VNQ", "label": "Vanguard Real Estate", "weight": 0.15},
            {"node": "treasury_10y", "ticker": "IEF", "label": "10-Year US Treasuries", "weight": 0.20},
        ],
    },
    "energy_industrial": {
        "id": "energy_industrial",
        "name": "⚡ Energy & Cyclical Industrials",
        "description": "Commodity producers and heavy cyclical industrial manufacturing.",
        "holdings": [
            {"node": "oil_producers", "ticker": "XOM", "label": "ExxonMobil", "weight": 0.40},
            {"node": "refiners", "ticker": "VLO", "label": "Valero Energy", "weight": 0.30},
            {"node": "banks", "ticker": "BAC", "label": "Bank of America", "weight": 0.20},
            {"node": "usd", "ticker": "UUP", "label": "Cash Buffer", "weight": 0.10},
        ],
    },
}

# Candidate liquid hedging instruments across macro asset classes
HEDGE_CANDIDATES = [
    {"node": "oil_producers", "ticker": "XOM", "label": "ExxonMobil (Energy Equity)", "asset_class": "Equities", "liquidity": "Tier 1 Liquid"},
    {"node": "crude_oil", "ticker": "USO", "label": "United States Oil Fund (Futures ETF)", "asset_class": "Commodities", "liquidity": "Tier 1 Liquid"},
    {"node": "gold", "ticker": "GLD", "label": "SPDR Gold Shares (Safe Haven)", "asset_class": "Precious Metals", "liquidity": "Tier 1 Liquid"},
    {"node": "treasury_10y", "ticker": "IEF", "label": "iShares 7-10 Year Treasury Bond", "asset_class": "Fixed Income", "liquidity": "Tier 1 Liquid"},
    {"node": "usd", "ticker": "UUP", "label": "Invesco DB US Dollar Bullish Fund", "asset_class": "Currencies (FX)", "liquidity": "Tier 1 Liquid"},
    {"node": "natural_gas", "ticker": "UNG", "label": "United States Natural Gas Fund", "asset_class": "Commodities", "liquidity": "Tier 2 Liquid"},
    {"node": "defense", "ticker": "ITA", "label": "iShares US Aerospace & Defense", "asset_class": "Equities", "liquidity": "Tier 1 Liquid"},
]


def analyze_portfolio_hedge(kg, analysis_raw, portfolio_holdings, total_value_usd=50000000.0):
    """Analyze net portfolio contagion and compute optimal counter-hedges.

    Args:
        kg: KnowledgeGraph instance
        analysis_raw: raw output from analyzer.analyze or whatif containing 'agg' or 'assets'
        portfolio_holdings: list of dicts with {node, ticker, weight, label}
        total_value_usd: total fund portfolio size in USD (default $50M)

    Returns:
        Structured dict with net P&L, holding shocks, and ranked counter-hedges.
    """
    agg = {}
    # Build fast lookup of node impact from analysis
    for r in (analysis_raw.get("assets") or []) + (analysis_raw.get("sectors") or []) + (analysis_raw.get("variables") or []):
        agg[r["node"]] = r

    # If analysis has raw propagation aggregation
    raw_agg = (analysis_raw.get("raw") or {}).get("agg") if isinstance(analysis_raw.get("raw"), dict) else None

    # Step 1: Calculate holding-level shock
    holdings_out = []
    net_pnl_usd = 0.0
    net_weighted_impact_pct = 0.0

    for h in portfolio_holdings:
        nid = h.get("node")
        weight = float(h.get("weight", 0.0))
        h_val = weight * total_value_usd
        row = agg.get(nid)

        if row:
            direction = row.get("direction", 0)
            confidence = float(row.get("confidence", 0.5))
            sensitivity = row.get("sensitivity", "moderate")
            sens_mult = 1.25 if sensitivity == "strong" else (1.0 if sensitivity == "moderate" else 0.70)
            # Baseline move estimate (percentage)
            move_pct = direction * confidence * sens_mult * 5.0
            mechanism = row.get("why") or row.get("headline") or "Downstream macro propagation"
        else:
            direction = 0
            confidence = 0.0
            move_pct = 0.0
            mechanism = "Neutral / unlinked to current shock"

        pnl_usd = h_val * (move_pct / 100.0)
        net_pnl_usd += pnl_usd
        net_weighted_impact_pct += weight * move_pct

        holdings_out.append({
            "node": nid,
            "ticker": h.get("ticker", nid.upper()),
            "label": h.get("label", kb.NODES.get(nid, {}).get("label", nid)),
            "weight": weight,
            "allocation_usd": round(h_val, 2),
            "predicted_move_pct": round(move_pct, 2),
            "pnl_usd": round(pnl_usd, 2),
            "direction": direction,
            "confidence": round(confidence, 2),
            "mechanism": mechanism,
        })

    # Step 2: Portfolio risk metrics
    net_pct = (net_pnl_usd / total_value_usd) * 100.0 if total_value_usd > 0 else 0.0
    is_downside = net_pnl_usd < 0

    # Stressed 30-day Value-at-Risk (95% confidence level under normal/Student-t)
    # Estimate weighted portfolio volatility
    est_vol_annual = 0.18 + (abs(net_pct) / 100.0) * 0.5
    daily_vol = est_vol_annual / math.sqrt(252)
    var_95_usd = round(total_value_usd * 1.645 * daily_vol * math.sqrt(21), 2)  # 21 trading days (1 month)

    # Primary risk driver
    negative_holdings = [h for h in holdings_out if h["pnl_usd"] < 0]
    negative_holdings.sort(key=lambda x: x["pnl_usd"])
    top_drag = negative_holdings[0] if negative_holdings else None

    # Step 3: Optimal Counter-Hedge Discovery
    recommended_hedges = []
    target_offset_usd = abs(net_pnl_usd) if is_downside else 0.0

    for cand in HEDGE_CANDIDATES:
        cnid = cand["node"]
        crow = agg.get(cnid)
        if not crow:
            continue

        c_dir = crow.get("direction", 0)
        c_conf = float(crow.get("confidence", 0.5))
        c_sens = crow.get("sensitivity", "moderate")
        sens_mult = 1.25 if c_sens == "strong" else (1.0 if c_sens == "moderate" else 0.70)
        c_move_pct = c_dir * c_conf * sens_mult * 5.0

        # We need a hedge that produces POSITIVE P&L when portfolio is negative
        # If cand moves UP (c_move_pct > 0), action is LONG/BUY
        # If cand moves DOWN (c_move_pct < 0), action is SHORT/SELL
        if abs(c_move_pct) < 0.2:
            continue

        action = "BUY / LONG" if c_move_pct > 0 else "SELL / SHORT"
        per_dollar_gain = abs(c_move_pct) / 100.0

        if per_dollar_gain > 0:
            # Sizing required to neutralize 100% of loss
            ideal_hedge_size_usd = min(total_value_usd * 0.40, target_offset_usd / per_dollar_gain) if target_offset_usd > 0 else total_value_usd * 0.15
            expected_hedge_gain_usd = ideal_hedge_size_usd * per_dollar_gain
            coverage_pct = min(98.0, max(15.0, (expected_hedge_gain_usd / target_offset_usd * 100.0))) if target_offset_usd > 0 else 85.0
        else:
            ideal_hedge_size_usd = total_value_usd * 0.10
            coverage_pct = 50.0

        net_post_hedge_pnl = net_pnl_usd + (expected_hedge_gain_usd if is_downside else 0.0)

        # Causal mechanism from KG
        mech = crow.get("why") or crow.get("headline") or "Counter-cyclical causal propagation"
        if top_drag and "airlines" in top_drag["node"] and "oil" in cnid:
            mech = "Energy upside inversely offsets jet fuel margin compression in airline holdings via direct commodity input pass-through."
        elif top_drag and "semis" in top_drag["node"] and "gold" in cnid:
            mech = "Gold serves as a non-yielding monetary safe haven, absorbing systemic tech multiple compression."

        # Basis risk heuristic (1 - correlation quality)
        corr_val = -0.74 if ("oil" in cnid and top_drag and "airlines" in top_drag["node"]) else (-0.62 if "gold" in cnid else -0.55)

        recommended_hedges.append({
            "asset_id": cnid,
            "ticker": cand["ticker"],
            "label": cand["label"],
            "asset_class": cand["asset_class"],
            "liquidity": cand["liquidity"],
            "action": action,
            "recommended_allocation_usd": round(ideal_hedge_size_usd, 2),
            "allocation_pct": round((ideal_hedge_size_usd / total_value_usd) * 100.0, 1),
            "predicted_asset_move_pct": round(c_move_pct, 2),
            "coverage_offset_pct": round(coverage_pct, 1),
            "post_hedge_net_pnl_usd": round(net_post_hedge_pnl, 2),
            "post_hedge_net_pct": round((net_post_hedge_pnl / total_value_usd) * 100.0, 2),
            "correlation": corr_val,
            "basis_risk": "Low" if abs(corr_val) >= 0.70 else "Moderate",
            "causal_mechanism": mech,
        })

    # Sort recommended hedges by coverage percentage descending
    recommended_hedges.sort(key=lambda h: -h["coverage_offset_pct"])

    return {
        "portfolio_value_usd": total_value_usd,
        "net_pnl_usd": round(net_pnl_usd, 2),
        "net_impact_pct": round(net_pct, 2),
        "is_downside": is_downside,
        "var_95_30d_usd": var_95_usd,
        "top_drag_holding": top_drag,
        "holdings": holdings_out,
        "recommended_hedges": recommended_hedges[:4],
        "presets": {k: {"id": v["id"], "name": v["name"], "description": v["description"]} for k, v in PORTFOLIO_PRESETS.items()},
    }
