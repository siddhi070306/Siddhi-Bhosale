# Plan: Round 2 upgrades for Apex Zenith (from the two pasted reviews)

## Context
The core app (extract -> KG -> propagate -> validate -> explain, 56 nodes / 90 edges, 22 passing tests, D3 UI)
is built. Two reviews of the PRD/IDEA docs agree on the gaps: historical precedent, what-if scenarios, portfolio
view, event credibility, loop labels, uncertainty ranges, regime-aware validation, editable graph, coverage
metrics. Goal: add the highest-value subset without breaking the project's rules (deterministic, offline-capable,
simulated data never changes confidence, plausibility is not probability, LLM never invents numbers/edges,
no reference to other projects).

Caveat to keep: the competitor descriptions in the reviews (MarketRipple, Causality Link: "24 verified events",
"7 relation types", Bayesian nets) are unverified claims. Do not copy them into PRD/IDEA/pitch as fact without
checking their sources; position on our own verified properties only.

## Recommended scope (ordered; each step independently shippable, tests added per step)

### Tier 1 - cheap, offline, big demo value
1. **What-if mode** (`propagate.py`, `service.py`, `server.py`, UI). New `POST /api/whatif {source, direction,
   magnitude_pct | bps, regime?}`. Today path score ignores magnitude (only `sensitivity = intensity*score`), so
   add an explicit `intensity_from_magnitude()` (monotone, saturating, documented as heuristic) and re-run
   `pg.propagate/aggregate` on a *copy-free* read of the KG (no ingest, no evidence update). Return ranking +
   delta vs baseline. UI: source dropdown + 3 preset sliders, diff view of top assets. Be explicit that scores
   do not scale linearly with shock size; only sensitivity and ranking do.
2. **Portfolio view** (`service.py::portfolio_impact`, `POST /api/portfolio`). Input {ticker: weight}; map tickers
   via kb (add a small ticker->node alias map; unmapped tickers listed as "not covered", CASH ignored). Output:
   net signed exposure = sum(weight * direction * confidence) with the same caps, top contributing paths,
   offsetting pairs (long energy / short airlines style), uncovered weight %. Reuse `agg` rows from analyze().
3. **Coverage & honesty metrics** in `analyze()` result + "Checks" tab: entities by type/market, % of mentions
   linked (`extraction["unlinked"]`), % of displayed paths with >=1 data-validated edge, # edges validated
   with real vs simulated vs prior-only data. All computed from existing fields.
4. **Uncertainty ranges**: replace single score with low/high band in `aggregate()`: low = conf discounted by
   agreement and by share of prior-only edges; high = noisy-OR without discount, capped at CONF_CAP. Show
   band + existing label. Document formula; still "plausibility", not a probability interval.
5. **Feedback-loop labels**: DFS already forbids revisits. Add `kg.find_loops(src)` (networkx simple_cycles on the
   reachable subgraph, length <=4), classify AMPLIFYING (product of signs +) / DAMPENING (-), attach a
   plain-language line built from edge mechanisms; show as a dashed edge style + list in Explain tab.
   First check how many cycles the current 90 edges contain; if ~0, add 2-3 curated feedback edges to `kb.py`
   (e.g. rates -> growth -> oil demand) with mechanisms, else skip UI work.

### Tier 2 - needs data; verify before claiming
6. **Event credibility** (new `credibility.py`): source_tier (user-selected or inferred from feed/SEC origin;
   default "unknown"), corroboration (count of independent items when fed headlines in one batch), specificity
   (magnitude/date/named entity present), recency (decay if a timestamp is supplied), quote_support. Combine
   with a transparent weighted sum shown per component; displayed separately from path plausibility.
   Pasted text has no source metadata, so default components are honest "unknown", not guessed.
7. **Rolling-window stability** in `timeseries.validate_edge`: correlation per rolling 12-month window at the
   chosen lag; report `stable / regime_dependent / unstable` (e.g. sign agreement in >=75% / 50-75% / <50% of
   windows) next to full-sample r. Reuses the cached returns; offline tests with synthetic series.
8. **Historical precedent / event study** (new `precedents.py` + `data/precedents.json`). Curated list of
   event templates (OPEC+ cut, Fed hike surprise, oil-supply shock, risk-off) each with real dates *I must source
   and confirm* (not recalled from memory; verify via web or leave out). For each, compute 1/5/20-day returns of
   mapped proxies from FRED/Yahoo and abnormal return vs SPY at runtime, cache to disk, and report "k of n
   episodes had the inferred sign". Rules: n shown always; n<5 labelled "anecdotal"; if data is unreachable,
   show "not available", never simulated. Depends on Yahoo path still being unverified -> step 0 below.

### Tier 3 - later / optional
9. **Editable, versioned graph**: `POST /api/edge` (add/disable/adjust, provenance `user_supplied`), history list
   per edge, JSON export/import. Needs KG serialization (`KnowledgeGraph.to_json/from_json`).
10. **LLM propose-verify**: extend `llm.extract_events` with schema validation (trigger in kb, direction in
    {-1,1}, quote present, hedge flag), and a "rejected suggestions" list in the response. Untestable until a
    key exists; implement with a fake-client unit test.
11. **Regime multipliers** (risk-off, inflation shock, growth scare): small per-regime edge multiplier table in
    `kb.py`, applied in `eff_strength`, UI lists which edges changed. Keep last; weights would be my judgement,
    so label as scenario assumptions.

### Step 0 (before Tier 2)
Re-verify the Yahoo path now that the thread-mixing fix is in (fetch ~6 tickers, check no duplicate
fingerprints, sane returns). Steps 6-8 depend on it; if Yahoo stays throttled, FRED-only proxies for step 8
(oil DCOILBRENTEU, rates DGS2/DGS10, USD DTWEXBGS, SP500, VIX, gold if available).

## Files touched
`impactgraph/{propagate,service,timeseries,graph,kb,llm}.py`, new `impactgraph/{credibility,precedents}.py`,
`server.py` (new endpoints), `static/index.html` (what-if panel, portfolio box, coverage/uncertainty/loop
displays), `tests/test_pipeline.py` (+ tests per step), `README.md`, `PRD.md`, `IDEA.md` (update counts, add
new features only once they exist and are verified; keep "honest status" section current).

## Verification
- `python -m unittest discover tests` green after every step (currently 22).
- What-if: oil +5% vs +25% -> same signs, higher sensitivity at +25%; baseline analysis unchanged afterwards
  (what-if must not mutate the KG; assert edge strengths identical before/after).
- Portfolio: hand-computed example (long XLE, long DAL) matches output; CASH/unknown ignored and reported.
- Coverage numbers cross-checked against raw `events/mentions/paths` counts on a sample.
- Rolling windows / event study: synthetic series with known answers in unit tests; one live run, numbers
  inspected by hand; precedents verified against dates I have confirmed from a source.
- UI: restart `python run.py`, screenshot each new panel on `#demo0`, click through tabs (this also closes
  the open "tabs not click-tested" item).
- Docs: no references to other projects; competitor claims either sourced or omitted.

## Decisions made
- Scope confirmed by user: **everything, Tier 1 + 2 + 3**. Build in the order above (Step 0, then 1-11), running
  the full test suite after each step.
- Curated feedback edges in `kb.py` are allowed only if the graph has no cycles; each needs a mechanism text.
