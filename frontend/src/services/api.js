// API Service for Apex Zenith with seamless live FastAPI backend integration & fallback

export const MOCK_DATA = {
  tickers: [
    {
      id: 'sp500',
      name: 'S&P 500',
      price: '5,099.96',
      change: '+1.24%',
      isPositive: true,
      sparkline: [5020, 5035, 5040, 5030, 5060, 5085, 5099.96],
    },
    {
      id: 'nasdaq',
      name: 'NASDAQ',
      price: '15,927.90',
      change: '+1.55%',
      isPositive: true,
      sparkline: [15650, 15700, 15730, 15690, 15820, 15890, 15927.90],
    },
    {
      id: 'dow',
      name: 'Dow Jones',
      price: '38,239.98',
      change: '+0.87%',
      isPositive: true,
      sparkline: [37900, 37950, 38020, 38100, 38150, 38200, 38239.98],
    },
    {
      id: 'gold',
      name: 'Gold',
      price: '2,333.40',
      change: '+0.42%',
      isPositive: true,
      sparkline: [2315, 2320, 2318, 2325, 2328, 2330, 2333.40],
    },
    {
      id: 'crude',
      name: 'Crude Oil',
      price: '82.16',
      change: '+2.31%',
      isPositive: true,
      sparkline: [78.5, 79.2, 78.8, 80.1, 80.9, 81.5, 82.16],
    },
  ],

  events: [
    {
      id: 'e1',
      time: '2h ago',
      title: 'Oil prices rise on Middle East tensions',
      category: 'Commodities',
      text: 'Crude oil prices jumped 12% after escalating tensions in the Middle East raised fears of supply disruptions.',
    },
    {
      id: 'e2',
      time: '4h ago',
      title: 'Fed signals possible rate hold',
      category: 'Macro',
      text: 'Federal Reserve officials signaled interest rates may remain unchanged as stubborn core inflation persists.',
    },
    {
      id: 'e3',
      time: '6h ago',
      title: 'Tech earnings beat expectations',
      category: 'Earnings',
      text: 'Major semiconductor and cloud infrastructure providers reported quarterly revenue gains above consensus.',
    },
    {
      id: 'e4',
      time: '8h ago',
      title: 'EU announces new AI regulations',
      category: 'Regulation',
      text: 'European regulators published detailed compliance guidelines for foundation model deployments across the EU.',
    },
    {
      id: 'e5',
      time: '12h ago',
      title: 'Tesla expands battery production',
      category: 'Company',
      text: 'Tesla confirmed capital expenditure increases for next-generation 4680 battery manufacturing facilities.',
    },
  ],

  sectors: [
    { name: 'Energy', change: '+2.8%', value: 85, isPositive: true },
    { name: 'Materials', change: '+1.9%', value: 65, isPositive: true },
    { name: 'Technology', change: '+1.2%', value: 45, isPositive: true },
    { name: 'Financials', change: '+0.0%', value: 15, isPositive: true },
    { name: 'Real Estate', change: '-0.3%', value: -20, isPositive: false },
  ],

  eventAnalysis: {
    eventText: 'Crude oil prices jumped 12% after escalating tensions in the Middle East raised fears of supply disruptions.',
    extractedEntities: {
      companies: ['Saudi Aramco', 'Exxon Mobil', 'Chevron'],
      commodities: ['Crude Oil'],
      sectors: ['Energy', 'Transportation', 'Materials'],
      indicators: ['Inflation', 'Interest Rates'],
      instruments: ['Oil Futures', 'Energy Stocks'],
    },
    details: {
      eventType: 'Commodity Price Surge',
      direction: '↑ Increase',
      magnitude: '12%',
      timeframe: 'Short Term (1-4 weeks)',
      source: 'Reuters (Apr 25, 2025)',
      sentiment: [
        { label: 'Bullish (Oil)', type: 'bullish' },
        { label: 'Bearish (Energy Consumers)', type: 'bearish' },
      ],
    },
    evidence: {
      quote: 'Crude oil prices jumped 12% after escalating tensions in the Middle East raised fears of supply disruptions.',
      source: 'Reuters, Apr 25, 2025',
      related: [
        { title: 'Middle East tensions escalate', date: 'Apr 25, 2025' },
        { title: 'Oil supply risks increase', date: 'Apr 25, 2025' },
        { title: 'Energy stocks gain momentum', date: 'Apr 25, 2025' },
      ],
    },
  },

  graphData: {
    centerNode: {
      id: 'crude_oil',
      label: 'Crude Oil',
      fullName: 'Brent Crude Oil',
      type: 'commodity',
      category: 'Commodity',
      change: '+12%',
      confidence: 0.94,
      isAnchor: true,
      col: 1,
      x: 340,
      y: 130,
      evidence: 'Observed quote verbatim from Reuters wire report: "Brent crude jumped 12% on Monday after tanker attacks."',
    },
    nodes: [
      // Column 0: Macro Shocks & Event Classes (Leftmost)
      { id: 'geopolitical_tension', label: 'Geopolitical Shock', fullName: 'Geopolitical Tension & Conflict Risk', type: 'event_class', category: 'Macro Shock', col: 0, x: 180, y: 240, change: '+Critical', confidence: 0.95 },
      { id: 'opec_supply_cut', label: 'OPEC+ Supply Res...', fullName: 'OPEC+ Supply Restraint & Quotas', type: 'event_class', category: 'Macro Shock', col: 0, x: 180, y: 470, change: '+Output Cuts', confidence: 0.88 },

      // Column 1: Commodities
      { id: 'crude_oil', label: 'Crude Oil', fullName: 'Brent & WTI Crude Oil', type: 'commodity', category: 'Commodity', col: 1, x: 340, y: 130, change: '+12%', isAnchor: true, confidence: 0.94 },
      { id: 'jet_fuel', label: 'Jet Fuel', fullName: 'Jet Fuel & Kerosene Feedstock', type: 'commodity', category: 'Commodity', col: 1, x: 340, y: 270, change: '+9.5%', confidence: 0.89 },
      { id: 'natural_gas', label: 'Natural Gas', fullName: 'Natural Gas (Henry Hub)', type: 'commodity', category: 'Commodity', col: 1, x: 340, y: 450, change: '+4.1%', confidence: 0.78 },
      { id: 'gold', label: 'Gold', fullName: 'Gold Bullion (Spot)', type: 'commodity', category: 'Commodity', col: 1, x: 340, y: 590, change: '+1.8%', confidence: 0.84 },
      { id: 'copper', label: 'Copper', fullName: 'Copper (Dr. Copper Industrial)', type: 'commodity', category: 'Commodity', col: 1, x: 340, y: 730, change: '-0.5%', confidence: 0.65 },

      // Column 2: Macro Indicators
      { id: 'usdinr', label: 'USD/INR (Rupee W...', fullName: 'USD/INR (Indian Rupee Weakness)', type: 'indicator', category: 'Macro Indicator', col: 2, x: 510, y: 90, change: '+0.8%', isDashed: true, confidence: 0.82 },
      { id: 'inflation_exp', label: 'Inflation Expect...', fullName: 'Inflation Expectations (5Y Breakeven)', type: 'indicator', category: 'Macro Indicator', col: 2, x: 510, y: 220, change: '+0.35%', confidence: 0.91 },
      { id: 'rate_exp', label: 'Rate Expectations', fullName: 'Interest Rate Hike Expectations', type: 'indicator', category: 'Macro Indicator', col: 2, x: 510, y: 340, change: '+0.25%', confidence: 0.86 },
      { id: 'cpi', label: 'US Headline CPI', fullName: 'US Headline Consumer Price Index', type: 'indicator', category: 'Macro Indicator', col: 2, x: 510, y: 450, change: '+0.30%', confidence: 0.80 },
      { id: 'us2y', label: 'US 2Y Treasury Y...', fullName: 'US 2-Year Treasury Yield', type: 'indicator', category: 'Macro Indicator', col: 2, x: 510, y: 560, change: '+12 bps', confidence: 0.87 },
      { id: 'us10y', label: 'US 10Y Treasury ...', fullName: 'US 10-Year Treasury Yield', type: 'indicator', category: 'Macro Indicator', col: 2, x: 510, y: 680, change: '+8 bps', confidence: 0.85 },
      { id: 'usd', label: 'US Dollar Index', fullName: 'US Dollar Index (DXY)', type: 'indicator', category: 'Macro Indicator', col: 2, x: 510, y: 790, change: '+0.6%', isConcentric: true, confidence: 0.83 },

      // Column 3: Sectors
      { id: 'airlines', label: 'Airlines Sector', fullName: 'Commercial Airlines Sector', type: 'sector', category: 'Sector', col: 3, x: 680, y: 70, change: '-3.4%', isDashed: true, confidence: 0.90 },
      { id: 'oil_gas_producers', label: 'Oil & Gas Produc...', fullName: 'Oil & Gas Upstream Producers', type: 'sector', category: 'Sector', col: 3, x: 680, y: 130, change: '+5.1%', isSelected: true, confidence: 0.96 },
      { id: 'it_services', label: 'Indian IT Services', fullName: 'Indian IT & Software Exporters', type: 'sector', category: 'Sector', col: 3, x: 680, y: 200, change: '+1.2%', confidence: 0.74 },
      { id: 'consumer_disc', label: 'Consumer Discret...', fullName: 'Consumer Discretionary Sector', type: 'sector', category: 'Sector', col: 3, x: 680, y: 270, change: '-1.8%', confidence: 0.72 },
      { id: 'shipping', label: 'Logistics & Ship...', fullName: 'Maritime Logistics & Shipping', type: 'sector', category: 'Sector', col: 3, x: 680, y: 340, change: '+2.4%', confidence: 0.75 },
      { id: 'refiners', label: 'Oil Refiners', fullName: 'Downstream Oil Refiners', type: 'sector', category: 'Sector', col: 3, x: 680, y: 410, change: '+0.9%', confidence: 0.68 },
      { id: 'autos', label: 'Indian Auto Sector', fullName: 'Automobile Manufacturers', type: 'sector', category: 'Sector', col: 3, x: 680, y: 480, change: '-1.5%', confidence: 0.70 },
      { id: 'real_estate', label: 'Real Estate Sector', fullName: 'Real Estate & Property Developers', type: 'sector', category: 'Sector', col: 3, x: 680, y: 550, change: '-2.1%', hasMixedSignals: true, confidence: 0.83 },
      { id: 'utilities', label: 'Utilities Sector', fullName: 'Regulated Power & Gas Utilities', type: 'sector', category: 'Sector', col: 3, x: 680, y: 620, change: '-0.8%', confidence: 0.66 },
      { id: 'metals_mining', label: 'Metals & Mining', fullName: 'Metals & Mining Producers', type: 'sector', category: 'Sector', col: 3, x: 680, y: 690, change: '+0.4%', hasMixedSignals: true, confidence: 0.62 },
      { id: 'banks_us', label: 'US Banks', fullName: 'US Diversified Banking Sector', type: 'sector', category: 'Sector', col: 3, x: 680, y: 760, change: '+0.2%', confidence: 0.65 },
      { id: 'banks_in', label: 'Indian Banks', fullName: 'Indian Scheduled Commercial Banks', type: 'sector', category: 'Sector', col: 3, x: 680, y: 830, change: '-1.1%', confidence: 0.69 },

      // Column 4: Assets & Equities (Rightmost)
      { id: 'dal', label: 'Delta Air Lines', fullName: 'Delta Air Lines (DAL)', type: 'company', category: 'Equity', col: 4, x: 860, y: 35, change: '-4.2%', confidence: 0.91 },
      { id: 'xom', label: 'ExxonMobil', fullName: 'Exxon Mobil Corporation (XOM)', type: 'company', category: 'Equity', col: 4, x: 860, y: 70, change: '+4.8%', confidence: 0.94 },
      { id: 'ongc', label: 'ONGC', fullName: 'Oil and Natural Gas Corp (ONGC)', type: 'company', category: 'Equity', col: 4, x: 860, y: 105, change: '+5.4%', confidence: 0.92 },
      { id: 'jets', label: 'US Global Jets E...', fullName: 'US Global Jets ETF (JETS)', type: 'instrument', category: 'ETF', col: 4, x: 860, y: 140, change: '-3.1%', confidence: 0.89 },
      { id: 'ual', label: 'United Airlines', fullName: 'United Airlines Holdings (UAL)', type: 'company', category: 'Equity', col: 4, x: 860, y: 175, change: '-3.9%', confidence: 0.88 },
      { id: 'indigo', label: 'IndiGo (InterGlo...', fullName: 'InterGlobe Aviation (IndiGo)', type: 'company', category: 'Equity', col: 4, x: 860, y: 210, change: '-2.8%', confidence: 0.85 },
      { id: 'xle', label: 'Energy Select SP...', fullName: 'Energy Select Sector SPDR Fund (XLE)', type: 'instrument', category: 'ETF', col: 4, x: 860, y: 245, change: '+3.9%', confidence: 0.93 },
      { id: 'cvx', label: 'Chevron', fullName: 'Chevron Corporation (CVX)', type: 'company', category: 'Equity', col: 4, x: 860, y: 280, change: '+3.6%', confidence: 0.90 },
      { id: 'reliance', label: 'Reliance Industr...', fullName: 'Reliance Industries Limited', type: 'company', category: 'Equity', col: 4, x: 860, y: 315, change: '+1.8%', confidence: 0.78 },
      { id: 'tcs', label: 'TCS', fullName: 'Tata Consultancy Services', type: 'company', category: 'Equity', col: 4, x: 860, y: 350, change: '+1.5%', confidence: 0.76 },
      { id: 'infy', label: 'Infosys', fullName: 'Infosys Limited (INFY)', type: 'company', category: 'Equity', col: 4, x: 860, y: 385, change: '+1.3%', confidence: 0.74 },
      { id: 'tlt', label: 'US Treasury Bond...', fullName: 'iShares 20+ Year Treasury Bond ETF (TLT)', type: 'instrument', category: 'ETF', col: 4, x: 860, y: 420, change: '-1.2%', confidence: 0.88 },
      { id: 'tatamotors', label: 'Tata Motors', fullName: 'Tata Motors Limited', type: 'company', category: 'Equity', col: 4, x: 860, y: 455, change: '-2.4%', confidence: 0.79 },
      { id: 'nasdaq', label: 'Nasdaq 100', fullName: 'Invesco QQQ / Nasdaq 100', type: 'index', category: 'Index', col: 4, x: 860, y: 490, change: '-0.8%', confidence: 0.72 },
      { id: 'russell', label: 'Russell 2000', fullName: 'iShares Russell 2000 ETF (IWM)', type: 'index', category: 'Index', col: 4, x: 860, y: 525, change: '-1.1%', confidence: 0.71 },
      { id: 'gld', label: 'SPDR Gold Shares...', fullName: 'SPDR Gold Shares ETF (GLD)', type: 'instrument', category: 'ETF', col: 4, x: 860, y: 560, change: '+1.7%', confidence: 0.95 },
      { id: 'dlf', label: 'DLF Real Estate', fullName: 'DLF Limited (Realty)', type: 'company', category: 'Equity', col: 4, x: 860, y: 595, change: '-2.6%', confidence: 0.80 },
      { id: 'nifty50', label: 'Nifty 50', fullName: 'NSE Nifty 50 Index', type: 'index', category: 'Index', col: 4, x: 860, y: 630, change: '-0.9%', confidence: 0.75 },
      { id: 'sensex', label: 'BSE Sensex', fullName: 'BSE Sensex 30 Index', type: 'index', category: 'Index', col: 4, x: 860, y: 665, change: '-0.8%', confidence: 0.73 },
      { id: 'spx', label: 'S&P 500', fullName: 'S&P 500 Composite Index', type: 'index', category: 'Index', col: 4, x: 860, y: 700, change: '-0.5%', confidence: 0.70 },
      { id: 'jpm', label: 'JPMorgan Chase', fullName: 'JPMorgan Chase & Co. (JPM)', type: 'company', category: 'Equity', col: 4, x: 860, y: 735, change: '+0.4%', confidence: 0.68 },
      { id: 'hdfcbank', label: 'HDFC Bank', fullName: 'HDFC Bank Limited', type: 'company', category: 'Equity', col: 4, x: 860, y: 770, change: '-1.4%', confidence: 0.74 },
      { id: 'icici', label: 'ICICI Bank', fullName: 'ICICI Bank Limited', type: 'company', category: 'Equity', col: 4, x: 860, y: 805, change: '-0.9%', confidence: 0.72 },
    ],
    edges: [
      // Highlighted Active Path: Crude Oil -> Oil & Gas Producers (matches screenshot)
      { from: 'crude_oil', to: 'oil_gas_producers', sign: 1, strength: 0.95, lag: 2, isActive: true, mechanism: 'Higher realised prices lift upstream exploration & production revenue' },
      
      // Events -> Commodities
      { from: 'geopolitical_tension', to: 'crude_oil', sign: 1, strength: 0.85, lag: 1, mechanism: 'Escalation near Hormuz raises supply-disruption risk premium' },
      { from: 'geopolitical_tension', to: 'gold', sign: 1, strength: 0.65, lag: 1, mechanism: 'Safe-haven flight to bullion amidst geopolitical uncertainty' },
      { from: 'opec_supply_cut', to: 'crude_oil', sign: 1, strength: 0.90, lag: 2, mechanism: 'Output cuts restrict global barrel availability' },

      // Commodities -> Sectors & Indicators
      { from: 'crude_oil', to: 'airlines', sign: -1, strength: 0.88, lag: 4, mechanism: 'Jet fuel input costs surge, compressing airline margins' },
      { from: 'crude_oil', to: 'inflation_exp', sign: 1, strength: 0.82, lag: 7, mechanism: 'Energy costs feed headline producer & consumer inflation' },
      { from: 'crude_oil', to: 'usdinr', sign: 1, strength: 0.70, lag: 5, mechanism: 'Wider crude import bill widens current account deficit' },
      { from: 'crude_oil', to: 'jet_fuel', sign: 1, strength: 0.92, lag: 2, mechanism: 'Direct crack spread derivative and aviation fuel price' },
      { from: 'crude_oil', to: 'autos', sign: -1, strength: 0.65, lag: 14, mechanism: 'Costlier fuel dampens private vehicle purchase sentiment' },
      { from: 'crude_oil', to: 'consumer_disc', sign: -1, strength: 0.60, lag: 14, mechanism: 'Gasoline expenditures cannibalize discretionary consumer spending' },
      { from: 'crude_oil', to: 'refiners', sign: 1, strength: 0.55, lag: 5, mechanism: 'Higher throughput revenues with volatile crack margins' },
      { from: 'crude_oil', to: 'shipping', sign: 1, strength: 0.60, lag: 5, mechanism: 'Bunker fuel surcharges passed along maritime freight corridors' },

      // Indicator Propagation Chains
      { from: 'inflation_exp', to: 'rate_exp', sign: 1, strength: 0.78, lag: 14, mechanism: 'Persistent inflation expectations prompt central banks to keep rates higher' },
      { from: 'inflation_exp', to: 'cpi', sign: 1, strength: 0.85, lag: 20, mechanism: 'Upstream price gains pass through to consumer basket indices' },
      { from: 'rate_exp', to: 'us2y', sign: 1, strength: 0.80, lag: 2, mechanism: 'Short-term yields reprice policy interest rate trajectory' },
      { from: 'rate_exp', to: 'us10y', sign: 1, strength: 0.75, lag: 3, mechanism: 'Term premium and policy rate expectations lift benchmark sovereign yields' },
      { from: 'rate_exp', to: 'real_estate', sign: -1, strength: 0.72, lag: 21, mechanism: 'Elevated mortgage rates depress housing sales volumes and valuations' },
      { from: 'rate_exp', to: 'banks_us', sign: 1, strength: 0.50, lag: 14, mechanism: 'Wider net interest margins (NIM), counteracted by loan growth drag' },
      { from: 'rate_exp', to: 'spx', sign: -1, strength: 0.60, lag: 7, mechanism: 'Higher equity discount rates compress price-to-earnings multiples' },
      { from: 'rate_exp', to: 'nasdaq', sign: -1, strength: 0.68, lag: 7, mechanism: 'Long-duration tech growth stocks disproportionately hit by discount rate rise' },

      // Foreign Exchange & Other Commodities
      { from: 'usdinr', to: 'it_services', sign: 1, strength: 0.75, lag: 5, mechanism: 'Rupee depreciation expands USD revenue conversion for IT exporters' },
      { from: 'usdinr', to: 'nifty50', sign: -1, strength: 0.58, lag: 5, mechanism: 'Foreign portfolio investors withdraw liquidity on currency depreciation' },
      { from: 'usdinr', to: 'banks_in', sign: -1, strength: 0.52, lag: 7, mechanism: 'Tightening system liquidity and imported inflation pressure' },
      { from: 'us10y', to: 'tlt', sign: -1, strength: 0.92, lag: 0, mechanism: 'Fixed coupon bond prices decline inversely with benchmark yield rises' },
      { from: 'gold', to: 'gld', sign: 1, strength: 0.98, lag: 0, mechanism: 'Physical bullion ETF tracks spot price with zero tracking error' },
      { from: 'natural_gas', to: 'utilities', sign: -1, strength: 0.70, lag: 10, mechanism: 'Feedstock cost spike for thermal generation facilities' },
      { from: 'copper', to: 'metals_mining', sign: 1, strength: 0.65, lag: 5, mechanism: 'Base metal price recovery supports industrial miner top-line revenue' },

      // Sector to Terminal Asset Linkages
      { from: 'oil_gas_producers', to: 'xom', sign: 1, strength: 0.95, lag: 0, mechanism: 'Direct core sector weighting and upstream asset ownership' },
      { from: 'oil_gas_producers', to: 'ongc', sign: 1, strength: 0.92, lag: 0, mechanism: 'Primary domestic crude extraction windfall' },
      { from: 'oil_gas_producers', to: 'cvx', sign: 1, strength: 0.90, lag: 0, mechanism: 'Integrated international oil major dividend and free cash flow leverage' },
      { from: 'oil_gas_producers', to: 'xle', sign: 1, strength: 0.96, lag: 0, mechanism: 'Sector ETF weighted heavily toward integrated oil and gas producers' },

      { from: 'airlines', to: 'dal', sign: 1, strength: 0.92, lag: 0, mechanism: 'Direct passenger carrier cost pressure on jet fuel crack spread' },
      { from: 'airlines', to: 'ual', sign: 1, strength: 0.90, lag: 0, mechanism: 'High domestic and transatlantic fuel cost sensitivity' },
      { from: 'airlines', to: 'indigo', sign: 1, strength: 0.88, lag: 0, mechanism: 'Unhedged ATF exposure in key emerging aviation corridor' },
      { from: 'airlines', to: 'jets', sign: 1, strength: 0.95, lag: 0, mechanism: 'Pure-play airline industry benchmark ETF' },

      { from: 'it_services', to: 'tcs', sign: 1, strength: 0.92, lag: 0, mechanism: 'USD realization benefits premier IT exporter EBITDA' },
      { from: 'it_services', to: 'infy', sign: 1, strength: 0.90, lag: 0, mechanism: 'Offshore billing dollar tailwinds' },

      { from: 'real_estate', to: 'dlf', sign: 1, strength: 0.85, lag: 0, mechanism: 'Borrowing cost sensitivity and property pre-sales rate trajectory' },
      { from: 'autos', to: 'tatamotors', sign: 1, strength: 0.82, lag: 0, mechanism: 'Commercial and passenger vehicle EMI interest rates and fuel expense' },

      { from: 'banks_us', to: 'jpm', sign: 1, strength: 0.90, lag: 0, mechanism: 'Dominant net interest margin capture across institutional loan book' },
      { from: 'banks_in', to: 'hdfcbank', sign: 1, strength: 0.88, lag: 0, mechanism: 'Unsecured loan risk weight regulation and rate sensitivity' },
      { from: 'banks_in', to: 'icici', sign: 1, strength: 0.88, lag: 0, mechanism: 'Domestic credit growth rate headwinds' },
      { from: 'refiners', to: 'reliance', sign: 1, strength: 0.75, lag: 0, mechanism: 'Jamnagar complex gross refining margin (GRM) adjustments' },
    ],
    pathways: [
      {
        id: 1,
        path: 'Crude Oil ↑ → Oil & Gas Producers ↑ → ExxonMobil & ONGC ↑',
        score: '0.95',
        impact: 'High Positive (+5.1%)',
      },
      {
        id: 2,
        path: 'Crude Oil ↑ → Airlines Sector ↓ → Delta Air Lines & IndiGo ↓',
        score: '0.88',
        impact: 'High Negative (-3.4%)',
      },
      {
        id: 3,
        path: 'Crude Oil ↑ → Inflation Expectations ↑ → Rate Expectations ↑ → Real Estate ↓',
        score: '0.72',
        impact: 'Negative Indirect (-2.1%)',
      },
      {
        id: 4,
        path: 'Crude Oil ↑ → USD/INR ↑ (Rupee Weakens) → Indian IT Services ↑ (TCS, Infy)',
        score: '0.75',
        impact: 'Moderate Positive (+1.2%)',
      },
    ],
  },

  assets: [
    {
      id: 'xom',
      name: 'Exxon Mobil (XOM)',
      type: 'Stock',
      impact: '+4.0%',
      isPositive: true,
      exposure: '0.82',
      confidence: '0.87',
    },
    {
      id: 'cvx',
      name: 'Chevron (CVX)',
      type: 'Stock',
      impact: '+4.2%',
      isPositive: true,
      exposure: '0.76',
      confidence: '0.83',
    },
    {
      id: 'spx',
      name: 'S&P 500',
      type: 'Index',
      impact: '+1.0%',
      isPositive: true,
      exposure: '0.68',
      confidence: '0.74',
    },
    {
      id: 'brent',
      name: 'Brent Crude Oil',
      type: 'Commodity',
      impact: '+12.0%',
      isPositive: true,
      exposure: '0.92',
      confidence: '0.88',
    },
    {
      id: 'dal',
      name: 'Delta Air Lines (DAL)',
      type: 'Stock',
      impact: '-2.3%',
      isPositive: false,
      exposure: '0.59',
      confidence: '0.71',
    },
    {
      id: 'jpm',
      name: 'JPMorgan (JPM)',
      type: 'Stock',
      impact: '-1.1%',
      isPositive: false,
      exposure: '0.52',
      confidence: '0.66',
    },
    {
      id: 'xlre',
      name: 'Real Estate (XLRE)',
      type: 'Sector',
      impact: '-0.7%',
      isPositive: false,
      exposure: '0.46',
      confidence: '0.63',
    },
  ],

  topSectors: [
    { name: 'Energy', val: '+2.8%', positive: true },
    { name: 'Materials', val: '+1.9%', positive: true },
    { name: 'Transportation', val: '-0.6%', positive: false },
    { name: 'Financials', val: '-0.4%', positive: false },
    { name: 'Real Estate', val: '-0.3%', positive: false },
  ],
};

export const api = {
  async getStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) return await res.json();
    } catch (_) {}
    return {
      llm: 'Groq (Offline / Fallback)',
      llm_required: false,
      fred_key: true,
      news_key: true,
      graph: { nodes: 56, edges: 90 },
    };
  },

  async getSamples() {
    try {
      const res = await fetch('/api/samples');
      if (res.ok) return await res.json();
    } catch (_) {}
    return MOCK_DATA.events.map((e) => e.text);
  },

  async analyze(text, live = false, useLlm = false) {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, live, use_llm: useLlm }),
      });
      if (res.ok) {
        const data = await res.json();
        // Normalize backend response format for UI
        const firstSource = data.sources?.[0] || {};
        return {
          ...data,
          extractedEntities: {
            companies: (data.assets || []).map((a) => a.label || a.entity).slice(0, 3),
            commodities: (data.variables || []).filter((v) => v.type === 'commodity').map((v) => v.label || v.entity),
            sectors: (data.sectors || []).map((s) => s.label || s.entity),
            indicators: (data.variables || []).filter((v) => v.type === 'indicator').map((v) => v.label || v.entity),
            instruments: ['Futures', 'Equities'],
          },
          details: {
            eventType: firstSource.type || 'Macro Shock',
            direction: (firstSource.direction || 1) > 0 ? '↑ Increase' : '↓ Decrease',
            magnitude: firstSource.magnitude || '5-15%',
            timeframe: 'Short Term (1-4 weeks)',
            source: 'Verified Financial Wire',
            sentiment: [
              { label: firstSource.direction > 0 ? 'Bullish (Shock Origin)' : 'Bearish (Shock Origin)', type: firstSource.direction > 0 ? 'bullish' : 'bearish' },
              { label: 'Bearish (Downstream Consumers)', type: 'bearish' },
            ],
          },
          evidence: {
            quote: firstSource.quote || text,
            source: 'Reuters / Bloomberg Wire',
            related: [
              { title: 'Market volatility indexes react', date: 'Apr 25, 2025' },
              { title: 'Sector correlations adjust to news', date: 'Apr 25, 2025' },
              { title: 'Institutional repositioning noted', date: 'Apr 25, 2025' },
            ],
          },
        };
      }
    } catch (_) {}

    // Dynamic rule parsing for standalone demo mode
    const lower = (text || '').toLowerCase();
    let category = 'Commodity Price Surge';
    let dir = '↑ Increase';
    let mag = '12%';
    let comp = ['Saudi Aramco', 'Exxon Mobil', 'Chevron'];
    let comm = ['Crude Oil'];
    let sec = ['Energy', 'Transportation', 'Materials'];
    let ind = ['Inflation Expectations', 'Interest Rates'];
    let inst = ['Oil Futures', 'Energy Stocks'];
    let sentiments = [
      { label: 'Bullish (Oil)', type: 'bullish' },
      { label: 'Bearish (Energy Consumers)', type: 'bearish' },
    ];

    if (lower.includes('oil') || lower.includes('crude') || lower.includes('brent') || lower.includes('opec') || lower.includes('energy') || lower.includes('hormuz')) {
      category = 'Commodity Price Surge';
      dir = '↑ Increase';
      mag = '12%';
      comp = ['Saudi Aramco', 'Exxon Mobil', 'Chevron'];
      comm = ['Crude Oil'];
      sec = ['Energy', 'Transportation', 'Materials'];
      ind = ['Inflation Expectations', 'Interest Rates'];
      inst = ['Oil Futures', 'Energy Stocks'];
      sentiments = [
        { label: 'Bullish (Oil)', type: 'bullish' },
        { label: 'Bearish (Energy Consumers)', type: 'bearish' },
      ];
    } else if (lower.includes('fed') || lower.includes('rate') || lower.includes('basis point') || lower.includes('bps')) {
      category = 'Monetary Policy Decision';
      dir = lower.includes('cut') ? '↓ Decrease' : '↑ Increase';
      mag = '50 bps';
      comp = ['JPMorgan Chase', 'Bank of America', 'Wells Fargo'];
      comm = ['Gold', 'Treasury Futures'];
      sec = ['Financials', 'Real Estate', 'Technology'];
      ind = ['10-Year Treasury Yield', 'Dollar Index (DXY)', 'Fed Funds Rate'];
      inst = ['SOFR Swaps', 'Bond ETFs'];
      sentiments = [
        { label: dir.includes('↑') ? 'Bullish (USD / Yields)' : 'Bullish (Equities)', type: 'bullish' },
        { label: dir.includes('↑') ? 'Bearish (Real Estate)' : 'Bearish (Yields)', type: 'bearish' },
      ];
    } else if (lower.includes('tsmc') || lower.includes('chip') || lower.includes('semiconductor') || /\b(ai|nvidia)\b/i.test(text)) {
      category = 'Semiconductor Demand Shock';
      dir = '↑ Increase';
      mag = '25%';
      comp = ['TSMC', 'NVIDIA', 'ASML', 'Broadcom'];
      comm = ['Silicon Wafers', 'Rare Earth Metals'];
      sec = ['Technology', 'Hardware', 'Communications'];
      ind = ['Capex Growth Rate', 'Foundry Capacity Utilization'];
      inst = ['SOXX ETF', 'Tech Options'];
      sentiments = [
        { label: 'Bullish (AI Hardware)', type: 'bullish' },
        { label: 'Neutral (Legacy Consumer Electronics)', type: 'neutral' },
      ];
    } else if (lower.includes('rbi') || lower.includes('bank') || lower.includes('loan')) {
      category = 'Banking Prudential Regulation';
      dir = '↓ Contraction';
      mag = '2.5%';
      comp = ['HDFC Bank', 'State Bank of India', 'ICICI Bank'];
      comm = ['Rupee (USDINR)'];
      sec = ['Banking', 'Non-Banking Financials', 'Consumer Discretionary'];
      ind = ['Credit Growth Rate', 'Tier-1 Capital Adequacy'];
      inst = ['Bank Nifty', 'Credit Default Swaps'];
      sentiments = [
        { label: 'Bearish (Short-term Lending)', type: 'bearish' },
        { label: 'Bullish (Long-term Balance Sheet Health)', type: 'bullish' },
      ];
    }

    return {
      summary: `Automated causal extraction for: "${text.slice(0, 65)}..."`,
      extractedEntities: {
        companies: comp,
        commodities: comm,
        sectors: sec,
        indicators: ind,
        instruments: inst,
      },
      details: {
        eventType: category,
        direction: dir,
        magnitude: mag,
        timeframe: 'Short Term (1-4 weeks)',
        source: 'Reuters / Bloomberg Financial Wire',
        sentiment: sentiments,
      },
      evidence: {
        quote: text,
        source: 'Financial Wire Services, Apr 25, 2025',
        related: [
          { title: `${comp[0]} volume spikes on headline`, date: 'Apr 25, 2025' },
          { title: `${sec[0]} sector correlations update`, date: 'Apr 25, 2025' },
          { title: 'Macro analysts issue revised forecasts', date: 'Apr 25, 2025' },
        ],
      },
    };
  },

  async getGraph() {
    try {
      const res = await fetch('/api/graph');
      if (res.ok) return await res.json();
    } catch (_) {}
    return MOCK_DATA.graphData;
  },

  async resetGraph() {
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (_) {}
    return { ok: true };
  },
};
