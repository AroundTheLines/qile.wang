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

if (!dataset.startsWith('dev') && !forceAny) {
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

const doc = <T extends Record<string, unknown>>(t: T & { _type: string }): SanityDoc =>
  ({ _id: randomUUID(), ...t }) as SanityDoc
const slug = (s: string) => ({ _type: 'slug' as const, current: s })
const ref = (_ref: string) => ({ _type: 'reference' as const, _ref })
const key = () => randomUUID()

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

const locations: SanityDoc[] = [
  doc({ _type: 'locationDoc', name: 'Marrakech, Morocco', coordinates: { lat: 31.63, lng: -7.99 } }),
  doc({ _type: 'locationDoc', name: 'Tokyo, Japan', coordinates: { lat: 35.68, lng: 139.65 } }),
  doc({ _type: 'locationDoc', name: 'Kyoto, Japan', coordinates: { lat: 35.01, lng: 135.77 } }),
  doc({ _type: 'locationDoc', name: 'Osaka, Japan', coordinates: { lat: 34.69, lng: 135.5 } }),
  doc({ _type: 'locationDoc', name: 'Berlin, Germany', coordinates: { lat: 52.52, lng: 13.4 } }),
  doc({ _type: 'locationDoc', name: 'Lisbon, Portugal', coordinates: { lat: 38.72, lng: -9.14 } }),
  doc({ _type: 'locationDoc', name: 'San Francisco, USA', coordinates: { lat: 37.77, lng: -122.42 } }),
  doc({ _type: 'locationDoc', name: 'Seattle, USA', coordinates: { lat: 47.61, lng: -122.33 } }),
  doc({ _type: 'locationDoc', name: 'Sydney, Australia', coordinates: { lat: -33.87, lng: 151.21 } }),
  doc({ _type: 'locationDoc', name: 'New York, USA', coordinates: { lat: 40.71, lng: -74.01 } }),
]

const L = Object.fromEntries(locations.map((l) => [l.name as string, l._id])) as Record<string, string>

const trips: SanityDoc[] = [
  doc({ _type: 'trip', title: "Morocco '18", slug: slug('morocco-2018'), articleBody: simpleBody('A week in Marrakech.') }),
  doc({ _type: 'trip', title: "Japan Spring '22", slug: slug('japan-spring-2022'), articleBody: simpleBody('Three cities. Too much ramen.') }),
  doc({ _type: 'trip', title: "Berlin '22", slug: slug('berlin-2022'), articleBody: simpleBody('First time. Kreuzberg.') }),
  doc({ _type: 'trip', title: "Berlin '24", slug: slug('berlin-2024'), articleBody: simpleBody('Second time. Prenzlauer Berg.') }),
  // No article body — tests grayed-out link.
  doc({ _type: 'trip', title: 'Weekend in Lisbon', slug: slug('weekend-in-lisbon') }),
  doc({ _type: 'trip', title: "SF Q4 '23", slug: slug('sf-q4-2023'), articleBody: simpleBody('Work trip.') }),
  doc({ _type: 'trip', title: "Seattle Q4 '23", slug: slug('seattle-q4-2023'), articleBody: simpleBody('Overlaps with SF.') }),
  doc({ _type: 'trip', title: 'NYC Day Trip', slug: slug('nyc-day-trip'), articleBody: simpleBody('One day.') }),
  doc({ _type: 'trip', title: 'Round-the-World', slug: slug('round-the-world'), articleBody: simpleBody('Everywhere.') }),
  doc({ _type: 'trip', title: 'Tokyo 2019', slug: slug('tokyo-2019') }),
]

const T = Object.fromEntries(trips.map((t) => [t.title as string, t._id])) as Record<string, string>

const itemSlugsToUse = ['black-ma-1-bomber', 'silk-scarf-navy']

function buildVisits(itemIds: Record<string, string>): SanityDoc[] {
  const v = (startDate: string, endDate: string, locId: string, tripId: string, items: string[] = []) =>
    doc({
      _type: 'visit',
      startDate,
      endDate,
      location: ref(locId),
      trip: ref(tripId),
      items: items
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ _type: 'reference' as const, _ref: id, _key: key() })),
    })

  const bomber = itemIds['black-ma-1-bomber']
  const scarf = itemIds['silk-scarf-navy']

  return [
    v('2018-05-10', '2018-05-17', L['Marrakech, Morocco'], T["Morocco '18"], [bomber]),

    v('2022-03-05', '2022-03-10', L['Tokyo, Japan'], T["Japan Spring '22"], [scarf]),
    v('2022-03-10', '2022-03-14', L['Kyoto, Japan'], T["Japan Spring '22"]),
    v('2022-03-14', '2022-03-18', L['Osaka, Japan'], T["Japan Spring '22"], [bomber]),

    v('2022-09-01', '2022-09-07', L['Berlin, Germany'], T["Berlin '22"], [scarf]),
    v('2024-06-10', '2024-06-20', L['Berlin, Germany'], T["Berlin '24"]),

    v('2023-02-17', '2023-02-19', L['Lisbon, Portugal'], T['Weekend in Lisbon']),

    v('2023-10-15', '2023-10-22', L['San Francisco, USA'], T["SF Q4 '23"]),
    v('2023-10-18', '2023-10-25', L['Seattle, USA'], T["Seattle Q4 '23"]),

    v('2024-01-20', '2024-01-20', L['New York, USA'], T['NYC Day Trip']),

    v('2023-07-01', '2023-07-10', L['Tokyo, Japan'], T['Round-the-World']),
    v('2023-07-11', '2023-07-18', L['New York, USA'], T['Round-the-World']),
    v('2023-07-19', '2023-07-25', L['Sydney, Australia'], T['Round-the-World']),

    v('2019-04-01', '2019-04-10', L['Tokyo, Japan'], T['Tokyo 2019']),
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
