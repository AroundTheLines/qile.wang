# Phase 4: Scroll-driven item → navbar transition

## Overview

As the user scrolls past the wardrobe stage, the currently centered sleeve — the whole glossy acrylic object, including its gloss sweep, rim highlight, and drop shadow — shrinks from its carousel position up into the top-right of the navbar, where it persists as a miniature sleeve-shaped icon while the user reads the article. Scrolling back up reverses the transition with a spring feel, and the icon expands back into the carousel's centered position.

On first load of `/wardrobe/*` the navbar is nearly empty: only a home/back affordance on the left. The right side has nothing visible until the transit element arrives there as the user scrolls. The transit element **is** the navbar icon at `progress = 1` — there is no swap or handoff between "flying sleeve" and "mounted icon."

**Status:** Planning
**Depends on:** Phase 3 (article body rendering + responsive wardrobe scaling) — ✅ complete

---

## Design decisions driving the plan

These were settled during Phase 4 planning and should not be relitigated during implementation. They shape several steps below.

- **Transit source = the entire acrylic sleeve**, not just the cover image. Gloss, rim highlight, refraction streak, and drop shadow all travel with the transit element.
- **Icon shape = sleeve-shaped**, not circular. Border radius stays at whatever the sleeve has throughout; there is no `borderRadius 0 → 50%` morph.
- **Navbar is wardrobe-scoped.** Phase 4 introduces a new `WardrobeNavbar` component under `components/wardrobe/`, used only by the wardrobe layout. The existing shared `components/Navbar.tsx` is left alone and continues to serve `/feed` and `/[slug]`. Other routes will get their own navbar variants later; there is no "one navbar that handles all routes" anymore.
- **Navbar at rest = home/back button on the left, nothing on the right.** The right area has an invisible measurement anchor so the transit element knows where to aim, but nothing is rendered there until the transit lands.
- **No hysteresis, no handoff swap.** Because the transit element stays mounted and is fixed-positioned, it can simply be the icon at `progress = 1`. The step-9 "fade transit out, fade permanent icon in" mechanism from earlier drafts is deleted.
- **Return = scroll-driven with spring quality.** `transitProgress` is wrapped in `useSpring` so both scroll-down (sleeve shrinks into icon) and scroll-up (icon expands back into sleeve) have a spring feel. Tapping the icon triggers `scrollIntoView`, which drives the same spring reversal.
- **Icon always tracks the carousel's active item.** No divergence, no pinning to "the article's item" — the two are defined to be the same thing for the lifetime of the wardrobe layout.

---

## Ground truth: current code state

Before reading the plan below, keep these facts about the current code in mind — earlier drafts of this document assumed a structure that does not exist.

- **`app/wardrobe/layout.tsx` is a Server Component.** It fetches `wardrobeContentQuery`, then renders `<Navbar />`, `<main>` containing `<WardrobeShell items={items} />` followed by `{children}` (the article content), then a bottom fade scrim. **`Navbar` and `WardrobeShell` are siblings**, not parent/child.
- **`components/Navbar.tsx` is already a Client Component** (`'use client'`) and is shared by `/wardrobe`, `/feed`, and `/[slug]`. Phase 4 does **not** modify it. Instead, a new wardrobe-local `components/wardrobe/WardrobeNavbar.tsx` is introduced and swapped in under the wardrobe layout only. The shared `Navbar` keeps working unchanged for `/feed` and `/[slug]`.
- **`components/wardrobe/WardrobeShell.tsx` is a 19-line `'use client'` wrapper** whose only job is to import `WardrobeCarousel` via `next/dynamic` with `ssr: false`. It owns no state and renders no wrapping element of its own.
- **`WardrobeCarousel` currently owns `activeIndex`** internally and derives its initial value from the pathname. It owns the 3D perspective container, the drag math, and the museum label.
- **The wardrobe stage uses CSS 3D transforms** (`perspective`, `preserve-3d`). Any descendant of that container with `position: fixed` will be positioned relative to the transformed ancestor, not the viewport. This is a CSS gotcha the transit element must avoid.

---

## Architecture

```
app/wardrobe/layout.tsx  (Server Component — fetches items)
  └── <WardrobeProvider items={items}>         ← NEW, 'use client', replaces WardrobeShell
        ├── <WardrobeNavbar />                  ← NEW, wardrobe-only; home/back on left, invisible measurement anchor on right
        ├── <main ...>
        │     ├── <div ref={shellRef}>          ← scroll target for useScroll
        │     │     └── <WardrobeCarousel />    ← reads/updates context
        │     └── {children}                    ← article content (unchanged)
        ├── <WardrobeTransit />                 ← NEW, fixed, outside the 3D context, reads context
        └── <div> bottom scrim                  ← moved here from layout
```

Key architectural decisions and the constraints driving them:

- **`WardrobeShell` is renamed to `WardrobeProvider` and promoted from a thin `next/dynamic` wrapper into a full Client Component context provider.** It still owns the dynamic import of `WardrobeCarousel` (the SSR boundary is unchanged), but it now also holds all shared wardrobe state, renders `WardrobeNavbar` and the transit element as siblings of the carousel, and exposes a `WardrobeContext` so that `WardrobeCarousel`, `WardrobeTransit`, and `WardrobeNavbar` can all read and update the same state without any of them being parents of each other.
- **The carousel item lives inside a CSS 3D perspective container.** Framer Motion's `layoutId` FLIP mechanism is unreliable inside 3D transform contexts because the FLIP measurement is distorted by the parent perspective. The correct primitive is a **fixed-position transit element rendered outside the 3D context entirely**, driven by a spring-wrapped `useTransform` over `scrollYProgress`. `WardrobeTransit` is therefore rendered as a child of `WardrobeProvider` directly, not as a descendant of the carousel.
- **The transit element is the icon.** At `progress = 1` the transit element sits exactly over the invisible navbar anchor, at its final size, and *is* the persistent navbar icon. There is no second "permanently mounted" icon that fades in — the transit element stays mounted for the lifetime of the wardrobe layout.
- **A new wardrobe-local `WardrobeNavbar` component exists only under the wardrobe layout.** The shared `components/Navbar.tsx` is untouched and keeps serving `/feed` and `/[slug]`. No attempt is made to reuse one navbar across all routes.

---

## Shared state: `WardrobeContext`

The provider owns this shape and exposes it through `WardrobeContext`:

```ts
type WardrobeContextValue = {
  // Content
  items: ContentSummary[]
  activeIndex: number
  setActiveIndex: (index: number) => void
  activeItem: ContentSummary | null

  // Source (centered sleeve) measurement — pushed from WardrobeCarousel
  sourceRect: DOMRectLike | null
  reportSourceRect: (rect: DOMRectLike | null) => void

  // Target (invisible navbar anchor) measurement — ref attached by WardrobeNavbar, read by provider
  navbarAnchorRef: React.RefObject<HTMLDivElement | null>
  targetRect: DOMRectLike | null

  // Transit animation
  transitProgress: MotionValue<number>   // 0..1, spring-wrapped, drives WardrobeTransit

  // Actions
  scrollToShell: () => void              // called by the transit element on tap
}
```

`WardrobeContext` lives inside the wardrobe layout and is never imported by code outside `components/wardrobe/`. There is no need to handle a `null` context — `useWardrobeContext()` can throw if called outside the provider, since the only consumers (`WardrobeCarousel`, `WardrobeTransit`, `WardrobeNavbar`) all live under it. The shared `components/Navbar.tsx` does not consume the context at all.

---

## Steps

Dependencies are called out per step; an aggregate implementation order is at the bottom.

### Step 1 — Create `WardrobeContext`, `WardrobeProvider`, and `WardrobeNavbar`

Delete `components/wardrobe/WardrobeShell.tsx` and replace it with three new files:

1. `components/wardrobe/WardrobeContext.tsx` — exports the context, a `useWardrobeContext()` hook (throws if used outside the provider), and the `WardrobeContextValue` type.
2. `components/wardrobe/WardrobeProvider.tsx` (`'use client'`) — holds all state, keeps the `next/dynamic` import of `WardrobeCarousel` (with `ssr: false`), renders `<WardrobeNavbar />`, the shell wrapper around `<WardrobeCarousel />`, `{children}`, `<WardrobeTransit />`, and the bottom scrim.
3. `components/wardrobe/WardrobeNavbar.tsx` (`'use client'`) — wardrobe-only navbar. At this step it renders just a home/back affordance on the left and an empty right area. It does not yet attach the measurement anchor or consume the context for transit purposes. The shared `components/Navbar.tsx` is left untouched.

At the end of this step, `WardrobeProvider` is functionally equivalent to the old `WardrobeShell` plus a wardrobe-local navbar — the carousel still loads, articles still render, and the visual result is unchanged from Phase 3 except that `/wardrobe/*` is now using `WardrobeNavbar` instead of the shared `Navbar`. The state surface and transit element are added in later steps.

**Files:** `components/wardrobe/WardrobeShell.tsx` (delete), `components/wardrobe/WardrobeProvider.tsx` (new), `components/wardrobe/WardrobeContext.tsx` (new), `components/wardrobe/WardrobeNavbar.tsx` (new).

**Risk:** Low. Pure structural move plus a navbar fork. Visually verify `/wardrobe`, `/feed`, and `/[slug]` all still render — `/feed` and `/[slug]` should continue using the shared `Navbar`.

---

### Step 2 — Turn `app/wardrobe/layout.tsx` into a thin wrapper

The wardrobe layout becomes:

```tsx
export default async function WardrobeLayout({ children }: { children: React.ReactNode }) {
  const items: ContentSummary[] = await client.fetch(wardrobeContentQuery)
  return <WardrobeProvider items={items}>{children}</WardrobeProvider>
}
```

The `<WardrobeNavbar />`, `<main>`, and bottom scrim move out of the server layout and into `WardrobeProvider`'s render tree. The wardrobe layout's only responsibilities are now data fetching and forwarding children. The shared `components/Navbar.tsx` is no longer imported by `app/wardrobe/layout.tsx` at all.

**Files:** `app/wardrobe/layout.tsx`.

**Risk:** Low, but exercise the wardrobe route end-to-end after this change before moving on. Any regression in scroll behavior or article rendering will be caught here and not conflated with the later transit work.

---

### Step 3 — Lift `activeIndex` out of `WardrobeCarousel`

`activeIndex` and the derived `activeItem` currently live inside `WardrobeCarousel`. Move them into `WardrobeProvider`'s state, expose them through `WardrobeContext`, and have the carousel read and update them via the context.

- `WardrobeProvider` owns `useState<number>(initialIndex)`. The initial index derivation from the pathname (currently done inside the carousel) moves into the provider.
- `WardrobeCarousel` calls `useWardrobeContext()` and reads `activeIndex` / calls `setActiveIndex`. Drag snap, dot indicators, prev/next buttons, and the museum label all continue to work; only the storage location of the state changes.
- The context does not need to know anything about drag offsets or spring state — those stay inside the carousel.

**Files:** `WardrobeProvider.tsx`, `WardrobeCarousel.tsx`.

**Risk:** Low. Pure state lift with no behavior change. Verify that URL-based initial selection still works on direct navigation to `/wardrobe/[slug]`.

---

### Step 4 — Attach `shellRef` and derive `transitProgress`

`WardrobeProvider` introduces a `<div ref={shellRef}>` wrapper around `<WardrobeCarousel />` and computes:

```ts
const { scrollYProgress } = useScroll({
  target: shellRef,
  offset: ["start start", "end start"],
})

const rawProgress = useTransform(scrollYProgress, [0, 0.3], [0, 1], { clamp: true })
const transitProgress = useSpring(rawProgress, {
  stiffness: 220,
  damping: 30,
  mass: 0.6,
})
```

The shell wrapper is introduced explicitly (instead of trying to ref an element inside the carousel) so the scroll target is stable and does not require threading a ref through `next/dynamic`. The shell wrapper has no padding, margin, or styling of its own — it exists only to be the scroll observation target.

`transitProgress` is the spring-wrapped version and is what goes into the context. Wrapping the raw scroll-derived value in `useSpring` is what gives both the shrink-down (scroll down) and the expand-back (scroll up) their spring quality. The spring runs in both directions automatically — no separate "return" code path is needed. Stiffness/damping/mass are tunables; tune them so the expand-back feels assertive without overshooting past the centered sleeve position.

The `0.3` upper bound on the `useTransform` input is a tunable that controls how much scroll distance the raw transit takes before the spring takes over. Pick a value that feels natural relative to the visible wardrobe stage height on mobile (the primary target). On a phone screen the wardrobe occupies a much larger fraction of the viewport than on desktop, so the natural value will be larger than it would be desktop-first.

**Files:** `WardrobeProvider.tsx`.

**Risk:** Low. Non-visual.

---

### Step 5 — Source rect: measure the centered sleeve

Attach a ref to the centered sleeve element inside `WardrobeCarousel`. Use a `useLayoutEffect` to measure it and push the result into the context via `reportSourceRect(rect)`. Re-run the measurement when:

- The carousel mounts
- `activeIndex` changes
- A `ResizeObserver` attached to the sleeve fires
- Window `resize` fires (for the scale multiplier that drives all wardrobe dimensions)

**Important:**

- Measurement code lives **inside `WardrobeCarousel`**, not inside `WardrobeProvider`. `WardrobeCarousel` is loaded with `ssr: false`, so `useLayoutEffect` runs only in the browser and does not produce SSR warnings.
- `getBoundingClientRect()` on an element inside a `perspective` parent returns the projected 2D screen rectangle, which is exactly what the transit element needs.
- Only the **centered** sleeve is measured. Non-centered sleeves are rotated (`rotAngle`), foreshortened, and partially transparent. They are never transit sources.
- The measurement must be pushed into the context **eagerly on mount**, not lazily on first scroll. If `sourceRect` is still `null` when the user starts scrolling, the transit element will not have anything to render from and will appear to jump into place.

**Files:** `WardrobeCarousel.tsx`, `WardrobeItem.tsx` (if the ref needs to be forwarded from the item).

**Risk:** Medium. Layout bugs manifest as a visible jump at the start of the transition. Keep the measurement and the snap-spring reconciled — measure after the drag-snap settles, not mid-spring.

---

### Step 6 — Target rect: measure the invisible navbar anchor

`WardrobeNavbar` mounts an **invisible measurement anchor** in its top-right area. This anchor's only job is to occupy the exact rectangle the transit element should land in when `progress = 1`. It is never visible, never receives content, and never participates in pointer events.

```tsx
// Inside WardrobeNavbar.tsx
const ctx = useWardrobeContext()

return (
  <nav className="...">
    <HomeBackButton className="justify-self-start" />
    {/* invisible target anchor — the transit element will land here */}
    <div
      ref={ctx.navbarAnchorRef}
      aria-hidden
      className="justify-self-end w-12 h-16 invisible pointer-events-none"
    />
  </nav>
)
```

Two important points:

1. **The anchor must have the same dimensions as the icon end-state.** Tailwind sizing classes like `w-12 h-16` (or whatever sleeve aspect ratio the icon should have — keep it sleeve-shaped, not square) lock the size in CSS so layout is stable on first paint. Pick dimensions that match the desired icon size; the transit element's `transform: scale()` end-state will resolve to exactly these dimensions.
2. **Use `invisible` (CSS `visibility: hidden`), not `opacity-0` and not conditional rendering.** `visibility: hidden` keeps the element in layout (so its bounding rect is meaningful) while ensuring nothing paints there. The transit element will be the only thing visible at that location, both during the flight and at rest.

`WardrobeProvider` measures the anchor on mount, on window resize, and via a `ResizeObserver`:

```ts
useEffect(() => {
  const el = navbarAnchorRef.current
  if (!el) return
  const measure = () => setTargetRect(toRectLike(el.getBoundingClientRect()))
  measure()
  const ro = new ResizeObserver(measure)
  ro.observe(el)
  window.addEventListener("resize", measure)
  return () => { ro.disconnect(); window.removeEventListener("resize", measure) }
}, [])
```

Use `useEffect` here (not `useLayoutEffect`) because `WardrobeProvider` runs through the server render path. A `typeof window !== 'undefined'` guard or a `useIsomorphicLayoutEffect` helper are acceptable alternatives; the key constraint is that no DOM measurement runs on the server.

**Files:** `WardrobeNavbar.tsx`, `WardrobeProvider.tsx`.

**Risk:** Medium. The most common bug here is rendering anything visible inside the anchor, which would show through behind the transit element. Keep the anchor strictly invisible — it is a layout placeholder, not a slot.

---

### Step 7 — `WardrobeTransit` component

Create `components/wardrobe/WardrobeTransit.tsx` (`'use client'`). It reads `sourceRect`, `targetRect`, `activeItem`, and `transitProgress` from `useWardrobeContext()`. It returns `null` until both rects are non-null and there is an active item.

`WardrobeTransit` renders the **whole acrylic sleeve** — the same sleeve component (or a faithful sibling that accepts the same item shape) used by `WardrobeItem` for the centered position, including gloss sweep, rim highlight, refraction streak, and drop shadow. The transit element is the literal visual continuation of the centered sleeve, just lifted out of the 3D stage and into a fixed-position wrapper. It is not a generic `<img>` of the cover image — that would lose all of the sleeve's visual identity mid-flight.

The wrapper is a single `motion.div` with `position: fixed` and `pointer-events: auto` (it needs to be tappable to trigger `scrollToShell` — see Step 10). It is **rendered as a direct child of `WardrobeProvider`**, at the same level as `<main>`. This placement is load-bearing: `WardrobeTransit` must not be a descendant of any element with a CSS `transform` applied, or `position: fixed` will be positioned relative to that transformed ancestor instead of the viewport. The carousel's 3D stage uses `transform`/`perspective`, so the transit element must live outside it.

#### Do not animate `width`/`height`/`top`/`left` directly

These are layout-affecting properties and force a reflow on every frame. Instead, fix the element at its **end state** (icon size, navbar anchor position) and use `transform: translate() scale()` to make it appear at the source position at `progress = 0`:

```ts
const scaleX = useTransform(transitProgress, [0, 1], [sourceRect.width / targetRect.width, 1])
const scaleY = useTransform(transitProgress, [0, 1], [sourceRect.height / targetRect.height, 1])
const translateX = useTransform(transitProgress, [0, 1], [sourceRect.x - targetRect.x, 0])
const translateY = useTransform(transitProgress, [0, 1], [sourceRect.y - targetRect.y, 0])
```

Apply as `transform: translate(x, y) scale(sx, sy)` with `transform-origin: top left`. **Do not animate `borderRadius`** — the icon is a tiny sleeve, not a circle. Border radius stays at whatever the sleeve already has throughout the transit.

Opacity stays `1` throughout the entire scroll range, including at `progress = 1` where the transit element *is* the persistent navbar icon. There is no fade-out, no swap, no second mounted icon. The element remains mounted for the lifetime of the wardrobe layout.

**Aspect ratio:** because `scaleX` and `scaleY` come from independent ratios, the transit element is free to non-uniformly scale if `sourceRect` and `targetRect` have different aspect ratios. Make the navbar anchor's aspect ratio match the centered sleeve's aspect ratio so the transit looks like a uniform shrink, not a squish. A sleeve aspect ratio (taller than wide) is the right shape for the anchor.

**Development tip:** During first build, apply `border: 1px solid red` to the transit element. It should sit exactly over the centered sleeve at `progress = 0` and exactly over the invisible navbar anchor at `progress = 1`. Any gap is a measurement bug, not a math bug.

**Files:** `components/wardrobe/WardrobeTransit.tsx` (new), `WardrobeProvider.tsx` (render site).

**Risk:** Medium. Transform math + transform-origin are easy to get subtly wrong, and rendering the full acrylic sleeve component (vs. a stripped-down image) may surface assumptions in the sleeve's styling about being inside the 3D stage. Be ready to extract the sleeve visual into a shared, position-agnostic component if necessary.

---

### Step 8 — Hide the centered sleeve (and its shadow) while the transit is active

Once `transitProgress > 0`, the centered carousel sleeve and the transit element would be visually doubled. Hide the centered sleeve.

**Do not remove it from layout.** The carousel math depends on item count and geometric positions. If the center item collapses, the side items will shift and fight the transit element.

Use `opacity: 0` or `visibility: hidden` on the center sleeve only, conditioned on `transitProgress > 0`. The cleanest implementation is to read `transitProgress` inside `WardrobeCarousel` via a `useMotionValueEvent` subscription or a derived `useTransform` applied as `style={{ opacity }}`.

**Drop shadow must also be hidden.** Per the design decision in the overview, the drop shadow travels with the transit element as part of the sleeve visual. If the wardrobe stage paints its own shadow under the centered slot (independently of the sleeve element), there will be a doubled shadow during transit and a stranded shadow after the sleeve has shrunk away. Audit `WardrobeItem.tsx` and the carousel-stage CSS for shadows attached to the slot rather than the sleeve, and gate them on `transitProgress === 0` the same way the sleeve itself is gated. The simplest invariant: at any moment, exactly one drop shadow exists for the active item — either the centered-sleeve shadow (when `progress === 0`) or the transit element's shadow (when `progress > 0`), never both and never neither.

**Files:** `WardrobeCarousel.tsx`, `WardrobeItem.tsx`.

**Risk:** Low for the sleeve hide; medium for the shadow audit, which depends on where the existing Phase 2/3 shadow CSS actually lives.

---

### Step 9 — Tap-to-return: transit element scrolls back to the shell

There is no handoff and no second icon. Once `transitProgress` reaches `1`, the transit element is sitting exactly over the invisible navbar anchor at icon size — that *is* the persistent navbar icon. It stays mounted, stays at `opacity: 1`, and stays interactive for the lifetime of the wardrobe layout.

The transit element's `onClick` calls `scrollToShell()` from the context:

```ts
const scrollToShell = () => {
  shellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
}
```

Scrolling reverses `scrollYProgress`, which reverses the spring-wrapped `transitProgress`, which reverses every `useTransform` mapping automatically. The spring (configured in Step 4) is what gives the expand-back its character: as the user crosses the threshold by scrolling up, the icon doesn't just track scroll 1:1 — it springs out toward the centered sleeve position with the configured stiffness/damping/mass. This is the feel the spec calls for ("the navbar icon expands and transforms back into the full wardrobe sleeve").

**Pointer events:** because the transit element is the only interactive surface for the icon, it must be `pointer-events: auto` (set in Step 7), and the invisible navbar anchor must be `pointer-events: none` (set in Step 6) so it never absorbs taps when the transit element is positioned over it.

**Files:** `WardrobeTransit.tsx` (onClick wiring), `WardrobeProvider.tsx` (`scrollToShell` implementation in the context value).

**Risk:** Low. The hardest part — the spring feel — is already done by Step 4's `useSpring` wrap; Step 9 just provides a way to programmatically kick the scroll.

---

### Step 10 — Scroll restoration and mid-page landing (QA, not new code)

If the user navigates back to this page with the browser restoring a non-zero scroll position, `scrollYProgress` will already be non-zero on mount. The transit element has no "catch up" logic — it derives its visual state from the current `scrollYProgress` via `useTransform`, so it will render correctly at whatever progress value is current, **provided both rects have been measured before the first paint**.

The risk points:

- `sourceRect` is measured inside `WardrobeCarousel` in a `useLayoutEffect`. The carousel is client-only, so this is safe.
- `targetRect` is measured inside `WardrobeProvider` in a `useEffect`. This runs after first paint, which means there is exactly one frame where `targetRect` is `null` and `WardrobeTransit` returns `null`. This is acceptable: the transit element is simply absent for one frame on mid-page landing, then appears at its correct progress value.

This step is QA. Load `/wardrobe/some-slug` with the browser having a restored scroll position near the article and confirm no visible jumps or flicker.

**Risk:** Low.

---

## Implementation order

1. **Step 1** — Rename + provider + context + new `WardrobeNavbar`. Non-behavioral, unblocks everything.
2. **Step 2** — Thin wardrobe layout. Non-behavioral.
3. **Step 3** — Lift `activeIndex` into context. Non-visual.
4. **Step 4** — `shellRef` + spring-wrapped `transitProgress`. Non-visual.
5. **Step 5** — Source rect measurement. Verifiable in isolation via console logs.
6. **Step 6** — Invisible navbar anchor + target rect measurement. Same.
7. **Step 7** — Build `WardrobeTransit` rendering the full acrylic sleeve. First visible result. Use the red-border trick to verify alignment at both ends.
8. **Step 8** — Hide the centered sleeve and its drop shadow.
9. **Step 9** — Tap-to-return wiring on the transit element.
10. **Step 10** — Scroll restoration QA.

Steps 1–4 are pure plumbing and can be committed independently before any visible work starts. Steps 5 and 6 can be done in parallel once Step 4 is done. Everything from Step 7 onward is strictly sequential.

---

## Phase 5 compatibility notes

Phase 5 is feed view polish — filtering, sorting, tag UI. The relevant interactions with Phase 4:

- **`WardrobeNavbar` is wardrobe-only and stays that way.** Phase 4 introduces `components/wardrobe/WardrobeNavbar.tsx` for use exclusively under `app/wardrobe/layout.tsx`. The shared `components/Navbar.tsx` is untouched and continues to serve `/feed` and `/[slug]`. Phase 5 should treat the feed's navbar as its own concern: either keep using the shared `Navbar`, or fork a `FeedNavbar` if feed needs route-specific affordances (filter chips, sort toggles). **Do not** try to unify the two navbars under a single component that switches behavior on route — the wardrobe navbar's layout is structurally different (it exists to host the transit element's landing site, which only makes sense on `/wardrobe`).
- **`WardrobeContext` is wardrobe-only.** It lives inside `WardrobeProvider`, which only mounts under the wardrobe layout. No code outside `components/wardrobe/` should import the context, and `useWardrobeContext()` is allowed to throw on misuse. Phase 5's feed code never touches it.
- **Do not couple `WardrobeContext` to tag filter state.** Tags are shared between wardrobe and feed (per SPEC), but the *filter state* is view-local. If Phase 5 adds tag filtering to wardrobe, it can extend `WardrobeContext` with a `filteredItems` derived value — the existing `items` field is already stored there, and `filteredItems` can be computed inside the provider from `items + filter` without touching the transit pipeline. Keep filter state out of the transit-related fields (`sourceRect`, `targetRect`, `transitProgress`) so the two concerns stay independent.
- **Route-level concerns stay at route level.** Feed lives at `/feed` and does not share a layout with `/wardrobe`. Each route owns its own navbar. There is no shared "navbar slot" abstraction in Phase 4, and Phase 5 should not invent one preemptively.

Note: Phase 6 (globe) is deliberately not covered in this compat section. Its architecture may shift significantly before it ships, and we do not want to pre-bake assumptions. When Phase 6 begins, revisit the wardrobe navbar pattern and decide whether the globe view wants its own variant or whether enough overlap has emerged to extract a shared abstraction at that time.

---

## Known deferred concerns

- **Active item change mid-transition:** If the user changes the selected item while `transitProgress` is between 0 and 1, `sourceRect` will update (Step 5 re-runs on `activeIndex` change) and the transit element will snap to the new source. Consider locking the carousel interaction while `transitProgress > 0` rather than chasing this edge case.
- **Multiple items / switching items from the navbar:** Out of scope. Phase 4 is single-item transit only.
- **Drag-vs-scroll gesture conflict on mobile:** Intentional horizontal drag on the carousel vs. the user's natural vertical scroll is not a new Phase 4 concern, but worth watching during Phase 4 QA — if the hero-to-navbar trigger makes the conflict feel worse, add a `touch-action: pan-y` policy on the shell wrapper so vertical scroll always wins.
