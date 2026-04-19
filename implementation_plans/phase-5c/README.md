# Phase 5C — Implementation Plan (per-ticket)

This directory contains one file per ticket. Each file is **self-contained** — an agent can be handed a single ticket file, along with the repo, and execute it end-to-end.

> **Before starting any ticket**: read this README for shared context (invariants, team structure, contracts, glossary). Then read **only** the ticket file you're assigned. Do not cross-read other tickets unless explicitly directed.

---

## 1. How to run tickets

### For the agent / developer picking up a ticket

1. Read this README (skim architectural context §4 in depth).
2. Read the ticket file top-to-bottom.
3. Check the **Dependencies** section. If any **Hard** dep is not yet merged to `phase-5c/integration`, stop — the ticket is not ready.
4. Read the **Files to read first** list. Read every file mentioned before writing code.
5. Check **Ambiguities requiring clarification**. If the section has unresolved items, raise them before coding.
6. Implement against the ticket's **Acceptance criteria**. Do not exceed scope (see **Non-goals**).
7. Verify manually per **How to verify**.
8. Record in the PR description which of the ticket's **Ambiguities** you resolved and how.

### For the coordinator scheduling work

- The **dependency graph** in §3 is the scheduling contract. A ticket can start once every hard dep listed in its file has been merged.
- **Soft deps** do not block — the ticket can ship with stubs. But testing may require the soft dep.
- Each ticket is named `5c-<epic-letter><number>-<kebab-slug>.md`. Epics: A (Foundation), B (Timeline/Playback), C (Globe/Panels), D (Routing), E (Mobile), F (Polish).
- PRs land on `phase-5c/integration`. Do **not** land on `main` until the full phase is verified (see §9 DoD).

---

## 2. Team Structure

Three developers, grouped by primary surface.

| Dev | Primary focus | Owns tickets |
|---|---|---|
| **Dev A — Data & Routing** | Sanity schemas, GROQ, TS types, fixtures, `/trip/<slug>`, URL/history state | A1, A2, A3, A4, D1, D2, D3 |
| **Dev B — Timeline & Playback** | Timeline, compression algorithm, zoom/pan, playback | B1, B2, B3, B4, B5, B6, B7, B8 |
| **Dev C — Globe & Panels** | Pin refactor, arcs, panels (both variants), camera, cross-interactions | C1, C2, C3, C4, C5, C6, C7 |
| **Shared** | Mobile (A + C), polish (all three) | E1, E2, E3, F1, F2, F3 |

When agents substitute for devs: treat "owner" as guidance only. Any agent with the ticket file + this README can execute any ticket whose hard deps are met.

---

## 3. Dependency graph & wave schedule

### 3.1 Per-ticket dependencies

Hard = must be merged before start. Soft = nice to have; ticket can ship with stubs.

| Ticket | Hard deps | Soft deps | Why the hard deps |
|---|---|---|---|
| **A1** | — | — | Greenfield schemas |
| **A2** | A1 | — | Imports schema-aligned types |
| **A3** | A2 | A4 (for real-data testing) | Uses new queries + types |
| **A4** | A1 | A2 (to verify queries work) | Fixtures must match schema |
| **B1** | — | — | Pure function, zero coupling |
| **B2** | B1 | — | Imports `CompressedMap` |
| **B3** | B2 | — | Extends timeline component |
| **B4** | A3, C1, B3 | — | Needs wired data, `lockedTrip` state, gestured timeline |
| **B5** | B4 | — | Polishes integrated timeline |
| **B6** | B5, C6 | — | Playhead on real timeline; arc response needed for full test |
| **B7** | B6, C2 | C5 | Pause API from B6; pin-hover source from C2 |
| **B8** | B4 | — | Deletes the dev route after real-data wiring lands |
| **C1** | A2 | — | Types flow through context |
| **C2** | C1 | B4 (visit-band rendering consumer) | Context shape |
| **C3** | C1 | — | Reads pin state |
| **C4** | C3 | — | Shares `PanelChrome` |
| **C5** | C1 | C4 (UI trigger) | Reacts to `lockedTrip` |
| **C6** | C1 | B6 (playback response layer) | Reads trip state |
| **C7** | C3, C4 | C6 (arc sync) | Wires both panel variants |
| **D1** | A2, C4 | — | Uses `tripBySlugQuery`; launched from trip panel |
| **D2** | C1, D1 | — | Syncs context state ↔ URL |
| **D3** | D2 | — | Builds on URL state |
| **E1** | C4, B4 | — | Renders panels + timeline inline |
| **E2** | E1 | — | Mobile content region default state |
| **E3** | E1, B4 | — | Timeline labels to expand |
| **F1** | B4, C3, C4, E2 | — | Wraps all skeleton surfaces |
| **F2** | B7, C7, D3, E3 | F1 | Profiles the completed app |
| **F3** | All above | — | Full verification pass |

### 3.2 Wave schedule (verified)

Each wave's tickets can be started once the previous wave is done. Inside a wave, all tickets are parallelizable. With 3 agents:

| Wave | Tickets | Parallel count | Notes |
|---|---|---|---|
| **0** | A1, B1 | 2 | One agent idle or pre-fetching Phase 5A/5B familiarity |
| **1** | A2, A4, B2 | 3 | Fully saturated |
| **2** | A3, C1, B3 | 3 | Fully saturated |
| **3** | C2, C3, C5, C6, B4 | 5 | 3 agents take first 3; next wave picks up remainder (C5, C6 flow into Wave 3b) |
| **4** | C4, B5, B8 (+ leftover C5/C6) | 3–5 | C4 unblocked by C3 from Wave 3 |
| **5** | D1, E1, C7, B6 | 4 | 3 agents saturated; B6 spills to next |
| **6** | D2, E2, E3, B7 (+ leftover B6) | 4–5 | D2 unblocked by D1, E2 by E1, etc. |
| **7** | D3, F1 | 2 | |
| **8** | F2 | 1 (pair) | Profiling |
| **9** | F3 | 1 (group) | Verification |

### 3.3 Visual graph

```
┌──────┐  ┌──────┐
│  A1  │  │  B1  │                     WAVE 0
└──┬───┘  └──┬───┘
   │         │
┌──┴──┬──────┼──────┐
│ A2  │ A4   │ B2   │                  WAVE 1
└──┬──┘      └──┬───┘
   │            │
   ├──────┬─────┼────┐
   │ A3   │ C1  │ B3 │                 WAVE 2
   └─┬────┴─┬───┴──┬─┘
     │      │      │
     │   ┌──┴──┬───┴──┬──────┐
     │   │ C2  │ C3   │  C5  │ C6      WAVE 3
     │   └─────┴──┬───┴──────┴──┐
     │            │              │
     └────────────┴────┐         │  ─── B4 (needs A3+C1+B3)
                       │         │
                   ┌───┴───┐     │
                   │ C4    │ B5  │ B8  WAVE 4
                   └───┬───┘
                       │
         ┌─────────┬───┴──┬──────┐
         │ D1      │ E1   │ C7   │ B6  WAVE 5
         └──┬──────┴──┬───┴──────┘
            │         │
         ┌──┴─┐    ┌──┴──┬──────┐
         │ D2 │    │ E2  │ E3   │ B7   WAVE 6
         └─┬──┘    └─────┘
           │
         ┌─┴──┐  ┌─────┐
         │ D3 │  │ F1  │                WAVE 7
         └────┘  └──┬──┘
                    │
                  ┌─┴──┐
                  │ F2 │                WAVE 8
                  └─┬──┘
                    │
                  ┌─┴──┐
                  │ F3 │                WAVE 9
                  └────┘
```

### 3.4 Critical path

`A1 → A2 → C1 → C3 → C4 → E1 → F1 → F2 → F3` — 9 ticket lengths. This is the minimum wall-clock time if agents are perfectly scheduled.

Anything off this path can flex earlier or later without extending the total.

---

## 4. Architectural context (read before any ticket)

### 4.1 Current data flow (Phase 5A/5B — about to be replaced for the globe)

```
Sanity (content docs with embedded `locations[]` of type `location`)
  → lib/queries.ts::globeContentQuery (GROQ)
  → app/globe/layout.tsx (server-side fetch, calls groupPins)
  → lib/globe.ts::groupPins (aggregates by `globe_group` string)
  → GlobeProvider (pins prop)
  → GlobeContext (selectedPin, hoveredPin, layoutState)
  → GlobeCanvas → GlobeScene + GlobePins + GlobeMesh + GlobePositionBridge
  → GlobeViewport (wraps canvas + panel + connectors)
```

**Phase 5C changes**: `groupPins` goes away, replaced by per-location pins with a visits list. `globe_group` string is replaced by references from visit → location documents. Content docs keep their embedded `locations[]` for **article travel-log display only** (`ArticleContent.tsx` lines 98–133) — the globe reads from the new visit/trip/location documents.

### 4.2 Key files and their fate in Phase 5C

| File | Status |
|---|---|
| `app/globe/layout.tsx` | **Modify** — fetch trips+visits, add timeline |
| `app/globe/page.tsx` | **Modify** — mobile default content |
| `app/globe/[slug]/page.tsx` | Keep — item article sliver |
| `app/trip/[slug]/page.tsx` | **New** — trip article sliver |
| `components/globe/GlobeProvider.tsx` | **Modify** — new state shape |
| `components/globe/GlobeContext.tsx` | **Modify** — new fields |
| `components/globe/GlobeViewport.tsx` | **Modify** — timeline placement + mobile restructure |
| `components/globe/GlobeCanvas.tsx` | Minor |
| `components/globe/GlobeScene.tsx` | **Modify** — rotate-to-fit trip |
| `components/globe/GlobePins.tsx` | **Modify** — per-location pins |
| `components/globe/GlobeMesh.tsx` | Keep |
| `components/globe/GlobePositionBridge.tsx` | Keep |
| `components/globe/GlobeDetailPanel.tsx` | **Refactor** — split into PinPanel + TripPanel |
| `components/globe/GlobeDetailItem.tsx` | Reuse inside visit sections |
| `components/globe/GlobeClickConnector.tsx` | Keep |
| `components/globe/GlobeHoverConnector.tsx` | Keep |
| `components/globe/GlobeTooltip.tsx` | **Modify** — new format |
| `components/globe/Timeline.tsx` | **New** |
| `components/globe/TripArcs.tsx` | **New** |
| `components/globe/panels/PinPanel.tsx` | **New** |
| `components/globe/panels/TripPanel.tsx` | **New** |
| `components/globe/panels/PanelChrome.tsx` | **New** |
| `components/globe/panels/VisitSection.tsx` | **New** |
| `components/globe/MobileContentRegion.tsx` | **New** |
| `components/globe/MobileTripList.tsx` | **New** |
| `lib/globe.ts` | **Modify** — replace `groupPins` with `aggregatePins` |
| `lib/queries.ts` | **Modify** — new queries |
| `lib/types.ts` | **Modify** — new types |
| `lib/timelineCompression.ts` | **New** |
| `lib/timelinePlayback.ts` | **New** |
| `lib/formatDates.ts` | **New** |
| `sanity/schemas/content.ts` | **Modify** — remove `globe_group` |
| `sanity/schemas/location.ts` (embedded) | **Modify** — drop `globe_group` field |
| `sanity/schemas/locationDoc.ts` | **New** |
| `sanity/schemas/trip.ts` | **New** |
| `sanity/schemas/visit.ts` | **New** |
| `scripts/seed-globe-groups.mts` | **Delete** |
| `scripts/seed-phase5c.mts` | **New** |

### 4.3 Invariants from the existing code (preserve these)

Pulled from reading the current Phase 5A/5B implementation — breaking any of these silently breaks the globe.

1. **Globe is fixed at world origin; camera orbits.** `GlobePins.tsx` back-face fade and `GlobePositionBridge.tsx` silhouette math both assume this. Trip arcs must make the same assumption. If you ever rotate the globe group, both need world-matrix awareness.

2. **Render-order bands**:
   - `-2`: depth-only occluder (opaque, writes depth, no color)
   - `-1`: pin dots + rings (transparent, no depth write)
   - `0` (default): wireframe + country borders + **arcs** (new — transparent, default band)

   Arcs render as transparent lines in the default band so map lines read through them on the back hemisphere. Do NOT put arcs at `-2` or they write depth and cull themselves.

3. **Pin position is a ref, not state.** `pinPositionRef.current[group]` is updated by `GlobePositionBridge` every frame. Connectors + arcs subscribe via `frameSubscribersRef.current.add(fn)` to stay in lockstep with canvas frames. Pattern: see `GlobeClickConnector.tsx`.

4. **Drag-vs-click threshold = 5 px** — `GlobeCanvas.tsx::DRAG_THRESHOLD`, `GlobeViewport.tsx::dragDistance`. Preserve.

5. **Panel animation timing = 450 ms** — `GlobeProvider.tsx::PANEL_SETTLE_MS`. The click-connector fade-in waits on this via `slideComplete`. Change in lockstep with any panel-slide duration change.

6. **`router.push('/globe/...', { scroll: false })`** is the idiom. Do not lose `{ scroll: false }`.

7. **`activeArticleSlug` derivation** (`GlobeProvider.tsx` lines 58–63) uses `pathname.startsWith('/globe/')`. Extend (don't replace) to cover `/trip/<slug>`.

8. **Pin re-resolution via `prev` selection** (`GlobeProvider.tsx` lines 121–135): when multiple pins can reach the same article, the effect uses `setSelectedPin(prev => ...)` to keep the user's chosen pin. **Do not flatten.** This pattern is critical for multi-visit pins — items can live on multiple pins.

### 4.4 Terminology distinction

- **Embedded location** = the object type in `content.locations[]` (existing, `sanity/schemas/location.ts`). Used for article travel-log display. Will have `globe_group` field **removed** but otherwise stays.
- **Location document** = the **new** top-level doc (`sanity/schemas/locationDoc.ts`). Referenced by visits. This is what pins are built from.

To avoid name collision in Sanity (both types cannot be named `location`), A1 introduces the new top-level doc as **`locationDoc`** (schema name). TypeScript type: `LocationDoc`.

---

## 5. Cross-ticket contracts

### 5.1 Identity

- **Trip identity** = `trip._id` (Sanity document ID). Never use `slug.current` for state — slugs are user-editable.
- **Pin identity** = `locationDoc._id`. This replaces the `globe_group` string throughout.
- **Visit identity** = `visit._id`.

### 5.2 Date formatting

Create `lib/formatDates.ts` in the earliest ticket that needs it (likely C3). Export:

```ts
formatMonthYear(iso: string): string          // "March 2022"
formatFullDate(iso: string): string            // "March 15, 2022"
formatDateRange(startIso: string, endIso: string): string  // auto-picks granularity
```

### 5.3 Pause reasons registry (for B6/B7)

A single `Set<string>` in `GlobeProvider` holding active pause reasons. Any non-empty set pauses playback. Keys:

- `'label-hover'` — trip label hover (desktop)
- `'pin-hover'` — pin hover (desktop)
- `'timeline-pan'`, `'timeline-zoom'` — timeline gestures
- `'globe-drag'` — manual globe rotation
- `'trip-lock'` — a trip is locked (kept in set as long as `lockedTrip !== null`)
- `'article-open'` — sliver is open
- `'playback-floating-label-hover'` — hovering the playback label

Do not add ad-hoc reasons without updating this list.

### 5.4 Skeleton names (for `npx boneyard-js build`)

- `timeline-strip`
- `trip-list-default`
- `trip-panel`
- `pin-panel-multi`

F1 registers all four. Other tickets should use `data-no-skeleton` on transient chrome (playhead, today marker, close X, back arrow, visit tick marks).

### 5.5 Accent color

Spec §17 defers the concrete hex. Default proposal if the repo has no accent set: `#2563eb` (blue-600). Check `app/globals.css` for any existing accent variable first. Define once, reference via Tailwind utility (e.g., a custom utility `text-accent`).

### 5.6 Item↔Visit reference direction

**Decision**: `visit.items` (array of item references on the visit). Locked in by A1. Rationale: spec §1.4.1 recommendation; query "what items were at this visit" is the hot path for panels. Do not add the reverse direction.

---

## 6. Test plan (manual)

No automated UI tests in this repo. Manual QA per ticket's Acceptance criteria. F3 aggregates cross-cutting verification.

### 6.1 Smoke test after full merge

1. `npm run dev`
2. Open `/globe` — globe spins, timeline loads with real trips.
3. Wait 5s — playhead starts sweeping past → present.
4. Click a trip label — panel opens, camera rotates, URL updates to `/globe?trip=<slug>`.
5. Click "View trip article" — sliver opens, URL `/trip/<slug>`.
6. Click globe sliver — sliver closes, trip stays locked.
7. Click another trip label — instant switch.
8. Click a pin in the new trip — panel auto-scrolls to that visit.
9. Click a pin NOT in the locked trip — panel closes, pin panel opens.
10. Click a pin with ≥ 2 visits — panel shows multi-section view.
11. Open article, press browser back twice — returns to `/globe` default.
12. Resize to mobile width (< 768 px) — vertical layout, timeline sticky after scroll.
13. Escape key at each nested state — closes one layer.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Playback spec ambiguities (sweep direction, pause/resume edges) | Medium | High | Spec re-read during B6; log ambiguities before coding |
| Next.js 16 routing API quirks break URL state | Medium | High | §8.7 explicitly flags this; D2 includes runtime validation |
| Mid-range mobile perf during playback | Medium | Medium | F2 profiling pass + spec §13.5.2 capacity ceiling |
| iOS Safari sticky-header jank in panels | Low | Medium | `overscroll-behavior: contain` (existing pattern); test on real device |
| Leftover `groupPins` / `globe_group` references | Low | Medium | Grep before A2 merges |
| Arc back-face occlusion vs pin fade conflict | Low | Medium | C6 uses same depth-only occluder pattern; verify in dev |
| Fixture data misses coverage cases | Medium | Low | A4 has an explicit checklist |

---

## 8. Out-of-scope for Phase 5C

Explicitly deferred (spec §13):

- Keyboard navigation of the timeline
- Screen reader announcements for playback
- Per-trip color distinction
- Item-dedup in trip panel (duplicates are intentional — §7.3)
- Mobile landscape optimization
- Item-detail page "worn on these trips" cross-ref
- Search or filtering
- Tablet-specific layout tuning (768–1024 uses desktop layout, acceptable cramp)

Any of these spotted and felt-urgent → defer to Phase 5d.

---

## 9. Definition of Done (Phase 5C)

- [ ] All tickets in §3 merged to `phase-5c/integration`.
- [ ] F3 verification matrix fully ticked.
- [ ] Smoke test (§6.1) passes on desktop Chrome, Safari, Firefox, and a real mobile device.
- [ ] `npm run build` zero type errors; no new `any` types introduced outside allowed boundaries (Sanity seed scripts).
- [ ] `npm run lint` passes.
- [ ] `npx boneyard-js build` runs clean; skeletons render on throttled network.
- [ ] `phase-5c/integration` → `main` PR merged.
- [ ] `SPEC.md` updated to mark 5c ✅ Done.

---

## 10. Glossary

- **Visit** — a single location at a single time period, contains items. Not URL-navigable.
- **Trip** — chronological container of visits, optionally with article body. URL at `/trip/<slug>`.
- **Location (document)** — shared Sanity doc. Multiple visits at the same place reference the same doc → one pin.
- **Embedded location** — the `location` object type on content docs (`content.locations[]`), used for article travel-log display only. Not the same as the location document. See §4.4.
- **Pin** — visual marker on globe, 1:1 with a location document. Contains 1..N visits.
- **Arc** — line between two visits within a single trip, chronological order.
- **Playhead** — vertical line sweeping the timeline during auto-playback.
- **Sliver** — narrow globe strip (~30% width) shown when an article is open. Reused from Phase 5B.
- **Preview / Locked (mobile)** — tapping a timeline label "previews" (inline expansion) before "locking" (camera rotate, panel open). Desktop has no preview step.
- **Passive spin** — slow idle rotation of the globe. Independent from playback highlights.
- **Panel variant** — `pin` or `trip`. Same chrome, different content and ordering.

---

## 11. Ticket index

- [5c-a1-sanity-schemas.md](./5c-a1-sanity-schemas.md)
- [5c-a2-data-layer.md](./5c-a2-data-layer.md)
- [5c-a3-wire-layout.md](./5c-a3-wire-layout.md)
- [5c-a4-seed-fixtures.md](./5c-a4-seed-fixtures.md)
- [5c-b1-compression-algorithm.md](./5c-b1-compression-algorithm.md)
- [5c-b2-timeline-prototype.md](./5c-b2-timeline-prototype.md)
- [5c-b3-timeline-zoom-pan.md](./5c-b3-timeline-zoom-pan.md)
- [5c-b4-timeline-integration.md](./5c-b4-timeline-integration.md)
- [5c-b5-timeline-polish.md](./5c-b5-timeline-polish.md)
- [5c-b6-playback-engine.md](./5c-b6-playback-engine.md)
- [5c-b7-pause-resume.md](./5c-b7-pause-resume.md)
- [5c-b8-retire-timeline-dev.md](./5c-b8-retire-timeline-dev.md)
- [5c-c1-provider-refactor.md](./5c-c1-provider-refactor.md)
- [5c-c2-pin-model.md](./5c-c2-pin-model.md)
- [5c-c3-pin-panel.md](./5c-c3-pin-panel.md)
- [5c-c4-trip-panel.md](./5c-c4-trip-panel.md)
- [5c-c5-camera-rotate-fit.md](./5c-c5-camera-rotate-fit.md)
- [5c-c6-trip-arcs.md](./5c-c6-trip-arcs.md)
- [5c-c7-panel-cross-interactions.md](./5c-c7-panel-cross-interactions.md)
- [5c-d1-trip-article-route.md](./5c-d1-trip-article-route.md)
- [5c-d2-url-state.md](./5c-d2-url-state.md)
- [5c-d3-404-escape-key.md](./5c-d3-404-escape-key.md)
- [5c-e1-mobile-layout.md](./5c-e1-mobile-layout.md)
- [5c-e2-mobile-trip-list.md](./5c-e2-mobile-trip-list.md)
- [5c-e3-mobile-preview-label.md](./5c-e3-mobile-preview-label.md)
- [5c-f1-boneyard.md](./5c-f1-boneyard.md)
- [5c-f2-perf-pass.md](./5c-f2-perf-pass.md)
- [5c-f3-verification-matrix.md](./5c-f3-verification-matrix.md)

---

_Spec source of truth_: [`../../Phase 5C.markdown`](../../Phase%205C.markdown). This plan implements what the spec describes. Spec > plan if they disagree. File bugs against the plan; edit the plan, not the spec.
