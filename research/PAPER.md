# Apex Zenith: A Tiered, Provenance-Carrying Causal Knowledge Graph for Explainable Propagation of Financial News Events

**Draft for internal review, 2026-10-11.** Authors: *[team names]*. All quantitative results in this draft were produced by
`research/evaluate.py` (output in `research/results.json`) unless a sentence says otherwise; see the reproducibility statement.

---

## Abstract

Financial events rarely affect a single asset: an oil shock reaches inflation expectations, interest-rate expectations,
sectors and indices through chains of economic mechanisms. News presents these effects as separate stories, and systems
that predict them often present inferences as facts. We describe **Apex Zenith**, a system that converts unstructured financial
text into an explainable dependency graph of possible effects. Its core is a *tiered property graph*: a curated causal
knowledge graph (56 entities, 90 links, each with a sign, strength, lag and written mechanism) in which every node carries a
tier (event, economic variable, sector, asset) and every link carries a relation type and a provenance record, but in which
tiers inform rather than constrain. Events are extracted by deterministic rules and by a language model whose output is accepted
only when its supporting quote appears verbatim in the article; each event is labelled *observed* or *expected*. Effects are
propagated by depth-limited multi-path search, links are checked against two years of real market data by lagged correlation,
and every change to the graph passes health checks and a regression test, with automatic rollback. On ten articles, restricting
links to a strict tier order removes 113 of 182 asset conclusions, while removing only upward (feedback) links removes 2, which
motivates the tiered-but-unconstrained design. Of the 36 causal links that real data could test, 24 are supported, 11
inconclusive and 1 contradicted; all 343 displayed path scores are reproduced exactly from their links; 9 of 9 injected
faults are handled correctly by the update guard; and the graph-grounded assistant retrieves the strongest chain for all 450
connected driver–target pairs, including 306 chains of three to five hops, and, after diversification, covers every usable
first link for all 18 drivers in one-topic questions (11 before). The assistant also answers from a library of every analysis the system
produced, keeping what each article reported apart from what the model inferred.
We report the system's errors, including rule-extraction failures found by the evaluation and then fixed, and discuss why its
scores are plausibility, not probability.

---

## 1. Introduction

A geopolitical event, commodity shock, interest-rate decision or regulation spreads through sectors and instruments. A reader who
wants to know whether a tanker attack in the Strait of Hormuz matters for an Indian real-estate index must rebuild the chain
(crude oil → inflation expectations → rate expectations → real estate) from separate stories. The problem we address is to do this
automatically: to turn unstructured financial information into a *dynamic dependency graph* showing how an event may influence
economic variables, sectors and assets, while distinguishing what the text states from what the system infers, and communicating
uncertainty instead of presenting predictions as guarantees.

Three families of approach are available, and each fails one requirement on its own. A **language model asked directly** handles any
phrasing but can invent links and numbers, is hard to audit, and does not reproduce exactly. **Purely statistical** links learned
from prices are objective but carry no mechanism, need long clean histories, and confuse correlation with causation. A **curated
causal graph** is auditable and deterministic but its weights are judgements and its rules miss unusual phrasing. Apex Zenith
combines the three with explicit boundaries between them: the curated graph supplies mechanisms, the rules and a quote-verified
language model supply the events, and market data supplies evidence about the links, never the links themselves.

**Contributions.**

1. A *tiered property graph* design for event-impact reasoning: tiers, relation types and provenance are stored on every node and
   link, but propagation is not restricted by tier. We measure what strict hierarchies would cost (Section 9.2).
2. An *observed / expected / inferred* discipline that runs through extraction, propagation (observed moves become anchors), the
   comparison of model and article, and the explanation shown to users.
3. *Grounded language-model use*: the model may propose events and links only with a quote that is verified against the article,
   may never change the sign of a curated link, and answers questions only from citable "cards" whose citations are checked: cards for
   the graph's facts, and cards for every earlier analysis that keep what an article reported apart from what the model inferred.
4. A *guarded, versioned update mechanism* for a graph that learns from articles: structural health checks, a regression test
   against the curated baseline, automatic rollback, and an exact before/after diff for every change.
5. An offline, reproducible evaluation (`research/evaluate.py`) covering design ablation, data validation of every link, score
   reproducibility, model-versus-article agreement, fault injection, latency and the assistant's multi-hop retrieval, with an error
   analysis whose findings were fixed and pinned by regression tests.

---

## 2. Related work

**Event extraction.** Extracting typed events and their arguments from text has a long history, from the ACE programme
[Doddington et al., 2004] to neural and generative extractors. Event-driven stock prediction [Ding et al., 2015] showed that
structured event representations carry market information. Our extractor is deliberately simpler (five event types, rule-based,
with a language-model supplement) because the target is an auditable explanation, not a trading signal.

**Knowledge graphs and causal graphs.** Knowledge graphs [Hogan et al., 2021] represent entities and typed relations; causal
graphs add direction and mechanism. Hierarchical or layered graphs organise nodes into levels. We keep the causal semantics of a
flat graph and add the hierarchy as stored, informative metadata (Section 4), and we measure the cost of enforcing it.

**Evidence combination.** Our per-node aggregation uses a noisy-OR over the strongest paths [Pearl, 1988], with a cap and an
agreement penalty because paths that share links violate noisy-OR's independence assumption.

**Statistical validation of links.** Lagged correlation is a weak relative of Granger-style tests [Granger, 1969]; we use it only to
label a link as supported, contradicted or inconclusive, never to create one. Event studies [MacKinlay, 1997] measure realised
abnormal returns around events; we do not perform them and list them as future work.

**Grounding language models.** Language models hallucinate [Ji et al., 2023]. Retrieval-augmented generation [Lewis et al., 2020] and
graph-based retrieval [Edge et al., 2024] ground answers in retrieved text. Our assistant is a small, deterministic instance of this
idea: it retrieves graph-derived cards without embeddings and verifies every citation in the answer.

**Volatility simulation.** The optional volatility fan uses geometric Brownian motion with zero drift [Black and Scholes, 1973],
calibrated on real returns; it illustrates dispersion, not direction.

---

## 3. Requirements

The design follows five requirements derived from the problem statement.

| # | Requirement | How it is met |
|---|---|---|
| R1 | Separate observed facts from inferred relationships | Hedge detection labels events observed or expected; only observed moves anchor propagation; everything downstream is labelled inferred; model hypotheses are drawn dashed and never learned |
| R2 | Explain every impact chain and its evidence | Each link has a written mechanism; each path lists, per hop, strength, decay, lag, basis, data check and quote; the displayed score is the exact product of the listed factors |
| R3 | Communicate uncertainty | Scores are named plausibility; conflicting paths are flagged "mixed"; confidence is reduced by disagreement; data checks show r, lag and sample size |
| R4 | Keep the graph dynamic but safe | Learning from articles is guarded by health checks and a regression test with rollback; every change is versioned and restorable |
| R5 | Be reproducible and auditable | Rules and propagation are deterministic; the language model's contributions are verified and badged; the evaluation runs offline |

---

## 4. The tiered property graph

### 4.1 Content

The curated graph contains **56 entities** and **90 directed links** (E1 in `results.json`), referred to by 215 aliases.

| Tier | Level | Node types | Entities |
|---|---|---|---|
| Events & policy | 0 | event class, institution (and the events an article reports) | 6 |
| Economic variables | 1 | commodity, indicator | 13 |
| Sectors | 2 | sector | 13 |
| Assets | 3 | company, index, instrument | 24 |

31 entities are global, 15 Indian and 10 US; 48 have a market series (FRED or Yahoo Finance). A link `u → v` states: *when `u` rises it
pushes `v` up (sign +1) or down (−1), with prior strength `s` ∈ (0, 1), typical lag `ℓ` days, for the stated mechanism*. 65 links are
positive and 25 negative; strengths range from 0.15 to 0.98 (median 0.50); the median lag is 2 days. Strengths are **analyst priors**,
not estimated coefficients.

### 4.2 Stored properties

Every node stores its `tier` (derived from its type, never learned), `origin` (curated, learned from an article, or added by a user),
`market`, `first_seen`, and the articles that mention it. Every link stores a **relation** that says what it means, separately from its
sign and strength:

| Relation | Meaning | Curated links |
|---|---|---|
| `causes` | the source moving pushes the target | 58 |
| `member_of` | a company belongs to a sector | 15 |
| `weight_in` | a sector or company is a component of a broad index | 7 |
| `tracks` | a fund or sector index follows a sector, commodity or yield | 6 |
| `policy_reaction` | an institution's decision reprices a variable | 4 |

Sector membership is read from these relations, so an impact on a sector can be drilled down to its members. Each link also carries a
**provenance** list (`prior`, `observed`, `llm_extracted`, `llm_proposed`, `validated`, `inferred`, `user_added`, `user_edited`), its
article evidence and its latest data check. For explanation, each link is assigned one **basis**, the strongest claim that applies, in
the order: user-edited, contradicted by data, observed in an article, supported by data, proposed by the language model, prior only.

### 4.3 Tier crossing, and why tiers do not constrain

Each link is classified by how it crosses tiers: `next` (one tier down, 54 links), `lateral` (within a tier, 25), `skip` (more than one
tier down, 9) or `feedback` (back up, 2). A strict hierarchy would allow only `next`. We keep all four kinds and enforce a single hard
rule: **no link learned at run time may point up from an asset**. Section 9.2 shows why: the problem's own example chain (oil →
inflation → rates → yields) is a chain of *lateral* links among variables, and indices such as the S&P 500 belong to no sector, so rates
reach them by a *skip*. The tiers are used to structure explanation (a tier header per column, a "tier sentence" per path, a per-tier
roll-up and evidence mix), not to prune the search.

---

## 5. Extraction and grounding

**Entities.** Longest-match, non-overlapping alias matching with word boundaries; aliases can be case-sensitive (`!Fed`, `!Delta`) so
that ordinary words do not match. Unrecognised capitalised company names ending in Inc, Corp, Airlines, Bank and similar are captured
and may be added as low-confidence *learned* entities.

**Events.** Five types are detected by rules: price or level moves, central-bank decisions, supply decisions (OPEC+), geopolitical
shocks and regulation. A move is an up- or down-verb near an entity *within the same clause* (clauses split at `;`, ", while", "but",
"as", "after", "amid"); determiner-preceded nouns ("the increase") and adjective uses ("higher capital requirements") are rejected. The
nearest percentage or basis-point figure sets the magnitude, and intensity is `clip(tanh(|%|/8), 0.25, 1)`. Special cases: "rupee
weakened" raises the USD/INR node; a generic "central banks" mention is not a decision; a regulator's action is scoped to its market.

**Observed versus expected.** A hedge word before the verb (could, may, expected to, analysts warn, if, risk of, forecast, …) makes an
event *expected* and reduces its intensity by 30%. Expected price moves are not propagated; they become claims that the model is
compared against.

**Language-model supplement.** One structured call (Groq, with OpenRouter as fallback) returns extra events and cause→effect links
restricted to known node identifiers. An item is accepted only if its identifiers exist, its sign is ±1, and its quote (at least 15
characters for a link) is found verbatim in the article. Accepted links enter the graph at strength 0.35 with provenance
`llm_proposed`; a model reading that contradicts the sign of a curated link is logged and discarded. The model also writes a summary
from a list of facts it is given, with instructions never to describe inferences as observed.

---

## 6. Propagation and scoring

**Sources and anchors.** Observed decisions and events become *sources*. Observed price moves become *anchored* sources: propagation
from any other source stops at an anchor, so the graph's prediction for that node can be compared with what the article reports, and
the anchor's own downstream effects are traced from the reported move. A cause-event and an observed move on the same node in the same
direction are merged to avoid double counting.

**Path search.** Depth-first search over simple paths, at most 5 hops, at most 300 paths per source, dropping paths below 0.04. For a
path with links `e₁ … e_k`,

```
score = Π_i  s_eff(e_i) · d(e_i)          d(e_1) = 1
s_eff(e) = min(0.99, s(e) · m(e))          m = 1 + min(0.25, |r|/2) if supported, max(0.55, 1 − |r|) if contradicted, else 1
d(e)     = 0.97 if |r| ≥ 0.50;  0.93 if 0.30 ≤ |r| < 0.50;  0.82 if |r| < 0.30 or contradicted;  0.92 if unchecked
sign     = source direction · Π sign(e_i)        lag = Σ lag_eff(e_i)
```

where `r` is the link's validated correlation on real data (Section 7). Longer and weakly supported chains are discounted.

**Aggregation per node.** Over all paths ending at a node, positive mass `P` and negative mass `N` are the summed scores of paths
pushing it up and down. With `miss = Π (1 − score)` over the best four paths,

```
agreement  = max(P, N) / (P + N)
confidence = min(0.92, 1 − miss) · (0.5 + 0.5 · agreement)
mixed      = agreement < 0.70  and  min(P, N) ≥ 0.02
```

The noisy-OR overstates confidence when paths share links; the 0.92 cap and the agreement penalty are deliberate corrections, and a
node reached by conflicting paths is flagged *mixed* rather than averaged. Labels: high ≥ 0.5, moderate ≥ 0.25, low below.
These numbers are **plausibility scores, not probabilities**: they are not calibrated against outcomes.

---

## 7. Validation against market data

For a link `u → v` whose endpoints both have a market series, daily series of about 520 trading days are taken from FRED and Yahoo
Finance (prices as log returns; yields and expectations as first differences in percentage points). The two series are aligned by date
(at least 120 common days) and correlated at lags `0 … min(10, max(2, ⌊1.5ℓ⌋ + 1))`; the strongest absolute correlation is kept,
preferring the shortest lag among near-ties. With `n` aligned days the threshold is `2.8/√n` (roughly a two-sided 0.5% level under a
normal approximation, ignoring autocorrelation and the several lags tried). The verdict is *supported* (significant, expected sign),
*contradicted* (significant, opposite sign), *inconclusive*, *same_series* (both ends use one series, which is not independent
evidence), or *no_data*. A supported or contradicted verdict changes the link's effective strength and decay as in Section 6, and a
data-informed lag replaces the prior lag, scaled by a volatility regime (recent 30-day over full-window volatility).

**Simulated data never changes confidence.** If no real series is reachable, a clearly labelled synthetic series may be drawn for
demonstration, but a check against it is marked simulated and ignored, since validating a prior against data generated from that prior
would be circular. Learned links that real data contradicts are pruned; curated and user links never are.

---

## 8. Safe dynamic updates and grounded questions

**Guarded changes.** In dynamic mode each analysed article updates the graph: sentences in which two linked entities co-occur are stored
as evidence and move the link's strength a step toward 0.97 (`s ← s + 0.05(0.97 − s)`; 0.03 for language-model evidence), new entities
and verified links are added. Every change is wrapped: a snapshot is taken, the change applied, and these checks run:

| Check | Rule |
|---|---|
| Curated entities present | none of the 56 missing |
| Curated links intact | every curated link keeps its sign (unless a user deliberately edited it) |
| Strengths in range | 0 < s ≤ 0.99 |
| No self-loops | |
| Tier rule | no learned link points up from an asset |
| Runtime links a minority | at most 35% of links |
| Bounded growth | at most 8 new links and 6 new entities per change |
| Baseline regression | on the built-in sample articles, ≥ 90% sign agreement on conclusions with confidence ≥ 0.3 and ≥ 90% recall of conclusions ≥ 0.5, compared with the curated baseline |

A failed check restores the snapshot. A deliberate user edit is judged on structure only (the regression is skipped because the user
chooses to depart from the baseline). Every accepted change produces a history entry with the actor, action, reason, tiers touched and an
exact diff computed by comparing the graph before and after; any of the last 30 versions can be restored as a new forward version; and
each analysis records the graph version it ran on.

**Grounded question answering.** The graph is exported as plain-text *cards* with stable identifiers (node `n:`, link `l:`, sector `s:`,
tier `t:`, path `p:`), each built only from stored facts, pinned to the graph version and summarised by a fingerprint that changes exactly
when the graph's facts change. To answer a question, the assistant finds the entities it names (follow-up questions may borrow the
previous subject), retrieves node, link and path cards between them (or, when the graph holds no path, a *gap* card and a *shared-drivers*
card listing the variables that move both, which is co-movement through common causes and is labelled as such), and asks the language
model to answer from those cards only, citing card identifiers. Citations not in the retrieved set are removed; an answer with no valid
citation gets one retry in which the model is shown its answer and asked to cite, and is otherwise replaced by the cards themselves. The
assistant never changes the graph.

For a question about one entity ("what happens if crude oil rises?") the strongest chains are short and share the strongest first link,
because a chain's score is a product. Retrieval therefore takes the strongest chain through each *different* first link, then through each
different second link when slots remain (a central bank has a single link, to rate expectations), up to five, and ensures one chain passes
through another economic variable when the graph has one.

**The analysis library.** The graph keeps what an article *teaches* it, not the analysis of the article. Every analysis the system produces
is therefore filed in a library on the backend (newest 200; the record id is a hash of the analysed text, so re-analysing an article
replaces its record), and the assistant can read it. Each record becomes an *analysis card* (`a:<id>`) that keeps three things apart:
what the article **reported** (observed events with their verbatim quotes), what the model **inferred** at the time (chains, affected assets,
on a stated graph version, with a note when the graph has changed since) and the model's **hypotheses**. A question retrieves the most recent
analyses that touched the entities it names, or, for a question about the news, the latest ones; "the last article" means exactly the
newest. The instructions require the answer to attribute each claim to one of the three kinds. Earlier analyses held in a user's browser can
be imported. Retrieval is by graph entity and keyword, not by embedding, so it stays deterministic and testable.

---

## 9. Evaluation

### 9.1 Setup

All experiments run offline and deterministically: rules-only extraction (the language model is switched off), real FRED and Yahoo
Finance daily series read from a disk cache covering **2024-09-05 to 2026-10-09**, and the graph frozen at the curated baseline (static
mode) so that results do not depend on the order in which articles are read. The article set is the five built-in samples (oil spike
after a Hormuz tanker attack; a 50 bp Fed hike; an RBI rule on banks; gold rallying on escalation; a natural-gas surge) and five short
articles on other event types (a 25 bp Fed hike; an OPEC+ output cut; an RBI rate cut; gold and the dollar on a banking scare; Delta
falling on fuel costs). Ten articles is a small set: these results characterise the system's behaviour and its design trade-offs; they
are not a benchmark of predictive accuracy.

### 9.2 Should tiers constrain propagation? (E2)

We removed links by tier-crossing kind and re-ran the ten articles, comparing the assets each variant reaches with the flat graph.

| Variant | Links | Paths | Asset conclusions | Lost | Direction flips | Top-5 overlap | Articles reaching no asset |
|---|---|---|---|---|---|---|---|
| Flat graph (as built) | 90 | 343 | 182 | 0 | 0 | 1.00 | 0 |
| No feedback links | 88 | 328 | 180 | 2 | 0 | 1.00 | 0 |
| No tier skips | 81 | 336 | 160 | 22 | 12 | 0.62 | 0 |
| No feedback, no skips | 79 | 321 | 158 | 24 | 12 | 0.62 | 0 |
| Strict layers (next tier only) | 54 | 127 | 69 | 113 | 4 | 0.49 | 2 |

In the flat graph, 65% of the 343 paths use at least one lateral link and 17% a tier skip; of the 137 best paths behind asset
conclusions, 51% use a lateral link and 28% a skip. A strict hierarchy therefore discards most conclusions (113 of 182) and leaves two
articles with no asset reached at all, and removing skips alone flips 12 directions. Removing the two feedback links costs only 2
conclusions and no flips, so feedback is the one kind we restrict, and only for learned links. (The figures are with the extraction
fixes of Section 9.5; before them the same run gave 183 conclusions and 114 lost under strict layers. A first version of the study, with
learning enabled between articles, gave 182 and 112; static mode removes that order dependence.)

### 9.3 Do real data support the links? (E3)

Every curated link was checked against the cached real series.

| Link type | Links | Simulated only | Supported | Inconclusive | Contradicted | Same series | No data |
|---|---|---|---|---|---|---|---|
| Causal (`causes`, `policy_reaction`) | 62 | 5 | 24 | 11 | 1 | 0 | 21 |
| Structural (`member_of`, `tracks`, `weight_in`) | 28 | 1 | 21 | 4 | 0 | 2 | 0 |
| All | 90 | 6 | 45 | 15 | 1 | 2 | 21 |

Of the 36 causal links that real data could test, 24 (67%) are supported, 11 (31%) are inconclusive and 1 (3%) is contradicted; the
median |r| of supported causal links is 0.42 (median overlap 495 trading days). The 21 causal links without data involve nodes that have
no daily series (economic growth, consumer spending, event classes, institutions), and the 6 simulated-only links involve natural gas,
wheat and Nifty Realty, whose series were not in the cache. Supported structural links are expected (a sector ETF
and its member stocks move together) and are reported separately so they do not inflate the causal figure. The one contradiction is
*US dollar → crude oil*: the prior says a stronger dollar lowers dollar-priced oil (sign −), but over this window the broad dollar index
and Brent rose together on the same day (r = +0.20, n = 502). We keep the prior and show the contradiction rather than flip the sign,
because a two-year same-day correlation is weak evidence about a structural mechanism; the data check lowers the link's effective
strength instead. Some supported correlations are small (minimum |r| = 0.13 just above a threshold of about 0.126), and choosing the best
of several lags inflates the chance of a spurious "supported"; we report r and n with every verdict for this reason.

### 9.4 Are the displayed scores what the method says? (E4)

After validating every link on the real data, we recomputed each of the 343 explained path scores from its links' effective strengths and
decays. The maximum absolute difference from the displayed score is **0.000** at the displayed precision (three decimals). The
explanation shown to the user is therefore the computation, not a description of it.

**Worked example.** For *"Crude oil rose 12% on Monday after an attack on tankers in the Strait of Hormuz"* the rules extract *Crude Oil up
12%* and *Geopolitical escalation (attack)*, both observed. One traced chain reads, tier by tier, *Event: Crude Oil up 12% → Variable:
Crude Oil ↑ → Variable: Inflation Expectations ↑ → Variable: Interest-Rate Expectations ↑ → Sector: Real Estate ↓*, typical lag 31 days:

| Hop | Effective strength | Decay | Lag (d) | Data check |
|---|---|---|---|---|
| Crude Oil → Inflation Expectations | 0.931 | 1.00 (first hop) | 2 | supported, r = 0.482, n = 504 |
| Inflation Expectations → Rate Expectations | 0.847 | 0.93 | 8 | supported, r = 0.421, n = 519 |
| Rate Expectations → Real Estate | 0.705 | 0.82 | 21 | supported but weak, r = −0.17, n = 495 |

`0.931 × (0.847 × 0.93) × (0.705 × 0.82) = 0.424`. The same analysis rates Airlines and Delta down (high, 0.92), Exxon Mobil up (high,
0.92), the S&P 500 down (high, 0.67) and **Banks up with low confidence (0.25), flagged mixed**: competing paths reach banks with opposite
signs (higher rates widen margins; slower growth hurts credit), and the system reports that instead of choosing.

### 9.5 Does the graph agree with what the articles state? (E5)

For each observed move (anchor) and expected claim, we compare the direction the graph predicts from the *other* sources with the
direction the article states.

| Verdict | First run | After the extraction fixes |
|---|---|---|
| Consistent | 15 | 18 |
| Contradicts | 2 | 1 |
| Model mixed | 1 | 1 |
| No upstream path (nothing else in the article reaches that node) | 5 | 4 |

**First run.** Of the 18 statements the graph could address, 15 agreed, 1 was flagged mixed and 2 disagreed. One disagreement was an
extraction error, the other a genuine model error (below). Inspecting the 30 events the rules extracted (author inspection, not an
annotated benchmark) found 2 wrong and at least 4 missed:

| Text | What the rules did | Cause | Fix |
|---|---|---|---|
| "OPEC+ agreed to cut oil output by 1 million barrels a day, sending Brent crude up 6%" | Crude Oil **down**; OPEC+ decision and the 6% rise missed | "cut" attached to "oil"; one word between "cut" and "output" broke the supply-restraint pattern; "sending … up" not recognised | an entity followed by a quantity noun (output, production, exports, inventories, demand …) is not a price; the pattern allows "cut oil output"; a causative verb + entity + up/down/higher/lower gives a direction |
| "…signalled more hikes if inflation stays high" (25 bp Fed article) | Inflation Expectations **up, observed** | the noun "hikes" read as a verb; the hedge "if" comes after the verb, so it was not seen | "more", "fewer", "additional", "no" mark a noun use; a hedge before the entity (not only before the verb) makes the statement expected |
| "10-year yields rose" (50 bp Fed sample) | missed | alias list had "10-year yield" only | plural aliases added |
| "…push central banks to keep interest rates higher for longer" (oil sample) | expected rise in rates missed | the generic "central banks" mention suppressed the rate statement, yet is (correctly) not a decision-maker | only a named central bank takes the statement over |
| "The dollar index jumped 1.2% and 10-year yields rose" (found while testing the fixes) | yields given the dollar's "1.2%" | a figure before the verb could belong to another entity | a figure before the verb must come after the entity's own mention |

Each fix has a regression test (`tests/test_pipeline.py`). **After the fixes**, of the 20 statements the graph can address, 18 agree, 1 is
flagged mixed and 1 disagrees, and all 32 extracted events are correct by inspection. These after-fix figures are **in-sample**: the fixes
were made by looking at these ten articles, so they show that the failures were removed, not how the extractor generalises. Failure
modes we know remain: verbs outside the list ("squeeze", "weigh on", "slow"), and a strong geopolitical word under a hedge ("oil could rise
if tensions escalate" still yields an *observed* escalation). The language-model pass exists to cover such gaps but was switched off here
and was not evaluated; it adds events alongside rule events and cannot remove a wrong one.

**The remaining disagreement is a genuine model error (gold sample).** The article reports Treasury yields falling as conflict escalated.
Two channels reach the 10-year yield from the geopolitical event and nearly balance on priors: flight to safety (geopolitical tension → risk
aversion → yields down, path score 0.193) and an inflation channel (geopolitical tension → crude oil → inflation expectations → rate
expectations → yields up, 0.213). After the data checks the graph's net call is "up", which the article contradicts. The flight-to-safety
mechanism dominated on the day; the graph has no notion of which channel acts first. We did not retune the priors to fit this article,
which would be fitting the evaluation set.

The four "no upstream path" cases are moves the graph can explain only backwards (for example Delta falling on fuel costs, where Delta is a
leaf node); for such stories the system adds *possible drivers* traced backwards, drawn as labelled hypotheses.

### 9.6 Does the guard catch bad updates? (E6)

We injected changes into a graph in dynamic mode and recorded whether the guard rolled them back and whether the graph was restored
exactly (same nodes, signs and strengths).

| Injected change | Should be rejected | Rolled back | Restored exactly | Failed check |
|---|---|---|---|---|
| Flip the sign of a curated link | yes | yes | yes | curated links intact |
| Delete a curated entity | yes | yes | yes | curated entities present; curated links intact |
| Strength out of range (1.5) | yes | yes | yes | strengths in range |
| Self-loop | yes | yes | yes | no self-loops |
| Learned link pointing up from an asset | yes | yes | yes | tier rule |
| Nine new links in one change | yes | yes | yes | bounded growth |
| Hollow out all oil links (signs kept, strength 0.01) | yes | yes | yes | baseline regression |
| Reinforce one link (normal learning) | no | no | – | – |
| One new language-model link | no | no | – | – |

All 9 cases are handled correctly. The seventh case matters most: it keeps every sign and passes every structural check, and only the
regression test against the curated baseline catches it.

### 9.7 Latency (E7)

A rules-only analysis on cached data takes a median of **0.045 s** (maximum 0.060 s over 30 runs, warm cache). With the language model on,
end-to-end analyses observed during development took 13–35 s, dominated by the model call and by provider rate limits (this figure was
observed in use, not measured by the script).

### 9.8 Supporting checks

The volatility fan is calibrated on real returns and refuses to run when only simulated data exist or when the series is a yield or an
expectation: on the cached data, Brent's annualised volatility is 49.6% and the S&P 500's 15.8% (520 daily returns each), and the 10-year
yield is refused. The repository's 228 automated tests cover extraction, propagation, validation, the guard, history and restore, the
cards, the assistant, the analysis library and the headline ranker.

### 9.9 Does the assistant retrieve multi-hop chains? (E8)

Answers can only be as good as the cards retrieved for them, so we measured retrieval directly, with no language model involved.

*Two-entity questions* ("how does geopolitical tension affect DLF?"). For every pair of a driver (event or variable, 19 nodes) and a target
(sector or asset, 37 nodes) joined by a chain of score at least 0.03 within five hops, we compared the chain the assistant retrieves with
the best chain found by exhaustive enumeration of all simple paths. Of 450 connected pairs, the assistant retrieves the best chain for
**all 450**; 306 of those chains have three to five hops (for example *geopolitical tension → crude oil → inflation expectations → rate
expectations → real estate → DLF*, score 0.143). When two entities are not connected, it returns a *gap* card and the answer says the
graph does not say.

*One-entity questions* ("what happens if crude oil rises?"). The first version retrieved the three strongest chains out of the entity.
Because a path score is a product of strengths, these were short chains through the strongest first link: for crude oil all three were
*crude oil → oil and gas producers → XLE / Exxon / Chevron*, and the inflation → rates chain, the problem's own example, never reached the
language model. We then diversified retrieval (Section 8) and measured both versions:

| One-entity retrieval (18 drivers) | Strongest three | Diversified |
|---|---|---|
| Drivers whose chains use every first link that leads to a sector or asset (up to the number of chains) | 11 | 18 |
| Chains retrieved (median) | 3 | 5 |
| Drivers with a retrieved chain through another economic variable | 14 | 15 |
| Crude oil: distinct first links covered (of 9 usable) | 1 | 5 |

The 8 drivers whose chains still share one first link have only one usable link (for example a central bank → rate expectations). With
diversification, "what happens if crude oil rises?" retrieves chains through producers, airlines, inflation, consumer spending and autos;
in a browser test with the language model on, the answer cited three of them, including crude oil → inflation expectations → rate
expectations → 10-year yield → TLT.

*Questions about analysed articles.* In the same browser test (14 checks, all passing), a new analysis was filed in the library, an older
analysis was imported from the browser's history, and "What did the last article report?" was answered only from the newest analysis,
quoting what that article reported. A first run of this test exposed a fault: with two analyses retrieved, the language model answered from
the older one; "the last article" now retrieves exactly the newest.

---

## 10. Discussion and limitations

* **Priors, not estimates.** Link strengths are expert judgements. Data checks adjust them modestly, and nothing is fitted or calibrated
  against outcomes. The plausibility scores are not probabilities and must not be read as the chance of a move or its size.
* **Correlation is not causation.** A supported verdict says two series moved together at some lag over about two years; relationships
  change across regimes, and the multiple-lag search raises the false-positive rate. Contradicted curated links are shown, not removed.
* **Noisy-OR over shared links** overstates independence; the cap and agreement penalty soften but do not remove this.
* **Coverage.** 56 entities, two markets (US, India), English text, five event types. The rule extractor misses unusual phrasing,
  negation and figures written in words, and makes the errors in Section 9.5.
* **The language model** varies between runs and its own extraction can be loose; it is constrained by quote verification and sign
  protection, but its accuracy was not evaluated here.
* **Evaluation scale.** Ten articles and author inspection are enough to characterise behaviour and design trade-offs, not to claim
  accuracy. A labelled extraction set and an event study of realised returns are the natural next evaluations.
* **Timing.** The graph gives typical lags but has no model of which channel acts first, which caused the gold-sample error.
* **Assistant retrieval** is by graph entity and keyword: an article is found only through the graph entities it touched, a question that
  names none and does not mention the news gets no answer, and which retrieved cards an answer cites is the language model's choice.
  The analysis library is shared by everyone using one backend.
* **Contributed modules.** A portfolio-hedging module in the repository converts plausibility into dollar profit and loss and uses fixed
  constants; it is outside the method described here and should not be cited as part of it.

**Responsible use.** The system is a research prototype and gives no investment advice. It reads full articles only from public hosts
that allow it in robots.txt, identifies itself honestly, stores no article text, and uses data sources within their free-tier terms
(the NewsAPI developer plan is not licensed for production use).

---

## 11. Conclusion and future work

Apex Zenith shows that an event-impact graph can be both dynamic and auditable when its parts have clear roles: a curated causal graph
supplies mechanisms, rules and a quote-verified language model supply events, real data labels links without creating them, and a guard
keeps learning from eroding the baseline. Tiers are most useful as stored, explanatory structure; enforced as constraints they would
remove most conclusions. Next steps, in order of value: (1) a labelled, held-out extraction set to measure precision and recall, and
fixes for the remaining failure modes in Section 9.5; (2) a question set with reference answers to evaluate the assistant's answers,
not only its retrieval; (3) event studies of realised abnormal returns for past events of each type, shown next to the graph's prediction; (4) calibration of
link strengths on historical episodes; (5) channel timing, so that fast channels (flight to safety) can dominate slow ones (inflation)
at short horizons; (6) embedding-based retrieval over the cards with the fingerprint to detect stale indexes.

---

## Reproducibility statement

All numbers in Section 9, except the language-model latency in 9.7, come from one command run at the repository root with the market-data
cache present:

```
ZENITH_REQUIRE_LLM=0 python research/evaluate.py
```

It needs no API key and no network access, writes only `research/results.json`, and takes about 5 seconds. Results depend on the cached
series (`data/cache`, window 2024-09-05 to 2026-10-09); with a different cache, the data-validation counts in 9.3 and the strengths in
9.4 will differ, while 9.2 (ablation), 9.5 (extraction), 9.6 (guard) and 9.9 (retrieval) do not depend on market data except through
validation.

---

## References

*Verify each entry against the original before submission.*

- Black, F. and Scholes, M. (1973). The pricing of options and corporate liabilities. *Journal of Political Economy*, 81(3), 637–654.
- Ding, X., Zhang, Y., Liu, T. and Duan, J. (2015). Deep learning for event-driven stock prediction. *Proceedings of IJCAI 2015*.
- Doddington, G., Mitchell, A., Przybocki, M., Ramshaw, L., Strassel, S. and Weischedel, R. (2004). The Automatic Content Extraction (ACE)
  program: tasks, data, and evaluation. *Proceedings of LREC 2004*.
- Edge, D. et al. (2024). From local to global: a graph RAG approach to query-focused summarization. *arXiv:2404.16130*.
- Granger, C. W. J. (1969). Investigating causal relations by econometric models and cross-spectral methods. *Econometrica*, 37(3), 424–438.
- Hogan, A. et al. (2021). Knowledge graphs. *ACM Computing Surveys*, 54(4).
- Ji, Z. et al. (2023). Survey of hallucination in natural language generation. *ACM Computing Surveys*, 55(12).
- Lewis, P. et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in NeurIPS 33*.
- MacKinlay, A. C. (1997). Event studies in economics and finance. *Journal of Economic Literature*, 35(1), 13–39.
- Pearl, J. (1988). *Probabilistic Reasoning in Intelligent Systems: Networks of Plausible Inference*. Morgan Kaufmann.

---

## Appendix: constants

| Constant | Value | Where |
|---|---|---|
| Maximum path length | 5 hops | `propagate.py` |
| Minimum path score | 0.04 | `propagate.py` |
| Paths per source | 300 | `propagate.py` |
| Per-hop decay | 0.97 / 0.93 / 0.82 / 0.92 (unchecked) | `propagate.py` |
| Confidence cap | 0.92 | `propagate.py` |
| Mixed-signal rule | agreement < 0.70 and minority mass ≥ 0.02 | `propagate.py` |
| Intensity | clip(tanh(|%|/8), 0.25, 1); ×0.7 if expected | `extract.py` |
| Validation window | about 520 trading days, ≥ 120 aligned | `timeseries.py` |
| Significance threshold | 2.8/√n | `timeseries.py` |
| Strength multiplier | supported 1 + min(0.25, |r|/2); contradicted max(0.55, 1 − |r|) | `timeseries.py` |
| Article reinforcement | s + 0.05(0.97 − s); language model 0.03 | `graph.py` |
| New language-model link | strength 0.35, lag 1 day, quote ≥ 15 characters | `graph.py`, `llm.py` |
| Guard limits | ≤ 8 links and ≤ 6 entities per change; runtime links ≤ 35%; regression ≥ 90% / ≥ 90% | `kbstate.py` |
| Restorable versions | 30 | `kbstate.py` |
