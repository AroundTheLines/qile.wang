/**
 * Seed script — inserts placeholder wardrobe items into Sanity.
 * Run with: npx tsx scripts/seed.mts
 *
 * Requires SANITY_API_TOKEN in .env.local with Editor or higher permissions.
 * Get one from: https://sanity.io/manage → your project → API → Tokens → Add token
 */

import { createClient } from '@sanity/client'
import { config } from 'dotenv'

config({ path: '.env.local' })

const token = process.env.SANITY_API_TOKEN
if (!token) {
  console.error(
    '\n  Missing SANITY_API_TOKEN in .env.local\n' +
    '  Get one at: https://sanity.io/manage → API → Tokens → Add token (Editor)\n'
  )
  process.exit(1)
}

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const items: any[] = [
  {
    _type: 'content',
    content_type: 'item',
    title: 'Black MA-1 Bomber',
    slug: { _type: 'slug', current: 'black-ma-1-bomber' },
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'Found at a vintage market in Seoul. Has been on more flights than most people.',
            marks: [],
          },
        ],
        markDefs: [],
      },
    ],
    tags: ['outerwear', 'vintage', 'korea'],
    published_at: new Date('2023-10-15').toISOString(),
    locations: [
      {
        _type: 'location',
        _key: 'loc1',
        label: 'Seoul, South Korea',
        coordinates: { lat: 37.5665, lng: 126.978 },
        sort_date: '2023-10-01',
        date_label: 'October 2023',
        body: [
          {
            _type: 'block',
            _key: 'b2',
            style: 'normal',
            children: [{ _type: 'span', _key: 's2', text: 'Picked it up at Gwangjang Market.', marks: [] }],
            markDefs: [],
          },
        ],
      },
      {
        _type: 'location',
        _key: 'loc2',
        label: 'Tokyo, Japan',
        coordinates: { lat: 35.6762, lng: 139.6503 },
        sort_date: '2023-12-10',
        date_label: 'December 2023',
      },
    ],
    acquisition: { location_index: 0 },
  },
  {
    _type: 'content',
    content_type: 'item',
    title: 'Linen Shirt — Off White',
    slug: { _type: 'slug', current: 'linen-shirt-off-white' },
    body: [
      {
        _type: 'block',
        _key: 'b3',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's3',
            text: 'A Lisbon market find. Wore it every hot day for two months straight.',
            marks: [],
          },
        ],
        markDefs: [],
      },
    ],
    tags: ['tops', 'summer', 'portugal'],
    published_at: new Date('2023-07-20').toISOString(),
    locations: [
      {
        _type: 'location',
        _key: 'loc3',
        label: 'Lisbon, Portugal',
        coordinates: { lat: 38.7169, lng: -9.1399 },
        sort_date: '2023-06-15',
        date_label: 'June 2023',
      },
      {
        _type: 'location',
        _key: 'loc4',
        label: 'Barcelona, Spain',
        coordinates: { lat: 41.3851, lng: 2.1734 },
        sort_date: '2023-07-18',
        date_label: 'July 2023',
      },
    ],
    acquisition: { location_index: 0 },
  },
  {
    _type: 'content',
    content_type: 'item',
    title: 'Silk Scarf — Navy',
    slug: { _type: 'slug', current: 'silk-scarf-navy' },
    body: [
      {
        _type: 'block',
        _key: 'b5',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's5',
            text: 'Gift from a market stall owner in Marrakech who insisted it would bring good luck.',
            marks: [],
          },
        ],
        markDefs: [],
      },
    ],
    tags: ['accessories', 'morocco', 'gifted'],
    published_at: new Date('2022-11-05').toISOString(),
    locations: [
      {
        _type: 'location',
        _key: 'loc7',
        label: 'Marrakech, Morocco',
        coordinates: { lat: 31.6295, lng: -7.9811 },
        sort_date: '2022-11-01',
        date_label: 'November 2022',
      },
      {
        _type: 'location',
        _key: 'loc8',
        label: 'Paris, France',
        coordinates: { lat: 48.8566, lng: 2.3522 },
        sort_date: '2023-03-20',
        date_label: 'March 2023',
      },
      {
        _type: 'location',
        _key: 'loc9',
        label: 'Tokyo, Japan',
        coordinates: { lat: 35.6762, lng: 139.6503 },
        sort_date: '2023-12-08',
        date_label: 'December 2023',
      },
    ],
    acquisition: { location_index: 0 },
  },
  {
    _type: 'content',
    content_type: 'item',
    title: 'White Denim — Wide Leg',
    slug: { _type: 'slug', current: 'white-denim-wide-leg' },
    body: [
      {
        _type: 'block',
        _key: 'b6',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's6',
            text: 'Bought online from a Japanese label. Incredible in photos. Never travel with them.',
            marks: [],
          },
        ],
        markDefs: [],
      },
    ],
    tags: ['bottoms', 'japan', 'studio-only'],
    published_at: new Date('2024-01-10').toISOString(),
    locations: [
      {
        _type: 'location',
        _key: 'loc10',
        label: 'Tokyo, Japan',
        coordinates: { lat: 35.6762, lng: 139.6503 },
        sort_date: '2024-01-01',
        date_label: 'January 2024',
      },
    ],
    acquisition: { location_index: 0 },
  },
  {
    _type: 'content',
    content_type: 'post',
    title: 'On Packing Light',
    slug: { _type: 'slug', current: 'on-packing-light' },
    body: [
      {
        _type: 'block',
        _key: 'b7',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's7',
            text: 'Everything I own that travels with me has earned its place. Here\'s how I think about it.',
            marks: [],
          },
        ],
        markDefs: [],
      },
    ],
    tags: ['travel', 'philosophy'],
    published_at: new Date('2024-02-01').toISOString(),
  },
]

async function seed() {
  console.log(`\n  Seeding ${items.length} documents into Sanity...\n`)

  for (const item of items) {
    try {
      const doc = await client.create(item)
      console.log(`  ✓ Created: ${item.title} (${doc._id})`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ Failed: ${item.title} — ${message}`)
    }
  }

  console.log('\n  Done.\n')
}

seed()
