# Hybrid Retrieval & Reranking Deep Dive

This note links the high-level pipeline in ⁠ docs/pipeline-validation.md ⁠ with the concrete implementation in ⁠ scripts/05-api/rag_api_secure.py ⁠, focusing on the triple-fusion hybrid search and reranking stack that powers PubMed retrieval.

## 1. Query Preparation
•⁠  ⁠*Inputs*: the raw user query and the expanded query produced by the query-contextualization/expansion step.
•⁠  ⁠*Embeddings*: ⁠ _assert_vector ⁠ guards that the embedding length matches the OpenSearch index (⁠ EMBED_DIM ⁠, default 768). The expanded query is embedded so that dense search covers synonyms injected during expansion, while BM25 uses the literal raw query to reward exact term overlaps.
•⁠  ⁠*Intent signals*: ⁠ intent_policies ⁠ can supply minimum publication year filters, study-type quotas, and rerank weight profiles so retrieval is biased toward evidence tiers that match the query intent.

## 2. Triple-Fusion Hybrid Retrieval
Implementation: ⁠ triple_rrf_pipeline ⁠ in ⁠ scripts/05-api/rag_api_secure.py ⁠.

| Retriever | Size constant | Why it exists | Query surface | Notes |
|-----------|---------------|---------------|---------------|-------|
| Dense semantic search | ⁠ DENSE_K = 200 ⁠ | Captures conceptual similarity beyond keywords | Expanded query embedding | OpenSearch ⁠ knn ⁠ over the indexed embeddings. Preserves ⁠ _score ⁠ and full ⁠ _source ⁠. |
| BM25 lexical search | ⁠ LEXICAL_K = 200 ⁠ | Rewards exact medical terminology matches, handles abbreviations | Raw user query | Applies ⁠ pub_year >= intent_year_filter ⁠ (defaults to 2010) to suppress stale literature. |
| Prior-weighted lexical search | ⁠ PRIOR_K = 120 ⁠ | Boosts historically authoritative papers | Raw query | Uses ⁠ function_score ⁠ to add log citations (⁠ cited_count ⁠) and Gaussian recency boost centered on ⁠ CURRENT_YEAR ⁠. |

The three individual queries are batched through a single OpenSearch ⁠ _msearch ⁠ call to cut network latency and ensure consistent snapshots of index state.

### Weighted Reciprocal Rank Fusion (RRF)
•⁠  ⁠RRF parameters: ⁠ RRF_K = 60 ⁠, ⁠ RRF_WEIGHTS = [1.0, 1.0, 0.6] ⁠. Fusion is handled by ⁠ _rrf_fuse_weighted ⁠.
•⁠  ⁠Dense and BM25 lists have equal weight; the prior list is down-weighted to avoid over-counting the same lexical signal while still surfacing high-value classics.
•⁠  ⁠Output includes per-document ⁠ rrf_score ⁠ and the original ranks of each retriever (⁠ fusion_ranks ⁠) for later diagnostics.

### Candidate Cleaning & Structuring
1.⁠ ⁠*Deduplication + Study-Type Quotas*: ⁠ _dedupe_and_type_quota ⁠ collapses duplicates by PMID/DOI/normalized title and enforces light quotas (default: 1 guideline, 1 systematic review, 2 RCTs) inside the top ⁠ TOP_SOFT_QUOTA_CAP = 100 ⁠. Intent-specific quotas override the defaults.
2.⁠ ⁠*Diversity via Maximum Marginal Relevance*: ⁠ _mmr_select ⁠ applies MMR on the candidate embeddings with ⁠ MMR_LAMBDA = 0.60 ⁠ (balance between relevance and novelty) and selects up to ⁠ MMR_SELECT = 150 ⁠ documents (⁠ max() ⁠ guard bumps to >=80 so reranking has headroom). This step reduces semantic redundancy before handing off to the reranker.

### Robust Fallback Ladder
⁠ robust_triple_search ⁠ guards against sparse results:
1.⁠ ⁠*Primary path*: ⁠ triple_rrf_pipeline ⁠.
2.⁠ ⁠*Underfill fallback*: run ⁠ _single_dense ⁠, ⁠ _single_bm25 ⁠, ⁠ _single_prior ⁠ in parallel (⁠ size=300/300/200 ⁠) and fuse the fresh lists.
3.⁠ ⁠*Relax year filter*: rerun BM25 without ⁠ pub_year ⁠ constraint if still low recall.
4.⁠ ⁠*Final fallback*: BM25-only wide net (size 500) to guarantee something is returned.
5.⁠ ⁠*Repeat dedupe, quotas, MMR*, then ensure the final set has ≥ ⁠ 3 * top_k ⁠ entries by appending tails if needed.

## 3. Reranking Stack
Two layers work together so that the LLM sees only the strongest contexts.

### 3.1 Cohere Rerank via Bedrock
•⁠  ⁠Function: ⁠ cohere_rerank_bedrock ⁠.
•⁠  ⁠Sends up to ⁠ COHERE_RERANK_TOP_N ⁠ candidates (env default 150) with truncated text budgets (⁠ COHERE_RERANK_CHAR_BUDGET ⁠, default 3200 chars).
•⁠  ⁠Builds ⁠ [DOCID:…] ⁠ headers so the API can map rerank results back onto the fused documents.
•⁠  ⁠AWS Tokyo (⁠ ap-northeast-1 ⁠) primary region with Oregon fallback; guarded by ⁠ COHERE_RERANK_TIMEOUT_S ⁠ (default 6s).
•⁠  ⁠Returns ⁠ (doc_id, relevanceScore) ⁠ which downstream code uses to reorder candidates before post-processing scores are applied.

### 3.2 Intent-Aware Heuristic Scoring
⁠ rerank_results ⁠ adds domain heuristics on top of the LLM reranker:
1.⁠ ⁠*Normalize* the base score (prefers ⁠ rrf_score ⁠ if available).
2.⁠ ⁠*Compute components* per doc: recency decay (⁠ RECENCY_DECAY_LAMBDA = 0.12 ⁠), citation impact (tiered via ⁠ CITATION_TIERS ⁠), and heuristic quality checks for study types.
3.⁠ ⁠*Combine* using weights from ⁠ intent_policies.get_rerank_weights_for_intent(intent) ⁠; falls back to ⁠ QUERY_WEIGHTS ⁠ heuristics when intent unknown.
4.⁠ ⁠*Resolve conflicts* so a brand-new high-quality paper can leapfrog an older but highly cited one when warranted.
5.⁠ ⁠*Filter* results with ⁠ final_score > MIN_SCORE_THRESHOLD ⁠, assign ⁠ rank ⁠, and hand the top ⁠ top_k ⁠ passages to prompt construction.

## 4. Parameter Reference & Tuning Guidance

| Parameter | Location | Accuracy impact when ↑ | Latency / cost impact when ↑ | Tuning notes |
|-----------|----------|------------------------|------------------------------|--------------|
| ⁠ DENSE_K ⁠ | ⁠ triple_rrf_pipeline ⁠ | Higher recall on semantic matches; improves coverage for paraphrased questions | Larger ⁠ _msearch ⁠ payload, more vectors pulled; increases MMR + rerank cost linearly | Increase if dense recall is poor (measured by offline eval). Watch out for noise diluting RRF scores. |
| ⁠ LEXICAL_K ⁠ | same | Better coverage for exact terms, abbreviations, drug names | Same as above; also increases memory footprint | Tune alongside BM25 analyzer tweaks. Too high can re-introduce deprecated or off-topic hits. |
| ⁠ PRIOR_K ⁠ | same | Surfaces highly cited work; useful for historical or guideline queries | Extra OpenSearch work but smaller than dense/BM25. Excess values skew toward old literature despite recency penalty | Adjust if you see over/under emphasis on landmark trials. |
| ⁠ RRF_K ⁠ | ⁠ _rrf_fuse_weighted ⁠ | Higher values flatten rank contributions, blending more candidates before decay | No direct latency change | Default 60 balances stability and responsiveness. Decrease to emphasize top-ranked docs, increase to smooth noisy lists. |
| ⁠ RRF_WEIGHTS ⁠ | ⁠ _rrf_fuse_weighted ⁠ | Rebalancing can rescue weak signals (e.g., boost dense weight for conceptual queries) | None | Keep weights normalized-ish to prevent any single list from dominating. Use eval splits to justify changes. |
| ⁠ TOP_SOFT_QUOTA_CAP ⁠ | ⁠ _dedupe_and_type_quota ⁠ | Expanding the cap allows quotas to act over more docs; improves evidence diversity | Slightly more CPU during dedupe | Raise if missing study types in top 100; lower if quotas over-constrain. |
| ⁠ MMR_LAMBDA ⁠ | ⁠ _mmr_select ⁠ | Closer to 1.0 = focus on relevance, 0.0 = focus on novelty | None direct | Empirically 0.6 balances duplicate removal without ejecting strong hits. Adjust per user feedback on redundancy. |
| ⁠ MMR_SELECT ⁠ | ⁠ _mmr_select ⁠ | Larger pool → more variety reaching reranker | More compute in MMR & rerank; may exceed Bedrock quota | Ensure ⁠ MMR_SELECT >= top_k * 3 ⁠ to maintain rerank headroom. |
| ⁠ COHERE_RERANK_TOP_N ⁠ | ⁠ cohere_rerank_bedrock ⁠ | More candidates → higher chance rerank lifts the right docs | Higher Bedrock cost and latency | Tune to keep P95 rerank latency within SLA. Measure marginal benefit beyond 120–180 docs. |
| ⁠ COHERE_RERANK_CHAR_BUDGET ⁠ | same | Longer excerpts give reranker more evidence | Pushes payload size; risk of hitting Bedrock limits | Lower if rerank latency spikes; raise for long-form mechanism questions. |
| ⁠ RECENCY_DECAY_LAMBDA ⁠ | ⁠ calculate_temporal_score ⁠ | Higher lambda penalizes old studies more aggressively | None | Adjust when guidelines demand very fresh literature (e.g., COVID). Validate against curated answer sets. |
| ⁠ top_k ⁠ (API input) | ⁠ hybrid_search ⁠ / downstream | Determines how many passages feed the LLM. Higher values increase recall and citation coverage | LLM prompt grows; response latency increases; rerank must process more docs | Typical sweet spot: 8–12. Consider dynamic scaling based on query difficulty. |

### How parameter changes affect accuracy vs latency
•⁠  ⁠*Increasing K-values (⁠ dense_k ⁠, ⁠ lexical_k ⁠, ⁠ prior_k ⁠)*: boosts recall but expands each ⁠ _msearch ⁠ result and the downstream rerank workload. Expect higher CPU usage, more memory pressure, and additional 50–150 ms per +100 docs depending on network proximity to OpenSearch.
•⁠  ⁠*Reducing K-values*: speeds things up but risks losing complementary evidence. Monitor failed-attribution cases and LLM hallucinations if you go too low.
•⁠  ⁠*Tweaking ⁠ MMR_LAMBDA ⁠*: lower values (toward 0.3) favor novelty and may return diverse but less relevant snippets; higher values (≥0.8) collapse back toward pure relevance, allowing near-duplicates.
•⁠  ⁠*Adjusting rerank budgets*: raising ⁠ COHERE_RERANK_TOP_N ⁠ or ⁠ COHERE_RERANK_CHAR_BUDGET ⁠ sharply increases cost/latency because Bedrock pricing is per token processed. Use latency telemetry to guard the SLA.
•⁠  ⁠*Year filters (⁠ INTENT_BM25_YEAR_FILTERS ⁠)*: stricter filters improve freshness but can starve rare topics. Loosen them when dealing with rare diseases or historical mechanism queries.

## 5. Practical Tuning Workflow
1.⁠ ⁠*Define evaluation splits*: curated question-answer pairs with gold citations let you measure recall and final answer quality when sweeping parameters.
2.⁠ ⁠*Inspect fusion diagnostics*: log ⁠ fusion_ranks ⁠ to see whether dense or BM25 is carrying the load. If dense ranks are consistently >100, increase ⁠ DENSE_K ⁠ or revisit embedding quality.
3.⁠ ⁠*Monitor rerank telemetry*: track Bedrock latency and successes; fallback to heuristic rerank if timeouts exceed ⁠ COHERE_RERANK_TIMEOUT_S ⁠.
4.⁠ ⁠*Measure end-to-end latency*: each +50 docs adds roughly linear cost to reranking and prompt assembly; include safety margins for peak load.
5.⁠ ⁠*Document intent overrides*: if you adjust weights per intent, capture rationale in ⁠ intent_policies ⁠ so future maintainers understand trade-offs.

## 6. Related / Alternative Approaches
•⁠  ⁠*Score-level fusion*: Instead of RRF, use Z-score or logistic regression to combine raw scores. Requires calibration across retrievers.
•⁠  ⁠*Learning-to-rank*: Train a lightweight gradient boosted model on features from dense/BM25/prior to replace heuristic rerank. More effort but can capture cross-feature interactions.
•⁠  ⁠*Two-stage encoders*: Use dual encoder for first pass, cross-encoder for rerank (current rerank approximates this via Cohere’s cross-encoder).
•⁠  ⁠*Self-distilled MMR*: Blend query-aware coverage metrics (e.g., subtopic detection) with MMR to ensure each passage adds new facts.
•⁠  ⁠*Adaptive K*: Dynamically set ⁠ dense_k ⁠ & ⁠ lexical_k ⁠ based on query length or entropy; short keyword queries might rely more on BM25, long natural language on dense.

## 7. Implementation Map
•⁠  ⁠*Hybrid retrieval entry point*: ⁠ hybrid_search ⁠ (⁠ scripts/05-api/rag_api_secure.py:1545 ⁠).
•⁠  ⁠*Triple fusion pipeline*: ⁠ triple_rrf_pipeline ⁠ (⁠ scripts/05-api/rag_api_secure.py:1393 ⁠).
•⁠  ⁠*Fallback orchestration*: ⁠ robust_triple_search ⁠ (⁠ scripts/05-api/rag_api_secure.py:1466 ⁠).
•⁠  ⁠*Fusion helpers*: ⁠ _rrf_fuse_weighted ⁠, ⁠ _dedupe_and_type_quota ⁠, ⁠ _mmr_select ⁠ (⁠ scripts/05-api/rag_api_secure.py:1205-1318 ⁠).
•⁠  ⁠*Rerank orchestration*: ⁠ cohere_rerank_bedrock ⁠, ⁠ rerank_results ⁠ (⁠ scripts/05-api/rag_api_secure.py:162-2050 ⁠ overall, see sections above).

Use this document as the anchor when iterating on retrieval parameters or explaining the system to new contributors.





          ┌───────────────────────────┐
          │ User Query (Natural Lang) │
          └──────────────┬────────────┘
                         │
             ┌────────────▼─────────────┐
             │ Query Preparation Layer  │
             │ - expansion & embedding  │
             └────────────┬─────────────┘
                         │
             ┌────────────▼─────────────┐
             │ Hybrid Retrieval Layer   │
             │ - Dense (Semantic)       │
             │ - BM25 (Lexical)         │
             │ - Prior-weighted Lexical │
             └────────────┬─────────────┘
                         │
             ┌────────────▼─────────────┐
             │ Weighted RRF Fusion      │
             └────────────┬─────────────┘
                         │
             ┌────────────▼─────────────┐
             │ Cleaning & Diversity     │
             │ (dedupe + MMR)           │
             └────────────┬─────────────┘
                         │
             ┌────────────▼─────────────┐
             │ Reranking Layer          │
             │ - Cohere (cross-encoder) │
             │ - Heuristic Scoring      │
             └────────────┬─────────────┘
                         │
             ┌────────────▼─────────────┐
             │ Final Ranked Contexts    │
             │ → to LLM / Answer Engine │
             └───────────────────────────┘





OpenSearch

               ┌──────────────────────────┐
               │  Query Preparation Layer │
               └────────────┬─────────────┘
                            │
                ┌───────────▼─────────────┐
                │   _msearch Request      │
                │  (3 subqueries batched) │
                └───────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
 Dense (DENSE_K)       BM25 (LEXICAL_K)    Prior (PRIOR_K)
  KNN over vectors      keyword search       recency+citation
        │                   │                   │
        └──────────┬────────┴──────────┬────────┘
                   ▼                   ▼
         Weighted Reciprocal Rank Fusion
                   │
                   ▼
          Deduplication + MMR + Rerank
                   │
                   ▼
             Final ranked docs





if intent == "entity_lookup":
    bm25_weight = 0.8
    vector_weight = 0.2
    ef_search = 100
    num_candidates = 100
elif intent == "topic_exploration":
    bm25_weight = 0.5
    vector_weight = 0.5
    ef_search = 300
    num_candidates = 500
elif intent == "context_building":
    bm25_weight = 0.3
    vector_weight = 0.7
    ef_search = 500
    num_candidates = 1000