/**
 * Replaces cover images on all wardrobe items with transparent-background PNGs.
 * Downloads clean product-shot images, removes the white background using Sharp,
 * and uploads the resulting PNG to Sanity.
 *
 * Run with: npx tsx scripts/replace-images.mts
 */

import { createClient } from '@sanity/client'
import { config } from 'dotenv'
import sharp from 'sharp'

config({ path: '.env.local' })

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

// ── Images ────────────────────────────────────────────────────────────────────
// Each is a clean product shot on a white or near-white background.
// Background will be removed by the script; resulting PNG will be transparent.
const imageMap: Record<string, { url: string; filename: string }> = {
  'black-ma-1-bomber': {
    // Bomber jacket hanging on white background
    url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=95',
    filename: 'black-ma-1-bomber.png',
  },
  'linen-shirt-off-white': {
    // White/cream shirt flat lay on white surface
    url: 'https://images.unsplash.com/photo-1602810316498-ab67cf68c8e1?w=800&q=95',
    filename: 'linen-shirt-off-white.png',
  },
  'silk-scarf-navy': {
    // Draped scarf on light background
    url: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800&q=95',
    filename: 'silk-scarf-navy.png',
  },
  'white-denim-wide-leg': {
    // Jeans hanging on white background
    url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=95',
    filename: 'white-denim-wide-leg.png',
  },
  'chelsea-boots-black-leather': {
    // Chelsea boots on white background
    url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=95',
    filename: 'chelsea-boots-black-leather.png',
  },
}

// ── Background removal ────────────────────────────────────────────────────────
// Iterates over every pixel. Any pixel that is near-white (high brightness,
// low saturation) is made fully or partially transparent. Edges are softened
// with a partial-alpha band to avoid harsh jaggies.
async function removeBackground(inputBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const pixels = new Uint8Array(data.buffer)

  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4]
    const g = pixels[i * 4 + 1]
    const b = pixels[i * 4 + 2]

    const brightness = (r + g + b) / 3
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const saturation = maxC - minC

    if (brightness > 235 && saturation < 20) {
      // Pure white / near-white — fully transparent
      pixels[i * 4 + 3] = 0
    } else if (brightness > 210 && saturation < 30) {
      // Light-grey edge zone — soft alpha for anti-aliasing
      const t = (brightness - 210) / 25          // 0 at 210, 1 at 235
      pixels[i * 4 + 3] = Math.round(255 * (1 - t))
    }
    // All other pixels keep their original alpha (255)
  }

  return sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 8 })
    .toBuffer()
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n  Fetching documents from Sanity...\n')

  const slugs = Object.keys(imageMap)
  const docs = await client.fetch<{ _id: string; slug: { current: string } }[]>(
    `*[_type == "content" && slug.current in $slugs]{ _id, slug }`,
    { slugs }
  )

  if (docs.length === 0) {
    console.error('  No matching documents found. Run seed scripts first.\n')
    process.exit(1)
  }

  console.log(`  Found ${docs.length} document(s). Processing images...\n`)

  for (const doc of docs) {
    const slug = doc.slug.current
    const entry = imageMap[slug]
    if (!entry) continue

    try {
      // 1. Download
      console.log(`  ↓ Downloading: ${slug}`)
      const res = await fetch(entry.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = Buffer.from(await res.arrayBuffer())

      // 2. Remove white background
      console.log(`  ✂ Removing background: ${slug}`)
      const png = await removeBackground(raw)

      // 3. Upload to Sanity
      console.log(`  ↑ Uploading: ${entry.filename}`)
      const asset = await client.assets.upload('image', png, {
        filename: entry.filename,
        contentType: 'image/png',
      })

      // 4. Patch the document
      await client
        .patch(doc._id)
        .set({
          cover_image: {
            _type: 'image',
            asset: { _type: 'reference', _ref: asset._id },
          },
        })
        .commit()

      console.log(`  ✓ Done: ${slug}\n`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ Failed: ${slug} — ${msg}\n`)
    }
  }

  console.log('  All done.\n')
}

run()
