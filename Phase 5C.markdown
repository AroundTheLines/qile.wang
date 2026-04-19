# Phase 5C — Trips, Visits, and the Timeline

_Requires Phases 5A and 5B to be complete. The globe scene, pins, detail panel, and article sliver must all be working._

_Read AGENTS.md before writing any Next.js code. Breaking changes in this Next.js version — consult `node_modules/next/dist/docs/` as needed._

---

## Goal

Introduce a new first-class concept — **Visits** and **Trips** — that lets items be attached to specific locations at specific points in time, and adds a **Timeline** to control the globe. The globe remains the primary feature; the timeline is a control surface for it.

- A **Visit** = a single location at a single time period, containing items worn/used during that time.
- A **Trip** = a chronological container of one or more visits, optionally with long-form article content.
- A **Timeline** visualizes trips over time, plays back historic trips continuously by default, and acts as a filter/selector for pins on the globe.

## Scope

**In scope for this phase:**
- New Sanity schemas (`location`, `trip`, `visit`) and migration of existing pin groupings.
- Globe page updates: timeline component, pin-per-location model, multi-visit pin panels, trip panels, arcs, playback animation.
- Trip article route (`/trip/<slug>`) and sliver integration.
- URL state, deep-linking, 404 fallback.
- Mobile layout restructuring (timeline below globe, content region below timeline, default trip list).

**Explicitly out of scope for this phase:**
- **Wardrobe view is untouched.** The wardrobe shows items only and gains no timeline chrome. Item-detail-page references to trips/visits are deferred (see [Section 13](#13-accessibility--deferred-ux)).
- Accessibility polish (keyboard nav, screen readers).
- Per-trip color differentiation.
- Search or filtering.
- Tablet-specific layout tuning.

---

## Table of Contents

1. [Data Model](#1-data-model)
2. [Desktop Layout](#2-desktop-layout)
3. [Mobile Layout](#3-mobile-layout)
4. [Timeline Component](#4-timeline-component)
5. [Playback Animation](#5-playback-animation)
6. [Pins & Arcs on the Globe](#6-pins--arcs-on-the-globe)
7. [Panel Behaviors](#7-panel-behaviors)
8. [Trip Article Integration](#8-trip-article-integration)
9. [Interaction Matrix](#9-interaction-matrix)
10. [Mobile-Specific Reframing](#10-mobile-specific-reframing)
11. [Migration from Legacy Pin Groupings](#11-migration-from-legacy-pin-groupings)
12. [Empty States & Edge Cases](#12-empty-states--edge-cases)
13. [Accessibility & Deferred UX](#13-accessibility--deferred-ux)
14. [File Inventory](#14-file-inventory)
15. [Implementation Order](#15-implementation-order)
16. [Open Questions](#16-open-questions)
17. [Visual Design Defaults](#17-visual-design-defaults)

---

## 1. Data Model

### 1.1 New concepts

| Concept | Definition |
|---|---|
| **Visit** | One location + one time period (start/end dates) + associated items. Has no article body. Not user-navigable via URL. |
| **Trip** | One or more visits, chronologically ordered by start date. Has an optional article body. User-navigable at `/trip/<slug>`. |

### 1.2 Relationships

- **Visit → Trip**: every visit belongs to exactly one trip. A visit with no associated grouping is wrapped in an implicit single-visit trip. Enforced at the data model level to avoid orphan visits.
- **Item ↔ Visit**: many-to-many. A single item can appear in multiple visits across multiple trips.
- **Item without visits**: permitted. Such items live in the wardrobe only and do not appear on the globe.
- **Trip → Article**: article body is optional. A trip can exist purely as a time/location wrapper while content is being drafted.

### 1.3 Slugs and URLs

- `/trip/<slug>` — trip article page. First-class URL.
- `/visit/<slug>` — **not implemented.** Visits are only reached via pin panel interaction. No user-navigable route.

### 1.4 Sanity CMS

Sanity is the source of truth. New document types:

- `location` — name, lat, lng. A **shared, referenceable** document. Multiple visits at the same place (e.g., Berlin 2022, Berlin 2024) reference the **same** `location` doc. This is what allows the globe to collapse multiple visits onto a single pin.
- `trip` — title, slug, `articleBody` (optional, rich text). `startDate` and `endDate` are **auto-computed** from visits (min start, max end) rather than stored as separate fields.
- `visit` — reference to a `location` doc, `startDate`, `endDate`, reference to parent `trip`.

Data integrity rules:

- A `trip` with zero visits is invalid and will not render on the timeline. Treat as a content-authoring error (CMS should flag if possible).
- A `visit` without a `location` or `trip` reference is invalid.
- Two visits are considered "at the same pin" if and only if they reference the same `location` document. Lat/lng proximity is **not** used for pin grouping (to avoid ambiguity).

### 1.4.1 Item ↔ Visit reference direction

Many-to-many is modeled with references on **one** side (Sanity convention — avoid bidirectional redundancy that can go out of sync):

- Recommended direction: **`visit.items`** — each visit holds an array of item references. Rationale: visits are the new "hub" objects; querying "what items were at this visit" is the common read path.
- Alternative: **`item.visits`** — each item holds an array of visit references. Slightly better if the common read is "what visits is this item in."
- Pick **one** direction during implementation. Do not model both sides.

### 1.4.2 Date granularity and display format

- Dates on visits are stored with **day precision** (`YYYY-MM-DD`).
- Display format conventions:
  - **Full date** (within a visit's section header, when space allows): "March 15, 2022".
  - **Month-year** (common compact form, e.g., within sticky panel headers): "March 2022".
  - **Date ranges** (trip panel header): "March 2022 – April 2022" or "March 15 – April 3, 2022" depending on span.
- Visits with the same month (e.g., two visits in March 2022) are ordered by their day precision. If two visits have the exact same date, fall back to Sanity document creation order.

### 1.4.4 Timeline label text

- Timeline label text = the **trip's `title` field** as authored in Sanity. No automatic formatting, year-stamping, or truncation server-side.
- Authors are expected to keep trip titles short (e.g., "Morocco '18", "Berlin Spring '24") to fit the timeline strip.
- Client may apply ellipsis truncation if a label overflows its allotted width at a given zoom level.

### 1.4.3 Slugs

- Trip slugs are **manually authored** in Sanity (to allow human-readable URLs like `/trip/berlin-2022`). Sanity's slug field supports auto-generation from title as a default; author can override.

---

## 2. Desktop Layout

Vertical order (top to bottom), on the globe page:

```
┌───────────────────────────────────────────────────┐
│                TIMELINE STRIP                     │  ~10–15% viewport height
├───────────────────────────────────────────────────┤
│                                                   │
│                     GLOBE                         │  remaining height
│                                                   │
│   (detail panel slides in from right when active) │
│                                                   │
└───────────────────────────────────────────────────┘
```

- Timeline sits **above** the globe, **full viewport width at all times** — its width does not change when the sidecar panel opens or when the article sliver opens. This keeps the timeline as a consistent top-level control surface regardless of other UI state.
- Pin panel and trip panel slide in as the existing right-edge sidecar (Phase 5A mechanism).
- Article sliver (Phase 5B) pushes globe to the left and renders to the right, centering on the relevant pin. Timeline remains at top of viewport, spanning full width above both the shrunken globe and the article sliver.
- The timeline remains fully interactive while the article sliver is open: users can hover/click other trip labels to preview or switch. See [Section 8.5.1](#851-switching-trips-while-the-article-sliver-is-open).

---

## 3. Mobile Layout

Vertical order (top to bottom):

```
┌───────────────────────────┐
│           GLOBE           │  not sticky — scrolls with page
├───────────────────────────┤
│        TIMELINE STRIP     │  proportional height, squeezes slightly
├───────────────────────────┤  ↓ scrollable content region ↓
│                           │
│   Default: trip list      │
│   Selected: panel content │
│   Article: sliver content │
│                           │
└───────────────────────────┘
```

- Sidecar panel from Phase 5A is **removed** on mobile. All formerly-sidecar content lives in the scrollable region below the timeline.
- Globe is **not sticky** — the user can scroll past it to read content comfortably.
- Timeline is **sticky** to the top of the viewport once the globe has scrolled out of view. As the user scrolls down into the content region, the timeline shrinks slightly in vertical height (squeeze effect) but remains visible, so a locked trip's context is always at hand.
- Landscape orientation: no dedicated optimization. Globe remains usable; user scrolls to reach the timeline.

See [Section 10](#10-mobile-specific-reframing) for detailed mobile interaction.

### 3.1 Breakpoint

- Mobile layout activates below the Tailwind `md` breakpoint (**768px** by default, auto-detected from Tailwind config).
- Desktop layout applies at `md` and above.
- Tablet-sized viewports (768–1024px) use the desktop layout. The sidecar panel on a 768px screen will be cramped but acceptable; further tablet-specific polish is deferred.

---

## 4. Timeline Component

### 4.1 Visual structure

- Horizontal strip showing time on the x-axis.
- Each trip rendered as a labeled segment whose length = latest visit end − earliest visit start.
- Labels float **above or below** the segment, placed by density to minimize collision.
- Overlapping trips stack vertically on the bar (at most ~2 expected in practice).

### 4.2 Scale and compression

- Compressed empty stretches: long gaps between trips do not dominate horizontal space.
- Trip-dense regions expand proportionally.
- **Algorithm**: left to implementation discretion. A reasonable default is piecewise-linear — compute the total "active" time (sum of trip durations + small padding), then allocate a larger share of horizontal space to active regions and compress empty regions to a fixed minimum visual width.
- Year/month axis labels still reflect **real** time at their visual position — the compression is only visual, not a relabeling.

### 4.3 Zoom and pan

- Min zoom = full history (earliest trip → today).
- Max zoom ≈ ~1 month window.
- Pan bounds are locked: earliest trip start ↔ today. No panning into pre-data or post-today empty space.
- Desktop: scroll wheel or pinch gesture to zoom; click-drag to pan.
- Mobile: two-finger pinch to zoom (horizontal only; center of gesture = zoom focal point); one-finger horizontal swipe to pan.

### 4.4 Labels

- Placed above or below by density.
- On collision (density failure): labels **rotate to 45°** (default) and also become hover-only reveal.
- Minimum segment pixel width for clickability — segments too narrow render as a small dot with hover-only info. **One-day (or otherwise very short) segments always render as a dot** rather than being artificially widened.
- Trip segments clipped by the current zoom window display a small visual cue at the edge indicating "extends further" (use discretion; keep it subtle and within the timeline bounds).

**Dot rendering behavior**: a dot-rendered trip still participates in all interactions — hover preview, click lock, playback highlight (the dot lights up as the playhead crosses it). The dot is a visual representation only, not a functional degradation.

### 4.5 Time axis

- Year labels along the bottom at all zoom levels.
- Month labels appear as the zoom level increases into shorter ranges.
- A **"today" marker** at the right edge of the timeline (the `endDate` boundary). Visual treatment: a subtle vertical line with a small "today" label. Intentionally understated.

### 4.6 Visit-level markers

Because pin clicks highlight only the **subregion of a trip segment corresponding to the clicked visit** (see [Section 9.2](#92-pin)), the timeline tracks visit boundaries within each trip segment.

- Visit tick marks are **hidden in the idle state** to keep the timeline visually calm.
- When a trip is **highlighted** (previewed or locked, or has a pin-click sub-region active), that trip segment reveals **subtle tick marks** between its visits, and the affected sub-range renders a distinct colored band over just that visit's portion.
- Non-highlighted trip segments never show visit ticks.

### 4.7 Gesture ownership (mobile)

- Timeline is a **dedicated gesture zone**. Horizontal swipe within the strip pans the timeline (not the globe).
- Vertical swipe on the timeline passes through to page scroll.

---

## 5. Playback Animation

Default state of the timeline: a continuous playback animation sweeps present → past, highlighting trips as the playhead crosses them. The globe is never truly static.

### 5.1 Playhead

- Thin vertical line across the timeline bar.
- Moves smoothly and continuously (not discrete trip-to-trip hops).
- Starts at the present edge.
- **Hides during user timeline interaction** (while panning, zooming, hovering a label, etc.). Reappears at the **right edge** (present) once interaction fully stops.
- Shown on both desktop and mobile.

### 5.1.1 Initial load behavior

- While trip data is loading, the globe **passively spins** (same slow rotation as the current idle state from prior phases). No playhead is shown, no timeline highlights are active.
- Timeline itself renders with a skeleton bar via boneyard-js during the load (see [Section 12.5](#125-loading-state)).
- Once all trip data is loaded, the passive spin **continues** — it does not stop. The playback sweep begins from the present edge as an additional highlight layer on top of the ever-spinning globe.
- Mid-animation "pop-in" of newly-arrived trips is not acceptable — all data must be resolved before the sweep starts.

### 5.2 Speed

- Approximately **5 seconds per half-year of trips** (configurable).
- Compressed empty stretches still move at visible pace — the playhead represents more real time per pixel in empty regions.

### 5.3 Loop

- When playhead reaches the earliest trip: playhead stays at that position for **5 seconds** (globe in fully neutral state — nothing highlighted, nothing dimmed), then resets to the present and resumes.

### 5.4 Pause triggers

Any of the following **pause** auto-playback:

- Hovering a trip label on the timeline.
- Hovering the floating playhead label.
- Clicking a trip label (lock).
- Panning or zooming the timeline.
- Clicking-and-dragging the globe to rotate it manually.
- Hovering a pin on the globe (desktop only — same as label hover, since it previews arcs and timeline sub-regions).

The following **do not** pause playback:

- Scrolling the page (mobile), except where the scroll involves the timeline itself.
- Brief cursor transit over the timeline without stopping.

### 5.5 Resume

- The resume countdown (**default: 5 seconds**) only starts once the user has **fully stopped interacting** — no active hover on a label, no touch on the timeline, no in-progress drag.
- If a trip is currently **locked** (user clicked a label): playback stays paused indefinitely until the trip is deselected. The 5s idle timer does not run while a trip is locked.
- When playback does resume, it picks up **from where the playhead was when interaction started** — not from the present edge.
- **Zoom state resets on resume.** If the user zoomed the timeline during interaction, the timeline animates back to full-history max zoom when playback restarts.

### 5.6 Pause UI

- No play/pause icon. No scrubber chrome. No video-player-style UI. The presence of the moving playhead is the only cue.

### 5.7 Floating label

- While playback is active, a small floating label near the playhead shows the name of the currently-playing trip.
- Desktop: clicking this floating label behaves the same as clicking the trip's timeline label (locks the trip).
- Mobile: a single tap on the floating label **previews** the trip (same behavior as single-tap on the timeline label) — it expands to show trip name, dates, and "View trip" button. The "View trip" button locks the trip.

### 5.8 Camera during playback

- The globe's **passive idle rotation continues** throughout auto-playback. Playback does not drive the camera — it only changes which pins/arcs are highlighted.
- Passive spin and playback highlights are independent animation layers that run in parallel. They never conflict: playback adds the highlight layer on top of the ever-spinning globe.
- Passive spin **does** stop when:
  - A trip is locked (camera rotates to fit and holds).
  - The user is manually dragging the globe.
  - An article sliver is open (camera is held centered on the target pin).
- After any of the above ends and idle state resumes, the passive spin restarts after a short delay (matches the playback resume delay, default 5s).

### 5.9 Overlapping trips

- If the playhead is in a region where two trips overlap in time, **both** trips are highlighted simultaneously using the single highlight color. Arcs for both thicken. Visual overlap of arcs is acceptable and not disambiguated.
- The floating label in overlap regions displays both trip names, separated by a bullet: e.g., "Trip A · Trip B". Keep compact — truncate with ellipsis if total label width would exceed a reasonable limit (e.g., ~240px).

---

## 6. Pins & Arcs on the Globe

### 6.1 Pins

- One pin per unique **location**, not per visit.
- A location with multiple visits (e.g., Berlin 2022 + Berlin 2024) has **one pin** that expands to a list on click.
- Pin hover label format: for multi-visit pins, "**Location · N visits**" (e.g., "Berlin · 2 visits"). For single-visit pins, just "**Location**" (e.g., "Berlin"). The detailed date breakdown appears within the panel itself when the pin is clicked.

### 6.2 Arcs

- Arcs connect the visits **within a single trip**, in chronological order.
- **Always visible** as thin muted gray lines, regardless of active state.
- **Non-directional**: no arrowheads, no gradient. Plain arcs.
- Repeated locations within a single trip (e.g., A → B → A → C): pin A appears once; three distinct arcs drawn between the unique pairs.
- Single-visit trips: no arc. No distinct visual treatment for single-visit trips on the globe.

### 6.3 Arc states

| State | Appearance |
|---|---|
| **Idle** | Thin muted gray |
| **Trip preview** (hover label, or pin belonging to any highlighted trip) | Thicker, highlight color |
| **Trip locked** (clicked label) | Thicker, highlight color, slow in-and-out pulsing loop |
| **Playback active on trip** | All of the trip's arcs thicken and pulse (appearing at once when playhead enters); fade out as playhead leaves |

Highlight color is a **single color** — not per-trip. Overlapping trips share the highlight.

---

## 7. Panel Behaviors

Two panel variants exist: **pin panel** (clicked a pin) and **trip panel** (clicked/locked a trip label). Both use the same underlying sliver/region, differentiated by content and header.

### 7.1 Pin panel

Opened when the user clicks a pin.

- Visit sections, scrollable.
- **Order: chronological descending** — most recent visit on top.
- Sticky per-visit header with date + trip name. Header swaps when the next section's header reaches the top.
- Each section has its own **"View trip article"** link (each section comes from a potentially different trip).
- Items within each visit section are collapsed by default: header row with chevron and item count (e.g., "12 items"). Expands on click.
- **Panel header format**: for a multi-visit pin, "Location · N visits" (e.g., "Berlin · 2 visits"). For a single-visit pin, just "Location" (e.g., "Berlin"). The individual visit dates are surfaced within each visit's sticky section header, not in the panel header.
- Close X button at the top of the panel.

### 7.2 Trip panel

Opened when the user clicks/locks a trip label on the timeline (or the floating playhead label).

- Visit sections, scrollable.
- **Order: chronological ascending** — earliest visit first.
- Sticky per-visit header with date + location. Header swaps on scroll as above.
- **One global "View trip article"** button at the panel top. Per-visit sections do **not** duplicate this link.
- Items in each visit section collapsed by default, same as pin panel.
- **Panel header contents: trip title + date range + visit count.** All three displayed.
- Close X button at the top of the panel.

### 7.3 Item duplication inside trip panel

If the same item appears in multiple visits within a single trip (e.g., worn on visit 1 and visit 3), the item is listed **once per visit** (duplicated). Deduplication is explicitly deferred.

### 7.3.1 Item click within any panel

- Clicking an item card within a pin panel or trip panel uses the **existing Phase 5B article sliver behavior**: the globe shifts left, the item's article fills the right portion, and the panel stays open behind it. Dismiss via globe click as before.
- This is unchanged from Phase 5B — the new trip/visit data model does not alter per-item navigation.

### 7.3.2 Panel variant transitions

When a panel swaps between variants (pin panel → trip panel, trip panel → pin panel):

- Cross-fade the panel contents over ~200ms. The panel container itself does not slide or resize — only the inner content transitions.
- Sticky headers and scroll position reset on variant switch (each new panel starts at the top).
- **Item expansion state resets** as well — all item sections return to their collapsed default. Expansion state does not persist across panel closes, reopens, or variant switches within a session.

### 7.3.3 Panel close behavior

- Clicking the panel's close X button **fully deselects** the current state:
  - If pin panel was open (nothing locked): clears timeline highlight, closes panel. URL stays at `/globe`.
  - If trip panel was open (trip locked): deselects the trip, closes panel, clears timeline highlight. URL returns to `/globe`.
- Closing the panel never leaves a trip locked in a "panel-less but still selected" state.

### 7.4 Panel highlight on pin-trip cross-interaction

When a trip is locked and the user interacts with a pin that belongs to that trip:

- **Click**: panel scrolls to that visit's section. The auto-scroll takes **priority** over the user's current scroll position — the user may be scrolled elsewhere, but the click intent is to focus their attention on this visit. Section receives a brief background-tint pulse (no border glow, no animation beyond the pulse), then returns to normal.
- **Hover**: section receives the same background tint, held for the duration of the hover, no scroll.

If the pin clicked during a trip lock **does not** belong to the locked trip: panel closes, trip is deselected, pin panel opens for the clicked pin.

### 7.5 Pin click also highlights timeline (visit subregions only)

When a pin is clicked and nothing is currently locked:

- Pin panel opens.
- The timeline highlights **only the sub-region within each trip segment that corresponds to the visit at this location** — not the entire trip segment. For example, clicking a Berlin pin with visits in trip X (2022) and trip Y (2024) highlights two narrow bands: the Berlin visit's window within trip X's segment, and the Berlin visit's window within trip Y's segment. Arcs radiating from Berlin on the globe are shown for both trips.
- This rule exists because highlighting entire trip segments on a multi-trip pin click could visually highlight the globe too broadly (a trip might span many other unrelated cities).
- Dismissing the pin panel clears the timeline highlight.

---

## 8. Trip Article Integration

Trip articles reuse the **Phase 5B article sliver mechanism**.

### 8.1 Opening

- Trigger: clicking "View trip article" from either the pin panel (per visit section) or the trip panel (global button).
- The trip panel **remains open behind the sliver** — it does not close.
- Globe pans to the **first (earliest) visit's pin** of the trip. That pin is centered vertically and horizontally within the sliver viewport (consistent with item article behavior).

### 8.2 Dismissing

- Same dismiss behavior as item article sliver (click globe acts as back button).
- On dismiss: returns to the **trip-locked state** (trip panel visible, trip segments highlighted). Does **not** fully deselect the trip.
- To fully deselect the trip after dismissing the sliver: click outside the panel area again.

### 8.3 Empty article body

- Trip exists with no article body: "View trip article" link is **grayed out**.
- Desktop: tooltip on hover reads "No content available for this trip."
- Mobile: tap on the grayed-out link shows the same message as a popover label (mobile-appropriate tooltip UI).
- If the user navigates directly to `/trip/<slug>` where the trip has no body, the page renders with only nav chrome — no specific skeleton/placeholder state.

### 8.4 URL state and deep linking

- Locking a trip (via timeline label click or floating playhead label) updates the URL to `/globe?trip=<slug>`.
- Opening the trip article sliver navigates to `/trip/<slug>`.
- Dismissing the sliver returns the URL to `/globe?trip=<slug>` (trip remains locked).
- Full trip deselect (click outside) returns the URL to `/globe`.
- **Cold load on `/trip/<slug>`**: the globe page loads with the article sliver already open. The globe plays its intro animation and pans to the trip's first visit. After the user dismisses the sliver, they land in the `/globe?trip=<slug>` state.
- **Cold load on `/globe?trip=<slug>`**: globe loads with that trip locked (panel open, camera rotated to fit visits) — no sliver.

### 8.5 Invalid URL fallback

- If the user loads `/trip/<slug>` or `/globe?trip=<slug>` where `<slug>` does not exist in Sanity:
  1. Show a brief **404 message** (e.g., "Trip not found").
  2. Automatically redirect to `/globe` (default state) after a short delay (~1.5s).
- The 404 message should be simple text chrome — no elaborate illustrations needed.

### 8.5.1 Switching trips while the article sliver is open

- User is on `/trip/A` with its article sliver open. They click a different trip's label (trip B) on the timeline.
- Behavior: the article sliver for trip A **closes** (globe shifts back to center), trip B becomes the newly locked trip, camera rotates to fit trip B, trip panel opens with trip B's contents. URL updates to `/globe?trip=B`.
- The user does **not** automatically see trip B's article sliver — they must click "View trip article" from the trip B panel to open it. This avoids stacking/replacing sliver content mid-read.

### 8.6 Browser history

- Each URL state change (lock trip, open sliver, deselect) pushes a new history entry. Back button reverses the last state change:
  - Back from `/trip/<slug>` → `/globe?trip=<slug>` (sliver closes, trip stays locked).
  - Back from `/globe?trip=<slug>` → `/globe` (trip deselects).
  - Back from `/globe` → previous site page.
- Forward button is symmetric.
- Use `router.push` (not `replace`) for all state transitions except the invalid-URL redirect, which uses `replace` to avoid polluting history with the 404.

### 8.7 SEO considerations

- The `/trip/<slug>` route must render the trip's article body server-side so search engines index the content (not only the sliver overlay). The sliver is a client-side presentation layer on top of the globe; the underlying HTML should include the article markup regardless of whether the sliver is visually open.
- This aligns with the existing Phase 5B item article treatment.

---

## 9. Interaction Matrix

### 9.1 Timeline label

| Input | Action |
|---|---|
| Hover (desktop) | Preview: trip arcs thicken + highlight color, visit tick marks reveal on the trip segment, pins in the trip light up. No camera rotation. No panel. |
| Click (desktop) | Lock: preview behaviors + camera rotates to fit trip's visits + trip panel opens. URL updates to `/globe?trip=<slug>`. |
| Click on already-locked label | Deselect (returns to idle state, URL back to `/globe`). |
| Click on a different trip's label while locked | Instant switch to the new trip (camera rotates, panel contents swap, URL updates). |
| Single tap (mobile) | Preview: same globe behaviors as desktop hover. Label additionally expands inline to show trip name, dates, and "View trip" button. |
| "View trip" button tap (mobile) | Lock (same as desktop click). |
| Tap a different label while one is locked (mobile) | Enter preview state for the new trip alongside the locked one — see [Section 10.3.1](#1031-switching-trips-on-mobile-preview-while-locked). |

### 9.2 Pin

| Input | Action |
|---|---|
| Hover (desktop) | Hover label appears: "Location · N visits". Arcs radiating from the pin preview-highlight for all trips containing those visits. **Timeline also highlights the visit sub-regions** within each containing trip's segment (same behavior as click, but transient — only for duration of hover). |
| Click (desktop, nothing locked) | Pin panel opens. Timeline highlights **only the visit sub-regions** within each containing trip's segment (see [Section 7.5](#75-pin-click-also-highlights-timeline-visit-subregions-only)). |
| Click (desktop, trip locked, pin is part of trip) | Panel scrolls to that visit's section with a brief background-tint pulse. Auto-scroll takes priority over user scroll position. Scroll uses ~300ms ease-out (tunable). |
| Click (desktop, trip locked, pin NOT part of trip) | Panel closes, trip deselects, pin panel opens for the new pin. URL updates accordingly. |
| Tap (mobile) | Opens the pin panel immediately — there is no preview-step equivalent to timeline single-tap. (Mobile pins don't need a preview: pins aren't as crowded as timeline labels.) Pin panel replaces the content region below the globe. A back arrow / X in the content region returns to the default trip list. |

Note: on mobile, the hover-label popover ("Location · N visits") still appears briefly during the tap gesture as visual feedback, but it does not require a separate gesture to see.

### 9.3 Globe surface (non-pin area)

| Input | Action |
|---|---|
| Click (no drag) | Deselects locked trip if any. Dismisses panel. |
| Click-drag | Rotates globe manually. Pauses playback. Stops passive spin. Does **not** deselect a locked trip. |
| Click-drag while trip is locked | Camera moves freely where the user drags. On release, camera stays where it was dragged — the "fit to visits" framing is not restored. (Consistent with [Section 5.8](#58-camera-during-playback) deselect behavior.) |
| Click-drag while article sliver is open | Camera moves; target pin is no longer centered in the sliver until sliver is dismissed or reopened. |

**Click vs drag distinction**: a pointer event is treated as a "click" if the pointer moved less than ~5px between mousedown and mouseup; otherwise it's a drag. Drag gestures do not trigger click handlers.

### 9.4 Timeline surface (non-label area)

| Input | Action |
|---|---|
| Click/tap | Deselects locked trip. |
| Drag / swipe | Pans timeline. Does not deselect. |
| Scroll wheel / pinch | Zooms timeline. Pauses playback. |

---

## 10. Mobile-Specific Reframing

### 10.1 Below-globe content region

This region is scrollable and holds one of the following states:

1. **Default (nothing selected)** — a chronologically descending list of all trips (most recent first). **Minimalist text rows** — no thumbnails, no visit counts beyond what's in the title. No pagination: the full list renders as one long scroll. Each row links into that trip (equivalent to locking it — camera rotates, timeline label lights up, URL updates).
2. **Pin panel** — same content as desktop pin panel, rendered inline in this region.
3. **Trip panel** — same content as desktop trip panel, rendered inline in this region.
4. **Article sliver** — replaces the content region with the article body. The **globe still renders above** (it does not take over the full viewport). Timeline still renders between the globe and the article.

### 10.2 Navigation chrome

- A **back arrow / close X button** appears at the top of the content region whenever the state is anything other than default. Same component — the two symbols are used interchangeably depending on context. Tapping it returns to the default trip list and deselects the active trip/pin.

### 10.3 Preview label (mobile)

When a user single-taps a trip label on the timeline:

- The label expands inline on the timeline to show: trip name, date range, and a **"View trip"** button.
- Tapping "View trip" locks the trip (camera rotates, trip panel replaces the content region below, URL updates).
- After locking, the **expanded preview label stays visible on the timeline** in a distinct "locked" styling — it does not collapse until deselect.
- Tapping the label again, or elsewhere on the timeline, collapses the preview label and deselects.

### 10.3.1 Switching trips on mobile (preview while locked)

Unlike desktop (which instantly switches lock from trip A to trip B on label click), mobile introduces an **intermediate preview step** for better touch ergonomics:

1. A trip is locked. Its expanded label is visible in "locked" styling.
2. User taps a **different** trip's label. That trip enters a temporary **preview** state — its label expands alongside the locked label but in a distinct **preview styling** (separate color/treatment from "locked").
3. The user can then tap "View trip" on the preview to swap the lock — the previously-locked trip collapses and the new trip becomes locked.
4. Tapping anywhere outside the two labels, or tapping the previewed label's collapse area, dismisses the preview without swapping.
5. **Only one preview at a time.** If a third trip's label is tapped while the first is locked and a second is in preview, the second preview collapses and the third enters preview state.

**Visual distinction between "preview" and "locked" states**: use two variants of the same accent — e.g., the locked label uses the full highlight color while the preview label uses a lighter/desaturated variant. Concrete color values deferred to [Section 17](#17-visual-design-defaults).

**Globe behavior during preview-while-locked**: the locked trip's arc highlights stay visible (pulsing). The previewed trip's arcs additionally highlight as a second layer. Because both use the same highlight color, this presents as a superset of pins/arcs lit up — equivalent to the "overlapping trips" visual treatment from [Section 5.9](#59-overlapping-trips).

### 10.4 Timeline squeeze on scroll

- When the user scrolls the page down past the globe, the timeline slightly shrinks vertically — a subtle cue that focus is on the scrollable content.

### 10.5 Landscape

- No special handling. Globe remains usable; the timeline scrolls below.

---

## 11. Migration from Legacy Pin Groupings

Phase 5A/5B pins are location-based groupings of items without explicit trip/visit structure. These are **migrated, not preserved alongside**.

### 11.1 Migration steps

1. For each existing pin grouping, infer or manually assign dates.
2. Wrap the pin's items into a single **Visit** at that location + time.
3. Wrap that visit in an implicit single-visit **Trip** (no article body).
4. Delete the legacy grouping structure.

Migration happens in Sanity (via script or manual content authoring). No dual-model period in code — cut over cleanly.

---

## 12. Empty States & Edge Cases

### 12.1 Zero trips

- Timeline renders with a muted "Nothing yet" message. Not hidden.
- Globe renders empty (no pins).

### 12.2 Single-trip user

- There is no dormant threshold. Playback runs its normal sweep regardless of how few trips exist. A single-trip user sees the sweep pass that one trip, loop back, and repeat.

### 12.3 Visit with zero items

- Still renders as a pin on the globe.
- Still renders a section in its pin panel and/or trip panel.
- No "Items coming soon" placeholder copy in the section.

### 12.4 Trip with all empty visits

- Still renders its full segment and label on the timeline.
- Article-only trips (no items across all visits) are a **first-class case** — expected to be common during content authoring.

### 12.5 Loading state

- Timeline renders a **skeleton bar** via boneyard-js during data fetch.
- Globe uses existing loading behavior from prior phases.

### 12.6 First paint

- Playback animation starts once all trip data is resolved. Before that, the globe passive-spins and the timeline renders a skeleton bar.

### 12.7 Data fetch failure

- If Sanity data fails to load (network error, query failure):
  - Globe renders empty (no pins).
  - Timeline shows an inline error state: "Could not load timeline. Retry." with a retry affordance.
  - No 404 redirect (the URL is valid; the data fetch is the problem).
- Partial failures (e.g., some trips load, some fail) are not specially handled in this phase — treat as full failure for simplicity.

### 12.8 Escape key (desktop)

- Pressing **Escape** dismisses state in layered order:
  - Article sliver open → closes sliver (returns to trip-locked or pin-open state).
  - Panel open, no sliver → closes panel and deselects trip/pin.
  - Nothing open → no-op.

---

## 13. Accessibility & Deferred UX

The following are **explicitly deferred** from this phase:

- Keyboard navigation of the timeline (arrow keys between trips).
- Screen reader announcements for playback state and trip selection.
- Per-trip color distinction (all highlights share one color).
- Item-dedup within a trip panel.
- Mobile landscape optimization.
- Many-trip overlap stacking beyond 2 rows (fallback to collapse/badge).
- Item detail page listing the trips/visits the item belongs to.
- Search or filtering within the timeline or trip list.

---

## 14. File Inventory

_(To be filled in during implementation planning. Expected areas of change:)_

- `sanity/schemaTypes/` — new `trip.ts` and `visit.ts`; update `item.ts`.
- `app/` — globe page layout changes for timeline placement (desktop + mobile).
- `components/globe/` — new `Timeline.tsx`, `TimelinePlayback.ts`, `TripArcs.tsx`, updates to existing pin/panel components.
- `components/globe/panels/` — split or refactor existing panel into PinPanel + TripPanel variants.
- `lib/` — data-fetching helpers for Sanity trip/visit queries; playback state management.
- `app/trip/[slug]/` — new route for trip article pages.

---

## 15. Implementation Order

_(Proposed — to be refined once open questions are resolved.)_

1. Sanity schema: `trip`, `visit`. Update `item` with visit references. Author a small migration script for existing pin groupings.
2. Data-fetching utilities: `getTrips()`, `getVisitsForPin()`, `getTripBySlug()`.
3. Static (non-playback) timeline: render trip segments, labels, basic zoom/pan.
4. Pin behavior: update to be per-location with multi-visit support. Hover label with visit list.
5. Pin panel: multi-visit variant with sticky headers.
6. Trip panel: ascending-order variant with global "View trip article" button.
7. Panel cross-interactions: pin-click-highlight-timeline, pin-click-while-trip-locked.
8. Arcs: always-visible thin arcs.
9. Camera: rotate-to-fit on trip click.
10. Trip article route and sliver integration.
11. Playback animation: playhead, loop, pause/resume, floating label.
12. Arc playback states: thickening, pulsing, in/out on playhead entry/exit.
13. Mobile layout: timeline-below-globe, content region, default trip list.
14. Mobile preview label with "View trip" button.
15. Polish: label rotation, zoom bounds, segment clipping cue, loading skeleton.

---

## 16. Open Questions

All remaining items are **non-blocking tuning knobs** — reasonable defaults are proposed and can be adjusted during implementation based on feel:

1. **Passive globe spin rotation speed** — match existing idle rotation from prior phases. Verify rate still feels right as a "loading" state.
2. **404 redirect timing** — default ~1.5s.
3. **Default trip list row content (mobile)** — proposed: two-line row with trip title (primary) on top and date range in muted text beneath. No thumbnails. Author can verify once populated with real data.
4. **Camera zoom cap for globe-spanning trips** — default: fit-to-bounds with max zoom cap at ~40% of globe visible. Tune if trips like "Tokyo + NYC + Sydney" look bad.
5. **Panel auto-scroll feel** — default 300ms ease-out.
6. **Floating playhead label position** — default: rendered **within the timeline strip** (not floating above or below it), attached to the playhead and offset slightly so it doesn't occlude trip labels. Edge-of-viewport behavior: slide toward center so the label stays fully visible; never clip.
7. **Drag-threshold pixel value** — default ~5px before mousedown→mouseup is classified as a drag rather than a click. Tune for feel.
8. **Minimum trip segment width** — default: segments below ~12px wide render as a dot instead of a bar. Tune for density.

---

## 17. Visual Design Defaults

These are **starting defaults** for implementation. All colors are intentionally conservative; review and iterate once the system is running.

### 17.0 Dark mode detection

- Dark mode is active when the `.dark` class is present on `<html>` or any parent element (inherits the existing site-wide convention — same mechanism used by boneyard-js per AGENTS.md).
- Timeline, arcs, panels, and all Phase 5C visual elements must listen to this state and swap color variables accordingly. No separate dark-mode toggle is introduced.

### 17.1 Light mode

| Element | Default |
|---|---|
| Timeline track (background) | `rgba(0, 0, 0, 0.05)` |
| Trip segment (idle) | `rgba(0, 0, 0, 0.20)` |
| Trip segment (highlighted/locked) | Project accent color, full saturation |
| Trip label (idle) | Body text color |
| Trip label (highlighted) | Accent color |
| Mobile preview label (non-locked preview state) | Accent color at ~50% saturation |
| Mobile preview label (locked state) | Accent color, full saturation |
| Playhead | `rgba(0, 0, 0, 0.7)` |
| Floating label background | White with subtle shadow |
| "Today" marker | `rgba(0, 0, 0, 0.35)` thin line + small label |
| Arc (idle) | `rgba(0, 0, 0, 0.15)` |
| Arc (highlighted) | Accent color |
| Visit tick mark (only when trip highlighted) | Accent color at ~40% saturation |

### 17.2 Dark mode

| Element | Default |
|---|---|
| Timeline track (background) | `rgba(255, 255, 255, 0.05)` |
| Trip segment (idle) | `rgba(255, 255, 255, 0.18)` |
| Trip segment (highlighted/locked) | Project accent color, slightly brighter |
| Trip label (idle) | Body text color (light) |
| Trip label (highlighted) | Accent color |
| Mobile preview label (non-locked preview state) | Accent color at ~50% saturation |
| Mobile preview label (locked state) | Accent color, full saturation |
| Playhead | `rgba(255, 255, 255, 0.8)` |
| Floating label background | Dark surface with subtle border |
| "Today" marker | `rgba(255, 255, 255, 0.40)` thin line + small label |
| Arc (idle) | `rgba(255, 255, 255, 0.15)` |
| Arc (highlighted) | Accent color |
| Visit tick mark (only when trip highlighted) | Accent color at ~40% saturation |

### 17.3 Animation timings (defaults)

| Action | Duration | Easing |
|---|---|---|
| Panel auto-scroll (pin-click within locked trip) | 300ms | ease-out |
| Background-tint pulse on visit section | 600ms | ease-in-out (fade up, hold briefly, fade down) |
| Camera rotate-to-fit on trip lock | ~800ms (cinematic range) | ease-in-out |
| Camera rotate on pin click | ~500ms (snappy range) | ease-out |
| Arc fade-in on playback entry | ~400ms | ease-out |
| Arc fade-out on playback exit | ~400ms | ease-in |
| Arc pulse loop (locked trip) | 2s period | sine in/out |
| Trip segment highlight transition (idle → highlighted) | 200ms | ease-out |
| Mobile preview label expand | 200ms | ease-out |
| 404 → redirect delay | 1500ms | — |
| Playback idle-resume delay | 5000ms | — |
| Playback speed | ~5s per half-year of trips (tunable) | linear |

All timings above are defaults — tunable via constants in implementation.

---

_This spec captures decisions from iterative design conversations. Any behavior not covered here defaults to "consult before implementing"._
