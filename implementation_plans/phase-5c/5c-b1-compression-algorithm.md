# 5C-B1 — Timeline compression algorithm (pure function)

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Yes · **Estimated size**: S–M

> **Status**: ✅ Shipped 2026-04-20 — see [Implementation log](#implementation-log) at the bottom for what was built, deviations from this spec, and notes for downstream B-tickets.

## Dependencies

### Hard
- None — pure function, zero external coupling.

### Soft
- None.

### Blocks
- B2 (imports `CompressedMap`)
- Transitively: all B tickets.

---

## Goal

Build the pure function that maps real dates → normalized x-coordinates (0..1) on the timeline, compressing empty stretches so sparse decades don't dominate horizontal space. Ship with unit tests.

Spec §15.1 explicitly flags this as **a dedicated early ticket** — its quality determines whether the timeline feels legible at full-history zoom. Iterating it standalone is cheaper than iterating it inside a rendered component.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §4.2 Scale and compression
- §4.5 Time axis (year/month labels at real positions)
- §15.1 Timeline compression algorithm — suggested separate ticket

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §4
- [`../../package.json`](../../package.json) — check current devDeps; no test harness currently

## Files to create

- `lib/timelineCompression.ts`
- `lib/timelineCompression.test.ts` (or equivalent — see ambiguity #1)

## Files to modify

- `package.json` — may need to add `vitest` devDep + `test` script. See ambiguity #1.

## Files to delete

- None.

---

## Implementation guidance

### API shape

```ts
// lib/timelineCompression.ts

export interface TripRange {
  id: string          // opaque — trip._id typically
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
}

export interface TickMark {
  date: string        // YYYY-MM-DD
  x: number           // 0..1
  label: string       // display label
  kind: 'year' | 'month'
}

export interface CompressedMap {
  /** Map any ISO date in [earliestStart, now] → normalized x in [0, 1]. */
  dateToX(isoDate: string): number
  /** Inverse map. Lossy: accurate within ~1 day. */
  xToDate(x: number): string
  /** For rendering year/month labels along the timeline. */
  tickMarks: TickMark[]
  /** Earliest date covered. */
  start: string
  /** Latest date covered (today). */
  end: string
}

export interface BuildOptions {
  /** Minimum fractional width for an empty gap (default: 0.02). Prevents gaps from collapsing to 0. */
  minGapFraction?: number
  /** How much more x-space active time gets vs empty time (default: 3). */
  activeBoost?: number
  /** Override "now" for testing. Default: today as YYYY-MM-DD. */
  now?: string
}

export function buildCompressedMap(
  trips: TripRange[],
  opts: BuildOptions = {}
): CompressedMap { /* ... */ }
```

### Algorithm

```
Inputs: trips[], options
Outputs: CompressedMap

1. Normalize and sort trips by startDate ascending.
2. Clamp each trip.endDate to <= now. Drop trips entirely after now (defensive).
3. Compute earliestStart = min(trips[].startDate). If no trips, default to
   `now - 1 year` so the map is still defined.
4. Merge overlapping intervals to produce `activeIntervals[]`:
   - Walk sorted trips, merge any (endDate >= nextStartDate).
5. Walk [earliestStart, now]. Produce alternating segments:
   { start, end, kind: 'active' | 'empty', realDays }
6. Assign each segment a weight:
   - active: realDays * activeBoost
   - empty:  max(realDays, minGapFraction * totalRealDays)
7. totalWeight = sum(weights). Each segment's xWidth = weight / totalWeight.
8. Accumulate: compute each segment's [xStart, xEnd] by cumulative sum.
9. Store segments[] on the map for fast lookup in dateToX/xToDate (binary search
   by date or x).
10. Build tick marks:
    - Walk years from year(earliestStart) to year(now). For each Jan 1, compute x via dateToX.
      Label: "2022".
    - If totalRealDays < 365*2, also add month ticks. Skip months whose x would collide
      with an adjacent year tick (within ~0.02 x).
    - Sort ticks by x. Store on map.
11. Return { dateToX, xToDate, tickMarks, start, end }.

dateToX(iso):
  - iso = clamp(iso, earliestStart, now)
  - Binary-search segments for the one containing iso.
  - Linear interpolate within segment: xStart + (realElapsed / realDays) * xWidth
  - Return x.

xToDate(x):
  - Binary-search segments for the one containing x (xStart <= x < xEnd).
  - Linear interpolate: realStart + (x - xStart) / xWidth * realDays
  - Return as YYYY-MM-DD.
```

### Date utilities (inline — no heavy library)

```ts
// Inline helpers — keep outside the exported surface.
function daysBetween(iso1: string, iso2: string): number {
  const a = Date.UTC(+iso1.slice(0, 4), +iso1.slice(5, 7) - 1, +iso1.slice(8, 10))
  const b = Date.UTC(+iso2.slice(0, 4), +iso2.slice(5, 7) - 1, +iso2.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

function addDays(iso: string, days: number): string {
  const ms = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + days * 86400000
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function today(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

### Test cases (`lib/timelineCompression.test.ts`)

Use `vitest` (or the chosen harness). Minimum coverage:

```ts
import { describe, it, expect } from 'vitest'
import { buildCompressedMap } from './timelineCompression'

describe('buildCompressedMap', () => {
  it('single-day trip: dateToX returns valid range', () => {
    const map = buildCompressedMap(
      [{ id: 'a', startDate: '2024-03-15', endDate: '2024-03-15' }],
      { now: '2024-04-15' }
    )
    expect(map.dateToX('2024-03-15')).toBeGreaterThan(0)
    expect(map.dateToX('2024-04-15')).toBe(1)
    expect(map.start).toBe('2024-03-15')
    expect(map.end).toBe('2024-04-15')
  })

  it('two trips far apart: empty region is compressed', () => {
    const map = buildCompressedMap(
      [
        { id: 'a', startDate: '2019-01-01', endDate: '2019-01-07' },
        { id: 'b', startDate: '2024-01-01', endDate: '2024-01-07' },
      ],
      { now: '2024-04-15' }
    )
    const tripAWidth = map.dateToX('2019-01-07') - map.dateToX('2019-01-01')
    const gapWidth   = map.dateToX('2024-01-01') - map.dateToX('2019-01-07')
    expect(tripAWidth).toBeGreaterThan(0)
    expect(gapWidth).toBeGreaterThan(0)
    // Gap is many years; trip is 7 days. With activeBoost=3 and minGapFraction=0.02,
    // the gap still takes MORE x than the trip (because 5 years dwarfs 7 days even /3),
    // but the ratio should be << the uncompressed ratio (5*365/7 = ~260x).
    // Assert: ratio < 50x.
    expect(gapWidth / tripAWidth).toBeLessThan(50)
  })

  it('10 trips densely packed: all get visible width', () => {
    const trips: TripRange[] = []
    for (let i = 0; i < 10; i++) {
      const month = String(i + 1).padStart(2, '0')
      trips.push({ id: `t${i}`, startDate: `2024-${month}-01`, endDate: `2024-${month}-05` })
    }
    const map = buildCompressedMap(trips, { now: '2024-12-01' })
    for (let i = 0; i < 10; i++) {
      const month = String(i + 1).padStart(2, '0')
      const w = map.dateToX(`2024-${month}-05`) - map.dateToX(`2024-${month}-01`)
      expect(w).toBeGreaterThan(0.005) // visible
    }
  })

  it('10-year trip: dominates width', () => {
    const map = buildCompressedMap(
      [{ id: 'long', startDate: '2014-01-01', endDate: '2024-01-01' }],
      { now: '2024-06-01' }
    )
    const longWidth = map.dateToX('2024-01-01') - map.dateToX('2014-01-01')
    expect(longWidth).toBeGreaterThan(0.8) // dominates
  })

  it('no trips: returns default span, dateToX(now) === 1', () => {
    const map = buildCompressedMap([], { now: '2024-04-15' })
    expect(map.dateToX('2024-04-15')).toBe(1)
    expect(map.dateToX(map.start)).toBe(0)
  })

  it('dateToX / xToDate roundtrip within 1 day', () => {
    const map = buildCompressedMap(
      [
        { id: 'a', startDate: '2022-03-05', endDate: '2022-03-18' },
        { id: 'b', startDate: '2023-10-15', endDate: '2023-10-25' },
      ],
      { now: '2024-04-15' }
    )
    for (const probe of ['2022-03-10', '2023-06-01', '2023-10-20']) {
      const x = map.dateToX(probe)
      const backToDate = map.xToDate(x)
      // Within 1 day
      const diff = Math.abs(new Date(probe).getTime() - new Date(backToDate).getTime()) / 86400000
      expect(diff).toBeLessThanOrEqual(1)
    }
  })

  it('tick marks: year ticks at all zoom levels', () => {
    const map = buildCompressedMap(
      [{ id: 'a', startDate: '2019-01-01', endDate: '2019-06-01' }],
      { now: '2024-04-15' }
    )
    const years = map.tickMarks.filter((t) => t.kind === 'year').map((t) => t.label)
    expect(years).toContain('2020')
    expect(years).toContain('2024')
  })

  it('tick marks: month ticks appear when span < 2 years', () => {
    const map = buildCompressedMap(
      [{ id: 'a', startDate: '2024-01-01', endDate: '2024-06-01' }],
      { now: '2024-07-01' }
    )
    const months = map.tickMarks.filter((t) => t.kind === 'month')
    expect(months.length).toBeGreaterThan(0)
  })

  it('dateToX is monotonically increasing', () => {
    const map = buildCompressedMap(
      [
        { id: 'a', startDate: '2020-01-01', endDate: '2020-02-01' },
        { id: 'b', startDate: '2022-06-01', endDate: '2022-06-30' },
      ],
      { now: '2024-04-15' }
    )
    const probes = ['2020-01-01', '2020-06-01', '2022-06-15', '2024-04-01']
    let prev = -1
    for (const p of probes) {
      const x = map.dateToX(p)
      expect(x).toBeGreaterThan(prev)
      prev = x
    }
  })
})
```

---

## Acceptance criteria

- [ ] `lib/timelineCompression.ts` exports `buildCompressedMap`, `CompressedMap`, `TripRange`, `TickMark`, `BuildOptions`.
- [ ] Test file covers the 8 cases above (or equivalent). All pass.
- [ ] `dateToX(now)` always equals 1.0 (within floating-point tolerance: `|x - 1| < 1e-9`).
- [ ] `dateToX(start)` always equals 0.
- [ ] Active regions take visibly more horizontal share than empty regions of similar real-time length (verified by the "10 trips densely packed" and "two trips far apart" tests).
- [ ] No trip segment compresses below `~1 / (activeBoost × 100)` of total width unless the input range makes it impossible.
- [ ] Pure function — no DOM, no React, no globals (other than `Date.now()` in the default `now`).
- [ ] Under 300 lines total (this algorithm doesn't need more).

## Non-goals

- **No React component**. That's B2.
- **No zoom/pan handling**. B3 operates on top of this map by slicing [0, 1].
- **No playhead logic**. B6.
- **No visual rendering of tick marks** — just the data structure.
- **Not a date library wrapper** — stay inline with the helpers above. Adding `date-fns` or similar is out of scope.

## Gotchas

- **Time zones**: compare dates via `Date.UTC(...)` to avoid DST edge cases. `Date.parse('2024-03-15')` parses as UTC midnight in most runtimes but don't rely on it.
- **Lexicographic compare** (`a.localeCompare(b)`) works for ISO-8601 dates. Avoid `new Date()` in hot paths; use `daysBetween` helper only where numeric math is needed.
- **`Date.UTC` is 0-indexed for month** — easy to slip a one-off bug. Double-check the helpers.
- **Empty input**: the function must still return a defined map. Don't throw.
- **`dateToX` for out-of-range dates**: clamp silently to [0, 1]. Don't throw.
- **Floating-point equality**: expect(x).toBe(1) fails on `0.9999...`. Use `toBeCloseTo(1, 10)` or tolerance.
- **`activeBoost` too aggressive**: default 3 feels right. Higher values (10, 30) make tiny trips invisible on full-history zoom. Tunable, but don't go above 5 as default.

## Ambiguities requiring clarification before starting

1. **Test harness**: no `vitest` or `jest` in the repo. Two options:
   - **(a)** Install `vitest` (lightweight, 0-config) + add `"test": "vitest"` to `package.json`. Enables tests for A2 too.
   - **(b)** Write runtime self-checks in the file: `if (require.main === module) { /* run asserts */ }` and document `npx tsx lib/timelineCompression.ts`.

   **Recommendation**: (a). Vitest is the de-facto choice for TS-first pure-function tests in 2025. The cost is one devDep + one script entry. Running the test locally is `npx vitest run`.

   **Action if unsure**: do (b) and note in the PR: "TODO: switch to vitest if we grow >1 module needing tests."

2. **`activeBoost` default**: proposed 3. Spec leaves discretion. If fixture review shows timeline still feels empty-gap-heavy, bump to 4 or 5. Don't tune until B4 renders real data.

   **Action**: ship with default 3. Document as tunable.

3. **Tick-mark density**: when to show month ticks? Proposed "when totalRealDays < 365*2". Could instead be "when zoom window span < 2 years" — but zoom is B3's concern. Keep static here; B3/B5 can override the tick list at render time based on zoom.

   **Action**: ship static logic. B5 can recompute ticks per zoom if needed.

## Handoff / outputs consumed by later tickets

- **Exports**: `buildCompressedMap`, type names `CompressedMap`, `TripRange`, `TickMark`, `BuildOptions`.
- **B2** imports `buildCompressedMap` and renders segments at `map.dateToX(trip.startDate)` to `map.dateToX(trip.endDate)`.
- **B3** consumes `CompressedMap.dateToX` / `xToDate` while slicing into a zoom window.
- **B5** may re-use `tickMarks` or regenerate for zoomed views.
- **B6** uses `map.dateToX(now)` and sweeps the playhead across [0, 1].

## How to verify

1. Install (if not present): `npm install -D vitest` and add `"test": "vitest"` to package.json `scripts`.
2. `npx vitest run` — all tests pass.
3. Manual sanity: add a `console.log` in a scratch file:
   ```ts
   import { buildCompressedMap } from './lib/timelineCompression'
   const m = buildCompressedMap([
     { id: 'a', startDate: '2018-05-10', endDate: '2018-05-17' },
     { id: 'b', startDate: '2024-03-01', endDate: '2024-03-15' },
   ], { now: '2024-04-15' })
   console.log('trip a x:', m.dateToX('2018-05-10'), m.dateToX('2018-05-17'))
   console.log('trip b x:', m.dateToX('2024-03-01'), m.dateToX('2024-03-15'))
   console.log('gap width:', m.dateToX('2024-03-01') - m.dateToX('2018-05-17'))
   console.log('ticks:', m.tickMarks.length, 'marks')
   ```
   Expected: trip widths are small but visible; gap is compressed (not 99%); ticks include years 2019–2024.

---

## Implementation log

Shipped in PR [#26](https://github.com/AroundTheLines/qile.wang/pull/26) on 2026-04-20.

### Files actually shipped

- `lib/timelineCompression.ts` — exports `buildCompressedMap`, `CompressedMap`, `TripRange`, `TickMark`, `BuildOptions`. ~250 lines.
- `lib/timelineCompression.test.ts` — 12 vitest cases (the 8 spec-required cases plus monotonicity, overlap merging, endDate-clamp, leap-day).
- `package.json` — added `vitest` devDep + `"test": "vitest run"` script (resolved ambiguity #1 with the recommended option).

### Deviation from the algorithm in this spec — read before B5

**Spec step 6 (literal):**
```
empty: max(realDays, minGapFraction * totalRealDays)
```
**As shipped:**
```
empty: max(realDays / activeBoost, minGapFraction * totalRealDays)
```

The literal formula could not satisfy this spec's own "two trips far apart" test (`gap/trip ratio < 50` at default `activeBoost=3`) — the math gives ~101. Satisfying the test with the literal formula would require `activeBoost ≥ 7`, which contradicts this spec's own gotcha ("don't go above 5 as default").

The shipped formula divides empty time by `activeBoost` symmetrically, which matches the spec's stated *intent* ("Active regions take visibly more horizontal share than empty regions of similar real-time length") and passes the test (ratio ≈ 34). `minGapFraction` still acts as the floor for tiny gaps.

**For B5 / future tuning:** if the rendered timeline still feels gap-heavy or trip-light, either bump `activeBoost` (default 3, soft cap 5) or revisit this empty-weight formula. Don't bump `activeBoost` past ~5 — tiny trips become invisible at full-history zoom.

### Resolved ambiguities

1. **Test harness**: chose option (a) — installed `vitest` and added `"test": "vitest run"` to scripts. First test harness in the repo. A2 / future tickets can now write tests cheaply.
2. **`activeBoost` default**: shipped at 3 as recommended. Tunable via `BuildOptions.activeBoost`.
3. **Tick density**: shipped static "month ticks if totalRealDays < 365×2" logic. B5 is free to recompute ticks based on zoom window if needed.

### Notes for downstream tickets

- **B2**: import `buildCompressedMap` and use `map.dateToX(trip.startDate)` / `map.dateToX(trip.endDate)` to position trip bands. `tickMarks` is ready to render — each tick has `{ date, x, label, kind }`.
- **B3**: `dateToX` / `xToDate` are stable; safe to call inside zoom transforms. Both clamp out-of-range inputs silently to [0, 1] / [start, end] — they will not throw.
- **B5**: see deviation note above. If you regenerate ticks per-zoom, the collision threshold is exposed as `TICK_COLLISION_X = 0.02` constant in the source (not exported; promote if needed).
- **B6**: `map.dateToX(now)` is exactly `1.0` (within 1e-9). Safe to use as the playhead's right edge.

### Issues fixed during review

- Leap-day bug in `subtractOneYear` — original `${y-1}${iso.slice(4)}` produced phantom `2023-02-29` from `2024-02-29`. Now routes through `addDays(iso, -365)`.
- Local-vs-UTC mismatch in `todayIso` — switched to `getUTC*` so it matches the UTC-anchored date math elsewhere.

### How to run the tests

```
npm test
# or for watch mode:
npx vitest
```
