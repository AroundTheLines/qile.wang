# 5C-G1 — Restore auto-rotate after article close

**Epic**: G. Post-ship hotfixes · **Owner**: Dev C (camera) · **Can be run by agent?**: Yes — the fix pattern is already established by B6 · **Estimated size**: XS

## Dependencies

### Hard
- **B6** (merged) — established the pattern that the `layoutState === 'default'` gate on OrbitControls' `autoRotate` prop is sufficient, and that the `autoRotate` state variable should stay `true` across lock cycles rather than being explicitly disabled.

### Soft
- None.

### Blocks
- None.

---

## Goal

Fix the regression where closing an article and then deselecting the trip/pin leaves the globe stationary instead of resuming passive spin.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §4 "globe is never truly static"
- §9.3 passive-state behavior

## Background

Phase 5C ticket B6 (PR #44) removed `setAutoRotate(false)` from `kickOffTripFit` in [`components/globe/GlobeScene.tsx`](../../components/globe/GlobeScene.tsx) — the explicit disable was unnecessary because the `autoRotate` prop on `<OrbitControls>` is already gated on `layoutState === 'default'`. This made trip-deselect resume passive spin like pin-deselect already did.

The article-open camera path (`startArticleZoom`, ~line 175) still calls `setAutoRotate(false)` and never restores it. Sequence:

1. Lock a trip OR select a pin.
2. Open the article (navigate to `/trip/<slug>` or click an item).
3. Close the article (Escape / back).
4. Deselect (click background or click the label again).
5. **Bug**: globe stays stationary. Expected: resume passive spin within ~1.5s.

## Files to read first

- [`../../components/globe/GlobeScene.tsx`](../../components/globe/GlobeScene.tsx) — especially `startArticleZoom` (~line 150-180), the article-open effect (~line 205-232), and the trip-lock path's `kickOffTripFit` (~line 288-313, which B6 already fixed).
- [`implementation_plans/phase-5c/5c-b6-playback-engine.md`](./5c-b6-playback-engine.md) — the "Auto-rotate after trip deselect" shipped-decision section explains why the layout gate alone suffices.

## Files to modify

- [`components/globe/GlobeScene.tsx`](../../components/globe/GlobeScene.tsx)

## Files to create / delete

- None.

---

## Implementation guidance

Two equally-valid fixes — pick whichever matches the surrounding code style:

**Option A (preferred, matches B6)**: Remove `setAutoRotate(false)` from `startArticleZoom` entirely. The `autoRotate` prop on `<OrbitControls>` is already gated on `layoutState === 'default'`, so while `layoutState === 'article-open'` the rotation is suppressed. `controlsEnabled=false` during the zoom animation further prevents OrbitControls from doing anything. No explicit disable needed.

**Option B**: Add a matching `setAutoRotate(true)` when the article-close zoom animation completes (around line 420-432 in the `useFrame` body where `zoom.active = false` is set). This preserves the "explicit off / explicit on" pattern but requires remembering to restore in every exit path.

Option A is less code and removes a source of drift. Prefer it unless Dev C notes a reason to keep the explicit disable for auditing.

### Acceptance criteria

- [ ] Lock a trip → open a trip article → close article → deselect trip → within ~1.5s, globe resumes passive rotation.
- [ ] Select a pin → open the pin's item article → close article → deselect pin → within ~1.5s, globe resumes passive rotation.
- [ ] Cold deep-link directly to `/trip/<slug>` → close article → deselect → rotation resumes. (This path also runs `startArticleZoom` via `pendingArticleZoom`.)
- [ ] No regression to the pre-existing behavior: during article-open, the globe does NOT rotate (layoutState gate still applies).
- [ ] No regression: trip-lock alone (without opening an article) already resumes rotation on deselect per B6 — must keep working.

### Non-goals

- Any other camera behavior changes. This is a single-line fix.
- Refactoring the article-zoom state machine.

## How to verify

1. Run `npm run dev`.
2. Open `/globe`, wait for the entrance animation + ~1s of passive spin (confirm baseline).
3. Click a timeline label to lock a trip. Rotation stops (expected).
4. Click the locked trip's panel to open the article (or navigate to `/trip/<slug>`).
5. Press Escape or click the globe to close the article.
6. Deselect the trip (click the background of the timeline, or click the same label again).
7. Watch for ~2s. **Pass**: globe starts rotating again.
8. Repeat steps 3-7 but with a pin selection → pin-article path → deselect pin.
9. Repeat with a cold `/trip/<slug>` deep-link as the entry point.

## Gotchas

- `setAutoRotate(false)` in `startArticleZoom` was likely added as a defensive copy of the trip-fit path's behavior. It was always redundant given the `layoutState` gate.
- Do not remove `setControlsEnabled(false)` from `startArticleZoom` — that IS load-bearing (prevents OrbitControls from panning during the zoom animation).
- There's a second `setControlsEnabled` path when `layoutState === 'article-open'` (line 424) that keeps controls disabled for the duration of the article view. Don't touch this.

## Handoff / outputs

- PR title: `5c-g1: restore auto-rotate after article close`.
- In the PR description, reference [`5c-b6-playback-engine.md`](./5c-b6-playback-engine.md) "Auto-rotate after trip deselect" — this ticket completes the pattern for the article path.
