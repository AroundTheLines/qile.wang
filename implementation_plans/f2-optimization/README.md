# F2 — Performance optimization pass (ticket breakdown)

This directory decomposes **Phase 5C · F2** into smaller self-contained tickets that individual agents can pick up and execute end-to-end. It supersedes — in operational terms — the single-file plan at [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md), which remains as the original high-level ticket.

> **Before starting any ticket**: read this README for shared context (goal, invariants, dependency order). Then read **only** the ticket file you're assigned. Do not cross-read other tickets unless explicitly directed.

---

## 1. Why this decomposition exists

F2 as originally scoped bundled four distinct workstreams:

1. Eliminate per-frame allocations in `useFrame`.
2. Split the monolithic `GlobeContext` into narrower contexts to cut re-render fan-out.
3. Wrap hot-path children in `React.memo`.
4. Profile + document the final numbers.

Each is independently ship-able and has different risk profiles. Splitting them lets multiple agents run in parallel where dependencies allow, and lets the reviewer land small, bisectable commits.

The reviewer has confirmed two policy decisions that were ambiguous in the original F2 spec:

- **Go big on the context split.** We are doing the full 6-way split, not just a `useMemo` wrap. Fan-out reduction is the single biggest lever.
- **Panel lazy-loading is deferred.** Panels stay statically imported unless the bundle-size acceptance criterion fails at the end.

---

## 2. Tickets in this directory

| ID | Title | Agent-runnable? | Size | Depends on |
|---|---|---|---|---|
| **F2-1** | [Per-frame allocations](f2-1-per-frame-allocations.md) | Yes (fully) | S | — |
| **F2-2** | [Context split — schema + provider](f2-2-context-split-provider.md) | Yes (fully) | M | — |
| **F2-3** | [Context split — consumer migration (23 files)](f2-3-consumer-migration.md) | Yes (fully) | M | F2-2 |
| **F2-4** | [Context-isolation regression tests](f2-4-isolation-tests.md) | Yes (fully) | S | F2-2, F2-3 |
| **F2-5** | [React.memo on hot-path children](f2-5-react-memo-wrappers.md) | Yes (fully) | S | F2-3 |
| **F2-6** | [Frame subscriber cleanup audit](f2-6-frame-subscribers-audit.md) | Yes (fully) | XS | — |
| **F2-7** | [Profiling pass + PR doc](f2-7-profiling-documentation.md) | Partial (profiling needs human) | S | F2-1, F2-3, F2-5, F2-6 |

### Dependency graph

```
F2-1 ────────────────────────────┐
                                 │
F2-2 ──▶ F2-3 ──┬──▶ F2-4        │
                │                │
                └──▶ F2-5 ───────┼──▶ F2-7
                                 │
F2-6 ────────────────────────────┘
```

Parallelism opportunities:
- F2-1, F2-2, F2-6 can start simultaneously.
- F2-4 and F2-5 can start in parallel once F2-3 lands.
- F2-7 is the last ticket; it cross-cuts everything.

---

## 3. Shared context all tickets should assume

### 3.1 The spec + upstream plan

- Original F2 ticket: [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md)
- Phase 5C master spec: [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5 (Performance) and §13.5.1–13.5.3 specifically
- Approved plan (this decomposition derives from it): `~/.claude/plans/currently-complete-tickets-a1-eventual-castle.md`

### 3.2 Targets (copy into your PR description)

- Desktop: ≥ 58 fps during every benchmark interaction.
- Mid-range mobile (iPhone 12 / Pixel 5 emulation): ≥ 45 fps.
- No long tasks > 50 ms in any of the 5 benchmark interactions.
- Memory plateau after 2 min of scripted interaction.
- Bundle size: within +15–30 KB gzipped of pre-5C baseline.

### 3.3 Benchmark interactions (used across tickets)

All tickets that touch profiling should exercise these 5 interactions:

1. 5 s idle globe spin.
2. 5 s timeline label hover/unhover.
3. 5 s pin hover/unhover (desktop).
4. 5 s globe drag.
5. 5 s lock a trip + close panel.
6. 5 s open + close article sliver.

Always profile with `npm run build && npm start`, never `next dev` — dev mode's StrictMode double-render inflates every number.

### 3.4 Invariants that must survive

Every ticket must preserve these — they are load-bearing behaviors:

- **Playback sweep renders only what actually changes.** The `arrayEq()` guard in [`lib/timelinePlayback.ts:97-102`](../../lib/timelinePlayback.ts:97) already prevents notify on no-op ticks. Do not remove.
- **`playheadRef.current.style.left`** direct-DOM animation in [`components/globe/TimelinePlayhead.tsx:103-149`](../../components/globe/TimelinePlayhead.tsx:103) must remain imperative. Do not migrate to React state.
- **Scratch-vector pattern in GlobePositionBridge** ([`components/globe/GlobePositionBridge.tsx:11-19`](../../components/globe/GlobePositionBridge.tsx:11)) is the canonical example — replicate it anywhere new scratch vectors are needed.
- **Existing Vitest suite stays green.** `npm test` must pass at the end of every ticket.

### 3.5 React version

- React 19.2.4 (see `package.json`).
- **React Compiler is NOT enabled** (no `babel-plugin-react-compiler` anywhere). Manual memoization is required — `React.memo`, `useMemo`, `useCallback` are not redundant.

### 3.6 Definition of "Done" per ticket

1. Acceptance criteria in the ticket file all checked.
2. `npm run build` green.
3. `npm test` green.
4. `npm run lint` green (if touched source).
5. Local verification per the ticket's "How to verify" section.
6. PR description includes before/after measurement where applicable.

---

## 4. Writing the final PR

When all 7 tickets have landed, the final PR (F2-7 owns documenting this) should include:

- **Before → after table** for FPS at each of the 5 interactions, desktop + mobile.
- **Re-render count** comparison (React Profiler): how many components committed per playback highlight tick, before vs. after.
- **Bundle-size diff** from `npm run build` output.
- **Memory plateau screenshot** from Chrome DevTools heap snapshot.
- A paragraph noting what was deliberately deferred (panel lazy-load, merged arc geometry, timeline virtualization — all out of scope per §13.5.2).

---

## 5. Outputs consumed by downstream work

- **F3 (verification matrix)** cross-references the numbers documented by F2-7.
- No ticket beyond F2 depends on the specific refactor shape.

## 6. Escape hatches

If any ticket discovers that its assumption is wrong (e.g., a file layout has drifted since this plan was written), the agent should:

1. Stop.
2. Note the discrepancy in the PR draft.
3. Flag the ambiguity back to the coordinator (`AskUserQuestion` if interactive, or a comment in the PR draft).

Do **not** silently re-scope a ticket.
