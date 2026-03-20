/**
 * Uploads real cover images to Sanity and patches existing seed documents.
 * Run with: npx tsx scripts/add-images.mts
 *
 * Images sourced from Unsplash (free to use).
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

// Unsplash images — portrait crop, clothing/fashion
const imageMap: Record<string, string> = {
  'black-ma-1-bomber':
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&h=800&fit=crop&q=85',
  'linen-shirt-off-white':
    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&h=800&fit=crop&q=85',
  'silk-scarf-navy':
    'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=600&h=800&fit=crop&q=85',
  'white-denim-wide-leg':
    'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&h=800&fit=crop&q=85',
}

async function uploadFromUrl(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const asset = await client.assets.upload('image', buffer, {
    filename,
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
  })
  return asset
}

async function run() {
  console.log('\n  Fetching documents from Sanity...\n')

  const docs = await client.fetch<{ _id: string; slug: { current: string } }[]>(
    `*[_type == "content" && slug.current in $slugs]{ _id, slug }`,
    { slugs: Object.keys(imageMap) }
  )

  if (docs.length === 0) {
    console.error('  No matching documents found. Run seed.mts first.\n')
    process.exit(1)
  }

  for (const doc of docs) {
    const slug = doc.slug.current
    const imageUrl = imageMap[slug]
    if (!imageUrl) continue

    try {
      console.log(`  ↑ Uploading image for: ${slug}`)
      const asset = await uploadFromUrl(imageUrl, `${slug}.jpg`)

      await client
        .patch(doc._id)
        .set({
          cover_image: {
            _type: 'image',
            asset: { _type: 'reference', _ref: asset._id },
          },
        })
        .commit()

      console.log(`  ✓ Patched: ${slug}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ Failed: ${slug} — ${msg}`)
    }
  }

  console.log('\n  Done.\n')
}

run()
