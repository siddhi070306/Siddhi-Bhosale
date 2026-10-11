"""The economic reason behind each link ("channel"), so links that rely on the same reason can be adjusted together.

When a user changes a link's weight they are saying something about a reason ("fuel costs matter less to airlines than we
thought"). Other links that work through the same reason (fuel costs for autos and consumers) are then proposed for the same
proportional change; links with a different reason keep their own evidence. Structural links (sector membership, index
weight, an ETF tracking its sector) are never grouped: each is checked against its own price data.

The channel is read from the link's relation and its mechanism sentence with fixed keyword rules (deterministic, no model
call), first match wins.
"""
import re

CHANNELS = [
    # (id, label, keywords in the mechanism sentence)
    ("supply_risk", "Supply and disruption risk", ["supply", "freight", "rerouting", "risk premium", "output"]),
    ("safe_haven", "Risk appetite and safe havens", ["safe", "risk appetite", "flight to safety", "high-beta", "sell off",
                                                    "emerging-market equity"]),
    ("policy", "Central-bank policy", ["reprice", "central-bank stance", "ecb moves", "central banks keep", "policy moves"]),
    ("currency", "Currency, trade and capital flows", ["rupee", "dollar-priced", "current-account", "terms-of-trade", "exporters earn",
                                                "portfolio outflows", "capital flows", "currency"]),
    ("feedstock", "Feedstock and input costs", ["feedstock", "input cost", "inputs get costlier", "packaging", "raw material"]),
    ("energy_cost", "Fuel and energy costs", ["fuel", "energy cost", "power cost"]),
    ("inflation", "Prices feeding inflation", ["cpi", "inflation", "heating costs", "food prices", "purchasing power"]),
    ("borrowing_cost", "Borrowing costs and interest rates", ["mortgage", "loan", "financing", "discount rate", "valuations",
                                                              "interest margin", "opportunity cost", "yields", "consumer credit",
                                                              "lending", "borrowing"]),
    ("producer_revenue", "Producers' revenue and margins", ["revenue", "margins", "realised prices", "leveraged to"]),
    ("demand", "Demand and the business cycle", ["demand", "growth", "earnings", "income", "spending", "sales", "cyclical",
                                                 "consumption", "credit"]),
]
LABEL = {c[0]: c[1] for c in CHANNELS}
LABEL.update({"structure": "Sector membership, index weight or ETF tracking", "other": "Other"})
STRUCTURAL_RELATIONS = {"member_of", "tracks", "weight_in"}
STRUCTURAL_WORDS = ["sector member", "etf", "index weight", "index is made", "heaviest", "overlapping", "largest single",
                    "conglomerate", "placed in this sector", "assigned to", "inferred from the company name"]
GROUPABLE = {c[0] for c in CHANNELS}


def channel_of(kg, u, v):
    """-> channel id for the link u -> v."""
    from . import hierarchy
    e = kg.g[u][v]
    mech = (e.get("mechanism") or "").lower()
    if hierarchy.rel(kg.g, u, v) in STRUCTURAL_RELATIONS or any(w in mech for w in STRUCTURAL_WORDS):
        return "structure"
    for cid, _, words in CHANNELS:
        if any(re.search(r"\b" + re.escape(w), mech) for w in words):
            return cid
    return "other"


def siblings(kg, u, v):
    """Other links that work through the same reason as u -> v (none for structural or unclassified links)."""
    ch = channel_of(kg, u, v)
    if ch not in GROUPABLE:
        return ch, []
    out = [(a, b) for a, b in kg.g.edges if (a, b) != (u, v) and channel_of(kg, a, b) == ch]
    return ch, sorted(out, key=lambda ab: (-kg.g[ab[0]][ab[1]]["strength"], ab))
