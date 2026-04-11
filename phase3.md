# Phase 3: Article body rendering + responsive wardrobe scaling

## Overview

Phase 3 delivers two things: the article detail page (`/[slug]`) that renders rich content from Sanity, and responsive scaling of the wardrobe carousel so it fills the screen naturally on mobile, tablet, and desktop.

**Status:** In progress  
**Depends on:** Phase 2 (wardrobe carousel + 3D item rendering)

---

## What is done

### Responsive wardrobe scaling ✅

`WardrobeCarousel.tsx` computes a `scale` factor from viewport width relative to a 390 px reference (iPhone 14 Pro). All geometry — item dimensions, arc radius, shadow sizes, drag sensitivity, perspective — scales proportionally. Stage height takes the max of `55 vh − 48 px` (natural mobile feel) and `BASE_ITEM_H × scale + 100 px` (content requirement), so landscape desktop screens are not clamped to near 1×. Scale is hard-capped at 1.8× to prevent items from becoming enormous on ultra-wide monitors.

### Article body rendering ✅

`app/[slug]/page.tsx` fetches `ContentFull` from Sanity and renders:
- Content type badge + `<h1>` title
- Rich article body via `<PortableText>` with styled block, list, listItem, and marks components
- Locations timeline: label, date, optional PortableText body per location

### Wardrobe item body rendering ✅

`WardrobeCarousel.tsx` renders the active item's `body` field (also PortableText) below the museum label, with an `AnimatePresence` fade transition when switching items.

---

## Explicitly deferred

The following fetched fields are intentionally not rendered in Phase 3:

- **`location.coordinates`** — Each `Location` carries `{ lat, lng }` which is fetched and typed but not displayed. This is deferred to the globe view phase, where coordinates drive map pin placement.
- **`acquisition`** — `ContentFull.acquisition.location_index` is fetched and typed. It marks which entry in the `locations[]` array is where the item was acquired. Rendering this distinction (e.g., highlighting the acquisition entry in the timeline) is also deferred to the globe view phase, where the acquisition location is the primary pin.
- **Hotspot-aware image cropping** — `SanityImage` carries `hotspot` metadata and `urlFor()` supports `.focalPoint()`. Whether to use this for `fill`+`object-cover` images needs further research. All image steps below use basic `urlFor().width(N).url()` until this is resolved.

---

## What remains

Five fields are fetched in `contentBySlugQuery` and typed in `ContentFull` / `Location` but are never rendered on the article page, plus one latent query bug where a sixth field (`acquired_at`) is typed but not actually fetched.

### Step 0 — Fix `acquired_at` query mismatch (immediate, prerequisite)

**This is a bug.** `ContentSummary` (parent of `ContentFull`) declares `acquired_at?: string`. `allContentQuery` and `wardrobeContentQuery` both derive this field as:

```groq
"acquired_at": locations | order(sort_date asc)[0].sort_date,
```

But `contentBySlugQuery` does **not** include this derivation. As a result, `item.acquired_at` is always `undefined` on the article page even though the type says it may be a string. Any code on `/[slug]` that reads `item.acquired_at` will silently get `undefined`.

**What to do:**

Add the derived field to `contentBySlugQuery` in `lib/queries.ts`:

```ts
export const contentBySlugQuery = groq`
  *[_type == "content" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    content_type,
    body,
    cover_image,
    gallery,
    tags,
    published_at,
    "acquired_at": locations | order(sort_date asc)[0].sort_date,
    acquisition,
    locations[] | order(sort_date asc) {
      label,
      coordinates,
      sort_date,
      date_label,
      body,
      images,
    },
  }
`
```

**Files:** `lib/queries.ts`  
**Risk:** Low. Query-only change, no type changes needed.

---

### Step 1 — Cover image on the article page

`item.cover_image` (`SanityImage | undefined`) is available on `ContentFull` and is fetched by `contentBySlugQuery`. It is not rendered anywhere on `/[slug]`.

**What to do:**

Add a full-width cover image in `app/[slug]/page.tsx`. Place it after the Phase 4 transition slot comment and before the content type badge — the existing comment `{/* Navbar icon transition target will mount here — Phase 4 */}` marks a slot that Phase 4 will use at the top of `<main>`; the cover image goes immediately after it.

```tsx
import Image from 'next/image'
import { urlFor } from '@/lib/sanity'

{/* Navbar icon transition target will mount here — Phase 4 */}
{item.cover_image && (
  <div className="relative w-full aspect-[3/2] mb-10 overflow-hidden rounded-sm">
    <Image
      src={urlFor(item.cover_image).width(1200).url()}
      alt={item.title}
      fill
      className="object-cover"
      sizes="(max-width: 672px) 100vw, 672px"
      priority
    />
  </div>
)}
<span className="text-xs tracking-widest uppercase text-gray-300">{item.content_type}</span>
```

> **Portrait images:** `aspect-[3/2]` is a landscape crop. Wardrobe items are often photographed in portrait orientation. If the cover images in Sanity are portrait, they will be cropped significantly. This is an explicit design choice for now — the fixed aspect ratio gives the page a consistent, editorial feel. Revisit if the content warrants it.

> **Hotspot cropping:** Deferred. See "Explicitly deferred" section above.

**Files:** `app/[slug]/page.tsx`  
**Risk:** Low.

---

### Step 2 — Gallery images on the article page

`item.gallery` (`SanityImage[] | undefined`) is fetched by `contentBySlugQuery` but never rendered.

**What to do:**

Add a gallery section after the article body and before the locations timeline in `app/[slug]/page.tsx`:

```tsx
{item.gallery && item.gallery.length > 0 && (
  <section className="mt-12 flex flex-col gap-4">
    {item.gallery.map((img, i) => (
      <div key={img.asset?._ref ?? i} className="relative w-full aspect-[4/3] overflow-hidden rounded-sm">
        <Image
          src={urlFor(img).width(1200).url()}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 672px) 100vw, 672px"
        />
      </div>
    ))}
  </section>
)}
```

Use `img.asset?._ref` as the React key rather than array index — Sanity asset refs are stable identifiers and survive reordering.

**Files:** `app/[slug]/page.tsx`  
**Risk:** Low.

---

### Step 3 — Location images in the timeline

`loc.images` (`SanityImage[] | undefined`) is fetched per location in `contentBySlugQuery` and typed on `Location`, but the locations timeline renders only `label`, `date_label`/`sort_date`, and `body`.

**What to do:**

Add a horizontal scroll strip of location images below each location's body, inside the `{item.locations.map(...)}` loop:

```tsx
{loc.images && loc.images.length > 0 && (
  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
    {loc.images.map((img, j) => (
      <div key={img.asset?._ref ?? j} className="relative shrink-0 w-32 h-24 overflow-hidden rounded-sm">
        <Image
          src={urlFor(img).width(320).url()}
          alt=""
          fill
          className="object-cover"
          sizes="128px"
        />
      </div>
    ))}
  </div>
)}
```

Use `img.asset?._ref` as the React key for the same reason as Step 2.

**Files:** `app/[slug]/page.tsx`  
**Risk:** Low.

---

### Step 4 — Tags on the article page

`item.tags` (`string[] | undefined`) is fetched by `contentBySlugQuery` but never rendered.

**What to do:**

Render tags as a small inline list near the header — after the `<h1>` and before the article body. This keeps them in the metadata cluster at the top of the page.

```tsx
{item.tags && item.tags.length > 0 && (
  <div className="flex flex-wrap gap-2 mb-10">
    {item.tags.map((tag) => (
      <span key={tag} className="text-xs tracking-widest uppercase text-gray-300 border border-gray-200 px-2 py-1">
        {tag}
      </span>
    ))}
  </div>
)}
```

Place this immediately after the `<h1>` closing tag. Also change `mb-12` on the `<h1>` to `mb-6` — the current `mb-12` was spacing the title from the body, but with tags in between, the tags container's `mb-10` handles that gap instead.

**Files:** `app/[slug]/page.tsx`  
**Risk:** Low.

---

### Step 5 — Published date on the article page

`item.published_at` (`string`) is fetched but never displayed on the article page. The page currently shows no date anywhere.

**What to do:**

Render the formatted date as part of the header cluster, between the content type badge and the `<h1>`:

```tsx
<span className="text-xs tracking-widest uppercase text-gray-300">{item.content_type}</span>
<span className="text-xs text-gray-300 mt-1 block">
  {new Date(item.published_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}
</span>
<h1 className="text-3xl font-light text-black mt-2 mb-6">{item.title}</h1>
```

> Note: `published_at` is already typed as `string` on `ContentSummary`. `new Date(string)` is safe here since Sanity stores ISO 8601 dates.

**Files:** `app/[slug]/page.tsx`  
**Risk:** Low.

---

## Implementation order

Step 0 is a prerequisite and should be done first. Steps 1–5 are otherwise independent and all touch only `app/[slug]/page.tsx`.

1. **Step 0** — Fix `acquired_at` query. Unblocks correct data on the article page.
2. **Step 1** — Cover image. Most visible gap; gives pages a strong visual anchor.
3. **Step 4** — Tags. Header metadata, sits near content type and date.
4. **Step 5** — Published date. Completes the header metadata cluster.
5. **Step 2** — Gallery. Renders the `gallery` field that is otherwise silently dropped.
6. **Step 3** — Location images. Fills out the timeline with visual context.

All image steps (1, 2, 3) require:
- `import Image from 'next/image'`
- `import { urlFor } from '@/lib/sanity'`

Both imports are already used in the wardrobe components; adding them to the article page is the only new dependency.

---

## Success criteria

Phase 3 is complete when:

- [ ] `contentBySlugQuery` includes `acquired_at` derivation (matches `allContentQuery` and `wardrobeContentQuery`)
- [ ] An article with a `cover_image` shows it above the content type badge on `/[slug]`
- [ ] An article with `gallery` images shows them after the body text, using asset refs as React keys
- [ ] A location entry with `images` shows them in the timeline, using asset refs as React keys
- [ ] Tags are displayed below the `<h1>` when present
- [ ] `published_at` is displayed in the header metadata cluster
- [ ] All images use `next/image` with appropriate `sizes` and `urlFor` sizing
- [ ] Responsive wardrobe scaling works at 390 px, 768 px, and 1440 px viewports (already done)
- [ ] Article body PortableText renders paragraphs, headings, lists, and marks correctly (already done)
