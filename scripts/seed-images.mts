/**
 * Attaches images to every seeded fixture so the local UI has full visual data
 * for end-to-end testing — cover_image + gallery on every content & trip doc,
 * plus one image per location entry inside item articles.
 *
 * Run AFTER scripts/seed-phase5c.mts:
 *   npx tsx scripts/seed-phase5c.mts
 *   npx tsx scripts/seed-images.mts
 *
 * Flags:
 *   --dry-run            (log plan, write nothing)
 *   --force-any-dataset  (bypass dev-dataset safety rail)
 *   --skip-fully-imaged  (skip docs that already have cover + gallery + (for
 *                         items) per-location images — avoids double-uploads
 *                         on a re-run, but won't paper over a partial run)
 *
 * Images come from picsum.photos with deterministic seeds — no auth, no
 * rate limits, same images every run. Network access required.
 *
 * SAFETY: refuses to run unless NEXT_PUBLIC_SANITY_DATASET matches
 *         /^dev(elopment)?([-_].*)?$/ or --force-any-dataset is passed.
 */
import { createClient } from '@sanity/client'
import { config } from 'dotenv'
import { randomUUID } from 'crypto'

config({ path: '.env.local' })

const token = process.env.SANITY_API_TOKEN
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID

if (!token || !dataset || !projectId) {
  console.error('\n  Missing SANITY_API_TOKEN / NEXT_PUBLIC_SANITY_DATASET / NEXT_PUBLIC_SANITY_PROJECT_ID in .env.local\n')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const forceAny = args.has('--force-any-dataset')
const skipFullyImaged = args.has('--skip-fully-imaged')

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

// ------------------------------
// Image source: picsum.photos
// ------------------------------
// Deterministic per seed string. Falls back to retry on transient network errors.

function picsumUrl(seed: string, w: number, h: number) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`
}

const assetCache = new Map<string, string>() // seed → asset _id (within this run)

async function uploadImage(seed: string, w: number, h: number, label: string): Promise<string> {
  const cacheKey = `${seed}:${w}x${h}`
  const cached = assetCache.get(cacheKey)
  if (cached) return cached

  const url = picsumUrl(seed, w, h)
  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const asset = await client.assets.upload('image', buf, {
        filename: `${label}.jpg`,
        contentType: res.headers.get('content-type') ?? 'image/jpeg',
      })
      assetCache.set(cacheKey, asset._id)
      return asset._id
    } catch (err) {
      lastErr = err
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

const imageRef = (assetId: string, withKey = false) => ({
  _type: 'image' as const,
  ...(withKey ? { _key: randomUUID() } : {}),
  asset: { _type: 'reference' as const, _ref: assetId },
})

// ------------------------------
// Patch plan
// ------------------------------

type ImageRef = { asset?: { _ref: string } }

type ContentDoc = {
  _id: string
  slug: { current: string }
  title: string
  content_type: 'item' | 'post'
  cover_image?: ImageRef
  galleryCount: number
  locations?: Array<{ _key: string; label: string; imageCount: number }>
}

type TripDoc = {
  _id: string
  slug: { current: string }
  title: string
  cover_image?: ImageRef
  galleryCount: number
}

const COVER_W = 1200
const COVER_H = 1500 // 4:5 portrait, common for clothing/editorial
const GALLERY_W = 1200
const GALLERY_H = 1500
const TRIP_COVER_W = 1600
const TRIP_COVER_H = 1067 // 3:2 landscape for travel
const LOC_W = 1200
const LOC_H = 800

const ITEM_GALLERY_COUNT = 3
const TRIP_GALLERY_COUNT = 4

function isFullyImaged(d: ContentDoc): boolean {
  if (!d.cover_image?.asset?._ref) return false
  if (d.galleryCount < ITEM_GALLERY_COUNT) return false
  if (d.content_type === 'item') {
    const locs = d.locations ?? []
    if (locs.some((l) => l.imageCount < 1)) return false
  }
  return true
}

async function patchContent(d: ContentDoc) {
  if (skipFullyImaged && isFullyImaged(d)) {
    console.log(`  ↷ skip ${d.slug.current} (fully imaged)`)
    return
  }
  const slug = d.slug.current
  const isItem = d.content_type === 'item'
  const w = isItem ? COVER_W : TRIP_COVER_W
  const h = isItem ? COVER_H : TRIP_COVER_H

  if (dryRun) {
    const galleryN = ITEM_GALLERY_COUNT
    const locN = (d.locations ?? []).length
    console.log(`  [dry] ${d.content_type} ${slug} → cover + ${galleryN} gallery + ${locN} location images`)
    return
  }

  console.log(`  ↑ ${d.content_type} ${slug} cover…`)
  const coverId = await uploadImage(`${slug}-cover`, w, h, `${slug}-cover`)

  console.log(`  ↑ ${slug} gallery (${ITEM_GALLERY_COUNT})…`)
  const galleryAssets = await Promise.all(
    Array.from({ length: ITEM_GALLERY_COUNT }, (_, i) =>
      uploadImage(`${slug}-g${i + 1}`, GALLERY_W, GALLERY_H, `${slug}-g${i + 1}`),
    ),
  )

  let patchedLocations: Array<Record<string, unknown>> | undefined
  if (isItem && d.locations?.length) {
    console.log(`  ↑ ${slug} location images (${d.locations.length})…`)
    patchedLocations = await Promise.all(
      d.locations.map(async (loc, i) => {
        const assetId = await uploadImage(
          `${slug}-loc${i + 1}`,
          LOC_W,
          LOC_H,
          `${slug}-loc${i + 1}`,
        )
        return {
          _key: loc._key,
          images: [imageRef(assetId, true)],
        }
      }),
    )
  }

  const setOps: Record<string, unknown> = {
    cover_image: imageRef(coverId),
    gallery: galleryAssets.map((id) => imageRef(id, true)),
  }

  let p = client.patch(d._id).set(setOps)
  if (patchedLocations) {
    for (const loc of patchedLocations) {
      p = p.set({ [`locations[_key=="${loc._key}"].images`]: loc.images })
    }
  }
  await p.commit()
  console.log(`  ✓ ${slug}`)
}

async function patchTrip(d: TripDoc) {
  if (skipFullyImaged && d.cover_image?.asset?._ref && d.galleryCount >= TRIP_GALLERY_COUNT) {
    console.log(`  ↷ skip trip ${d.slug.current} (fully imaged)`)
    return
  }
  const slug = d.slug.current

  if (dryRun) {
    console.log(`  [dry] trip ${slug} → cover + ${TRIP_GALLERY_COUNT} gallery`)
    return
  }

  console.log(`  ↑ trip ${slug} cover…`)
  const coverId = await uploadImage(`trip-${slug}-cover`, TRIP_COVER_W, TRIP_COVER_H, `trip-${slug}-cover`)

  console.log(`  ↑ trip ${slug} gallery (${TRIP_GALLERY_COUNT})…`)
  const galleryAssets = await Promise.all(
    Array.from({ length: TRIP_GALLERY_COUNT }, (_, i) =>
      uploadImage(`trip-${slug}-g${i + 1}`, TRIP_COVER_W, TRIP_COVER_H, `trip-${slug}-g${i + 1}`),
    ),
  )

  await client
    .patch(d._id)
    .set({
      cover_image: imageRef(coverId),
      gallery: galleryAssets.map((id) => imageRef(id, true)),
    })
    .commit()
  console.log(`  ✓ trip ${slug}`)
}

// ------------------------------
// Run
// ------------------------------

async function main() {
  console.log(`Dataset: ${dataset}${dryRun ? ' (dry run)' : ''}${skipFullyImaged ? ' (skip-fully-imaged)' : ''}\n`)

  const [contentDocs, tripDocs] = await Promise.all([
    client.fetch<ContentDoc[]>(`*[_type == "content"]{
      _id, slug, title, content_type, cover_image,
      "galleryCount": count(gallery),
      "locations": locations[]{ _key, label, "imageCount": count(images) }
    } | order(slug.current asc)`),
    client.fetch<TripDoc[]>(`*[_type == "trip"]{
      _id, slug, title, cover_image,
      "galleryCount": count(gallery)
    } | order(slug.current asc)`),
  ])

  console.log(`Found ${contentDocs.length} content docs, ${tripDocs.length} trip docs\n`)

  // Sequential per-doc to keep upload concurrency moderate (assets within a doc
  // upload in parallel, but docs are processed one at a time).
  console.log('— Content (items + posts) —')
  for (const d of contentDocs) {
    try {
      await patchContent(d)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${d.slug.current}: ${msg}`)
    }
  }

  console.log('\n— Trips —')
  for (const d of tripDocs) {
    try {
      await patchTrip(d)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ trip ${d.slug.current}: ${msg}`)
    }
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
