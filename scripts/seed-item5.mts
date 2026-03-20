/**
 * Seeds the 5th wardrobe item into Sanity.
 * Run with: npx tsx scripts/seed-item5.mts
 */

import { createClient } from '@sanity/client'
import { config } from 'dotenv'

config({ path: '.env.local' })

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

const item = {
  _type: 'content',
  content_type: 'item',
  title: 'Chelsea Boots — Black Leather',
  slug: { _type: 'slug', current: 'chelsea-boots-black-leather' },
  body: [
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [
        {
          _type: 'span',
          _key: 's1',
          text: 'Found in a tiny shop off Portobello Road. Resoled twice. Going on a third.',
          marks: [],
        },
      ],
      markDefs: [],
    },
  ],
  tags: ['footwear', 'leather', 'london'],
  published_at: new Date('2021-09-04').toISOString(),
  locations: [
    {
      _type: 'location',
      _key: 'loc1',
      label: 'London, UK',
      coordinates: { lat: 51.5074, lng: -0.1278 },
      sort_date: '2021-09-01',
      date_label: 'September 2021',
      body: [
        {
          _type: 'block',
          _key: 'b2',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's2',
              text: 'Portobello Road Market, Notting Hill.',
              marks: [],
            },
          ],
          markDefs: [],
        },
      ],
    },
    {
      _type: 'location',
      _key: 'loc2',
      label: 'Amsterdam, Netherlands',
      coordinates: { lat: 52.3676, lng: 4.9041 },
      sort_date: '2022-04-12',
      date_label: 'April 2022',
    },
    {
      _type: 'location',
      _key: 'loc3',
      label: 'Berlin, Germany',
      coordinates: { lat: 52.52, lng: 13.405 },
      sort_date: '2022-11-20',
      date_label: 'November 2022',
    },
  ],
  acquisition: { location_index: 0 },
}

async function run() {
  try {
    const doc = await client.create(item)
    console.log(`\n  ✓ Created: ${item.title} (${doc._id})\n`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\n  ✗ Failed: ${msg}\n`)
    process.exit(1)
  }
}

run()
