/**
 * Phase 5C fixture seed.
 *
 * Usage:
 *   npx tsx scripts/seed-phase5c.mts --wipe-first          (deletes existing locationDoc, trip, visit docs first)
 *   npx tsx scripts/seed-phase5c.mts --dry-run             (logs plan, writes nothing)
 *   npx tsx scripts/seed-phase5c.mts                        (idempotent re-run — createIfNotExists on stable IDs)
 *
 * Doc IDs are derived deterministically from slugs/names (see stableId helpers),
 * so re-running without --wipe-first is a no-op rather than a duplicate seed.
 * To apply edits to an existing fixture, use --wipe-first.
 *
 * SAFETY: script refuses to run unless NEXT_PUBLIC_SANITY_DATASET matches
 *         /^dev(elopment)?([-_].*)?$/ or --force-any-dataset is passed.
 *         This prevents accidental production wipes.
 *
 * NOTE: Visits reference `content` docs with content_type == "item" by slug. If the
 * dataset has no such content docs, run `npx tsx scripts/seed.mts` first and re-run.
 */
import { createClient } from '@sanity/client'
import { config } from 'dotenv'
import { randomUUID } from 'crypto'

config({ path: '.env.local' })

const token = process.env.SANITY_API_TOKEN
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID

if (!token) {
  console.error(
    '\n  Missing SANITY_API_TOKEN in .env.local\n' +
      '  Get one at: https://sanity.io/manage → API → Tokens → Add token (Editor)\n',
  )
  process.exit(1)
}
if (!dataset || !projectId) {
  console.error('\n  Missing NEXT_PUBLIC_SANITY_DATASET or NEXT_PUBLIC_SANITY_PROJECT_ID in .env.local\n')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const wipeFirst = args.has('--wipe-first')
const forceAny = args.has('--force-any-dataset')

const DEV_DATASET_RE = /^dev(elopment)?([-_].*)?$/
if (!DEV_DATASET_RE.test(dataset) && !forceAny) {
  console.error(`Refusing to run on dataset '${dataset}'. Pass --force-any-dataset to override.`)
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

type SanityDoc = Record<string, unknown> & { _id: string; _type: string }

const doc = <T extends Record<string, unknown>>(_id: string, t: T & { _type: string }): SanityDoc =>
  ({ _id, ...t }) as SanityDoc
const slug = (s: string) => ({ _type: 'slug' as const, current: s })
const ref = (_ref: string) => ({ _type: 'reference' as const, _ref })
const key = () => randomUUID()

// Stable kebab — used to derive deterministic _id values so re-runs are idempotent.
const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const locationId = (name: string) => `seed.location.${kebab(name)}`
const tripId = (tripSlug: string) => `seed.trip.${tripSlug}`
const visitId = (tripSlug: string, locName: string, startDate: string) =>
  `seed.visit.${tripSlug}.${kebab(locName)}.${startDate}`

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
// Fixture definitions
// ------------------------------

const locationDefs: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Marrakech, Morocco', lat: 31.63, lng: -7.99 },
  { name: 'Tokyo, Japan', lat: 35.68, lng: 139.65 },
  { name: 'Kyoto, Japan', lat: 35.01, lng: 135.77 },
  { name: 'Osaka, Japan', lat: 34.69, lng: 135.5 },
  { name: 'Berlin, Germany', lat: 52.52, lng: 13.4 },
  { name: 'Lisbon, Portugal', lat: 38.72, lng: -9.14 },
  { name: 'San Francisco, USA', lat: 37.77, lng: -122.42 },
  { name: 'Seattle, USA', lat: 47.61, lng: -122.33 },
  { name: 'Sydney, Australia', lat: -33.87, lng: 151.21 },
  { name: 'New York, USA', lat: 40.71, lng: -74.01 },
]

const locations: SanityDoc[] = locationDefs.map(({ name, lat, lng }) =>
  doc(locationId(name), { _type: 'locationDoc', name, coordinates: { lat, lng } }),
)

const L = Object.fromEntries(locationDefs.map((l) => [l.name, locationId(l.name)])) as Record<string, string>

const tripDefs: Array<{ title: string; slug: string; body?: string }> = [
  { title: "Morocco '18", slug: 'morocco-2018', body: 'A week in Marrakech.' },
  { title: "Japan Spring '22", slug: 'japan-spring-2022', body: 'Three cities. Too much ramen.' },
  { title: "Berlin '22", slug: 'berlin-2022', body: 'First time. Kreuzberg.' },
  { title: "Berlin '24", slug: 'berlin-2024', body: 'Second time. Prenzlauer Berg.' },
  // No article body — tests grayed-out link.
  { title: 'Weekend in Lisbon', slug: 'weekend-in-lisbon' },
  { title: "SF Q4 '23", slug: 'sf-q4-2023', body: 'Work trip.' },
  { title: "Seattle Q4 '23", slug: 'seattle-q4-2023', body: 'Overlaps with SF.' },
  { title: 'NYC Day Trip', slug: 'nyc-day-trip', body: 'One day.' },
  { title: 'Round-the-World', slug: 'round-the-world', body: 'Everywhere.' },
  { title: 'Tokyo 2019', slug: 'tokyo-2019' },
]

const trips: SanityDoc[] = tripDefs.map(({ title, slug: s, body }) =>
  doc(tripId(s), {
    _type: 'trip',
    title,
    slug: slug(s),
    ...(body ? { articleBody: simpleBody(body) } : {}),
  }),
)

const T = Object.fromEntries(tripDefs.map((t) => [t.title, tripId(t.slug)])) as Record<string, string>
const TRIP_SLUG = Object.fromEntries(tripDefs.map((t) => [t.title, t.slug])) as Record<string, string>

const itemSlugsToUse = ['black-ma-1-bomber', 'silk-scarf-navy']

function buildVisits(itemIds: Record<string, string>): SanityDoc[] {
  const v = (
    tripTitle: string,
    locName: string,
    startDate: string,
    endDate: string,
    items: string[] = [],
  ) =>
    doc(visitId(TRIP_SLUG[tripTitle], locName, startDate), {
      _type: 'visit',
      startDate,
      endDate,
      location: ref(L[locName]),
      trip: ref(T[tripTitle]),
      items: items
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ _type: 'reference' as const, _ref: id, _key: key() })),
    })

  const bomber = itemIds['black-ma-1-bomber']
  const scarf = itemIds['silk-scarf-navy']

  return [
    v("Morocco '18", 'Marrakech, Morocco', '2018-05-10', '2018-05-17', [bomber]),

    v("Japan Spring '22", 'Tokyo, Japan', '2022-03-05', '2022-03-10', [scarf]),
    v("Japan Spring '22", 'Kyoto, Japan', '2022-03-10', '2022-03-14'),
    v("Japan Spring '22", 'Osaka, Japan', '2022-03-14', '2022-03-18', [bomber]),

    v("Berlin '22", 'Berlin, Germany', '2022-09-01', '2022-09-07', [scarf]),
    v("Berlin '24", 'Berlin, Germany', '2024-06-10', '2024-06-20'),

    v('Weekend in Lisbon', 'Lisbon, Portugal', '2023-02-17', '2023-02-19'),

    v("SF Q4 '23", 'San Francisco, USA', '2023-10-15', '2023-10-22'),
    v("Seattle Q4 '23", 'Seattle, USA', '2023-10-18', '2023-10-25'),

    v('NYC Day Trip', 'New York, USA', '2024-01-20', '2024-01-20'),

    v('Round-the-World', 'Tokyo, Japan', '2023-07-01', '2023-07-10'),
    v('Round-the-World', 'New York, USA', '2023-07-11', '2023-07-18'),
    v('Round-the-World', 'Sydney, Australia', '2023-07-19', '2023-07-25'),

    v('Tokyo 2019', 'Tokyo, Japan', '2019-04-01', '2019-04-10'),
  ]
}

// ------------------------------
// Run
// ------------------------------

async function maybeCreate(d: SanityDoc) {
  if (dryRun) {
    const label = (d as { title?: string; name?: string }).title ?? (d as { name?: string }).name ?? ''
    console.log('  [would create]', d._type, d._id, label)
    return
  }
  await client.createIfNotExists(d)
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

async function main() {
  console.log(`Dataset: ${dataset}${dryRun ? ' (dry run)' : ''}`)

  if (wipeFirst) {
    await wipe(['visit', 'trip', 'locationDoc'])
  }

  for (const l of locations) await maybeCreate(l)
  for (const t of trips) await maybeCreate(t)

  const itemIds = await resolveItemSlugs(itemSlugsToUse)
  const missing = itemSlugsToUse.filter((s) => !itemIds[s])
  if (missing.length) {
    console.warn(
      `  ⚠ Item slugs not found in dataset: ${missing.join(', ')}. ` +
        `Run 'npx tsx scripts/seed.mts' first to populate content docs. ` +
        `Visits referencing these slugs will be created without item refs.`,
    )
  }

  for (const v of buildVisits(itemIds)) await maybeCreate(v)

  const summary = await client.fetch(`{
    "trips": count(*[_type == "trip"]),
    "visits": count(*[_type == "visit"]),
    "locations": count(*[_type == "locationDoc"]),
    "orphanItems": count(*[_type == "content" && content_type == "item" && count(*[_type == "visit" && references(^._id)]) == 0])
  }`)
  console.log('Summary:', summary)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
