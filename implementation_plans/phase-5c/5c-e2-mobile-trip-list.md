# 5C-E2 — Mobile default trip list

**Epic**: E. Mobile reframing · **Owner**: Dev A · **Can be run by agent?**: Yes · **Estimated size**: S

## Dependencies

### Hard
- **E1** — mobile layout has a content region that renders MobileTripList.

### Soft
- None.

### Blocks
- **F1** (boneyard target `trip-list-default`).

---

## Goal

Replace the E1 stub with the real mobile trip list. Chronologically descending (most recent first). Minimalist text rows with trip title + date range. Tapping a row locks that trip.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §10.1 Below-globe content region (item 1 — default)
- §16 Open question 3 (row format default)
- §13.6.1 Skeleton target: `trip-list-default`

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §10.1, §16
- [`../../components/globe/MobileTripList.tsx`](../../components/globe/MobileTripList.tsx) (stub from E1)
- [`../../lib/formatDates.ts`](../../lib/formatDates.ts) (from C3)
- [`../../components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — `trips` + `setLockedTrip`

## Files to create

- None — MobileTripList already stubbed by E1.

## Files to modify

- `components/globe/MobileTripList.tsx` — replace stub with real component

## Files to delete

- None.

---

## Implementation guidance

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { Skeleton } from 'boneyard-js/react'
import { useGlobe } from './GlobeContext'
import { formatDateRange } from '@/lib/formatDates'

export default function MobileTripList() {
  const router = useRouter()
  const { trips, setLockedTrip } = useGlobe()

  // trips already filtered for validity (has startDate/endDate) by layout.
  // Already sorted by startDate desc per allTripsQuery ORDER clause.

  const handleSelect = (tripId: string, slug: string) => {
    setLockedTrip(tripId)
    router.push(`/globe?trip=${encodeURIComponent(slug)}`, { scroll: false })
  }

  return (
    <Skeleton name="trip-list-default" loading={false} fixture={fixtureList()}>
      <ul className="w-full divide-y divide-gray-100 dark:divide-gray-900">
        {trips.map((trip) => (
          <li key={trip._id}>
            <button
              onClick={() => handleSelect(trip._id, trip.slug.current)}
              className="w-full px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
            >
              <p className="text-sm tracking-wide font-light text-black dark:text-white">
                {trip.title}
              </p>
              <p className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 mt-1">
                {formatDateRange(trip.startDate, trip.endDate)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </Skeleton>
  )
}

/** Boneyard fixture — ~5 sample rows. */
function fixtureList() {
  const samples = [
    { title: 'Berlin 2024', range: 'June 2024' },
    { title: 'NYC Day Trip', range: 'January 20, 2024' },
    { title: 'Seattle Q4 2023', range: 'October 2023' },
    { title: 'SF Q4 2023', range: 'October 2023' },
    { title: 'Round-the-World', range: 'July 2023' },
  ]
  return (
    <ul className="w-full divide-y divide-gray-100 dark:divide-gray-900">
      {samples.map((s) => (
        <li key={s.title} className="px-5 py-4">
          <p className="text-sm tracking-wide font-light text-black dark:text-white">{s.title}</p>
          <p className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 mt-1">{s.range}</p>
        </li>
      ))}
    </ul>
  )
}
```

---

## Acceptance criteria

- [ ] On mobile `/globe` default state, content region below timeline shows a list of trips.
- [ ] List is chronologically descending (matches `trips` array order).
- [ ] Each row: trip title (primary) + date range (muted, smaller).
- [ ] Tapping a row locks the trip (trip panel opens inline; URL updates).
- [ ] No thumbnails or icons.
- [ ] No pagination — full list renders scrollably.
- [ ] Boneyard fixture renders ~5 sample rows when the real data hasn't loaded.
- [ ] Dark mode works.
- [ ] Empty-trips case: shows "Nothing yet" (from Timeline's empty state handling — or add explicit handling here).

## Non-goals

- **No thumbnails** — §16 Q3 default.
- **No visit counts** — not in spec's row format.
- **No filtering or sorting** — §13 defers.
- **No desktop rendering** — this component is mobile-only by virtue of where it's mounted (`MobileContentRegion`).

## Gotchas

- **`Skeleton` wrapper**: required for F1 boneyard registration. Keep `loading={false}` — the list renders from hydrated context data, not a fetch state. The skeleton bones show during SSR/hydration gap only.
- **`trips` from context is `TripSummary[]`**: has `startDate`, `endDate`, `slug`, `title`, `visitCount`, `hasArticle`. All needed.
- **`divide-y` trick**: Tailwind utility that puts borders between `<li>` children. Simpler than per-item borders.
- **Cursor on button**: include `cursor-pointer` so the row feels tappable.
- **Empty trips**: if `trips` is empty (fresh setup), render a placeholder "No trips yet" message. Spec §12.1 handles at timeline level; redundant at list level but friendly.
- **Long trip titles**: no truncation specified. If titles exceed row width, they wrap. Acceptable.

## Ambiguities requiring clarification before starting

1. **Date range format**: using `formatDateRange` — may produce "March 15–20, 2022" for same-month or "March 2022 — April 2022" for cross-month. Reviewer may prefer consistent month-year format: "March 2022" only. Tune if requested.

   **Action**: use `formatDateRange`. Reviewable.

2. **Include visit count as a third line?**: spec §16 Q3 default is two lines. Visit count would be a useful secondary hint but adds clutter. Defer.

3. **Fixture for boneyard**: 5 sample rows with plausible titles. The rendered fixture JSX matters for bone shapes. Verify layout matches real render.

## Handoff / outputs consumed by later tickets

- `trip-list-default` skeleton name — consumed by F1 boneyard build.

## How to verify

1. Mobile `/globe` default state: list renders below timeline. All seeded trips visible.
2. Tap "Japan Spring '22" row — trip panel opens inline, URL updates.
3. Tap back arrow — list returns.
4. Slow-network cold load: skeleton bones visible briefly, replaced by real list.
5. DevTools: inspect `<ul>` — children have proper structure.
6. Dark mode: `.dark` class on `<html>` → colors swap.
