# 07 — Overview + Activity views

**Parent:** `.scratch/first-harness-end-to-end/spec.md`

**What to build:** The first "how I work" payoff on real Claude data: an Overview of headline totals and an Activity heatmap of local day-of-week × hour (S6).

**Blocked by:** 01 (stored Interactions to aggregate).

**Status:** ready-for-agent

- [ ] A store aggregation read for headline totals: total Interaction count and total token usage combining main and sub buckets across all four token types.
- [ ] A store aggregation read for the heatmap: `GROUP BY localDow, localHour` counting Interactions, served as pure SQL over the precomputed local columns (ADR-0005) — no per-row timezone work at query time.
- [ ] An Overview view rendering the headline totals.
- [ ] An Activity view rendering the day-of-week × hour heatmap in the user's configured timezone.
- [ ] Tested at the store read-function seam against seeded Interaction rows: headline totals (main+sub) and heatmap bucket counts, not rendered DOM. Prior art: `src/lib/server/database/store.test.ts`.
