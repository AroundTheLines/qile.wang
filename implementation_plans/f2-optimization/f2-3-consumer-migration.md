# F2-3 — Consumer migration: 23 files to specific hooks

**Epic**: F. Polish · **Can be run by agent?**: Yes (fully) · **Estimated size**: M

## Dependencies

### Hard
- **F2-2** — the 6 new contexts and hooks must exist.

### Soft
- None.

### Blocks
- **F2-4** (isolation tests assume migrated consumers).
- **F2-5** (memo wrappers rely on hub components subscribing to narrower contexts).
- **F2-7** (final profiling).

---

## Goal

Migrate every `useGlobe()` callsite to the six specific hooks (`useGlobeData`, `useGlobePin`, `useGlobeTrip`, `useGlobePlayback`, `useGlobeUI`, `useGlobeRoute`). Each consumer must subscribe **only** to the hooks that match the fields it actually reads. After this ticket:

- `useGlobe` no longer exists (it's already deleted in F2-2).
- `grep -rn "useGlobe\b" components/globe` returns zero matches.
- `grep -rn "from './GlobeContext'" components/globe` → each file imports only the specific hooks it needs.
- `npm run build` is green again.

## Spec references

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5.1
- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md)

## Files to read first

- [`components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — confirm the 6 hook names and their shapes (F2-2 output).
- [`components/globe/GlobeProvider.tsx`](../../components/globe/GlobeProvider.tsx) — just to confirm the nesting is in place.

## Files to create

- None.

## Files to modify

All 23 consumer files listed in the migration table below.

## Files to delete

- None.

---

## Implementation guidance

### Migration table (ground truth — derived from the audit of every `useGlobe` callsite)

| # | File | New hooks to import | Fields mapped to each hook |
|---|---|---|---|
| 1 | `components/globe/GlobePins.tsx` | `useGlobeData, useGlobePin, useGlobeTrip, useGlobePlayback, useGlobeUI` | Data: `pins` · Pin: `selectedPin, selectPin, hoveredPin, setHoveredPin, setPinSubregionHighlight, requestPinScroll` · Trip: `lockedTrip, setLockedTrip, hoveredTrip` · Playback: `playbackHighlightedTripIds` · UI: `showHover` |
| 2 | `components/globe/GlobeScene.tsx` | `useGlobeData, useGlobePin, useGlobeTrip, useGlobeUI, useGlobeRoute, useGlobePlayback` | Data: `pins, tripsWithVisits` · Pin: `selectedPin` · Trip: `lockedTrip` · UI: `layoutState, isMobile` · Route: `activeTripSlug` · Playback: `addPauseReason, removePauseReason` |
| 3 | `components/globe/Timeline.tsx` | `useGlobeData, useGlobeTrip, useGlobePlayback, useGlobeUI` | Data: `trips` · Trip: `hoveredTrip, lockedTrip, setHoveredTrip, setLockedTrip` · Playback: `playbackActive, addPauseReason, removePauseReason` · UI: `isMobile, isDesktop` |
| 4 | `components/globe/TripArcs.tsx` | `useGlobeData, useGlobeTrip, useGlobePlayback, useGlobeUI` | Data: `tripsWithVisits` · Trip: `hoveredTrip, lockedTrip` · Playback: `playbackHighlightedTripIds` · UI: `isDark` |
| 5 | `components/globe/GlobePositionBridge.tsx` | `useGlobeData` | Data: `pins, pinPositionRef, globeScreenRef, frameSubscribersRef` |
| 6 | `components/globe/GlobeHoverConnector.tsx` | `useGlobeData, useGlobePin, useGlobeUI` | Data: `pinPositionRef, globeScreenRef, frameSubscribersRef` · Pin: `hoveredPin` · UI: `showConnectors, isDark` |
| 7 | `components/globe/GlobeClickConnector.tsx` | `useGlobeData, useGlobePin, useGlobeUI` | Data: `pinPositionRef, globeScreenRef, frameSubscribersRef` · Pin: `selectedPin, selectedPinScreenY` · UI: `slideComplete, showConnectors, isDesktop, isTablet, isDark, layoutState` |
| 8 | `components/globe/GlobePinTriggers.tsx` | `useGlobeData, useGlobePin, useGlobeTrip` | Data: `pins` · Pin: `selectPin, setPinSubregionHighlight, requestPinScroll` · Trip: `lockedTrip, setLockedTrip` |
| 9 | `components/globe/GlobeTooltip.tsx` | `useGlobeData, useGlobePin, useGlobeUI` | Data: `pins, pinPositionRef` · Pin: `hoveredPin` · UI: `showHover` |
| 10 | `components/globe/GlobeDetailPanel.tsx` | `useGlobeData, useGlobePin, useGlobeTrip, useGlobeUI` | Data: `pins, tripsWithVisits` · Pin: `selectedPin` · Trip: `lockedTrip` · UI: `panelVariant` |
| 11 | `components/globe/GlobeCanvas.tsx` | `useGlobePin, useGlobeUI, useGlobeRoute` | Pin: `selectPin, selectedPin` · UI: `layoutState` · Route: `closeArticle` |
| 12 | `components/globe/GlobeViewport.tsx` | `useGlobePin, useGlobeUI, useGlobeRoute` | Pin: `selectedPinScreenY` · UI: `tier, isMobile, isDesktop, layoutState, panelVariant` · Route: `closeArticle` |
| 13 | `components/globe/GlobeNavbar.tsx` | `useGlobePin, useGlobeUI` | Pin: `selectedPin` · UI: `isDesktop, isTablet` |
| 14 | `components/globe/GlobeMesh.tsx` | `useGlobeUI` | UI: `isDark` |
| 15 | `components/globe/MobileContentRegion.tsx` | `useGlobeData, useGlobePin, useGlobeTrip, useGlobeUI` | Data: `pins, tripsWithVisits` · Pin: `selectedPin` · Trip: `lockedTrip` · UI: `panelVariant` |
| 16 | `components/globe/MobileTripList.tsx` | `useGlobeData, useGlobeTrip` | Data: `trips` · Trip: `setLockedTrip` |
| 17 | `components/globe/MobileNavChrome.tsx` | `useGlobePin, useGlobeTrip, useGlobeRoute, useGlobeUI` | Pin: `selectPin` · Trip: `setLockedTrip` · Route: `closeArticle` · UI: `layoutState` |
| 18 | `components/globe/TripArticleReveal.tsx` | `useGlobeTrip` | Trip: `lockedTrip, setLockedTrip` |
| 19 | `components/globe/panels/TripPanel.tsx` | `useGlobePin, useGlobeTrip` | Pin: `pinToScrollTo, clearPinScroll, hoveredPin` · Trip: `setLockedTrip` |
| 20 | `components/globe/panels/PinPanel.tsx` | `useGlobePin` | Pin: `selectPin` |
| 21 | `components/globe/panels/VisitSection.tsx` | `useGlobeData` | Data: `trips` |
| 22 | `components/globe/TimelineOverlay.tsx` | `useGlobeUI` | UI: `layoutState` |
| 23 | **Verify** no other file imports `useGlobe`. Grep `rg -n "useGlobe\b" components app lib` — only `GlobeContext.tsx` itself should show the six hook names as definitions; no `useGlobe(` calls anywhere. |||

### Migration pattern — per file

For each file:

1. Replace the import:
   ```diff
   - import { useGlobe } from './GlobeContext'
   + import { useGlobeData, useGlobePin, useGlobeTrip } from './GlobeContext'
   ```
   (Adjust the list to the file's row in the table.)

2. Replace the destructure:
   ```diff
   - const { pins, selectedPin, selectPin, hoveredPin, /* ... */ } = useGlobe()
   + const { pins } = useGlobeData()
   + const { selectedPin, selectPin, hoveredPin } = useGlobePin()
   + const { lockedTrip } = useGlobeTrip()
   ```

3. Keep the destructured variable names **identical** — do not rename anything. Downstream code does not change.

4. Import path adjustment: files inside `components/globe/panels/` import from `'../GlobeContext'`, not `'./GlobeContext'`. Preserve whatever relative prefix they used before.

### What to check per file after migration

- No stale `useGlobe` imports.
- Every field that was destructured before is still destructured from some hook.
- No field is destructured from the wrong hook (e.g., `trips` comes from `useGlobeData`, not `useGlobeTrip`).
- `npm run lint -- <file>` clean.
- `tsc --noEmit` on that file: no errors about missing properties (a telltale sign of a wrong hook pick).

### Build after every 5 files

Do not wait until all 23 are done to run the build. Every 5 files, run:
```bash
npm run lint && tsc --noEmit 2>&1 | tail -40
```
This catches hook-picking mistakes early.

---

## Acceptance criteria

- [ ] All 23 files in the migration table updated.
- [ ] `rg -n "useGlobe\b\s*\(" components app` returns zero matches (no remaining composite-hook calls).
- [ ] `rg -n "useGlobe\b" components/globe/GlobeContext.tsx` returns zero matches (the old hook is gone).
- [ ] `npm run build` green.
- [ ] `npm test` green (no behavioral changes expected).
- [ ] `npm run lint` green.
- [ ] Manual sanity check: load `/globe` in a dev server; verify the globe renders, a pin can be clicked, a trip can be locked, the timeline playhead moves. No console errors.

## Non-goals

- Do **not** change any logic inside any consumer. Only imports and destructures are touched.
- Do **not** attempt to memoize or optimize any consumer. That's F2-5.
- Do **not** refactor any component file structure (e.g., split a giant file into smaller ones).

## Gotchas

- **Field moved across hooks**: easy to pick the wrong hook for a field. Always cross-reference the F2-2 context shape.
- **Relative import paths**: files under `panels/` use `../GlobeContext`; files at the top level use `./GlobeContext`. Don't introduce incorrect paths.
- **`Dispatch<SetStateAction<...>>` vs. plain setter signature**: the hook shape preserves whichever was exported before. If you encounter a type mismatch, check F2-2's context shape — likely an error in F2-2, not in the consumer.
- **Top-of-file ordering**: keep import order consistent with the file's existing style (React, then third-party, then local). Do not reorder unrelated imports.
- **`setHoveredPin` is `Dispatch<SetStateAction<string | null>>`** — some callsites pass a function updater. This must still work after migration; the hook shape matches the raw setter.
- **`pinParamForId` is internal to the provider** — it's not exported on the context, so no consumer should reference it. If you see an `eslint` complaint about an unknown field, verify against the F2-2 context shape.

## Ambiguities requiring clarification

- **If a consumer was using a field not listed above**: the audit covered every observed `useGlobe` destructure. If the code has drifted since this plan was written and a new field appears in a consumer that isn't mapped, stop and flag it — do not invent a new hook or a new field.

## Handoff / outputs consumed by later tickets

- **F2-4** probes the six contexts directly (not via `useGlobe`). Zero-import changes; this ticket removing the composite hook doesn't affect F2-4.
- **F2-5** relies on parent components subscribing to narrow contexts so that their props to memoed children are stable. No explicit interface.
- **F2-7** benchmarks the post-migration world.

## How to verify

1. `rg -n "useGlobe\b" components app lib` — only definitions in `GlobeContext.tsx` (the 6 hooks), no calls to `useGlobe`.
2. `npm run build` — green.
3. `npm test` — green.
4. `npm run dev`, then manually in the browser:
   - Globe renders.
   - Click a pin → pin panel opens.
   - Click a trip label on timeline → trip panel opens.
   - Close either → globe resumes idle spin.
   - Let playback run → timeline playhead moves and arcs pulse.
   - `Escape` → layered dismiss works.
   - No red errors in console.
5. Spot-check 3 files from the table against the "fields mapped" column — destructures match exactly.
