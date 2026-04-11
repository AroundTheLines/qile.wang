# Phase 4: Scroll-driven item → navbar transition

## Overview

As the user scrolls past the wardrobe stage, the currently selected item animates from its position in the carousel up into the navbar, where it persists as an icon while the user browses the rest of the page. Scrolling back to the top reverses the transition.

**Status:** Planning  
**Depends on:** Phase 3 (article body rendering + responsive wardrobe scaling)

---

## Architecture

```
WardrobeShell
  ├── activeItem state           (lifted here, was inside WardrobeCarousel)
  ├── scrollYProgress MotionValue
  ├── WardrobeCarousel           (receives onActiveChange, stageRef, isTransitActive)
  ├── WardrobeTransit            (fixed overlay, driven by scrollYProgress)
  └── Navbar                     (receives activeItem + isScrolledPast)
```

The key architectural constraint: the carousel item lives inside a CSS 3D perspective container. Framer Motion's `layoutId` FLIP mechanism breaks inside 3D transform contexts because the FLIP measurement is distorted by the parent perspective. The correct primitive here is a **fixed-position transit element** outside the 3D context entirely, driven by `useTransform` over `scrollYProgress`.

---

## Steps

### Step 1 — Lift selected item state to `WardrobeShell`

`activeIndex` and `activeItem` currently live entirely inside `WardrobeCarousel`. The transit element and the navbar both need access to the selected item, so this state must be lifted to `WardrobeShell`, which is already the right Client Component boundary.

**Files:** `WardrobeShell.tsx`, `WardrobeCarousel.tsx`

**What changes:**
- `WardrobeCarousel` receives `activeIndex`, `onActiveChange` as props instead of owning this state
- `WardrobeShell` holds `activeItem` and passes it to both `WardrobeTransit` and `Navbar`

**Risk:** Low. Pure prop-lifting with no behavior change.

---

### Step 2 — Attach scroll ref and derive `scrollYProgress`

Add a `ref` to the wardrobe stage container. Pass it to `WardrobeShell`. Use:

```ts
const { scrollYProgress } = useScroll({
  target: stageRef,
  offset: ["start start", "end start"],
});
```

This gives `0` when the top of the stage is at the top of the viewport, and `1` when the bottom of the stage has scrolled off the top. The 0→1 range covers the full scroll distance of the stage, which may be longer than the visual transition looks natural. Clamp the active transition range to the first portion of scroll using `useTransform`:

```ts
const transitProgress = useTransform(scrollYProgress, [0, 0.3], [0, 1], { clamp: true });
```

Tune the `0.3` threshold so the animation completes before the user has scrolled far.

**Files:** `WardrobeCarousel.tsx`, `WardrobeShell.tsx`

**Risk:** Low. Non-visual change.

---

### Step 3 — Measure source and target coordinates

This is the hardest step. The transit element must start at the exact rendered screen position and size of the active carousel sleeve, and end at the navbar icon slot. Both measurements must be live.

#### 3a. Source: carousel sleeve position

Use `getBoundingClientRect()` on the center sleeve element. Despite the 3D parent, `getBoundingClientRect()` returns the projected 2D screen rectangle, which is what we want.

Attach a `ref` to the center sleeve in `WardrobeCarousel` and expose it via a callback or forwarded ref. Measure it with a `useLayoutEffect` that re-runs:
- On mount
- When `activeIndex` changes
- On window resize (attach a `ResizeObserver` to the sleeve element, or listen to `window` resize)

Store the result as `{ x, y, width, height }` in `WardrobeShell` state.

**Important:** The measurement must be taken before `scrollYProgress` moves off zero, or the transit element will jump on first scroll. Take the measurement eagerly on mount, not lazily on first scroll.

#### 3b. Target: navbar icon slot position

The navbar icon slot needs to exist in the DOM before the transition completes so it can be measured. **Always render the slot**, but keep it visually hidden (`opacity: 0`, `pointer-events: none`) until `isScrolledPast` is true. This avoids the chicken-and-egg problem where the target doesn't exist until the animation reaches it.

Attach a `ref` to the navbar slot element and pass the position back up to `WardrobeShell` (or store it in a shared context). Measure with the same `useLayoutEffect` + `ResizeObserver` approach as the source.

**Files:** `WardrobeShell.tsx`, `WardrobeCarousel.tsx`, `WardrobeItem.tsx`, `Navbar.tsx`

**Risk:** Medium-high. This is the most fiddly part. Layout bugs here will manifest as a visible jump at the start or end of the transition.

---

### Step 4 — `WardrobeTransit` component

Create a new `WardrobeTransit` component. It renders a single `motion.div` with `position: fixed` and `pointer-events: none`. It receives:
- `activeItem` — for the cover image
- `transitProgress` — the clamped `0→1` MotionValue
- `sourceRect` — `{ x, y, width, height }` measured in Step 3a
- `targetRect` — `{ x, y, width, height }` measured in Step 3b

#### Do not animate `width`/`height`/`top`/`left` directly

These are layout-affecting CSS properties. Changing them on every scroll tick forces a browser reflow on every frame, which will cause jank.

Instead, fix the element at its **end state** (icon size, navbar position) and use `transform: translate() scale()` to make it appear at the source position at `progress = 0`:

```ts
const scaleX = useTransform(transitProgress, [0, 1], [sourceRect.width / targetRect.width, 1]);
const scaleY = useTransform(transitProgress, [0, 1], [sourceRect.height / targetRect.height, 1]);
const translateX = useTransform(transitProgress, [0, 1], [sourceRect.x - targetRect.x, 0]);
const translateY = useTransform(transitProgress, [0, 1], [sourceRect.y - targetRect.y, 0]);
```

Apply as `transform: translate(translateX, translateY) scale(scaleX, scaleY)` with `transform-origin: top left`.

Also animate:
- `borderRadius`: `0% → 50%` (rectangular sleeve → circular icon)
- `opacity`: stays `1` throughout

**Files:** `components/wardrobe/WardrobeTransit.tsx` (new)

**Risk:** Medium. The transform math needs careful handling of `transform-origin`. Test with `border: 1px solid red` on the element and verify it sits exactly over the sleeve at `progress = 0` and exactly over the navbar slot at `progress = 1`.

---

### Step 5 — Hide the center sleeve while transit is active

Once `transitProgress > 0`, the center carousel sleeve and the transit element would be visually doubled. The sleeve must be hidden.

**Do not remove it from layout.** The carousel is laid out assuming three items. If the center item collapses, the side items will shift and fight the transit element visually.

Use `opacity: 0` (or `visibility: hidden`) on the center sleeve only, conditioned on `transitProgress > 0`. Freeze the carousel layout so no reflow occurs.

**Files:** `WardrobeCarousel.tsx`, `WardrobeItem.tsx`

**Risk:** Low once Step 3 measurements are stable.

---

### Step 6 — Navbar icon and the handoff

When `transitProgress === 1`, the transit element has reached the navbar slot. The goal is to replace it with a permanently mounted icon.

#### The race condition

"Unmount transit, mount icon" must be visually seamless. Because React's render timing is not frame-perfect and `scrollYProgress` may oscillate near `1` if the user scrolls slowly at the boundary, a naive `if (progress === 1)` check will cause flicker.

**Solution:** Use a hysteresis threshold, not an exact equality check.

```ts
const isScrolledPast = useMotionValueEvent(transitProgress, "change", (v) => {
  if (v >= 0.99 && !isScrolledPastRef.current) {
    setIsScrolledPast(true);
  } else if (v < 0.95 && isScrolledPastRef.current) {
    setIsScrolledPast(false);
  }
});
```

The 0.99 / 0.95 gap means the state won't toggle rapidly at the boundary.

When `isScrolledPast` is true:
- `WardrobeTransit` renders `opacity: 0` (do not unmount — let the opacity transition complete first, then unmount via `onAnimationComplete`)
- The navbar slot renders `opacity: 1`

The overlap window where both are present (transit fading out, icon fading in over ~1 frame) is imperceptible.

**Files:** `WardrobeShell.tsx`, `Navbar.tsx`, `WardrobeTransit.tsx`

**Risk:** Medium. Requires coordinated state across `WardrobeShell` and `Navbar`. Use a shared context or prop drilling — either is fine given they're both under `WardrobeShell`.

---

### Step 7 — Scroll restoration and mid-page landing

If the user navigates back to this page with the browser restored to a non-zero scroll position, `scrollYProgress` will already be non-zero on mount. The transit element has no "catch up" logic — it derives its visual state from the current `scrollYProgress` value via `useTransform`, so it will render correctly at whatever progress value is current.

The one risk is that `sourceRect` and `targetRect` (Step 3) must both be measured before the first paint, or the transit element will jump on the first render. Use `useLayoutEffect` (not `useEffect`) for both measurements to ensure they run synchronously before the browser paints.

**Files:** `WardrobeShell.tsx`

**Risk:** Low if Step 3 uses `useLayoutEffect` correctly.

---

### Step 8 — Return tap (navbar icon → scroll back)

When the user taps the navbar icon, the intended behavior is to scroll back to the wardrobe stage. Use:

```ts
stageRef.current?.scrollIntoView({ behavior: "smooth" });
```

This reverses `scrollYProgress` back toward `0`, which reverses all `useTransform` mappings automatically.

**UX risk:** If the user has scrolled deep into the page, a full smooth scroll to the top is jarring. Consider instead a spring-animated overlay or drawer that expands from the icon — a separate concern that can be designed independently. For Phase 4, the scroll-back behavior is sufficient.

**Files:** `Navbar.tsx`

**Risk:** Low for the basic implementation. UX polish is deferred.

---

### Step 9 — Navbar Server/Client Component split

If `Navbar` is currently a Server Component (expected in App Router), it cannot receive scroll-reactive state or MotionValues as props. Split it:

```
Navbar.tsx (Server Component — layout, links, server-rendered content)
NavbarClientSlot.tsx (Client Component — receives activeItem, isScrolledPast)
```

`Navbar` renders `<NavbarClientSlot />` in the right slot. `NavbarClientSlot` is what `WardrobeShell` communicates with (via context or prop drilling through the parent layout).

**Files:** `Navbar.tsx` (modify), `NavbarClientSlot.tsx` (new)

**Risk:** Medium. Requires understanding the current Navbar rendering model before touching it. Read `Navbar.tsx` in full before writing any code here.

---

## Implementation order

These steps have dependencies. Work in this sequence:

1. **Step 1** — State lift. Everything else depends on `WardrobeShell` owning `activeItem`.
2. **Step 9** — Navbar split. Unblock the navbar as a target before wiring it up.
3. **Step 2** — Scroll ref + `scrollYProgress`. Unblocks Step 3 and Step 4.
4. **Step 3** — Source and target measurement. This is the load-bearing step — get it right before animating anything.
5. **Step 4** — Build `WardrobeTransit`. At this point you can verify the transform math in isolation.
6. **Step 5** — Hide center sleeve. Polish on top of Step 4.
7. **Step 6** — Navbar handoff + hysteresis. Final wiring.
8. **Step 7** — Scroll restoration verification. QA, not new code.
9. **Step 8** — Return tap behavior.

Steps 1 and 9 can be done in parallel by separate people. Steps 4 and 9 can be built in parallel once Step 3 is done.

---

## Known deferred concerns

- **Return animation polish:** A spring-snap back (using `layoutId` or an `AnimatePresence` exit) when tapping the navbar icon is a natural follow-on, but is out of scope for Phase 4.
- **Active item change mid-transition:** If the user somehow changes the selected item while `transitProgress` is between 0 and 1, the transit element should update its `sourceRect`. This is an edge case — the carousel interaction should be locked while the stage is scrolling off screen.
- **Multiple items / item switching from navbar:** Out of scope. Phase 4 is single-item transit only.
