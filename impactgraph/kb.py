"""Curated seed knowledge base: entities and prior causal relationships.

Edge semantics
    sign      +1 if the source rising pushes the target up, -1 if it pushes it down
    strength  0..1 plausibility that the transmission operates and is material
              (an analyst prior, NOT a statistically estimated coefficient)
    lag       typical days before the effect shows up
Everything here is a *prior*. Live data (see timeseries.py) and article evidence
(see graph.py) adjust confidence; nothing in this file is a prediction.
"""

# (id, label, type, aliases, series candidates)
# A leading "!" on an alias means case-sensitive matching.
# series: list of (source, id, kind); kind "ret" = pct returns, "diff" = first difference
_N = []


def _n(id_, label, type_, aliases=(), series=(), kind=None):
    _N.append(dict(id=id_, label=label, type=type_, aliases=list(aliases),
                   series=list(series), kind=kind))


# ---- commodities ----------------------------------------------------------------------------
_n("crude_oil", "Crude Oil", "commodity",
   ["brent crude", "brent", "wti crude", "wti", "west texas intermediate", "crude oil", "crude",
    "oil prices", "oil price", "oil"],
   [("fred", "DCOILBRENTEU", "ret"), ("yf", "BZ=F", "ret"), ("yf", "CL=F", "ret")])
_n("natural_gas", "Natural Gas", "commodity", ["natural gas", "nat gas", "lng prices", "gas prices"],
   [("fred", "DHHNGSP", "ret"), ("yf", "NG=F", "ret")])
_n("gold", "Gold", "commodity", ["gold prices", "gold price", "bullion", "gold"], [("yf", "GC=F", "ret")])
_n("wheat", "Wheat", "commodity", ["wheat", "grain prices"], [("yf", "ZW=F", "ret")])
_n("copper", "Copper", "commodity", ["copper", "dr. copper"], [("yf", "HG=F", "ret")])

# ---- macro indicators -----------------------------------------------------------------------
_n("inflation_exp", "Inflation Expectations", "indicator",
   ["inflation expectations", "inflationary pressure", "inflation outlook", "inflation fears",
    "inflation", "cpi", "price pressures"],
   [("fred", "T5YIE", "diff")])
_n("rate_exp", "Interest-Rate Expectations", "indicator",
   ["interest rate expectations", "rate expectations", "rate-hike expectations", "interest rates",
    "interest rate", "borrowing costs", "policy rate", "repo rate", "rates"],
   [("fred", "DGS2", "diff"), ("yf", "^IRX", "diff")])
_n("us10y", "US 10Y Treasury Yield", "indicator",
   ["10-year yield", "10-year treasury", "ten-year yield", "treasury yields", "treasury yield",
    "bond yields", "bond yield"],
   [("fred", "DGS10", "diff"), ("yf", "^TNX", "diff")])
_n("usd", "US Dollar", "indicator", ["us dollar", "dollar index", "!DXY", "greenback", "dollar"],
   [("fred", "DTWEXBGS", "ret"), ("yf", "DX-Y.NYB", "ret")])
_n("usdinr", "USD/INR (Rupee weakness)", "indicator", ["indian rupee", "rupee", "usd/inr", "!INR"],
   [("fred", "DEXINUS", "ret"), ("yf", "INR=X", "ret")])
_n("gdp_growth", "Economic Growth", "indicator", ["economic growth", "gdp growth", "gdp", "growth outlook"], [])
_n("consumer_spending", "Consumer Spending", "indicator",
   ["consumer spending", "consumer demand", "household spending"], [])
_n("risk_aversion", "Risk Aversion", "indicator",
   ["risk aversion", "risk-off", "flight to safety", "market volatility", "!VIX", "market jitters"],
   [("fred", "VIXCLS", "ret"), ("yf", "^VIX", "ret")])
_n("geopolitical_tension", "Geopolitical Tension", "event_class",
   ["geopolitical tensions", "geopolitical tension", "geopolitical risk", "middle east", "strait of hormuz",
    "hormuz", "red sea", "ukraine", "russia", "iran", "israel", "gaza", "taiwan strait", "south china sea"])
_n("opec_supply_cut", "OPEC+ Supply Restraint", "event_class", ["opec+", "opec"])

# ---- central banks --------------------------------------------------------------------------
_n("fed", "US Federal Reserve", "institution", ["federal reserve", "fomc", "!Fed", "powell"])
_n("rbi", "Reserve Bank of India", "institution", ["reserve bank of india", "!RBI"])
_n("central_banks", "Central Banks (generic)", "institution", ["central banks", "central bank", "policymakers"])
_n("ecb", "European Central Bank", "institution", ["european central bank", "!ECB", "lagarde"])

# ---- sectors --------------------------------------------------------------------------------
_n("airlines", "Airlines", "sector", ["airline stocks", "airline shares", "airline sector", "airlines", "carriers", "aviation"],
   [("yf", "JETS", "ret")])
_n("banks", "Banks", "sector", ["banking stocks", "bank stocks", "banking sector", "banks", "lenders"],
   [("yf", "XLF", "ret")])
_n("real_estate", "Real Estate", "sector",
   ["real estate", "property stocks", "property developers", "housing market", "realty", "housing"],
   [("yf", "XLRE", "ret")])
_n("oil_gas_producers", "Oil & Gas Producers", "sector",
   ["oil and gas", "oil & gas", "energy stocks", "energy shares", "energy sector", "oil producers", "upstream"],
   [("yf", "XLE", "ret")])
_n("refiners", "Refiners", "sector", ["refiners", "refining"], [("yf", "CRAK", "ret")])
_n("autos", "Autos", "sector", ["auto stocks", "automakers", "carmakers", "automobile", "auto sector"],
   [("yf", "CARZ", "ret")])
_n("fmcg", "FMCG / Staples", "sector", ["consumer staples", "packaged goods", "fmcg"], [("yf", "XLP", "ret")])
_n("consumer_disc", "Consumer Discretionary", "sector", ["consumer discretionary", "retail stocks"],
   [("yf", "XLY", "ret")])
_n("chemicals", "Chemicals", "sector", ["petrochemical", "chemical makers", "chemicals"], [("yf", "XLB", "ret")])
_n("utilities", "Utilities", "sector", ["power producers", "utilities"], [("yf", "XLU", "ret")])
_n("gold_miners", "Gold Miners", "sector", ["gold miners", "mining stocks"], [("yf", "GDX", "ret")])
_n("shipping", "Shipping", "sector", ["container lines", "freight rates", "shipping", "freight"], [("yf", "SEA", "ret")])
_n("it_services", "IT Services", "sector", ["it services", "it stocks", "software exporters", "tech exporters"],
   [("yf", "XLK", "ret")])

# ---- companies ------------------------------------------------------------------------------
for _id, _label, _al, _tk in [
    ("exxon", "Exxon Mobil", ["exxonmobil", "exxon mobil", "exxon"], "XOM"),
    ("chevron", "Chevron", ["chevron"], "CVX"),
    ("ongc", "ONGC", ["oil and natural gas corp", "ongc"], "ONGC.NS"),
    ("reliance", "Reliance Industries", ["reliance industries", "!Reliance"], "RELIANCE.NS"),
    ("delta", "Delta Air Lines", ["delta air lines", "!Delta"], "DAL"),
    ("united", "United Airlines", ["united airlines"], "UAL"),
    ("indigo", "IndiGo", ["interglobe aviation", "indigo"], "INDIGO.NS"),
    ("jpm", "JPMorgan Chase", ["jpmorgan chase", "jpmorgan"], "JPM"),
    ("hdfcbank", "HDFC Bank", ["hdfc bank"], "HDFCBANK.NS"),
    ("sbi", "State Bank of India", ["state bank of india", "!SBI"], "SBIN.NS"),
    ("tatamotors", "Tata Motors", ["tata motors"], "TATAMOTORS.NS"),
    ("dlf", "DLF", ["!DLF"], "DLF.NS"),
    ("hul", "Hindustan Unilever", ["hindustan unilever", "!HUL"], "HINDUNILVR.NS"),
    ("infosys", "Infosys", ["infosys"], "INFY.NS"),
    ("tcs", "TCS", ["tata consultancy services", "!TCS"], "TCS.NS"),
]:
    _n(_id, _label, "company", _al, [("yf", _tk, "ret")])

# ---- indices & instruments ------------------------------------------------------------------
for _id, _label, _al, _tk, _t in [
    ("spx", "S&P 500", ["s&p 500", "s&p500", "wall street", "us stocks"], "^GSPC", "index"),
    ("nifty50", "Nifty 50", ["nifty 50", "nse nifty", "!Nifty", "indian stocks", "dalal street"], "^NSEI", "index"),
    ("sensex", "BSE Sensex", ["bse sensex", "sensex"], "^BSESN", "index"),
    ("nifty_bank", "Nifty Bank", ["bank nifty", "nifty bank"], "^NSEBANK", "index"),
    ("nifty_realty", "Nifty Realty", ["nifty realty"], "^CNXREALTY", "index"),
    ("xle", "XLE (Energy ETF)", ["xle"], "XLE", "instrument"),
    ("jets", "JETS (Airlines ETF)", ["jets etf", "!JETS"], "JETS", "instrument"),
    ("gld", "GLD (Gold ETF)", ["gld", "spdr gold"], "GLD", "instrument"),
    ("tlt", "TLT (Long Treasuries ETF)", ["tlt"], "TLT", "instrument"),
]:
    _n(_id, _label, _t, _al, ([("fred", "SP500", "ret")] if _id == "spx" else []) + [("yf", _tk, "ret")])

# ---- edges: (src, dst, sign, strength, lag_days, mechanism) ---------------------------------
_E = [
    # shocks -> variables
    ("geopolitical_tension", "crude_oil", 1, .65, 3, "Tension near producing regions or chokepoints raises the supply-disruption risk premium"),
    ("geopolitical_tension", "risk_aversion", 1, .60, 1, "Geopolitical shocks push investors toward safe assets"),
    ("geopolitical_tension", "shipping", 1, .40, 5, "Rerouting and war-risk insurance lift freight rates"),
    ("opec_supply_cut", "crude_oil", 1, .80, 2, "Lower OPEC+ output tightens global supply"),
    ("fed", "rate_exp", 1, .90, 1, "A hawkish Fed decision directly reprices expected policy rates"),
    ("rbi", "rate_exp", 1, .75, 1, "RBI policy moves reprice rate expectations, mainly for INR assets"),
    ("central_banks", "rate_exp", 1, .60, 7, "Central-bank stance sets the policy-rate path"),
    ("ecb", "rate_exp", 1, .55, 1, "ECB moves spill over into global rate expectations"),
    # commodities
    ("crude_oil", "inflation_exp", 1, .75, 7, "Energy is a direct CPI input and anchors headline inflation expectations"),
    ("crude_oil", "airlines", -1, .80, 5, "Jet fuel is a large share of airline operating cost; hedging only partly offsets"),
    ("crude_oil", "oil_gas_producers", 1, .85, 2, "Higher realised prices lift upstream revenue and margins"),
    ("crude_oil", "refiners", 1, .30, 5, "Crude is feedstock; margins depend on crack spreads, so the sign is ambiguous"),
    ("crude_oil", "chemicals", -1, .45, 10, "Petrochemical feedstock costs rise"),
    ("crude_oil", "autos", -1, .30, 20, "Higher fuel costs weigh on vehicle demand"),
    ("crude_oil", "consumer_spending", -1, .40, 14, "Fuel costs squeeze discretionary budgets"),
    ("crude_oil", "gdp_growth", -1, .30, 30, "Energy-importing economies face a terms-of-trade drag"),
    ("crude_oil", "usdinr", 1, .40, 7, "Oil importers such as India face a wider current-account deficit, weakening the rupee"),
    ("crude_oil", "fmcg", -1, .30, 20, "Packaging and logistics inputs get costlier"),
    ("natural_gas", "inflation_exp", 1, .40, 10, "Gas feeds electricity and heating costs"),
    ("natural_gas", "utilities", -1, .40, 10, "Fuel cost for gas-fired generation (partly passed through)"),
    ("natural_gas", "chemicals", -1, .50, 10, "Gas is a feedstock and energy input"),
    ("wheat", "inflation_exp", 1, .35, 14, "Food prices feed headline inflation"),
    ("wheat", "fmcg", -1, .40, 20, "Input cost pressure for packaged-food makers"),
    ("copper", "gdp_growth", 1, .25, 30, "Copper demand is a cyclical-growth indicator (correlation, not strict causation)"),
    ("gold", "gold_miners", 1, .80, 2, "Miners' revenue is leveraged to the gold price"),
    ("gold", "gld", 1, .98, 0, "The ETF tracks spot gold"),
    # inflation / rates
    ("inflation_exp", "rate_exp", 1, .70, 14, "Higher expected inflation raises the odds central banks keep rates higher"),
    ("inflation_exp", "gold", 1, .50, 7, "Gold is a traditional inflation hedge"),
    ("inflation_exp", "consumer_spending", -1, .35, 30, "Rising prices erode real purchasing power"),
    ("rate_exp", "us10y", 1, .80, 2, "Longer yields follow expected policy rates"),
    ("rate_exp", "banks", 1, .35, 30, "Higher rates can widen net interest margins, offset by credit-cost risk"),
    ("rate_exp", "real_estate", -1, .65, 30, "Costlier mortgages and financing depress valuations and demand"),
    ("rate_exp", "spx", -1, .50, 7, "Higher discount rates compress equity valuations"),
    ("rate_exp", "nifty50", -1, .40, 7, "Higher rates dampen equity valuations and domestic credit growth"),
    ("rate_exp", "usd", 1, .55, 5, "Higher relative rates attract capital flows into the dollar"),
    ("rate_exp", "gold", -1, .40, 7, "Higher real yields raise gold's opportunity cost"),
    ("rate_exp", "autos", -1, .35, 30, "Auto loans get costlier"),
    ("rate_exp", "consumer_disc", -1, .35, 30, "Consumer credit and big-ticket purchases weaken"),
    ("us10y", "tlt", -1, .90, 0, "Bond prices move inversely to yields"),
    ("us10y", "real_estate", -1, .40, 14, "Mortgage rates track long yields"),
    ("usd", "usdinr", 1, .70, 1, "A stronger dollar generally weakens the rupee"),
    ("usd", "gold", -1, .45, 3, "Gold is dollar-priced, so a stronger dollar makes it dearer for others"),
    ("usd", "crude_oil", -1, .30, 3, "A stronger dollar makes dollar-priced crude costlier for others"),
    ("usdinr", "nifty50", -1, .25, 5, "A weaker rupee prompts foreign portfolio outflows"),
    ("usdinr", "it_services", 1, .50, 5, "Exporters earn in dollars, so a weaker rupee lifts rupee revenue"),
    # risk sentiment
    ("risk_aversion", "spx", -1, .60, 1, "Equities sell off when risk appetite falls"),
    ("risk_aversion", "nifty50", -1, .55, 1, "Foreign investors cut emerging-market equity exposure"),
    ("risk_aversion", "gold", 1, .50, 1, "Safe-haven demand"),
    ("risk_aversion", "usd", 1, .40, 1, "Dollar acts as a safe haven"),
    ("risk_aversion", "us10y", -1, .35, 1, "Flight to safety pushes yields down"),
    ("risk_aversion", "airlines", -1, .30, 2, "Travel demand and high-beta equities are hit"),
    # growth
    ("gdp_growth", "spx", 1, .50, 30, "Earnings expectations track growth"),
    ("gdp_growth", "banks", 1, .40, 60, "Credit demand follows growth"),
    ("gdp_growth", "real_estate", 1, .30, 60, "Housing demand follows income growth"),
    ("gdp_growth", "consumer_spending", 1, .60, 30, "Income growth supports spending"),
    ("consumer_spending", "consumer_disc", 1, .70, 14, "Directly drives discretionary sales"),
    ("consumer_spending", "fmcg", 1, .30, 14, "Staples are less cyclical, so the link is weaker"),
    ("consumer_spending", "autos", 1, .50, 14, "Vehicle demand is cyclical"),
    ("banks", "gdp_growth", 1, .30, 60, "Credit availability supports investment and consumption"),
    ("banks", "consumer_spending", 1, .30, 45, "Retail credit funds consumption"),
    ("banks", "real_estate", 1, .25, 45, "Lending capacity underpins property financing"),
    # sector -> company
    ("airlines", "delta", 1, .90, 0, "Sector member"), ("airlines", "united", 1, .90, 0, "Sector member"),
    ("airlines", "indigo", 1, .90, 0, "Sector member"), ("airlines", "jets", 1, .90, 0, "ETF holds the sector"),
    ("oil_gas_producers", "exxon", 1, .90, 0, "Sector member"), ("oil_gas_producers", "chevron", 1, .90, 0, "Sector member"),
    ("oil_gas_producers", "ongc", 1, .90, 0, "Sector member"), ("oil_gas_producers", "xle", 1, .95, 0, "ETF holds the sector"),
    ("oil_gas_producers", "spx", 1, .15, 0, "Energy is a small index weight"),
    ("refiners", "reliance", 1, .60, 0, "Refining-to-retail conglomerate with large refining exposure"),
    ("banks", "jpm", 1, .90, 0, "Sector member"), ("banks", "hdfcbank", 1, .90, 0, "Sector member"),
    ("banks", "sbi", 1, .90, 0, "Sector member"), ("banks", "nifty_bank", 1, .90, 0, "Index is made of banks"),
    ("banks", "spx", 1, .20, 0, "Financials index weight"),
    ("real_estate", "dlf", 1, .90, 0, "Sector member"), ("real_estate", "nifty_realty", 1, .90, 0, "Index is made of developers"),
    ("autos", "tatamotors", 1, .90, 0, "Sector member"), ("autos", "nifty50", 1, .15, 0, "Index weight"),
    ("fmcg", "hul", 1, .90, 0, "Sector member"), ("fmcg", "nifty50", 1, .25, 0, "Index weight"),
    ("it_services", "infosys", 1, .90, 0, "Sector member"), ("it_services", "tcs", 1, .90, 0, "Sector member"),
    ("it_services", "nifty50", 1, .30, 0, "Index weight"),
    ("consumer_disc", "spx", 1, .35, 0, "Index weight"),
    ("nifty_bank", "nifty50", 1, .40, 0, "Banks are the heaviest Nifty sector"),
    ("nifty_bank", "sensex", 1, .40, 0, "Banks are the heaviest Sensex sector"),
    ("nifty50", "sensex", 1, .95, 0, "Highly overlapping large-cap indices"),
    ("reliance", "nifty50", 1, .25, 0, "Largest single Nifty weight"),
]

NODES = {n["id"]: n for n in _N}

_IN_IDS = {"nifty50", "sensex", "nifty_bank", "nifty_realty", "rbi"}


def market_of(node_id):
    """'IN' or 'US' for market-specific entities (companies, indices, ETFs); 'GLOBAL' otherwise."""
    n = NODES.get(node_id)
    if not n:
        return "GLOBAL"
    if node_id in _IN_IDS or any(sid.endswith(".NS") for _, sid, _ in n["series"]):
        return "IN"
    if n["type"] in ("company", "index", "instrument"):
        return "US"
    return "GLOBAL"
EDGES = _E

# Simulated-data factor loadings (oil, inflation, rates, risk) per node. Used ONLY when no live
# or cached market data is reachable, and always labelled "simulated" in the UI.
SIM_LOADINGS = {
    "crude_oil": (1.0, 0, 0, 0), "inflation_exp": (0, 1.0, 0, 0), "rate_exp": (0, 0, 1.0, 0),
    "us10y": (0, 0, .9, -.1), "usd": (-.1, 0, .35, .25), "usdinr": (.15, 0, .15, .2),
    "gold": (.1, .3, -.5, .3), "risk_aversion": (0, 0, 0, 1.0), "natural_gas": (.2, 0, 0, 0),
    "airlines": (-.45, 0, -.2, -.9), "oil_gas_producers": (.6, 0, 0, -.4), "banks": (0, 0, .15, -.8),
    "real_estate": (0, 0, -.5, -.8), "spx": (-.05, 0, -.4, -1.0), "nifty50": (-.1, 0, -.3, -.7),
    "nifty_bank": (-.05, 0, .1, -.8), "nifty_realty": (0, 0, -.5, -.9), "tlt": (0, 0, -1.0, .2),
    "jets": (-.45, 0, -.2, -.9), "xle": (.6, 0, 0, -.4), "gld": (.1, .3, -.5, .3),
    "it_services": (0, 0, -.3, -.9), "gold_miners": (.1, .3, -.6, -.3),
}
_DEFAULT_LOAD = (0, 0, -.1, -.7)


def sim_loading(node_id):
    return SIM_LOADINGS.get(node_id, _DEFAULT_LOAD)


# Sector fallback for an entity the KB has not seen, from keywords in its name.
SECTOR_KEYWORDS = [
    (("airlines", "airways", "aviation"), "airlines"),
    (("bank", "bancorp", "financial"), "banks"),
    (("petroleum", "oil", "energy", "resources"), "oil_gas_producers"),
    (("motors", "automotive"), "autos"),
    (("realty", "properties", "estate", "developers"), "real_estate"),
]

CASE_SENSITIVE_PREFIX = "!"

# Words that make a statement an expectation or scenario rather than a reported fact.
TYPES_FOR_PRICE_MOVES = {"commodity", "indicator", "sector", "company", "index", "instrument"}
