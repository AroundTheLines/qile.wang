# Phase 3: Article body rendering, responsive wardrobe scaling, and article reveal

## Overview

Phase 3 delivers three things: the article detail content (Steps 0–6), responsive scaling of the wardrobe carousel (already done), and the inline article reveal that keeps the wardrobe mounted during reading (Phase 3b, Steps 7–11).

**Routing decision:** Article content is revealed inline below the wardrobe using Next.js parallel routes + intercepting routes. When a user taps the centered wardrobe item, `router.push` triggers a Next.js client-side navigation to `/[slug]`. An intercepting route inside the wardrobe segment catches this navigation and renders the article content in a parallel `@article` slot below the carousel — the wardrobe stays mounted, the URL updates correctly, and Back/Forward work natively. When someone navigates directly to `/[slug]` (hard nav, refresh, or shared link), the intercepting route does not fire and the standalone `app/[slug]/page.tsx` renders the article without the wardrobe. This satisfies URL shareability, phase 4 scroll tracking, and correct browser history without any `history.pushState` hacks.

**Status:** In progress  
**Depends on:** Phase 2 (wardrobe carousel + 3D item rendering)

---

## What is done

### Responsive wardrobe scaling ✅

`WardrobeCarousel.tsx` computes a `scale` factor from viewport width relative to a 390 px reference (iPhone 14 Pro). All geometry — item dimensions, arc radius, shadow sizes, drag sensitivity, perspective — scales proportionally. Stage height takes the max of `55 vh − 48 px` (natural mobile feel) and `BASE_ITEM_H × scale + 100 px` (content requirement), so landscape desktop screens are not clamped to near 1×. Scale is hard-capped at 1.8× to prevent items from becoming enormous on ultra-wide monitors.

### Baseline article page at `/[slug]` ✅

`app/[slug]/page.tsx` fetches `ContentFull` and renders: content type badge, `<h1>` title, rich article body via `<PortableText>`, and a locations timeline with label, date, and optional PortableText body per location. This page serves direct navigation (shared links, refresh). It will be refactored in Step 9 to share rendering logic with the inline reveal.

---

## Explicitly deferred

- **`location.coordinates`** — `{ lat, lng }` is fetched and typed but not displayed. Deferred to the globe view phase.
- **`acquisition.location_index`** — marks the acquisition entry in `locations[]`. Deferred to the globe view phase.
- **Hotspot-aware image cropping** — `SanityImage` carries `hotspot` metadata. All image steps use basic `urlFor().width(N).url()` until this is resolved.
- **`retired_at` / "still in rotation"** — the spec derives `retired_at` from the latest `location.sort_date` and uses it to show whether an item is still in rotation. This field is not fetched, not typed, and not rendered. Explicitly deferred to a future phase.

---

## What remains

### Step 0 — Fix `acquired_at` query mismatch (prerequisite)

**This is a bug.** `contentBySlugQuery` does not include the `acquired_at` derivation that `allContentQuery` and `wardrobeContentQuery` both have. As a result, `item.acquired_at` is always `undefined` on the article page even though `ContentSummary` declares it as `acquired_at?: string`.

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

### Step 1 — Strip `body` from `wardrobeContentQuery` and `ContentSummary`

**This is a scalability prerequisite for Phase 3b.** `wardrobeContentQuery` currently fetches the `body` field (full PortableText) for every wardrobe item. `ContentSummary` types it as `body?: PortableTextBlock[]`. At scale (hundreds to thousands of items), this is a large unnecessary payload — the carousel only needs display metadata. Full article content is fetched on demand in Phase 3b when an item is selected.

**What to do:**

1. Remove `body` from `wardrobeContentQuery` in `lib/queries.ts`:

```ts
export const wardrobeContentQuery = groq`
  *[_type == "content" && content_type == "item"] | order(published_at desc) {
    _id,
    title,
    slug,
    content_type,
    cover_image,
    tags,
    published_at,
    "acquired_at": locations | order(sort_date asc)[0].sort_date,
  }
`
```

2. Remove `body` from `ContentSummary` in `lib/types.ts`:

```ts
export interface ContentSummary {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  tags?: string[]
  published_at: string
  acquired_at?: string
}
```

3. Remove the inline body rendering block from `WardrobeCarousel.tsx` (lines inside the `AnimatePresence` block that renders `activeItem?.body`). Also remove the `bodyComponents` PortableText config at the top of the file — it is no longer needed in the carousel. The article body will render in the `@article` slot (Step 10).

**Files:** `lib/queries.ts`, `lib/types.ts`, `components/wardrobe/WardrobeCarousel.tsx`  
**Risk:** Low. The body rendering in the carousel is replaced by the `@article` slot. TypeScript will surface any remaining references to `ContentSummary.body` that need to be removed.

---

### Step 2 — Install `@chenglou/pretext`, add `AnimatePresence` fade, and pre-size the museum label

This step does three things that belong together: (1) installs pretext, (2) wraps the museum label in `AnimatePresence` for the first time — it currently has no fade animation at all, it just swaps values instantly — and (3) uses pretext to pre-size the container so there is no layout shift when the fade plays.

**`@chenglou/pretext` is not yet installed.** Install it:

```bash
npm install @chenglou/pretext
```

**The current museum label has no `AnimatePresence`.** The existing code is a plain conditional render:

```tsx
{activeItem && (
  <div className="shrink-0 text-center px-6">
    ...
  </div>
)}
```

This step replaces it entirely. The `<div>` becomes a `<motion.div>`, wrapped in `<AnimatePresence mode="wait">` so the old label fades out before the new one fades in on item change.

**Pretext pre-sizing:** `layout()` from `@chenglou/pretext` computes the rendered height of the title text before the fade starts, so the container is already the right size when `opacity` transitions from 0 → 1. Without this, the container height would animate from 0 (or a previous item's height) during the fade, causing a jump.

The museum label `<h2>` uses `text-xl font-light` (Tailwind: 20px, weight 300) with the Geist variable font. The CSS `font` shorthand passed to `prepare` must exactly match the resolved CSS value — a mismatch silently produces wrong measurements. The correct string is approximately:

```ts
const font = `300 20px/1.4 var(--font-geist), sans-serif`
```

Verify by inspecting the element in dev tools and reading `window.getComputedStyle(el).font`. Adjust if there is any discrepancy.

**Width passed to `layout()`:** The label container uses `px-6` (24 px each side = 48 px total padding). The effective text width for line-breaking is `textMaxWidth - 48`, not `textMaxWidth`. Pass the adjusted value:

```ts
const preparedTitle = activeItem ? prepare(activeItem.title, font) : null
const labelLayout = preparedTitle
  ? layout(preparedTitle, textMaxWidth - 48, 1.4 * 20) // lineHeight in px = lineHeight × fontSize
  : null
```

**Full replacement in JSX:**

```tsx
import { prepare, layout } from '@chenglou/pretext'
import { AnimatePresence, motion } from 'framer-motion'

// Replace the existing static museum label block:
<AnimatePresence mode="wait">
  {activeItem && (
    <motion.div
      key={activeItem._id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="shrink-0 text-center px-6"
      style={labelLayout ? { minHeight: labelLayout.height } : undefined}
    >
      <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400">
        {activeItem.content_type}
        {activeItem.acquired_at ? ` · ${new Date(activeItem.acquired_at).getFullYear()}` : ''}
      </p>
      <h2 className="text-xl font-light text-black mt-1.5 tracking-wide">
        {activeItem.title}
      </h2>
      {activeItem.tags && activeItem.tags.length > 0 && (
        <p className="text-[10px] tracking-widest uppercase text-gray-300 mt-2">
          {activeItem.tags.join(' · ')}
        </p>
      )}
    </motion.div>
  )}
</AnimatePresence>
```

> **Note:** `prepare` and `layout` are synchronous and DOM-free — they do not trigger reflow. Call them during render, not in a `useEffect`. The result is stable for the same inputs so it is safe to call on every render without memoization (the library is designed for this).

**Files:** `package.json`, `components/wardrobe/WardrobeCarousel.tsx`  
**Risk:** Low-medium. The font string must match the resolved CSS exactly. Test at 390 px, 768 px, and 1440 px viewport widths with items whose titles span one line, two lines, and three lines. Verify the fade plays correctly when swiping between items — the old label should fade out completely before the new one fades in.

---

### Step 3 — Create shared `ArticleContent` component

Steps 4–8 define the fields to render in the article. Rather than writing this rendering logic twice (once for the intercept page in Phase 3b, once for the standalone `/[slug]` page), extract it into a shared Server Component.

**What to do:**

Create `components/ArticleContent.tsx`. This component accepts `item: ContentFull` and renders the full article layout. It is a Server Component (no `'use client'` directive) — all data is passed as props, no client-side state needed.

```tsx
import Image from 'next/image'
import { PortableText } from '@portabletext/react'
import type { ContentFull } from '@/lib/types'
import { urlFor } from '@/lib/sanity'
import { portableTextComponents } from '@/lib/portableTextComponents'

export default function ArticleContent({ item }: { item: ContentFull }) {
  return (
    <div className="w-full px-6 pt-0 pb-16 max-w-2xl mx-auto">
      {/* Steps 4–8 render here */}
    </div>
  )
}
```

Also extract the `portableTextComponents` config from `app/[slug]/page.tsx` into `lib/portableTextComponents.ts` so it can be shared. The carousel's `bodyComponents` was removed in Step 1; `app/[slug]/page.tsx` has the same config inline — move it to the shared location.

**Files:** `components/ArticleContent.tsx` (new), `lib/portableTextComponents.ts` (new)  
**Risk:** Low. Pure extraction.

---

### Step 4 — Cover image in `ArticleContent`

`item.cover_image` is available on `ContentFull` but not rendered anywhere on the article page.

Add a full-width cover image at the top of `ArticleContent`, before the content type badge:

```tsx
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
```

> **Portrait images:** `aspect-[3/2]` is a landscape crop. If cover images in Sanity are portrait-oriented, they will be significantly cropped. This is an intentional design choice for editorial consistency. Revisit if the content warrants it.

**Files:** `components/ArticleContent.tsx`  
**Risk:** Low.

---

### Step 5 — Header metadata cluster in `ArticleContent`

Render the content type badge, published date, acquired year, and title together as a header cluster. After Step 0, `acquired_at` is available on `ContentFull`.

```tsx
<span className="text-xs tracking-widest uppercase text-gray-300">{item.content_type}</span>
<span className="text-xs text-gray-300 mt-1 block">
  {new Date(item.published_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}
  {item.acquired_at
    ? ` · acquired ${new Date(item.acquired_at).getFullYear()}`
    : ''}
</span>
<h1 className="text-3xl font-light text-black mt-2 mb-6">{item.title}</h1>
```

> `acquired_at` is the earliest `location.sort_date`. Showing just the year keeps it compact. The full date is available in the locations timeline below.

**Files:** `components/ArticleContent.tsx`  
**Risk:** Low. Depends on Step 0 for `acquired_at` to be non-undefined.

---

### Step 6 — Tags in `ArticleContent`

Render tags as a small inline list below the `<h1>`:

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

**Files:** `components/ArticleContent.tsx`  
**Risk:** Low.

---

### Step 7 — Gallery images in `ArticleContent`

`item.gallery` is fetched by `contentBySlugQuery` but never rendered. Add a gallery section after the article body and before the locations timeline:

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

Use `img.asset?._ref` as the React key — Sanity asset refs are stable identifiers that survive reordering.

**Files:** `components/ArticleContent.tsx`  
**Risk:** Low.

---

### Step 8 — Location images in `ArticleContent`

`loc.images` is fetched per location but the timeline only renders label, date, and body. Add a horizontal scroll strip of images below each location's body:

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

**Files:** `components/ArticleContent.tsx`  
**Risk:** Low.

---

### Step 9 — Refactor `app/[slug]/page.tsx` to use `ArticleContent`

After Steps 3–8 build `ArticleContent`, replace the inline rendering in `app/[slug]/page.tsx` with the shared component. The standalone page is for direct navigation and does not include the entrance animation.

```tsx
import ArticleContent from '@/components/ArticleContent'

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const item: ContentFull | null = await client.fetch(contentBySlugQuery, { slug })
  if (!item) return notFound()

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-12">
        <ArticleContent item={item} />
      </main>
    </>
  )
}
```

**Files:** `app/[slug]/page.tsx`  
**Risk:** Low. Behavior is identical; this is pure extraction.

---

## Phase 3b — Inline article reveal via parallel + intercepting routes

### Architecture

```
app/
  wardrobe/
    @article/
      default.tsx              ← null (no article selected)
      (..)[slug]/
        page.tsx               ← intercept: article below wardrobe
    layout.tsx                 ← Navbar + children (wardrobe) + article slot
    page.tsx                   ← wardrobe carousel (unchanged except Navbar removal)
  [slug]/
    page.tsx                   ← standalone article for direct navigation (Step 9)
```

**Routing behavior:**
- **Soft nav from `/wardrobe` → `/[slug]`**: intercepting route fires. `children` (wardrobe) stays mounted. `@article` slot renders article content. URL becomes `/[slug]`. Back returns to `/wardrobe` with article slot cleared.
- **Hard nav / refresh / direct link to `/[slug]`**: intercepting route does not fire. `app/[slug]/page.tsx` renders. Wardrobe is not shown. This is the expected behavior for shared links.

**Note on `(..)` convention**: The `(..)` in `app/wardrobe/@article/(..)[slug]/` is based on route segments, not the file system. `@article` is a slot (not a segment) and is ignored by the convention. `[slug]` is one route segment above `wardrobe` (both are root-level segments). `(..)` is therefore correct.

---

### Step 10 — Create `app/wardrobe/layout.tsx`

Move `<Navbar />` and the outer `<main>` wrapper from `app/wardrobe/page.tsx` into a new layout. The layout receives `children` (the wardrobe page) and `article` (the `@article` slot).

This layout is also where the Boneyard skeleton registry must be imported. The registry must be loaded once, high in the tree, before any `<Skeleton>` component renders — the layout is the right place.

```tsx
// app/wardrobe/layout.tsx
import Navbar from '@/components/Navbar'
import '@/bones/registry'

export default function WardrobeLayout({
  children,
  article,
}: {
  children: React.ReactNode
  article: React.ReactNode
}) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white flex flex-col items-center pt-12">
        {children}
        {article}
      </main>
    </>
  )
}
```

> **Note:** `bones/registry` does not exist until the Boneyard CLI has been run (Step 11 post-task). The import will cause a build error until then. If you create this layout before running the CLI, comment out the registry import and uncomment it after.
```

Update `app/wardrobe/page.tsx` to remove `<Navbar />` and the `<main>` wrapper — those now live in the layout:

```tsx
// app/wardrobe/page.tsx
export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { wardrobeContentQuery } from '@/lib/queries'
import type { ContentSummary } from '@/lib/types'
import WardrobeShell from '@/components/wardrobe/WardrobeShell'

export default async function WardrobePage() {
  const items: ContentSummary[] = await client.fetch(wardrobeContentQuery)
  return <WardrobeShell items={items} />
}
```

**Files:** `app/wardrobe/layout.tsx` (new), `app/wardrobe/page.tsx`  
**Risk:** Low. Behavior is identical; this is structural extraction.

---

### Step 11 — Create `@article` default, intercepting page, loading skeleton, and `ArticleReveal`

Install Boneyard before creating these files:

```bash
npm install boneyard-js
```

---

**`app/wardrobe/@article/default.tsx`** — returns null so the slot is empty when no article is selected:

```tsx
export default function Default() {
  return null
}
```

---

**`app/wardrobe/@article/(..)[slug]/page.tsx`** — the intercepting page. Fetches `ContentFull` server-side and renders it wrapped in both the Boneyard `<Skeleton>` (so bones can be captured from this render) and the `ArticleReveal` entrance animation:

```tsx
import { client } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound } from 'next/navigation'
import { Skeleton } from 'boneyard-js/react'
import ArticleContent from '@/components/ArticleContent'
import ArticleReveal from '@/components/ArticleReveal'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function InterceptedArticlePage({ params }: Props) {
  const { slug } = await params
  const item: ContentFull | null = await client.fetch(contentBySlugQuery, { slug })
  if (!item) return notFound()

  return (
    <ArticleReveal>
      <Skeleton name="article-content" loading={false} animate="shimmer">
        <ArticleContent item={item} />
      </Skeleton>
    </ArticleReveal>
  )
}
```

---

**`app/wardrobe/@article/loading.tsx`** — shown by Next.js while the intercepting page server-renders and fetches. Uses the captured Boneyard skeleton so the user sees a pixel-accurate placeholder:

```tsx
import { Skeleton } from 'boneyard-js/react'

export default function Loading() {
  return <Skeleton name="article-content" loading={true} animate="shimmer" />
}
```

---

**`components/ArticleReveal.tsx`** — a Client Component that wraps article content with the fade-and-rise entrance animation:

```tsx
'use client'

import { motion } from 'framer-motion'

export default function ArticleReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="w-full"
    >
      {children}
    </motion.div>
  )
}
```

> **Why wrap rather than animate inside `ArticleContent`:** `ArticleContent` is a Server Component. Framer Motion's `motion.div` requires a Client Component. The `ArticleReveal` wrapper pattern keeps the content server-rendered (good for loading performance) while enabling the entrance animation. This is the standard Next.js App Router approach for animating server-fetched content.

---

**Post-step: capture the skeleton with the Boneyard CLI.** After this step is complete and the dev server is running with real Sanity content, run:

```bash
npx boneyard-js build
```

This navigates to the article page, captures the rendered DOM of `ArticleContent`, and writes `bones/article-content.bones.json` + `bones/registry.ts`. Once the registry exists, uncomment the registry import in `app/wardrobe/layout.tsx` (added in Step 10). The `loading.tsx` will not work correctly until the CLI has been run.

**Files:** `app/wardrobe/@article/default.tsx` (new), `app/wardrobe/@article/(..)[slug]/page.tsx` (new), `app/wardrobe/@article/loading.tsx` (new), `components/ArticleReveal.tsx` (new)  
**Risk:** Medium. This introduces the new routing primitives. Verify behavior across four scenarios: (1) soft nav from wardrobe → article, (2) direct nav to `/[slug]`, (3) refresh while on intercepted `/[slug]`, (4) browser Back from intercepted state. Also verify the skeleton appears during the fetch on a throttled connection (Chrome DevTools → Network → Slow 3G).

---

### Step 12 — Add navigation trigger in `WardrobeCarousel`

Currently tapping any carousel item calls `goTo(i)`, which only animates the carousel. There is no navigation to `/[slug]`. Per the spec, tapping the **already-centered** item triggers navigation; tapping a non-centered item centers it.

In `WardrobeCarousel.tsx`:

```tsx
import { useRouter } from 'next/navigation'

// Inside the component:
const router = useRouter()

// Update the WardrobeItem onClick:
<WardrobeItem
  key={item._id}
  item={item}
  index={i}
  offset={offset}
  scale={scale}
  onClick={() => {
    if (i === activeIndex) {
      router.push('/' + item.slug.current, { scroll: false })
    } else {
      goTo(i)
    }
  }}
/>
```

`scroll: false` prevents Next.js from scrolling to the top on navigation. The user stays at the wardrobe, and can scroll down to read the article that has appeared below.

> **Cursor / tap affordance:** The centered item should visually communicate that it is tappable. Consider changing the cursor to `pointer` on the center item only (i.e., conditioned on `i === activeIndex`). This can be done via a prop passed to `WardrobeItem` or by updating the stage container's cursor when `isDragging` is false and a hover is detected on the center item.

**Files:** `components/wardrobe/WardrobeCarousel.tsx`  
**Risk:** Low. Single behavioral change to an existing click handler.

---

## Implementation order

Steps have the following dependencies:

1. **Step 0** — Fix `acquired_at` query. Prerequisite for Step 5.
2. **Step 1** — Strip `body` from query and type. Prerequisite for Phase 3b (the `@article` slot takes over body rendering). Also removes TypeScript errors that would surface in Step 11.
3. **Step 2** — Install pretext, add `AnimatePresence` to museum label, and integrate pre-sizing. Independent; can run alongside Steps 3–9.
4. **Step 3** — Create `ArticleContent` shell and extract `portableTextComponents`. Prerequisite for Steps 4–9.
5. **Steps 4–8** — Fill in `ArticleContent` fields. All independent of each other; any order.
6. **Step 9** — Refactor `app/[slug]/page.tsx` to use `ArticleContent`. Requires Step 3.
7. **Step 10** — Create `app/wardrobe/layout.tsx` (with registry import commented out). Can run alongside Steps 3–9.
8. **Step 11** — Create `@article` slot, `loading.tsx`, and `ArticleReveal`. Requires Steps 3, 9, and 10.
9. **Boneyard CLI** — Run `npx boneyard-js build` after Step 11 with the dev server running. Uncomment registry import in `layout.tsx` once `bones/registry.ts` exists.
10. **Step 12** — Add navigation trigger in `WardrobeCarousel`. Requires Step 11 to be testable end-to-end.

Steps 2 and 10 are fully independent and can be done in parallel with the `ArticleContent` chain.

---

## Success criteria

Phase 3 is complete when:

- [ ] `contentBySlugQuery` includes `acquired_at` derivation
- [ ] `wardrobeContentQuery` does not fetch `body`; `ContentSummary` does not declare `body`
- [ ] `@chenglou/pretext` is installed; museum label is wrapped in `AnimatePresence mode="wait"` and fades between items; container is pre-sized by pretext before the fade plays
- [ ] `ArticleContent` component exists and is used by both the intercepting page and `app/[slug]/page.tsx`
- [ ] An article with a `cover_image` shows it at the top of `ArticleContent`
- [ ] Header metadata cluster renders: content type badge, published date, `acquired_at` year, title
- [ ] Tags are displayed below the `<h1>` when present
- [ ] `gallery` images render after the body, using asset refs as React keys
- [ ] Location `images` render as a horizontal scroll strip in the timeline, using asset refs as React keys
- [ ] `app/wardrobe/layout.tsx` exists and owns `<Navbar />` and `<main>`
- [ ] `boneyard-js` is installed; `bones/registry.ts` exists and is imported in `app/wardrobe/layout.tsx`
- [ ] `app/wardrobe/@article/default.tsx` returns null
- [ ] `app/wardrobe/@article/loading.tsx` renders the Boneyard skeleton while the article fetches
- [ ] `app/wardrobe/@article/(..)[slug]/page.tsx` intercepts navigation from `/wardrobe` and renders article content wrapped in `<Skeleton>` and `ArticleReveal`
- [ ] Soft nav from `/wardrobe` → `/slug`: wardrobe stays mounted, article fades in below, URL updates to `/slug`
- [ ] Hard nav / refresh to `/slug`: standalone `app/[slug]/page.tsx` renders (no wardrobe)
- [ ] Browser Back from intercepted `/slug` returns to `/wardrobe` with article slot cleared
- [ ] Tapping a non-centered carousel item centers it; tapping the already-centered item navigates to its article
- [ ] All images use `next/image` with appropriate `sizes` and `urlFor` sizing
- [ ] Responsive wardrobe scaling works at 390 px, 768 px, and 1440 px viewports (already done)
