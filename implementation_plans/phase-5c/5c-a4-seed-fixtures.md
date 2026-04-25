# 5C-A4 — Wipe existing content; author Phase 5C fixtures

**Epic**: A. Foundation · **Owner**: Dev A · **Can be run by agent?**: Partial — agent scaffolds script; human reviews editorial realism. · **Estimated size**: M

## Dependencies

### Hard
- **A1** — schemas must exist for creation to succeed.

### Soft
- **A2** — queries help verify seeded data visually.

### Blocks
- Functionally nothing downstream is strictly blocked by A4; every other ticket can run against empty data. But F3 verification requires the full fixture set.

---

## Goal

Author a **representative fixture set** on the new `locationDoc` / `trip` / `visit` schema. The fixtures double as the manual test plan for the entire phase — they must exercise every case listed in §11.2 and §12.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §11 Greenfield migration
- §11.2 Fixture authoring checklist
- §12 Empty states & edge cases

## Files to read first

- [`../../scripts/seed.mts`](../../scripts/seed.mts) — pattern for Sanity client setup + writes
- [`../../scripts/seed-globe-groups.mts`](../../scripts/seed-globe-groups.mts) — to be deleted (reference only)
- [`../../scripts/seed-item-bodies.mts`](../../scripts/seed-item-bodies.mts) — additional seed pattern
- [`../../lib/sanity.ts`](../../lib/sanity.ts) — project/dataset config
- The A1 schemas (verify field names match what you'll write)

## Files to create

- `scripts/seed-phase5c.mts` — fixture creation script

## Files to modify

- None.

## Files to delete

- `scripts/seed-globe-groups.mts` — replaces `globe_group` backfill, no longer meaningful after A1.

---

## Implementation guidance

### Script shape

```ts
/**
 * Phase 5C fixture seed.
 *
 * Usage:
 *   npx tsx scripts/seed-phase5c.mts --wipe-first          (deletes existing locationDoc, trip, visit docs first)
 *   npx tsx scripts/seed-phase5c.mts --dry-run             (logs plan, writes nothing)
 *   npx tsx scripts/seed-phase5c.mts                        (additive — may conflict with existing docs)
 *
 * SAFETY: script refuses to run unless NEXT_PUBLIC_SANITY_DATASET starts with "dev"
 *         or --force-any-dataset is passed. This prevents accidental production wipes.
 */
import { createClient } from '@sanity/client'
import { config } from 'dotenv'
import { randomUUID } from 'crypto'

config({ path: '.env.local' })

const token = process.env.SANITY_API_TOKEN
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!
if (!token) { /* error + exit */ }

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const wipeFirst = args.has('--wipe-first')
const forceAny = args.has('--force-any-dataset')

if (!dataset.startsWith('dev') && !forceAny) {
  console.error(`Refusing to run on dataset '${dataset}'. Pass --force-any-dataset to override.`)
  process.exit(1)
}

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset,
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

// Helpers
const doc = <T extends Record<string, unknown>>(t: T) => ({ _id: randomUUID(), ...t })
const slug = (s: string) => ({ _type: 'slug' as const, current: s })
const ref = (_ref: string) => ({ _type: 'reference' as const, _ref })
const key = () => randomUUID()

// ------------------------------
// Fixture definitions
// ------------------------------

const locations = [
  doc({ _type: 'locationDoc', name: 'Marrakech, Morocco',   coordinates: { lat: 31.63, lng: -7.99 } }),
  doc({ _type: 'locationDoc', name: 'Tokyo, Japan',         coordinates: { lat: 35.68, lng: 139.65 } }),
  doc({ _type: 'locationDoc', name: 'Kyoto, Japan',         coordinates: { lat: 35.01, lng: 135.77 } }),
  doc({ _type: 'locationDoc', name: 'Osaka, Japan',         coordinates: { lat: 34.69, lng: 135.50 } }),
  doc({ _type: 'locationDoc', name: 'Berlin, Germany',      coordinates: { lat: 52.52, lng: 13.40 } }),
  doc({ _type: 'locationDoc', name: 'Lisbon, Portugal',     coordinates: { lat: 38.72, lng: -9.14 } }),
  doc({ _type: 'locationDoc', name: 'San Francisco, USA',   coordinates: { lat: 37.77, lng: -122.42 } }),
  doc({ _type: 'locationDoc', name: 'Seattle, USA',         coordinates: { lat: 47.61, lng: -122.33 } }),
  doc({ _type: 'locationDoc', name: 'Sydney, Australia',    coordinates: { lat: -33.87, lng: 151.21 } }),
  doc({ _type: 'locationDoc', name: 'New York, USA',        coordinates: { lat: 40.71, lng: -74.01 } }),
]

// Lookup by name for readability below.
const L = Object.fromEntries(locations.map((l) => [l.name, l._id])) as Record<string, string>

// Trips.
// Each trip is seeded as a top-level doc with title + slug + optional articleBody.
// startDate / endDate are NOT stored — computed at query time.
const trips = [
  doc({
    _type: 'trip',
    title: 'Morocco \'18',
    slug: slug('morocco-2018'),
    articleBody: simpleBody('A week in Marrakech.'),
  }),
  doc({
    _type: 'trip',
    title: 'Japan Spring \'22',
    slug: slug('japan-spring-2022'),
    articleBody: simpleBody('Three cities. Too much ramen.'),
  }),
  doc({
    _type: 'trip',
    title: 'Berlin \'22',
    slug: slug('berlin-2022'),
    articleBody: simpleBody('First time. Kreuzberg.'),
  }),
  doc({
    _type: 'trip',
    title: 'Berlin \'24',
    slug: slug('berlin-2024'),
    articleBody: simpleBody('Second time. Prenzlauer Berg.'),
  }),
  // No article body — tests grayed-out link + §8.3.
  doc({
    _type: 'trip',
    title: 'Weekend in Lisbon',
    slug: slug('weekend-in-lisbon'),
    // articleBody omitted
  }),
  doc({ _type: 'trip', title: 'SF Q4 \'23',     slug: slug('sf-q4-2023'),     articleBody: simpleBody('Work trip.') }),
  doc({ _type: 'trip', title: 'Seattle Q4 \'23', slug: slug('seattle-q4-2023'), articleBody: simpleBody('Overlaps with SF.') }),
  // Single-day trip — tests dot rendering.
  doc({ _type: 'trip', title: 'NYC Day Trip',   slug: slug('nyc-day-trip'),   articleBody: simpleBody('One day.') }),
  // Globe-spanning trip — tests camera fit cap.
  doc({ _type: 'trip', title: 'Round-the-World', slug: slug('round-the-world'), articleBody: simpleBody('Everywhere.') }),
  // Older trips for 5-year span sanity check.
  doc({ _type: 'trip', title: 'Tokyo 2019',      slug: slug('tokyo-2019'),      articleBody: simpleBody('') }),
]

const T = Object.fromEntries(trips.map((t) => [t.title, t._id])) as Record<string, string>

// Items: reuse a few existing content docs (by slug) — fetch their IDs at runtime.
// For the coverage case "item with no visits", ensure at least one content doc is never
// referenced by any visit below.
const itemSlugsToUse = [
  'black-ma-1-bomber',       // will appear in multiple visits
  'silk-scarf-navy',         // cross-trip item
  // ... query at runtime by slug
]

// Visits. One per block; associates item IDs resolved at runtime.
function buildVisits(itemIds: Record<string, string>): object[] {
  const v = (startDate: string, endDate: string, locId: string, tripId: string, items: string[] = []) =>
    doc({
      _type: 'visit',
      startDate,
      endDate,
      location: ref(locId),
      trip: ref(tripId),
      items: items.map((id) => ({ _type: 'reference' as const, _ref: id, _key: key() })),
    })

  return [
    // Morocco '18 — single visit.
    v('2018-05-10', '2018-05-17', L['Marrakech, Morocco'], T['Morocco \'18'], [itemIds['black-ma-1-bomber']]),

    // Japan Spring '22 — multi-visit + article. Shows arcs (Tokyo→Kyoto→Osaka).
    v('2022-03-05', '2022-03-10', L['Tokyo, Japan'],  T['Japan Spring \'22'], [itemIds['silk-scarf-navy']]),
    v('2022-03-10', '2022-03-14', L['Kyoto, Japan'],  T['Japan Spring \'22']),
    v('2022-03-14', '2022-03-18', L['Osaka, Japan'],  T['Japan Spring \'22'], [itemIds['black-ma-1-bomber']]),

    // Berlin '22 and Berlin '24 — same location, two different trips.
    v('2022-09-01', '2022-09-07', L['Berlin, Germany'], T['Berlin \'22'], [itemIds['silk-scarf-navy']]),
    v('2024-06-10', '2024-06-20', L['Berlin, Germany'], T['Berlin \'24']),

    // Weekend in Lisbon — empty visit (no items), trip has no article body.
    v('2023-02-17', '2023-02-19', L['Lisbon, Portugal'], T['Weekend in Lisbon']),

    // Overlapping trips: SF + Seattle in Q4 '23.
    v('2023-10-15', '2023-10-22', L['San Francisco, USA'], T['SF Q4 \'23']),
    v('2023-10-18', '2023-10-25', L['Seattle, USA'], T['Seattle Q4 \'23']),

    // Single-day trip — tests dot rendering (startDate === endDate).
    v('2024-01-20', '2024-01-20', L['New York, USA'], T['NYC Day Trip']),

    // Globe-spanning trip — three far-apart pins.
    v('2023-07-01', '2023-07-10', L['Tokyo, Japan'],     T['Round-the-World']),
    v('2023-07-11', '2023-07-18', L['New York, USA'],    T['Round-the-World']),
    v('2023-07-19', '2023-07-25', L['Sydney, Australia'], T['Round-the-World']),

    // Older trip for 5-year span.
    v('2019-04-01', '2019-04-10', L['Tokyo, Japan'], T['Tokyo 2019']),

    // Item duplication within one trip: same item in visit 1 and visit 3 of Japan Spring.
    // (Handled above by assigning 'black-ma-1-bomber' to both Tokyo and Osaka visits.)
  ]
}

// PortableText helper
function simpleBody(text: string) {
  if (!text) return undefined
  return [
    {
      _type: 'block',
      _key: key(),
      style: 'normal',
      children: [{ _type: 'span', _key: key(), text, marks: [] }],
      markDefs: [],
    },
  ]
}

// ------------------------------
// Run
// ------------------------------

async function main() {
  if (wipeFirst) {
    await wipe(['visit', 'trip', 'locationDoc'])
  }

  // Write locations first, then trips, then visits (to satisfy reference order).
  for (const l of locations) await maybeCreate(l)
  for (const t of trips) await maybeCreate(t)

  const itemIds = await resolveItemSlugs(itemSlugsToUse)
  for (const v of buildVisits(itemIds)) await maybeCreate(v)

  // Summary
  const summary = await client.fetch(`{
    "trips": count(*[_type == "trip"]),
    "visits": count(*[_type == "visit"]),
    "locations": count(*[_type == "locationDoc"]),
    "orphanItems": count(*[_type == "content" && content_type == "item" && count(*[_type == "visit" && references(^._id)]) == 0])
  }`)
  console.log('Summary:', summary)
}

async function maybeCreate(d: Record<string, unknown>) {
  if (dryRun) {
    console.log('  [would create]', d._type, d._id ?? '', (d as { title?: string; name?: string }).title ?? (d as { name?: string }).name ?? '')
    return
  }
  await client.createIfNotExists(d as Parameters<typeof client.createIfNotExists>[0])
}

async function wipe(types: string[]) {
  if (dryRun) {
    console.log('  [would wipe]', types)
    return
  }
  for (const type of types) {
    const ids = await client.fetch<string[]>(`*[_type == $type]._id`, { type })
    console.log(`  wiping ${ids.length} ${type} docs…`)
    for (const id of ids) await client.delete(id)
  }
}

async function resolveItemSlugs(slugs: string[]): Promise<Record<string, string>> {
  const rows = await client.fetch<{ slug: { current: string }; _id: string }[]>(
    `*[_type == "content" && content_type == "item" && slug.current in $slugs] { _id, slug }`,
    { slugs },
  )
  const map: Record<string, string> = {}
  for (const r of rows) map[r.slug.current] = r._id
  return map
}

main().catch((e) => { console.error(e); process.exit(1) })
```

### Fixture coverage checklist

Before merging, verify the seeded dataset hits every case in §11.2:

| Case | Fixture covering it |
|---|---|
| Single-visit trip | Morocco '18, Tokyo 2019 |
| Multi-visit trip + article | Japan Spring '22 |
| Multi-visit at same location across different trips | Berlin '22 + Berlin '24 |
| Trip with no article body | Weekend in Lisbon |
| Trips overlapping in time | SF Q4 '23 + Seattle Q4 '23 |
| Single-day trip (dot rendering) | NYC Day Trip |
| Globe-spanning trip (zoom cap) | Round-the-World |
| Item with no visits (wardrobe-only) | Ensure ≥ 1 existing content doc never referenced below |
| Item in 2+ visits within one trip | `black-ma-1-bomber` in Tokyo + Osaka of Japan Spring '22 |
| Item in visits across ≥ 2 trips | `silk-scarf-navy` in Japan Spring '22 + Berlin '22 |
| ≥ 10 trips, ≥ 5 year span | Tokyo 2019 → Berlin '24 (5-year span, 10 trips) |

### Delete the old seed

```
rm scripts/seed-globe-groups.mts
```

---

## Acceptance criteria

- [ ] `scripts/seed-phase5c.mts` exists and is runnable via `npx tsx scripts/seed-phase5c.mts --wipe-first`.
- [ ] Script refuses to run on a non-`dev*` dataset unless `--force-any-dataset` is passed.
- [ ] `--dry-run` prints a plan without writing.
- [ ] After running `--wipe-first` on a dev dataset: Studio shows ≥ 9 `locationDoc` docs, 10 trips, ≥ 14 visits.
- [ ] GROQ sanity query `*[_type == "trip"] { title, "visitCount": count(*[_type == "visit" && references(^._id)]) }` returns non-zero visitCount for every trip.
- [ ] `scripts/seed-globe-groups.mts` is deleted.
- [ ] Opening `/globe` after seeding shows pins at each seeded location (assuming A3 has merged).
- [ ] At least one `content` doc with `content_type == 'item'` has zero visits (verify via the summary query).

## Non-goals

- **Do not author real biographical data.** Fixtures are representative, not personal.
- **Do not seed new `content` docs** unless needed to hit the "item with no visits" case. Prefer reusing existing content.
- **Do not wire seed into `package.json` scripts** (optional — if you want, add `"seed:phase5c": "tsx scripts/seed-phase5c.mts"` but not required).
- **Do not seed images** — existing content docs already have images.

## Gotchas

- **Safety rail**: the dataset-name check must come before any delete/create. A colleague accidentally wiping a prod-adjacent dataset is a plausible risk.
- **`createIfNotExists`**: use this rather than `create` so re-running without `--wipe-first` is safe (no duplicate ID errors).
- **`randomUUID()` in Node** requires `import { randomUUID } from 'crypto'`. Do not use `crypto.randomUUID()` as a global — varies by Node version.
- **Reference ordering**: Sanity can reject a `visit` with `_ref` to a non-existent `trip`. Write locations → trips → visits in that order.
- **`content_type == "item"` filter** on `visit.items` (A1 schema): respect it when picking which items to reference. Do not reference posts.
- **Existing content docs**: the `black-ma-1-bomber` slug is seeded by `scripts/seed.mts`. If that script hasn't been run in this dataset, `resolveItemSlugs` returns empty and visits have no items. Document this: "Run `npx tsx scripts/seed.mts` first if the dataset is empty of content docs."
- **Visit `_key` on `items` array entries**: Sanity arrays-of-references need a `_key` on each entry. Without it, Studio shows "Missing keys" warning. Include `_key: randomUUID()`.

## Ambiguities requiring clarification before starting

1. **Fixture realism**: spec leaves "how many" and "how elaborate" up to the author. Ten trips / nine locations meets the span + coverage requirements. Add more only if a reviewer asks for denser playback testing.

   **Resolution**: seed exactly the fixtures above; add more only on request.

2. **Which existing item slugs to reference**: depends on what's currently in the dev dataset. Enumerate what's there with `*[_type == "content" && content_type == "item"] { slug }` before running. If fewer than 2 items exist, either seed more via `scripts/seed.mts` first or reduce the item-referencing fixtures to only what's available.

   **Resolution**: run `scripts/seed.mts` first if needed; document in PR.

3. **Wipe scope**: proposed script wipes `visit`, `trip`, `locationDoc` in that order. It does **not** wipe `content` docs — those are orthogonal and carry the wardrobe items. A stricter approach ("wipe everything and re-seed content too") would also re-seed the wardrobe via `scripts/seed.mts`. Adds complexity; not this ticket's scope.

   **Resolution**: wipe only the 3 new types. Content docs untouched.

## Implementation notes (from PR #28)

Surfaced during review and worth recording for future seed-script work:

- **Deterministic `_id`s for idempotency.** The initial draft used `randomUUID()` for every doc's `_id`. That meant `createIfNotExists` never matched anything on re-run, so the script silently double-seeded instead of "conflicting" as the header claimed. Fixed by deriving stable IDs from slugs/names via helpers:
  - `locationId(name)` → `seed.location.<kebab-name>`
  - `tripId(slug)` → `seed.trip.<slug>`
  - `visitId(tripSlug, locName, startDate)` → `seed.visit.<tripSlug>.<kebab-loc>.<YYYY-MM-DD>`

  Consequence for editors: `createIfNotExists` is now genuinely idempotent. If you edit a fixture's content (e.g., add an item to a visit) and re-run *without* `--wipe-first`, the change will **not** propagate — the existing doc with the same `_id` wins. Always re-seed with `--wipe-first` when changing fixture content. `_key` on array-of-refs entries still uses `randomUUID()` (per-run churn there is harmless since Sanity only requires uniqueness within the array).

- **Dataset safety regex.** `startsWith('dev')` was too loose (would match hypothetical names like `devastating-prod`). Tightened to `/^dev(elopment)?([-_].*)?$/` — matches `dev`, `development`, `dev-foo`, `dev_foo`, `development-staging`, etc., but not arbitrary words starting with "dev". Pass `--force-any-dataset` to bypass.

- **Env file path is hardcoded to `.env.local`** (matches existing `scripts/seed.mts`). Users with differently-named env files (`.env.development`, `.dev.local`) should symlink or rename. Not worth adding a `--env-file` flag for a one-off seed script.

- **`_key` required on `items` array entries.** Sanity flags "Missing keys" otherwise. Use `randomUUID()` for the `_key` value — unlike `_id`, these don't need to be deterministic.

## Handoff / outputs consumed by later tickets

- **Fixture dataset** on a dev Sanity dataset — F3's verification matrix depends on the coverage cases above.
- No code handoff.

## How to verify

1. `cat .env.local | grep NEXT_PUBLIC_SANITY_DATASET` — confirm it starts with `dev`.
2. `npx tsx scripts/seed-phase5c.mts --dry-run` — plan log.
3. `npx tsx scripts/seed-phase5c.mts --wipe-first` — execute.
4. Open `/studio`:
   - 9+ locationDoc entries.
   - 10 trips (scroll to verify all present).
   - ≥ 14 visits.
5. Open `/globe` (if A3 has merged): pins visible at each location; Tokyo/Kyoto/Osaka arcs visible if C6 has merged; otherwise just pins.
6. Confirm at least one item doc has zero visits:
   ```
   npx tsx -e "const { createClient } = require('@sanity/client'); ..." (one-liner ok)
   ```
   or use the summary query the script already prints.
