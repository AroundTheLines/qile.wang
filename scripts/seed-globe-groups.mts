/**
 * Backfill globe_group values on existing content locations.
 *
 * Usage:
 *   npx tsx scripts/seed-globe-groups.mts
 *
 * This script fetches all content with locations, and for each location
 * that lacks a globe_group, derives one from the label field.
 * Requires manual editorial review — run with --dry-run first to see
 * what would be patched.
 */

import { createClient } from 'next-sanity'
import { config } from 'dotenv'

config({ path: '.env.local' })

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!
const token = process.env.SANITY_API_TOKEN

if (!token) {
  console.error('SANITY_API_TOKEN is required for write operations')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  useCdn: false,
  token,
})

const dryRun = process.argv.includes('--dry-run')

interface ContentDoc {
  _id: string
  title: string
  locations?: {
    _key: string
    label: string
    globe_group?: string
  }[]
}

async function main() {
  const docs: ContentDoc[] = await client.fetch(
    `*[_type == "content" && defined(locations)] {
      _id,
      title,
      locations[] { _key, label, globe_group }
    }`,
  )

  console.log(`Found ${docs.length} documents with locations\n`)

  let patchCount = 0

  for (const doc of docs) {
    if (!doc.locations) continue

    for (let i = 0; i < doc.locations.length; i++) {
      const loc = doc.locations[i]
      if (loc.globe_group) {
        console.log(`  [skip] ${doc.title} → ${loc.label} (already: "${loc.globe_group}")`)
        continue
      }

      // Derive globe_group from label — this is a best-guess.
      // Editorial review recommended.
      const globeGroup = loc.label
      console.log(`  [patch] ${doc.title} → ${loc.label} → globe_group: "${globeGroup}"`)

      if (!dryRun) {
        await client
          .patch(doc._id)
          .set({ [`locations[_key=="${loc._key}"].globe_group`]: globeGroup })
          .commit()
        patchCount++
      }
    }
  }

  if (dryRun) {
    console.log('\n(dry run — no changes made)')
  } else {
    console.log(`\nPatched ${patchCount} locations`)
  }
}

main().catch(console.error)
