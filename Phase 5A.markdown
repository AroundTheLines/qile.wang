# Phase 5A — Globe Scene & Interaction

_Sequential prerequisite for Phase 5B. Complete this phase first._

_For an implementer who has not seen this codebase before. Read SPEC.md (lines 106–245) for the full product spec. Read AGENTS.md before writing any Next.js code._

---

## Goal

Build a self-contained interactive globe at `/globe` — a 3D wireframe sphere with country borders, location pins, hover tooltips, click-to-open detail panels, and all associated interaction states. By the end of this phase, the globe is fully functional as a browsing experience: the user can explore pins, read location details, and see item lists. **Article navigation is NOT part of this phase** — that is Phase 5B.

---

## Table of Contents

1. [Dependencies](#1-dependencies)
2. [Data Model Changes](#2-data-model-changes)
3. [GROQ Queries & Grouping Utility](#3-groq-queries--grouping-utility)
4. [TypeScript Types](#4-typescript-types)
5. [Route & Layout Structure](#5-route--layout-structure)
6. [Component Architecture](#6-component-architecture)
7. [Globe Rendering](#7-globe-rendering)
8. [Entrance Animation](#8-entrance-animation)
9. [Pin System](#9-pin-system)
10. [Interaction Model](#10-interaction-model)
11. [Tooltip & Hover Connector](#11-tooltip--hover-connector)
12. [Detail Panel](#12-detail-panel)
13. [Click Connector](#13-click-connector)
14. [Layout State Machine](#14-layout-state-machine)
15. [Pin Switching Transitions](#15-pin-switching-transitions)
16. [R3F↔HTML Bridge (Per-Frame Position Sync)](#16-r3fhtml-bridge)
17. [Responsive Behavior](#17-responsive-behavior)
18. [Performance Considerations](#18-performance-considerations)
19. [File Inventory](#19-file-inventory)
20. [Implementation Order](#20-implementation-order)
21. [Deferred to Phase 5B](#21-deferred-to-phase-5b)
22. [Deferred to Phase 5C](#22-deferred-to-phase-5c)
23. [Documented Decisions & Nits](#23-documented-decisions--nits)

---

## 1. Dependencies

```bash
npm install three @react-three/fiber @react-three/drei topojson-client world-atlas
npm install -D @types/three @types/topojson-client
```

| Package | Purpose |
|---|---|
| `three` | WebGL 3D engine — wireframe globe, pins, shadows |
| `@react-three/fiber` (R3F) | React reconciler for Three.js — declarative scene graph |
| `@react-three/drei` | R3F helpers — `OrbitControls`, `Line` (fat lines), etc. |
| `topojson-client` + `world-atlas` | Country border data (110m TopoJSON, ~30KB) |
| `@types/three`, `@types/topojson-client` | TypeScript definitions |

Framer Motion (already installed) handles all 2D panel/layout animations. Three.js handles all in-canvas animation.

---

## 2. Data Model Changes

### 2a. Add `globe_group` field to Location schema

**File:** `sanity/schemas/location.ts`

```typescript
defineField({
  name: 'globe_group',
  title: 'Globe Group',
  type: 'string',
  description:
    'Editorial label for globe pin grouping (e.g., "Tokyo, Japan"). ' +
    'All locations sharing the same globe_group string cluster under one pin. ' +
    'Leave empty to exclude this location from the globe.',
}),
```

**Rationale:** Lightest-touch approach. No new document types. Author-controlled grouping per spec. A typo creates a spurious pin — acceptable for MVP.

### 2b. Backfill existing content

Write `scripts/seed-globe-groups.mts` to patch existing locations with `globe_group` values derived from their `label` fields. Requires manual editorial judgment — the script should log each patch for author review.

---

## 3. GROQ Queries & Grouping Utility

### Query

**File:** `lib/queries.ts` — add:

```groq
// globeContentQuery — all content (items AND posts) with at least one globe-grouped location
*[_type == "content" && count(locations[defined(globe_group)]) > 0] {
  _id,
  title,
  slug,
  content_type,
  cover_image,
  tags,
  "acquired_at": locations | order(sort_date asc)[0].sort_date,
  "latest_location_date": locations | order(sort_date desc)[0].sort_date,
  locations[] | order(sort_date asc) {
    label,
    coordinates,
    sort_date,
    date_label,
    globe_group,
  },
}
```

Both items and posts are included — the globe is a lens on the full collection.

`latest_location_date` is projected for determining the entrance animation camera target.

### Grouping utility

**File:** `lib/globe.ts`

```typescript
function groupPins(content: GlobeContentItem[]): GlobePin[]
```

The function:
1. Iterates all content and their locations
2. Buckets by `globe_group` string (locations without `globe_group` are skipped)
3. Computes pin coordinates as the **centroid** (average lat/lng) of all locations in the group
4. Deduplicates content that appears in the same group via multiple locations — when an item has multiple locations in the same group, use the **most recent** `sort_date` location's label as the `locationLabel`
5. Tracks `latestDate` per group (most recent `sort_date` across all locations)
6. Returns `GlobePin[]` sorted by `latestDate` descending (most recent first)

---

## 4. TypeScript Types

**File:** `lib/types.ts` — add `globe_group?: string` to `Location` interface.

**File:** `lib/globe.ts` — define and export:

```typescript
export interface GlobePin {
  group: string                    // e.g., "Tokyo, Japan"
  coordinates: Coordinates         // centroid of grouped locations
  items: GlobePinItem[]            // content associated with this pin
  latestDate?: string              // most recent sort_date in group
}

export interface GlobePinItem {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType        // 'item' | 'post'
  cover_image?: SanityImage
  locationLabel: string            // sub-location (e.g., "Shibuya") — most recent
  year?: string                    // derived from sort_date
}

// Raw shape from GROQ (before grouping)
export interface GlobeContentItem {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  tags?: string[]
  acquired_at?: string
  latest_location_date?: string
  locations: (Location & { globe_group?: string })[]
}
```

---

## 5. Route & Layout Structure

```
app/globe/
  layout.tsx    ← Server Component: fetches query, groups pins, renders GlobeProvider
  page.tsx      ← Returns null (globe rendered by provider, same as wardrobe pattern)
```

**`app/globe/layout.tsx`** — Server Component:
- `export const dynamic = 'force-dynamic'` (match wardrobe pattern)
- Fetches `globeContentQuery` from Sanity
- Calls `groupPins()` to produce `GlobePin[]`
- Renders `<GlobeProvider pins={pins}>{children}</GlobeProvider>`

**`app/globe/page.tsx`** — Returns `null`.

### Loading fallback

R3F + Three.js are dynamically imported with `ssr: false`. While loading (~150–200KB), show a **static SVG wireframe globe silhouette**:

```tsx
const GlobeViewport = dynamic(() => import('./GlobeViewport'), {
  ssr: false,
  loading: () => <GlobeFallbackSVG />,
})
```

`GlobeFallbackSVG` is an inline component — a few `<circle>` and `<ellipse>` elements forming a minimal globe outline. Lightweight, no external asset. Matches the clinical aesthetic.

---

## 6. Component Architecture

```
app/globe/layout.tsx (Server Component — data fetch + grouping)
  └── GlobeProvider (Client Component — state owner)
      ├── GlobeNavbar (back/home button, "Globe" title)
      ├── GlobeViewport (dynamic import, ssr: false, contains everything below)
      │   ├── R3F Canvas
      │   │   ├── GlobeScene (camera, OrbitControls, entrance anim, idle rotation)
      │   │   │   ├── GlobeMesh (wireframe sphere + country borders)
      │   │   │   ├── GlobePins (pin meshes with back-face fading)
      │   │   │   └── GlobePositionBridge (useFrame → writes pin screen coords to shared ref)
      │   │   └── OrbitControls (drei)
      │   │
      │   ├── GlobeHoverConnector (SVG overlay — hover state only, desktop)
      │   ├── GlobeTooltip (HTML overlay — hover state only, desktop)
      │   ├── GlobeClickConnector (SVG overlay — click/selected state, desktop)
      │   └── GlobeDetailPanel (HTML overlay — click/selected state)
      │
      └── (children — page.tsx returns null for now; Phase 5B adds article page)
```

### Component file map → `components/globe/`

| File | Responsibility |
|---|---|
| `GlobeContext.tsx` | Context definition, types, `useGlobe()` hook |
| `GlobeProvider.tsx` | Context owner: selectedPin, hoveredPin, layout state, pin data, shared position refs |
| `GlobeNavbar.tsx` | Simple top navbar (home link, "Globe" label) |
| `GlobeViewport.tsx` | Wrapper: R3F `<Canvas>` + sibling HTML/SVG overlays |
| `GlobeFallbackSVG.tsx` | Static SVG wireframe silhouette (loading state) |
| `GlobeScene.tsx` | Camera setup, OrbitControls (with enable/disable), entrance animation, idle rotation |
| `GlobeMesh.tsx` | Wireframe sphere + country border line geometry |
| `GlobePins.tsx` | Maps `pins[]` → 3D pin meshes with back-face fading |
| `GlobePositionBridge.tsx` | R3F component: `useFrame` → projects pin positions to screen coords, writes to shared ref |
| `GlobeHoverConnector.tsx` | SVG overlay: thin line from hovered pin to tooltip (desktop only) |
| `GlobeTooltip.tsx` | HTML overlay: location name + item count on hover (desktop only) |
| `GlobeClickConnector.tsx` | SVG overlay: thin line from selected pin to detail panel edge (desktop only) |
| `GlobeDetailPanel.tsx` | Full detail panel with item list |
| `GlobeDetailItem.tsx` | Single item/post row within the detail panel |

All files in `components/globe/` need `"use client"`.

**Key distinction: two connector components.** `GlobeHoverConnector` and `GlobeClickConnector` are separate elements with different endpoints, animation timing, and lifecycle. The hover connector lives only during hover and points to the tooltip. The click connector lives during panel-open state and points to the panel edge.

---

## 7. Globe Rendering

### 7a. Wireframe sphere

```typescript
const geo = new THREE.SphereGeometry(2, 36, 18)
const wireframe = new THREE.WireframeGeometry(geo)
const material = new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.12, transparent: true })
const lines = new THREE.LineSegments(wireframe, material)
```

- **Radius:** 2 (Three.js units)
- **Segments:** 36 width × 18 height (medium density)
- **Color:** `rgba(0, 0, 0, 0.12)` — very light, background texture only

### 7b. Country borders

Parse `world-atlas` TopoJSON → GeoJSON features → 3D line geometry on sphere surface.

Spherical → Cartesian conversion:
```
x = R * cos(lat) * cos(lng)
y = R * sin(lat)
z = R * cos(lat) * sin(lng)
```

(Where lat/lng are in radians: `radians = degrees * Math.PI / 180`)

**Visual hierarchy — grid vs. borders:**

| Layer | Color/Opacity | Line weight | Purpose |
|---|---|---|---|
| Wireframe grid | `rgba(0, 0, 0, 0.12)` | 1px (native WebGL) | Subtle background, gives sphere form |
| Country borders | `rgba(0, 0, 0, 0.45)` | 1.5–2px (drei `<Line>`) | Geographic context, primary visual feature |

Use drei's `<Line>` for country borders — it renders as triangulated mesh geometry, supporting line widths > 1px (native WebGL `lineWidth` is unreliable). The grid uses standard `LineSegments` at 1px.

**Performance:** Merge all border segments into a single `BufferGeometry` → one draw call. Country borders are static; compute once on mount.

### 7c. Shadow

Flat `CircleGeometry` plane below the globe with a radial gradient texture (transparent edges, light gray center). No real lights or `ContactShadows` needed.

---

## 8. Entrance Animation

Every navigation to `/globe` triggers a 0.75s zoom-in.

### Camera target: most recently visited pin

1. Find the `GlobePin` with the most recent `latestDate`
2. Compute camera position that faces that pin's coordinates (the pin should be front-and-center)
3. Camera starts at `far` (e.g., distance = 15) along the same vector
4. Lerp to `resting` (e.g., distance = 5) over 0.75s, ease-out

If no dates exist, default to `[0°, 20°N]` (North Atlantic — neutral starting point).

### OrbitControls must be disabled during entrance

OrbitControls and the entrance animation both control the camera. They will conflict.

**Implementation:**
1. On mount, set `OrbitControls.enabled = false`
2. Run the entrance lerp via `useFrame` (check elapsed time against 0.75s)
3. On completion, set `OrbitControls.enabled = true` and update its target to the globe center
4. Same pattern applies any time the globe programmatically rotates (pin switching, see Section 15)

Store the OrbitControls ref via drei's `ref` prop: `<OrbitControls ref={controlsRef} />`.

---

## 9. Pin System

### 9a. Positioning

Each pin sits on the globe surface at its group's centroid coordinates:

```
pinPosition = sphericalToCartesian(lat, lng, radius * 1.01)
```

The `* 1.01` offset prevents z-fighting with the wireframe. Increase to `1.02` if visual overlap persists.

### 9b. Visual

- **Default:** Solid red dot (`#EF4444`). `SphereGeometry(0.04, 16, 16)` + `MeshBasicMaterial` (unlit).
- **Hovered (desktop):** Scale up to 1.3×.
- **Selected:** Gentle pulse (scale oscillates 1.0–1.2 via `useFrame`: `1 + 0.15 * sin(clock * 3)`) + outline ring (`RingGeometry`, billboarded to face camera).

### 9c. Back-face fading

Pins on the far side of the globe (facing away from camera) must **fade out and become non-interactive**.

**Implementation:** In `useFrame`, for each pin:
1. Compute the dot product between the pin's normal vector (pin position normalized) and the camera-to-pin direction
2. If the dot product < 0 (pin faces away from camera), the pin is on the back face
3. Animate opacity: `opacity = smoothstep(dotProduct, -0.1, 0.2)` — fades out as it crosses the horizon
4. Set `material.opacity` and toggle pointer events: `raycast` function returns early when opacity < 0.1

This prevents users from clicking through-the-globe pins and gives a clean visual read.

### 9d. Hit detection

R3F's built-in raycasting. Each pin gets `onPointerOver`, `onPointerOut`, `onClick` handlers.

Invisible hit-target sphere (radius ~0.08) wraps the visible pin (radius ~0.04) for 48px+ mobile tap targets. The hit sphere has `visible={false}` but receives raycasts.

---

## 10. Interaction Model

### 10a. Globe controls

```tsx
<OrbitControls
  ref={controlsRef}
  enablePan={false}
  enableZoom={true}
  minDistance={3}
  maxDistance={8}
  enableDamping={true}
  dampingFactor={0.05}
  rotateSpeed={0.5}
  autoRotate={!controlsLocked}   // disable during entrance/pin-switch
  autoRotateSpeed={0.3}
/>
```

- **Auto-rotate resume delay:** After user interaction ends, wait ~2 seconds before resuming. Implement by listening to OrbitControls `'end'` event, setting a timeout to re-enable `autoRotate`.
- **No scroll hijacking:** `style={{ touchAction: 'none' }}` on the canvas wrapper. The `/globe` page is full-viewport, not scrollable.

### 10b. Desktop: hover → click

**Hover (desktop only):**
1. `onPointerOver` on pin hit-sphere → `setHoveredPin(group)`
2. `GlobeTooltip` renders (location name + item count). Positioned via screen coords from the bridge.
3. `GlobeHoverConnector` renders — SVG line from pin screen position to tooltip
4. `onPointerOut` → `setHoveredPin(null)` — tooltip + connector disappear
5. If the hovered pin is the same as the selected pin, tooltip does NOT render (panel is already showing details)

**Click:**
1. `onClick` on pin hit-sphere → `selectPin(group)` + capture `selectedPinScreenY`
2. Layout transitions to `'panel-open'`
3. Globe slides left + shrinks
4. **After slide completes:** `GlobeClickConnector` draws from pin to panel edge
5. Detail panel slides in

**Click empty space (drag-vs-click discriminator):**

`onPointerMissed` on R3F `<Canvas>` fires on any click that misses a mesh — including drag-to-rotate. This is a critical bug source.

**Implementation:**
1. On `<Canvas>` wrapper's `onPointerDown`: store `{ x: e.clientX, y: e.clientY }` in a ref
2. In `onPointerMissed` handler: compute displacement from stored coords
3. If displacement < 5px → it was a click → `selectPin(null)`, close panel
4. If displacement ≥ 5px → it was a drag → ignore

### 10c. Mobile: tap only

No hover state. Tap pin → same as desktop click (select + open panel). Tap empty space → close panel (with same drag discriminator).

Detect mobile via `useIsMobile()` hook (`matchMedia('(pointer: coarse)')`). Skip `onPointerOver`/`onPointerOut` handlers on mobile.

---

## 11. Tooltip & Hover Connector

Both are **desktop only**. Both disappear when hover ends. Both are HTML/SVG overlays outside the Canvas.

### GlobeTooltip

- Positioned at the hovered pin's screen coordinates (from the bridge ref) + small offset (e.g., 12px up and right)
- Content: location name (uppercase) + item count (omit count if only 1 item)
- Style: small white card, thin border, no border-radius, `text-xs tracking-widest uppercase`
- Animation: fade in with slight `translateY(-4px)` over 150ms

### GlobeHoverConnector

- SVG overlay (`pointer-events: none`, `position: absolute`, fills viewport)
- Thin black line (`stroke: black`, `stroke-width: 1`) from pin screen position to tooltip position
- Animation: `stroke-dashoffset` draw-in from pin toward tooltip, ~150ms
- Disappears instantly when hover ends (no retract animation needed for hover)

Both read the hovered pin's screen coordinates from the bridge ref (see Section 16). They update position on every animation frame via their own `requestAnimationFrame` loop reading the ref.

---

## 12. Detail Panel

### 12a. Positioning

The panel is a regular HTML `div`, sibling to the Canvas inside `GlobeViewport`.

**Desktop:**
- `position: absolute; right: 0; width: 35vw; max-width: 420px; min-width: 320px`
- **Vertical alignment:** Panel's top edge aligns with the selected pin's screen Y at the moment of click, clamped to keep fully within viewport (min 24px from top/bottom edges)
- `max-height: calc(100vh - 48px)` with internal scroll
- White background, thin left border (`border-left: 1px solid #e5e5e5`)
- No border radius (spec: "hard-edge card")
- Close button (×) in top-right corner, 48px tap target

**Mobile:**
- Slides in from right edge as partial overlay
- `width: 85vw; max-width: 380px`
- Dark scrim behind panel: `rgba(0, 0, 0, 0.3)`, animated in with panel
- **Tapping scrim closes panel**
- Also dismissible by: swipe right (Framer Motion `drag="x"` + threshold), close button
- Close button: 48px minimum tap target

**Phase 5A scope:** Panel vertical position is set once on open and stays static. It does NOT track the pin's screen Y during idle rotation — that is Phase 5C.

### 12b. Panel content

```
┌─────────────────────────────┐
│  × (close)                  │
│                             │
│  TOKYO, JAPAN               │  ← group name, uppercase, tracking-widest
│  4 items                    │  ← item count
│                             │
│  ┌─────────────────────────┐│
│  │ ┌──────┐               ││
│  │ │ img  │ ITEM TITLE    ││  ← framed thumbnail + title (caps)
│  │ │      │ Shibuya       ││  ← sub-location label
│  │ └──────┘ 2023          ││  ← year
│  ├─────────────────────────┤│
│  │ ┌──────┐               ││
│  │ │ img  │ ITEM TITLE    ││
│  │ │      │ Harajuku      ││
│  │ └──────┘ 2024          ││
│  ├─────────────────────────┤│
│  │ ┌──────┐               ││
│  │ │ img  │ ITEM TITLE    ││  ← partial visibility = scroll affordance
│  │ │      │ ...           ││
│  └─┴──────┴───────────────┘│
│        ↕ scrollable         │
└─────────────────────────────┘
```

- ~3.5 items visible (partial last item = scroll affordance)
- **Posts without cover image:** Text-only row with placeholder area or icon. Layout must handle gracefully.
- **Content type indicator:** Subtle "POST" tag for posts. Items have no label (they are the default).
- **Item tap behavior:** In Phase 5A, item taps are **non-functional stubs** — they log the slug to console. Phase 5B implements actual navigation.

### 12c. Panel scroll isolation

`overflow-y: auto` + `overscroll-behavior: contain` on the item list container. Touch events inside the panel must not propagate to the globe canvas.

---

## 13. Click Connector

Separate component from the hover connector. Desktop only.

### Positioning

- SVG overlay (`pointer-events: none`, fills viewport)
- **Start:** Selected pin's screen position (from bridge ref)
- **End:** Left edge of the detail panel, vertically centered on the panel header
- Updates per frame (pin moves with rotation) via `requestAnimationFrame` reading bridge ref

### Animation

- **Waits until the globe slide animation completes** before drawing. The globe slide takes ~300ms (spring). The click connector begins its draw-in animation after the slide settles.
- Draw animation: `stroke-dashoffset` from full → 0, ~200ms ease-out
- On panel close: retracts (animates back to zero length toward pin) over ~150ms

### Dismiss button

The connector line has an **× button** at its midpoint (or at the panel-end). Tapping this button closes the panel (same as clicking the panel's close button). This provides an additional close affordance that's spatially connected to the pin-panel relationship. Implement as a small HTML `<button>` absolutely positioned at the connector's midpoint, overlaid on the SVG.

---

## 14. Layout State Machine

Two states:

### State: `default`

| Property | Desktop | Mobile |
|---|---|---|
| Globe container | `width: 100vw`, centered | `width: 100vw`, centered |
| Detail panel | Not mounted | Not mounted |
| Click connector | Hidden | Hidden |
| Tooltip | Shows on hover | N/A |

### State: `panel-open`

| Property | Desktop | Mobile |
|---|---|---|
| Globe container | Shrinks to ~60vw, shifts left | Shrinks slightly, shifts left |
| Detail panel | 35vw right side | 85vw overlay from right + scrim |
| Click connector | Visible (after slide completes) | Hidden |
| Tooltip | Hidden (panel replaces it) | N/A |

### Transition mechanism

**Desktop:** Flex container. Globe and panel are siblings:

```tsx
<div className="flex h-screen w-screen">
  <motion.div
    className="relative"
    animate={{ width: selectedPin ? '60%' : '100%' }}
    transition={{ type: 'spring', stiffness: 200, damping: 30 }}
    onAnimationComplete={() => setSlideComplete(true)}  // triggers connector draw
  >
    <Canvas>...</Canvas>
  </motion.div>

  <AnimatePresence>
    {selectedPin && (
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 30 }}
        style={{ top: clampedPinScreenY }}  // vertical alignment to pin
      >
        <GlobeDetailPanel />
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

R3F auto-handles canvas resize via internal ResizeObserver.

**Mobile:** Panel is an absolute overlay (not flex sibling). Scrim is a separate element behind the panel.

**Spring parameters:** `stiffness: 200, damping: 30` produces critically-damped motion — smooth, no overshoot. Matches the spec's "no bounce" requirement.

---

## 15. Pin Switching Transitions

When clicking a different pin while a panel is already open:

### Sequence (all durations approximate)

1. **Click connector retracts** (~150ms) — line animates from full length back to zero at the origin pin
2. **Globe rotates if needed** (~300ms) — if the new pin is on the back face (not visible), programmatically rotate the globe to bring it into view. Disable OrbitControls during this rotation; re-enable after.
3. **Panel content swaps** — panel stays mounted at the same position, content cross-fades to the new pin's data. Panel vertical position updates to align with the new pin's screen Y.
4. **New click connector grows out** (~200ms) — from the new pin's screen position to the panel edge

Total: ~650ms worst case (with rotation), ~350ms if no rotation needed.

### Globe auto-rotation to bring back-face pin into view

```typescript
function rotateToPinCoords(controls: OrbitControls, targetLat: number, targetLng: number) {
  controls.enabled = false
  // Compute target spherical coords for the camera
  // Animate azimuthal/polar angles via useFrame lerp
  // On completion: controls.enabled = true
}
```

This is the same OrbitControls disable/enable pattern as the entrance animation.

---

## 16. R3F↔HTML Bridge (Per-Frame Position Sync)

### Problem

HTML overlays (tooltip, both connectors) need pin screen positions updated every frame. But `useFrame` only works inside the R3F Canvas. Components outside the Canvas can't call it.

### Solution: Shared ref written inside Canvas, read outside

**Inside Canvas — `GlobePositionBridge.tsx`:**

```typescript
// Runs inside <Canvas>, has access to useFrame and useThree
function GlobePositionBridge() {
  const { camera } = useThree()
  const { pins, hoveredPin, selectedPin, pinPositionRef } = useGlobe()

  useFrame(() => {
    const positions: Record<string, { x: number; y: number; visible: boolean }> = {}
    for (const pin of pins) {
      const vec = new THREE.Vector3(...sphericalToCartesian(pin.coordinates))
      vec.project(camera)
      positions[pin.group] = {
        x: (vec.x * 0.5 + 0.5) * window.innerWidth,
        y: (-vec.y * 0.5 + 0.5) * window.innerHeight,
        visible: vec.z < 1,  // front face
      }
    }
    pinPositionRef.current = positions
  })

  return null  // no visual output
}
```

**`pinPositionRef`** is a `useRef<Record<string, ScreenPosition>>` owned by `GlobeProvider`, shared via context.

**Outside Canvas — overlays read the ref:**

Each overlay (tooltip, connectors) runs its own `requestAnimationFrame` loop that reads `pinPositionRef.current` and updates its DOM position. This is cheap — just reading a ref and setting CSS transforms.

```typescript
// In GlobeTooltip.tsx
useEffect(() => {
  let raf: number
  const update = () => {
    const pos = pinPositionRef.current?.[hoveredPin]
    if (pos && tooltipRef.current) {
      tooltipRef.current.style.transform = `translate(${pos.x + 12}px, ${pos.y - 12}px)`
    }
    raf = requestAnimationFrame(update)
  }
  raf = requestAnimationFrame(update)
  return () => cancelAnimationFrame(raf)
}, [hoveredPin])
```

This pattern cleanly separates the R3F render loop from DOM updates with no context boundary violations.

---

## 17. Responsive Behavior

| Breakpoint | Globe | Panel | Connectors |
|---|---|---|---|
| **≥ 1024px** | Full hover + click, connector lines | Flex sibling, 35vw | Both hover + click |
| **768–1023px** | Hover works, no connectors | Flex sibling, 45vw | Hidden |
| **< 768px** | Tap only, no hover | Overlay, 85vw + scrim | Hidden |

### Mobile concerns

- **Touch targets:** Invisible hit-sphere radius ~0.08 (≥ 48px on screen at default zoom)
- **`touch-action: none`** on canvas wrapper — no page scroll
- **Panel scroll:** `overscroll-behavior: contain` — no globe rotation from panel scrolls
- **Swipe dismiss:** Framer Motion `drag="x"` + `onDragEnd` threshold
- **Close button:** 48px minimum tap target

---

## 18. Performance Considerations

### Bundle size
- Dynamic import with `ssr: false` on `GlobeViewport` — Three.js never loads on other routes
- Tree-shake drei: import only `OrbitControls`, `Line`

### Rendering
- Country borders: single merged `BufferGeometry` → one draw call
- Pins: individual meshes fine for <15 pins. Use `InstancedMesh` if >20.
- `useFrame` callbacks: only pin pulse scale + bridge position projection. Keep lean.
- Back-face opacity: computed per pin per frame (cheap dot-product)

### Mobile GPU
- 36×18 sphere segments + country borders = manageable
- No post-processing, no real-time shadows
- Target 60fps on iPhone 12+

---

## 19. File Inventory

### New files

```
components/globe/
  GlobeContext.tsx
  GlobeProvider.tsx
  GlobeNavbar.tsx
  GlobeViewport.tsx
  GlobeFallbackSVG.tsx
  GlobeScene.tsx
  GlobeMesh.tsx
  GlobePins.tsx
  GlobePositionBridge.tsx
  GlobeHoverConnector.tsx
  GlobeTooltip.tsx
  GlobeClickConnector.tsx
  GlobeDetailPanel.tsx
  GlobeDetailItem.tsx

app/globe/
  layout.tsx
  page.tsx

lib/globe.ts

scripts/seed-globe-groups.mts
```

### Modified files

```
sanity/schemas/location.ts    ← add globe_group field
lib/queries.ts                ← add globeContentQuery
lib/types.ts                  ← add globe_group to Location
app/page.tsx                  ← add link to /globe (Step 10)
package.json                  ← new dependencies
```

---

## 20. Implementation Order

Each step produces a testable artifact. Complete in sequence.

### Step 1: Schema & data
1. Add `globe_group` field to `sanity/schemas/location.ts`
2. Add `globe_group` to `Location` type in `lib/types.ts`
3. Write `scripts/seed-globe-groups.mts` and run to backfill
4. Add `globeContentQuery` to `lib/queries.ts`
5. Write `lib/globe.ts` — `groupPins()` utility + types (`GlobePin`, `GlobePinItem`, `GlobeContentItem`)
6. **Verify:** Run query in Sanity Vision, confirm data shape. Test `groupPins()` produces expected output.

### Step 2: Route scaffolding
1. `npm install three @react-three/fiber @react-three/drei topojson-client world-atlas` + dev types
2. Create `app/globe/layout.tsx` (server component, fetches + groups data)
3. Create `app/globe/page.tsx` (returns null)
4. Create `GlobeContext.tsx` + `GlobeProvider.tsx` (context shell, state definitions, `pinPositionRef`)
5. Create `GlobeNavbar.tsx` (home link + "Globe" title)
6. **Verify:** Navigate to `/globe`, see navbar, no errors

### Step 3: Static globe + entrance
1. Create `GlobeFallbackSVG.tsx`
2. Create `GlobeViewport.tsx` with `<Canvas>` (dynamic import, `ssr: false`, SVG fallback)
3. Create `GlobeScene.tsx` — camera, OrbitControls (with ref + enable/disable), auto-rotate with 2s resume delay
4. Create `GlobeMesh.tsx` — wireframe sphere (light opacity grid)
5. Add shadow plane below globe
6. Implement entrance zoom animation (0.75s, targets most-recent pin coords, disables OrbitControls during)
7. **Verify:** Spinning wireframe globe, drag/zoom works, entrance zooms toward correct region, SVG fallback shows during load

### Step 4: Country borders
1. In `GlobeMesh.tsx`, parse `world-atlas` TopoJSON → 3D line geometry on sphere surface
2. Use drei `<Line>` for borders (1.5–2px, opacity 0.45) vs grid (1px, opacity 0.12)
3. Merge border segments into single geometry
4. **Verify:** Country outlines clearly distinguishable from grid, rotate with globe

### Step 5: Pins + back-face fading
1. Create `GlobePins.tsx` — red dots at centroid coordinates
2. Implement back-face fading (dot product → opacity, disable raycast when faded)
3. Add invisible hit-target spheres for ≥48px tap targets
4. Implement selected-state pulse animation + outline ring
5. Wire pin data from `GlobeContext`
6. **Verify:** Red pins visible at correct locations, fade when rotating behind globe, not clickable when faded

### Step 6: Position bridge
1. Create `GlobePositionBridge.tsx` — `useFrame` projects all pin positions to screen coords, writes to `pinPositionRef`
2. Wire `pinPositionRef` through `GlobeContext`
3. **Verify:** Console-log screen positions from an overlay component — values update per frame

### Step 7: Tooltip + hover connector (desktop)
1. Create `GlobeTooltip.tsx` — reads `pinPositionRef`, positions via RAF loop
2. Create `GlobeHoverConnector.tsx` — SVG line from pin to tooltip, draw-in animation
3. Wire `onPointerOver`/`onPointerOut` to `hoveredPin` state (desktop only via `useIsMobile`)
4. **Verify:** Hover pin → tooltip + connector appear. Hover off → disappear. No hover on mobile.

### Step 8: Detail panel + layout state
1. Create `GlobeDetailPanel.tsx` + `GlobeDetailItem.tsx` — handle both items and posts
2. Implement layout state machine in `GlobeProvider` (`default` ↔ `panel-open`)
3. Wire `onClick` on pins → `selectPin()`, capture `selectedPinScreenY`
4. Animate globe slide-left + panel slide-in (Framer Motion flex container)
5. Panel vertical alignment to pin's screen Y (clamped)
6. Mobile: overlay panel + scrim + swipe dismiss
7. Implement drag-vs-click discriminator on `onPointerMissed`
8. Item taps are **stubs** in this phase — `console.log(slug)`. Phase 5B adds navigation.
9. **Verify:** Click pin → globe shifts, panel opens at pin's Y level. Click elsewhere → closes. Drag does NOT close. Posts show correctly.

### Step 9: Click connector + dismiss
1. Create `GlobeClickConnector.tsx` — SVG line from pin to panel, with × dismiss button
2. Wire to `onAnimationComplete` of globe slide — draw begins after slide settles
3. Draw-in animation: ~200ms. Retract on close: ~150ms.
4. × button at connector midpoint closes panel
5. **Verify:** Pin click → globe slides → connector draws to panel. × on connector closes panel. Connector retracts before panel exits.

### Step 10: Pin switching + landing page
1. Implement pin switching sequence: retract → rotate if needed → content swap → extend
2. OrbitControls disabled during programmatic rotation, re-enabled after
3. Add `/globe` link on `app/page.tsx`
4. **Verify:** Switch pins with panel open → smooth transition. Back-face pin switch triggers rotation. Landing page links to globe.

---

## 21. Deferred to Phase 5B

These items are explicitly out of scope for 5A and will be implemented next:

- **Article navigation from panel items** — tapping an item in the detail panel navigates to the article
- **Desktop article view** — globe shifts fully left, zooms to pin, article content takes 70% right
- **Mobile article view** — leaves globe, navigates to standalone article page
- **Globe-specific `ArticleReveal` variant**
- **`app/globe/[slug]/page.tsx`** and `loading.tsx`
- **Pin-to-article-title connector** with × dismiss
- **Globe state persistence** on return from article (desktop)

---

## 22. Deferred to Phase 5C

- Panel vertical position tracking during rotation (per-frame)
- Camera-zoom cinematic article transition
- Travel traces (animated lines on globe)
- Pin color encoding by content type
- Time-based filtering

---

## 23. Documented Decisions & Nits

### Decisions made

| Decision | Choice | Why |
|---|---|---|
| Pin grouping | `globe_group` string on Location | Lowest friction, matches existing patterns |
| Border data | `world-atlas` TopoJSON 110m | ~30KB, clean at globe scale |
| Pin coords | Centroid of grouped locations | Good enough for city-scale groups |
| Hover vs click connector | Two separate SVG components | Different endpoints, lifecycles, animations |
| Panel impl | HTML overlay, not R3F `<Html>` | Full CSS control for scroll, responsive |
| R3F↔HTML sync | Shared ref (bridge pattern) | Clean separation, no context violations |
| Globe shadow | Textured plane | Cheaper than ContactShadows, no light needed |
| Layout shift | Flex + Framer Motion width | Simple, already using Framer |
| Back-face pins | Fade out + disable raycast | Prevents confusing through-globe clicks |
| Dedup location label | Most recent sort_date | Consistent, matches "latest visit" mental model |

### Nits (not blocking)

1. **Pin count in tooltip:** Omit "1 item" when count is 1.
2. **OrbitControls resume delay:** 2s timeout feels natural; immediate resume feels jarring.
3. **Pin z-fighting:** If `radius * 1.01` isn't enough, try `1.02` or `depthTest: false`.
4. **Canvas resize during slide:** R3F handles it, but watch for mobile jank. Fallback: animate `transform: scale()` instead of `width`.
5. **Connector drift during rotation:** In 5A, the click connector's pin endpoint moves with idle rotation. If it looks odd, pause auto-rotate while panel is open.
6. **`world-atlas` size:** Could drop to 50m (~15KB) if 30KB feels heavy. Negligible visual difference.
