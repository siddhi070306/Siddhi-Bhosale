"""Benchmark dataset for evaluating the Apex Zenith event extraction and graph pipeline."""

BENCHMARK_SUITE = [
    {
        "id": "oil_strait_hormuz",
        "category": "Commodities & Geopolitics",
        "description": "Crude oil surge, OPEC+ hold, airline drop, and downstream energy gain",
        "text": (
            "Brent crude jumped 12% on Monday after an attack on tankers near the Strait of Hormuz raised fears of a supply disruption. "
            "OPEC+ signalled it would keep its output cuts in place. Analysts warned that higher energy costs could lift inflation expectations "
            "and push central banks to keep interest rates higher for longer. Airline stocks fell sharply, with Delta Air Lines among the biggest "
            "decliners, while ExxonMobil and ONGC gained. The rupee weakened as India's import bill is expected to widen."
        ),
        "expected_entities": ["crude_oil", "opec", "inflation_exp", "rates", "airlines", "exxon", "usdinr"],
        "expected_events": [
            {"trigger": "crude_oil", "direction": 1, "status": "observed", "magnitude": "12%"},
            {"trigger": "inflation_exp", "direction": 1, "status": "expected"},
            {"trigger": "airlines", "direction": -1, "status": "observed"},
            {"trigger": "exxon", "direction": 1, "status": "observed"},
            {"trigger": "usdinr", "direction": 1, "status": "observed"},
        ],
        "expected_impacts": {
            "airlines": -1,
            "energy": 1,
        },
        "forbidden_entities": [],
    },
    {
        "id": "fed_rate_hike",
        "category": "Monetary Policy",
        "description": "50 bps Fed rate increase, dollar surge, real estate contraction",
        "text": (
            "The Federal Reserve raised interest rates by 50 basis points on Wednesday, more than markets had expected. "
            "The dollar index jumped 1.2% and 10-year yields rose as investors priced in a longer period of tight policy. "
            "Real estate stocks fell, while analysts said banks could benefit from wider lending margins."
        ),
        "expected_entities": ["fed", "rates", "dxy", "us10y", "real_estate", "banks"],
        "expected_events": [
            {"trigger": "rates", "direction": 1, "status": "observed", "magnitude": "50 bps"},
            {"trigger": "dxy", "direction": 1, "status": "observed", "magnitude": "1.2%"},
            {"trigger": "real_estate", "direction": -1, "status": "observed"},
            {"trigger": "banks", "direction": 1, "status": "expected"},
        ],
        "expected_impacts": {
            "real_estate": -1,
            "dxy": 1,
        },
        "forbidden_entities": [],
    },
    {
        "id": "rbi_bank_rules",
        "category": "Banking Regulation",
        "description": "RBI tightening risk weights, bank stocks sliding",
        "text": (
            "The RBI imposed tighter rules on banks, raising risk weights on unsecured consumer loans. "
            "Bank stocks fell 2.5% as lenders flagged higher capital requirements. HDFC Bank and State Bank of India slid in early trade. "
            "Analysts said the move could slow credit growth and weigh on consumer spending."
        ),
        "expected_entities": ["rbi", "banks", "hdfc_bank", "sbi"],
        "expected_events": [
            {"trigger": "banks", "direction": -1, "status": "observed", "magnitude": "2.5%"},
            {"trigger": "hdfc_bank", "direction": -1, "status": "observed"},
        ],
        "expected_impacts": {
            "banks": -1,
        },
        "forbidden_entities": [],
    },
    {
        "id": "gold_safe_haven",
        "category": "Safe Haven & Commodities",
        "description": "Gold rally, conflict escalation, US stock decline",
        "text": (
            "Gold rallied 3.4% as military conflict in the Middle East escalated and investors fled to safe havens. "
            "US stocks slipped while Treasury yields fell. Analysts warned that a prolonged conflict could push oil higher and "
            "revive inflation fears."
        ),
        "expected_entities": ["gold", "sp500", "us10y", "crude_oil", "inflation_exp"],
        "expected_events": [
            {"trigger": "gold", "direction": 1, "status": "observed", "magnitude": "3.4%"},
            {"trigger": "sp500", "direction": -1, "status": "observed"},
            {"trigger": "us10y", "direction": -1, "status": "observed"},
            {"trigger": "crude_oil", "direction": 1, "status": "expected"},
        ],
        "expected_impacts": {
            "gold": 1,
        },
        "forbidden_entities": [],
    },
]
