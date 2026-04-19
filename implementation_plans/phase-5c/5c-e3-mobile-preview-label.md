# 5C-E3 — Mobile preview label + preview-while-locked switching

**Epic**: E. Mobile reframing · **Owner**: Dev C · **Can be run by agent?**: Partial — touch interaction feel needs real device review · **Estimated size**: M

## Dependencies

### Hard
- **E1** — mobile layout with timeline positioned correctly.
- **B4** — timeline segments have real click handlers.

### Soft
- None.

### Blocks
- None directly. F2 perf pass would include.

---

## Goal

Mobile single-tap on a timeline label → inline "preview" expansion showing trip name, date range, "View trip" button. "View trip" tap → locks the trip. Tapping a different label while one is locked → expands the new label in distinct preview styling (coexists with locked label). "View trip" on preview → swaps lock.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §10.3 Preview label (mobile)
- §10.3.1 Switching trips on mobile (preview while locked)
- §17.1 Mobile preview label colors
- §17.3 Mobile preview label expand duration (200ms)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §10.3, §10.3.1, §17.1, §17.3
- [`../../components/globe/TimelineSegment.tsx`](../../components/globe/TimelineSegment.tsx) (post-B4) — needs mobile branch
- [`../../components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — `previewTrip`, `setPreviewTrip` from C1

## Files to create

- None.

## Files to modify

- `components/globe/TimelineSegment.tsx` — mobile tap → preview; preview UI inline
- `components/globe/Timeline.tsx` — potentially handle preview dismissal on empty-timeline tap

## Files to delete

- None.

---

## Implementation guidance

### Mobile tap behavior (TimelineSegment)

```tsx
// In TimelineSegment.tsx

const { isMobile, previewTrip, setPreviewTrip, lockedTrip, setLockedTrip } = useGlobe()

// Mobile tap: if already locked, deselect. If not locked, preview.
// Tapping a segment with an active preview (same segment): dismiss preview.
// Tapping a different segment's label while one is previewed: swap preview.
const onMobileTap = () => {
  if (lockedTrip === trip.id) {
    // Tapping locked trip's label again — deselect.
    setLockedTrip(null)
    setPreviewTrip(null)
    router.push('/globe', { scroll: false })
    return
  }
  if (previewTrip === trip.id) {
    // Tapping the currently-previewed segment — dismiss preview.
    setPreviewTrip(null)
    return
  }
  // Otherwise, set preview.
  setPreviewTrip(trip.id)
}

// onPointerUp: on mobile, route click to onMobileTap; on desktop, keep the B4 lock logic.
const onPointerUp = (e: React.PointerEvent) => {
  if (!pressDown.current) return
  const dx = Math.abs(e.clientX - pressDown.current.x)
  pressDown.current = null
  if (dx >= DRAG_THRESHOLD_PX) return
  if (isMobile) {
    onMobileTap()
  } else {
    // existing B4 desktop logic
    if (lockedTrip === trip.id) { /* deselect */ }
    else { setLockedTrip(trip.id); /* router.push */ }
  }
}
```

### Preview label UI

Expanded inline content visible when `previewTrip === trip.id`:

```tsx
const isPreviewed = previewTrip === trip.id
const isLocked = lockedTrip === trip.id

// In the render:
<div className="absolute inset-y-0" style={{ left: leftPx, width: widthPx }}>
  <div className={`absolute inset-0 ${isLocked ? 'bg-[var(--accent)]' : isHighlighted ? 'bg-[var(--accent)]/60' : 'bg-black/20 dark:bg-white/[.18]'}`} />

  {/* Mobile preview expansion — renders below the segment */}
  {isMobile && isPreviewed && (
    <div
      className="absolute left-0 z-20 mt-2 px-3 py-2 bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 shadow-md w-max min-w-[180px] animate-preview-expand"
      style={{ top: '100%' }}
    >
      <p className={`text-xs tracking-widest uppercase ${
        isLocked ? 'text-[var(--accent)]' : 'text-[var(--accent)]/60'
      }`}>
        {trip.title}
      </p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
        {formatDateRange(trip.startDate, trip.endDate)}
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation()
          // Lock this trip (swap if another was locked).
          setLockedTrip(trip.id)
          setPreviewTrip(null)
          router.push(`/globe?trip=${encodeURIComponent(trip.slug.current)}`, { scroll: false })
        }}
        className="mt-2 px-2 py-1 border border-black dark:border-white text-[10px] tracking-widest uppercase text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black cursor-pointer"
      >
        View trip
      </button>
    </div>
  )}

  {/* Label (same as before) */}
  ...
</div>
```

CSS for expand animation — in `globals.css` or inline:

```css
@keyframes preview-expand {
  from { opacity: 0; transform: translateY(-4px) scaleY(0.8); transform-origin: top center; }
  to   { opacity: 1; transform: translateY(0) scaleY(1); }
}
.animate-preview-expand {
  animation: preview-expand 200ms ease-out;
}
```

### Preview-while-locked (§10.3.1)

Key rule: `previewTrip` and `lockedTrip` can coexist. `previewTrip !== lockedTrip` when both set. Style:
- `lockedTrip === trip.id` → segment gets full accent.
- `previewTrip === trip.id && !isLocked` → segment gets accent/60 (lighter).

Tapping "View trip" on a preview while another is locked:
- Swap: `setLockedTrip(newId)` + `setPreviewTrip(null)` + router.push. Old lock releases automatically because the provider's `setLockedTrip` setter updates to the new id.

Tapping a third label while preview + lock coexist:
- Preview swaps: `setPreviewTrip(thirdId)`. Only one preview at a time (§10.3.1 point 5).

Tapping outside (empty timeline area):
- Clear preview (don't deselect lock).

```tsx
// In Timeline.tsx handleTimelineClick
const handleTimelineClick = (e: React.PointerEvent) => {
  if (wasJustDragged.current) return
  if (isMobile && previewTrip) {
    setPreviewTrip(null)
    return
  }
  // Desktop: deselect lock.
  if (lockedTrip) {
    setLockedTrip(null)
    router.push('/globe', { scroll: false })
  }
}
```

### Globe behavior during preview-while-locked (§10.3.1)

"The locked trip's arc highlights stay visible (pulsing). The previewed trip's arcs additionally highlight as a second layer. Because both use the same highlight color, this presents as a superset of pins/arcs lit up — equivalent to the 'overlapping trips' visual treatment from Section 5.10."

Free via the way C6 arcs render: arcs check `lockedTrip === arc.tripId || hoveredTrip === arc.tripId || playbackHighlightedTripIds.includes(arc.tripId)`. We just need arcs to also check `previewTrip === arc.tripId`:

```tsx
// In C6's ArcLine (update)
const isHighlighted =
  hoveredTrip === arc.tripId ||
  lockedTrip === arc.tripId ||
  previewTrip === arc.tripId ||  // new
  playbackHighlightedTripIds.includes(arc.tripId)
```

Add `previewTrip` to C6's context read. Light touch — one line change.

Pin highlights should follow the same pattern. C2 reads hover/selection; extend to include `previewTrip` via the arc-list intersection (any pin that's in a preview-trip's visit list lights up). Wire via `pinSubregionHighlight` indirectly, or directly via an effect.

Pragmatic approach: `previewTrip` triggers arc highlighting (above) — visually conveys the preview. Pin glow during preview is less critical; defer unless reviewer flags.

### Dismissal paths

- Tap preview label itself (same segment): `setPreviewTrip(null)`.
- Tap a different label: `setPreviewTrip(otherId)`.
- Tap timeline empty area: `setPreviewTrip(null)`.
- Tap "View trip" button: lock + clear preview.
- Lock changes via other means (desktop resize, URL change): preview should also clear. Add effect:

```tsx
// In GlobeProvider
useEffect(() => {
  // If lockedTrip changes and previewTrip is same as new lock, clear preview.
  if (previewTrip === lockedTrip) setPreviewTrip(null)
}, [lockedTrip, previewTrip])
```

### Hover on mobile

Spec: "No hover state exists on mobile." Desktop handles hover; mobile never fires hover semantically. The `isDesktop` gate on hover in B4/C2 already enforces. Good.

---

## Acceptance criteria

- [ ] Mobile, nothing locked: tap trip label → preview expands below label (200ms). Shows title, date range, "View trip" button.
- [ ] Tapping a different label: preview swaps to new label. Old preview collapses.
- [ ] Tap "View trip" in preview: trip locks. Preview closes. Camera rotates. Panel opens. URL updates.
- [ ] Tap locked label again: trip deselects. URL → `/globe`.
- [ ] Tap a different label while one is locked: new label enters preview state (lighter accent). Locked label stays locked (full accent). Both visible simultaneously.
- [ ] "View trip" on preview while other is locked: swaps lock; old segment returns to idle; new segment is locked.
- [ ] Tapping yet another label during preview-while-locked: third enters preview; second preview clears. Locked remains.
- [ ] Tap timeline empty area: clears preview. Lock unaffected.
- [ ] Arcs on globe: previewed trip's arcs also highlight (same color as locked).
- [ ] Only one preview at a time.
- [ ] Desktop: no preview behavior — standard hover + click.

## Non-goals

- **No preview on desktop** — explicit.
- **No pin preview highlight** beyond what existing `hoveredTrip`-based logic covers (may or may not cover; defer).
- **No keyboard support for preview** — deferred §13.

## Gotchas

- **Tap vs drag distinction**: same 5px threshold. Short tap → preview. Drag → pan timeline.
- **Z-index**: preview panel overlaps adjacent segments. `z-20` on the preview puts it above normal segments. Verify visually — rotated labels (B5) use lower z-index.
- **Overflow**: preview expands below the segment. If segment is near the right edge of the timeline, preview could clip off. Adjust `left: 0` to right-align if near edge:
  ```tsx
  const willClipRight = leftPx + 180 > containerWidth
  style={{ top: '100%', left: willClipRight ? 'auto' : 0, right: willClipRight ? 0 : 'auto' }}
  ```
- **Preview pointer-capture**: don't let the preview's "View trip" button click propagate to the timeline's click-to-dismiss. `e.stopPropagation()`.
- **Timing**: spec §17.3 "Mobile preview label expand | 200ms | ease-out." CSS animation above uses 200ms ease-out. Match.
- **`previewTrip` reset on unmount**: if Timeline unmounts (shouldn't during navigation but defensive), `previewTrip` stays set. Not a functional bug since no consumer renders it without Timeline. But clean up if you want — clear `previewTrip` on provider-level `layoutState !== 'default' && layoutState !== 'panel-open'` or similar.

## Ambiguities requiring clarification before starting

1. **Preview location (above vs below segment)**: I placed below. For segments near the top of the timeline (labels above, row 0), preview below overlaps other row-1 labels. Could place above for row-1 labels. Add logic or always put below + accept occasional overlap.

   **Action**: always below. Reviewable.

2. **Preview width**: `min-w-[180px] w-max` = takes content size, min 180px. Tune.

3. **"View trip" button label**: spec says "View trip" (verb phrase). Not "View trip article." Different from pin panel's "View trip article." Follows spec verbatim.

4. **Does tapping "View trip" while it's the already-locked trip do anything?**: no — if locked, segment can't enter preview (the `onMobileTap` handles locked case separately). Preview is not shown for locked trip. Good.

5. **Swap behavior detail**: when swapping lock from A to B:
   - B's segment gains full accent.
   - A's segment returns to idle (the `previewTrip === null` via the cleanup effect).
   - A's trip panel closes; B's trip panel opens (via `lockedTrip` change flows through C1/C4).

   Verify: does closing A's panel happen cleanly? `setLockedTrip(B)` triggers the provider's `lockedTrip` state change. C4's TripPanel re-renders for B. No explicit unmount of A's TripPanel — React diff handles it. Good.

## Handoff / outputs consumed by later tickets

- None after this ticket — E3 is a leaf.

## How to verify

1. Mobile devtools, `/globe`. Tap a trip label — expansion appears below with title, dates, "View trip" button.
2. Tap the same label again — dismisses.
3. Tap a different label — preview swaps.
4. Tap "View trip" — trip locks, preview closes, panel opens inline, URL updates.
5. Tap a different label while the first is locked — new label enters preview (lighter accent). Locked label stays locked (full accent).
6. Arcs on globe: both locked and previewed trips' arcs highlight.
7. Tap "View trip" in preview — lock swaps. Old segment returns to idle.
8. Tap empty timeline area during preview — preview clears. Lock unchanged.
9. Desktop: hover a label — no preview expansion (standard hover highlight). Click — locks. No mobile behavior leaks.
