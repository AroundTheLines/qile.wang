# 5C-A2 — Data layer: GROQ queries, TS types, `aggregatePins`

**Epic**: A. Foundation · **Owner**: Dev A · **Can be run by agent?**: Yes · **Estimated size**: M

> **Status**: ✅ Shipped 2026-04-20 — see [Implementation log](#implementation-log) at the bottom for what was built, deviations from this spec, and notes for downstream tickets.

## Dependencies

### Hard
- **A1** — imports schema names into GROQ; TypeScript types mirror schema field shapes.

### Soft
- **A4** — fixture data helps verify queries return expected shapes. Not blocking; can work against empty arrays.

### Blocks
- **A3** (wires queries into layout)
- **C1** (provider state uses new types)
- **D1** (uses `tripBySlugQuery`)
- Transitively: everything else.

---

## Goal

Build the server-side data layer for Phase 5C: GROQ queries for trips, visits, locations; TypeScript types matching the schemas from A1; a pure `aggregatePins` function that builds per-location pins with visit lists (replacing the old `groupPins`).

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §1 (entire)
- §6.1 Pins (per unique location)
- §7.1 Pin panel (for understanding panel data shape)
- §8.4 URL state (for `tripBySlugQuery` shape)

## Files to read first

- [`../../lib/queries.ts`](../../lib/queries.ts) — existing queries, the pattern to follow
- [`../../lib/globe.ts`](../../lib/globe.ts) — existing `groupPins` (to be removed) and kept utilities
- [`../../lib/types.ts`](../../lib/types.ts) — existing types
- [`../../lib/sanity.ts`](../../lib/sanity.ts) — client setup
- The A1 schema files (`sanity/schemas/{locationDoc,trip,visit}.ts`)
- [README §5.1 Identity](./README.md#51-identity)

## Files to create

- `lib/timelineCompression.ts` is **NOT** this ticket (it's B1). Skip.

(No new files in this ticket — only modifications.)

## Files to modify

- `lib/queries.ts` — add new queries, remove `globeContentQuery`
- `lib/types.ts` — add `Trip`, `Visit`, `LocationDoc`, `PinWithVisits` types; remove `GlobeContentItem` if present
- `lib/globe.ts` — remove `groupPins` and `GlobeContentItem`; add `aggregatePins`; keep `sphericalToCartesian`, `clampPanelTop`, `clipLineByGlobe`, `GlobeScreenCircle`

## Files to delete

- None in this ticket — `scripts/seed-globe-groups.mts` deletion is part of A4.

---

## Implementation guidance

### New types (in `lib/types.ts`)

Append (don't replace) to existing exports:

```ts
import type { PortableTextBlock } from 'sanity'

export interface LocationDoc {
  _id: string
  name: string
  coordinates: Coordinates   // existing type from lib/types.ts
  slug?: { current: string }
}

export interface TripSummary {
  _id: string
  title: string
  slug: { current: string }
  startDate: string          // YYYY-MM-DD — computed by GROQ
  endDate: string            // YYYY-MM-DD — computed by GROQ
  visitCount: number         // computed by GROQ
  hasArticle: boolean        // computed by GROQ (articleBody defined + non-empty)
}

export interface Trip extends TripSummary {
  articleBody?: PortableTextBlock[]
  // Full trip may embed visits (as in tripBySlugQuery) — see TripWithVisits below
}

export interface VisitSummary {
  _id: string
  startDate: string
  endDate: string
  location: LocationDoc
  trip: { _id: string; title: string; slug: { current: string } }
  items: ContentSummary[]    // existing type
}

/** Visits returned embedded inside TripWithVisits do not repeat the trip ref. */
export interface VisitInTrip {
  _id: string
  startDate: string
  endDate: string
  location: LocationDoc
  items: ContentSummary[]
}

export interface TripWithVisits extends Trip {
  visits: VisitInTrip[]
}

export interface PinWithVisits {
  location: LocationDoc
  visits: VisitSummary[]       // sorted startDate desc (most recent first)
  coordinates: Coordinates     // convenience copy from location.coordinates
  visitCount: number
  tripIds: string[]            // distinct trip._id values
}

/** Remove the old type if present. Left here as a compile-check marker. */
// export interface GlobeContentItem { ... } <- DELETE
```

Remove `GlobeContentItem` and anything referencing `globe_group` in `lib/types.ts`.

### New queries (in `lib/queries.ts`)

Delete `globeContentQuery`. Add:

```ts
import { groq } from 'next-sanity'

export const allTripsQuery = groq`
  *[_type == "trip"] {
    _id,
    title,
    slug,
    "startDate": *[_type == "visit" && references(^._id)] | order(startDate asc)[0].startDate,
    "endDate":   *[_type == "visit" && references(^._id)] | order(endDate desc)[0].endDate,
    "visitCount": count(*[_type == "visit" && references(^._id)]),
    "hasArticle": defined(articleBody) && length(articleBody) > 0,
  } | order(startDate desc)
`

export const allVisitsQuery = groq`
  *[_type == "visit"] {
    _id,
    startDate,
    endDate,
    "location": location->{ _id, name, coordinates, slug },
    "trip": trip->{ _id, title, slug },
    "items": items[]->{
      _id,
      title,
      slug,
      content_type,
      cover_image,
      tags
    }
  } | order(startDate desc)
`

export const tripBySlugQuery = groq`
  *[_type == "trip" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    articleBody,
    "startDate": *[_type == "visit" && references(^._id)] | order(startDate asc)[0].startDate,
    "endDate":   *[_type == "visit" && references(^._id)] | order(endDate desc)[0].endDate,
    "visitCount": count(*[_type == "visit" && references(^._id)]),
    "hasArticle": defined(articleBody) && length(articleBody) > 0,
    "visits": *[_type == "visit" && references(^._id)] | order(startDate asc) {
      _id,
      startDate,
      endDate,
      "location": location->{ _id, name, coordinates },
      "items": items[]->{ _id, title, slug, content_type, cover_image }
    }
  }
`

// Existing queries stay: allContentQuery, contentBySlugQuery, wardrobeContentQuery.
```

Keep `allContentQuery`, `contentBySlugQuery`, `wardrobeContentQuery` untouched.

### `aggregatePins` (in `lib/globe.ts`)

Replace `groupPins` entirely:

```ts
import type { VisitSummary, PinWithVisits } from './types'

// Delete: groupPins, GlobeContentItem interface, GlobePin (was tied to globe_group string).
// Keep: sphericalToCartesian, clampPanelTop, clipLineByGlobe, GlobeScreenCircle, GlobePinItem (used by panel).

/**
 * Aggregate visits into pins (one pin per unique location document).
 * - Each pin's `visits` are sorted startDate desc (most recent first) — matches §7.1 (pin panel order).
 * - Pins are sorted by each pin's most-recent visit, descending — preserves
 *   the entrance-target contract GlobeScene relies on (`pins[0]` = freshest).
 */
export function aggregatePins(visits: VisitSummary[]): PinWithVisits[] {
  const byLocation = new Map<string, PinWithVisits>()
  for (const v of visits) {
    const key = v.location._id
    let pin = byLocation.get(key)
    if (!pin) {
      pin = {
        location: v.location,
        visits: [],
        coordinates: v.location.coordinates,
        visitCount: 0,
        tripIds: [],
      }
      byLocation.set(key, pin)
    }
    pin.visits.push(v)
    pin.visitCount++
    if (!pin.tripIds.includes(v.trip._id)) pin.tripIds.push(v.trip._id)
  }
  for (const pin of byLocation.values()) {
    pin.visits.sort((a, b) => b.startDate.localeCompare(a.startDate))
  }
  return Array.from(byLocation.values()).sort((a, b) =>
    b.visits[0].startDate.localeCompare(a.visits[0].startDate),
  )
}
```

### Kept exports in `lib/globe.ts`

These stay untouched (used by connectors and scene):
- `sphericalToCartesian`
- `clampPanelTop`
- `clipLineByGlobe`
- `GlobeScreenCircle` interface

The old `GlobePin` and `GlobePinItem` interfaces may be referenced by `GlobeDetailItem.tsx`. Decision:
- **Remove `GlobePin`** (was tied to `globe_group`) — `PinWithVisits` replaces it.
- **Keep `GlobePinItem`** — `GlobeDetailItem.tsx` props use it and it's reusable. Adjust if fields differ after refactor, but do not delete.

If removing `GlobePin` causes compile errors, that's expected — those errors are the map for C1/C3 to fix. Document this in your PR description: "Intentional compile break in ComponentX.tsx — fixed by ticket C1."

---

## Acceptance criteria

- [ ] `lib/queries.ts` exports `allTripsQuery`, `allVisitsQuery`, `tripBySlugQuery`. `globeContentQuery` is deleted.
- [ ] `lib/types.ts` exports `LocationDoc`, `Trip`, `TripSummary`, `Visit`, `VisitSummary`, `VisitInTrip`, `TripWithVisits`, `PinWithVisits`. No references to `globe_group` remain.
- [ ] `lib/globe.ts::aggregatePins` exists and compiles. `groupPins` is removed. `GlobeContentItem` is removed.
- [ ] `lib/globe.ts` still exports `sphericalToCartesian`, `clampPanelTop`, `clipLineByGlobe`, `GlobeScreenCircle`.
- [ ] Unit-test coverage for `aggregatePins` with:
  - Empty visits array → empty pins array.
  - Single visit → one pin with `visitCount: 1`, one tripId.
  - Two visits same location different trips → one pin with `visitCount: 2`, two tripIds, visits sorted desc.
  - Three visits across two locations → two pins.
  - (Put tests in `lib/globe.test.ts`; if no test harness exists yet, add `vitest` as a devDep and wire up a `test` script in `package.json`. If standing up vitest is too invasive for this ticket, write an `if (process.argv[1].endsWith('globe.ts')) { ... }` self-check block at the bottom of `lib/globe.ts` and document how to run it: `npx tsx lib/globe.ts`.)
- [ ] `npx tsc --noEmit` passes **for `lib/**/*`**. Compile errors in `components/` or `app/` caused by `GlobePin`/`GlobeContentItem` removal are expected and documented in the PR — they are the downstream tickets' responsibility.

## Non-goals

- **Do not wire queries into `app/globe/layout.tsx`** — that's A3.
- **Do not update `GlobeProvider` or `GlobeContext`** — C1.
- **Do not build the timeline compression algorithm** — B1.
- **Do not touch seed scripts** — A4.

## Gotchas

- **GROQ `references(^._id)`**: the `^` references the outer query's current document. Only works inside a projection subquery. Unfamiliar with `^`? Read Sanity's GROQ docs (`https://www.sanity.io/docs/groq-parent-operator`).
- **Date comparisons on ISO strings** use lexicographic `.localeCompare(...)`. Avoid `Date.parse` in hot paths — unnecessary allocation.
- **Empty visits array**: `*[_type == "visit" && references(^._id)] | order(startDate asc)[0].startDate` returns `null` for a trip with zero visits. Spec §1.4 treats zero-visit trips as invalid and says they "will not render on the timeline". Don't bake that guard into the query — let the timeline ticket (B4) filter out null-dated trips.
- **Preserving `GlobePinItem`**: `GlobeDetailItem.tsx` imports it. If you delete it, that component breaks. Leave it, or update its shape to match `ContentSummary` — verify what `GlobeDetailItem` actually reads.
- **PR hygiene**: because this ticket intentionally creates downstream compile errors, the PR will show red. Use the PR description to list every file that breaks and what ticket will fix it. Example:
  ```
  Intentional downstream breaks (resolved by listed tickets):
  - components/globe/GlobeProvider.tsx — fixed by C1
  - components/globe/GlobeContext.tsx — fixed by C1
  - components/globe/GlobeDetailPanel.tsx — fixed by C3
  - app/globe/layout.tsx — fixed by A3
  ```

## Ambiguities requiring clarification before starting

1. **Test harness choice**: no `vitest`/`jest` currently installed. Options:
   - **a**. Install `vitest` and add a `test` script. Low friction but adds a devDep.
   - **b**. Write inline self-check with `if (process.argv[1].endsWith(...))` and run via `npx tsx lib/globe.ts`. Zero devDeps, slightly awkward.
   - **c**. Defer tests entirely; rely on runtime verification in A3/A4.

   **Default**: (a) — install vitest. Unit-testable pure functions should have tests. If a reviewer pushes back, fall back to (b).

2. **`GlobePinItem` retention**: I'm saying "keep it." Verify by grep in `components/` — if it's widely used, keep; if only in `GlobeDetailItem.tsx`, consider inlining. Decision deferred to implementation feel.

3. **Query shape for items within visits**: I included `cover_image`, `title`, `slug`, `content_type`, `tags`. If downstream panels need `acquired_at` or `published_at`, they'd have to add it. That's a C3/C4 concern — leave this ticket minimal.

## Handoff / outputs consumed by later tickets

- **Type names**: `LocationDoc`, `Trip`, `TripSummary`, `TripWithVisits`, `Visit`, `VisitSummary`, `VisitInTrip`, `PinWithVisits`.
- **Query names**: `allTripsQuery`, `allVisitsQuery`, `tripBySlugQuery`.
- **Function**: `aggregatePins(visits: VisitSummary[]): PinWithVisits[]`.

Downstream tickets import these names verbatim. Do not rename them without coordinating.

## How to verify

1. `npx tsc --noEmit lib/**/*.ts` (or equivalent) — no errors in `lib/`.
2. Run unit tests (if added): `npx vitest run lib/globe.test.ts`.
3. Manual smoke: open `app/globe/layout.tsx`. The compile error will be `Module '"@/lib/queries"' has no exported member 'globeContentQuery'.` — expected, handed off to A3.

---

## Implementation log

Shipped in PR [#27](https://github.com/AroundTheLines/qile.wang/pull/27) on 2026-04-20.

### Files actually shipped

- `lib/queries.ts` — added `allTripsQuery`, `allVisitsQuery`, `tripBySlugQuery`; deleted `globeContentQuery`; also removed the dead `globe_group` projection from `contentBySlugQuery` (the field no longer exists on the `Location` type).
- `lib/types.ts` — added `LocationDoc`, `TripSummary`, `Trip`, `VisitSummary`, `Visit` (alias of `VisitSummary`), `VisitInTrip`, `TripWithVisits`, `PinWithVisits`, plus a new narrower `VisitItemSummary` (see deviation #1 below). Removed `globe_group` from `Location`.
- `lib/globe.ts` — replaced `groupPins` + `GlobeContentItem` + `GlobePin` with `aggregatePins`. Kept `GlobePinItem`, `sphericalToCartesian`, `clampPanelTop`, `clipLineByGlobe`, `GlobeScreenCircle` untouched.
- `lib/globe.test.ts` — 4 vitest cases matching the ticket's acceptance criteria (empty, single visit, same-location/two-trips, two-locations).

### Deviations from this spec

**1. New `VisitItemSummary` type instead of `ContentSummary` on `items`.**
This spec says `VisitSummary.items: ContentSummary[]` and same for `VisitInTrip`. But `ContentSummary` requires `published_at: string`, and the GROQ projections for visit items intentionally do *not* include `published_at` (visit items are worn/used references, not full content cards). Using `ContentSummary` would make the type optimistic — TS would claim `published_at` exists when it doesn't at runtime.

Shipped a narrower type:
```ts
export interface VisitItemSummary {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  tags?: string[]
}
```
Both `VisitSummary.items` and `VisitInTrip.items` use it. Both queries (`allVisitsQuery` and `tripBySlugQuery`) project these fields consistently via a shared `visitItemProjection` constant — one place to edit if C3/C4 decide they need more fields.

**If C3/C4 need additional fields on items** (e.g., `published_at`, `acquired_at`): (a) add them to the `VisitItemSummary` type, (b) add them to `visitItemProjection` in [lib/queries.ts](../../lib/queries.ts). Both queries pick them up automatically.

**2. Two-stage projections for `allTripsQuery` and `tripBySlugQuery`.**
This spec's example GROQ runs `*[_type == "visit" && references(^._id)]` three to four times per trip (once for `startDate`, `endDate`, `visitCount`, and `visits`). Shipped a two-stage projection that fetches visits once, then derives aggregates from the embedded array:

```groq
*[_type == "trip" && slug.current == $slug][0] {
  _id, title, slug, articleBody,
  "hasArticle": defined(articleBody) && length(articleBody) > 0,
  "visits": *[_type == "visit" && references(^._id)] | order(startDate asc) { ... }
} {
  ...,
  "startDate": visits[0].startDate,
  "endDate":   visits | order(endDate desc)[0].endDate,
  "visitCount": count(visits),
}
```

Same shape for `allTripsQuery` with a slim `__v` array (just `startDate`/`endDate`). Semantics unchanged; fewer round-trips.

### Resolved ambiguities

1. **Test harness**: moot — B1 shipped first and installed `vitest` + added `"test": "vitest run"`. A2 just added its test file; no new tooling.
2. **`GlobePinItem` retention**: kept. Only [components/globe/GlobeDetailItem.tsx](../../components/globe/GlobeDetailItem.tsx) imports it. Safe to inline later if desired, but not worth touching in this ticket.
3. **Item projection fields**: shipped `{ _id, title, slug, content_type, cover_image, tags }` for both queries. No `published_at`, no `acquired_at`. See deviation #1 for how C3/C4 should extend if needed.

### Notes for downstream tickets

- **A3 (wire layout)**: import `allTripsQuery` + `allVisitsQuery` from [lib/queries.ts](../../lib/queries.ts); call `aggregatePins(visits)` to get `PinWithVisits[]`. The compile error `Module '"@/lib/queries"' has no exported member 'globeContentQuery'` in `app/globe/layout.tsx` is your entry point.
- **A4 (seed fixtures)**: the queries assume visits reference location docs and trips via `location->` / `trip->`. Fixtures must create `locationDoc` + `trip` before `visit`. Zero-visit trips are *not* filtered in GROQ — they'll return `startDate: null`. B4 is supposed to filter them from the timeline; if A4 seeds any, expect null dates to surface.
- **C1 (provider refactor)**: `PinWithVisits` replaces `GlobePin`. Each pin has `.location`, `.visits` (sorted desc by startDate), `.coordinates`, `.visitCount`, `.tripIds`. Pins array is sorted by each pin's most-recent visit, descending — so `pins[0]` is still the freshest pin (entrance-target contract preserved).
- **C3 (pin panel)**: the pin panel's visit list is already sorted newest-first per spec §7.1. Items on each visit are `VisitItemSummary[]` — not `ContentSummary[]`. If the panel needs `published_at` on items, see deviation #1.
- **C4 (trip panel)**: use `tripBySlugQuery` — it returns `TripWithVisits` (includes `articleBody` + embedded `visits: VisitInTrip[]`). Visits are ordered by startDate asc (chronological).
- **D1 (trip article route)**: `tripBySlugQuery` takes a `$slug` param and returns `null` for missing slugs → use for the 404 check.

### Issues fixed during review

- `items` projection was typed `ContentSummary[]` but actually returned a narrower shape — replaced with `VisitItemSummary`.
- `tripBySlugQuery` re-ran `references(^._id)` four times per trip — refactored to a single subquery.
- `allTripsQuery` re-ran `references(^._id)` three times per trip — same refactor.
- `aggregatePins` used `Array.includes` for `tripId` dedup (O(n²)) — swapped for a parallel `Set` (O(n)) while preserving insertion-order `tripIds`.
- `contentBySlugQuery` still projected the now-dead `globe_group` field — removed.

### How to run the tests

```
npm test
# or a single file:
npx vitest run lib/globe.test.ts
```
