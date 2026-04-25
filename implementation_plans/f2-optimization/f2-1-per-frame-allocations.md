# F2-1 — Eliminate per-frame allocations in useFrame bodies

**Epic**: F. Polish · **Can be run by agent?**: Yes (fully) · **Estimated size**: S

## Dependencies

### Hard
- None.

### Soft
- None.

### Blocks
- None structurally. F2-7 (profiling) will benchmark this ticket's impact.

---

## Goal

Every `useFrame` body in `components/globe/**` must execute **zero allocations** per frame. Allocations inside the render loop cause GC pressure that shows up as frame-time jitter (the sawtooth "stop-the-world" pauses visible in Chrome's Performance panel).

## Spec references

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5.1 "Minimize per-frame work"
- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md) "Common hotspots to audit → Per-frame allocations"

## Files to read first

- [`components/globe/GlobePositionBridge.tsx`](../../components/globe/GlobePositionBridge.tsx) — canonical scratch-vector pattern (lines 11–19). Follow this style verbatim.
- [`components/globe/GlobePins.tsx`](../../components/globe/GlobePins.tsx) — contains the primary hotspot (lines 107–166).
- [`components/globe/GlobeScene.tsx`](../../components/globe/GlobeScene.tsx) — secondary hotspot at the entrance-animation `useFrame`.
- [`components/globe/TripArcs.tsx`](../../components/globe/TripArcs.tsx) — already correct (scratch colors via refs). Read to confirm; no change needed.

## Files to create

- None.

## Files to modify

- `components/globe/GlobePins.tsx`
- `components/globe/GlobeScene.tsx` (only if a `.clone()` or similar is inside `useFrame`)

## Files to delete

- None.

---

## Implementation guidance

### Step 1 — GlobePins: replace in-frame `new THREE.Vector3` with module scratch

Current (`components/globe/GlobePins.tsx:118-122`):

```tsx
const pinNormal = new THREE.Vector3(...pos).normalize()
const cameraDir = new THREE.Vector3()
  .subVectors(camera.position, new THREE.Vector3(...pos))
  .normalize()
const dot = pinNormal.dot(cameraDir)
```

Three allocations per pin per frame. At 500 pins × 60 fps that's 90 000 Vector3 allocations per second — measurable GC cost.

**Fix shape**:

1. Hoist a module-scope scratch near the other constants (above the `Pin` function):
   ```tsx
   // Safe to share across all Pin instances: useFrame is synchronous and
   // non-reentrant. Same pattern as GlobePositionBridge.
   const _pinScratchCameraDir = new THREE.Vector3()
   ```

2. Precompute `pinNormal` once per pin via `useMemo` (it depends only on `lat`/`lng`, not on camera — there is no reason to recompute it per frame):
   ```tsx
   const pinNormal = useMemo(
     () => new THREE.Vector3(pos[0], pos[1], pos[2]).normalize(),
     [pos[0], pos[1], pos[2]],
   )
   ```
   (Or compute once using `sphericalToCartesian` + a local scratch if you prefer; stability is what matters.)

3. Inside `useFrame`, reuse the module scratch for `cameraDir`:
   ```tsx
   const cameraDir = _pinScratchCameraDir
     .copy(camera.position)
     .sub(pinPositionVec)  // pre-allocated, see step 4
     .normalize()
   const dot = pinNormal.dot(cameraDir)
   ```

4. `pos` is currently a tuple `[x,y,z]` from `sphericalToCartesian`. Either:
   - keep it as a tuple and use `_pinScratchCameraDir.copy(camera.position).sub({x: pos[0], y: pos[1], z: pos[2]})` — won't work, `.sub` wants a Vector3-like; use a second module scratch and `.set(pos[0], pos[1], pos[2])` once per frame, or
   - store `pos` as a `THREE.Vector3` via `useMemo` so both `pinNormal` and subtraction work without per-frame allocation.

   Prefer the latter — one `useMemo` replaces the tuple with a Vector3 that downstream code reuses.

5. Verify by searching the file after: `rg "new THREE" components/globe/GlobePins.tsx` should only match inside `useMemo` blocks, not inside `useFrame`.

### Step 2 — GlobeScene: audit entrance-animation `useFrame`

Current (`components/globe/GlobeScene.tsx` around line 354): `targetDir.current.clone()` inside the entrance `useFrame`.

**Fix shape**: declare a module-scope `const _sceneEntranceDir = new THREE.Vector3()` near the top of the file; replace `.clone()` with `_sceneEntranceDir.copy(targetDir.current)` and continue the chain. Verify the downstream math doesn't mutate what it received (tracing the chain, `clone()` is used so subsequent `.multiplyScalar()` / `.add(...)` doesn't touch the ref) — with the scratch approach, `_sceneEntranceDir` accepts the mutations fine because it's scratch.

### Step 3 — full audit grep

Before considering the ticket done, run:

```bash
rg -n "useFrame|new THREE\.|\.clone\(\)" components/globe --type tsx
```

For every `new THREE.*` or `.clone()` hit, confirm it is inside a `useMemo`, `useEffect`, event handler, or mount-time code — **not** inside a `useFrame` body. Document any intentional exceptions in a code comment.

### What NOT to do

- Do **not** pre-allocate scratch vectors per-component via `useRef(new THREE.Vector3())`. It works but creates one scratch per Pin instance, which needlessly grows heap. Module scratch is cheaper and the reentrancy story is fine because R3F's useFrame is single-threaded.
- Do **not** attempt to memoize the `dot` product itself — it genuinely depends on the camera position, which mutates every frame.
- Do **not** restructure the fade-curve math while you're here. Keep the diff surgical.

---

## Acceptance criteria

- [ ] `rg "new THREE" components/globe/GlobePins.tsx` returns zero matches inside the `useFrame` body.
- [ ] `rg "\.clone\(\)" components/globe/GlobeScene.tsx` returns zero matches inside any `useFrame` body.
- [ ] Chrome DevTools Performance trace during 5 s idle spin: no sawtooth GC markers (bars under "GC" timeline track).
- [ ] Visual behavior unchanged: pins still fade on the back of the globe at the same rate; entrance animation still works.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `npm run lint` passes on the modified files.

## Non-goals

- Do not touch TripArcs — its useFrame is already scratch-safe.
- Do not refactor pin hit-testing or selection logic.
- Do not change the pin render order or material setup.

## Gotchas

- **Module-scoped scratch reentrancy**: R3F's `useFrame` callbacks run sequentially within a single frame — never concurrently. A module-scoped Vector3 shared across all Pin instances is safe **as long as** no useFrame body yields to async code that could re-enter the same scratch. Our useFrame bodies are fully synchronous; the pattern is safe.
- **`sphericalToCartesian` return type**: currently returns a tuple. If you convert to a Vector3 via `useMemo`, double-check no other code in the file still expects the tuple form.
- **Don't forget `.set(...)` before `.sub(...)`**: if you use a scratch that's been mutated by a prior frame, `.copy()` it from a stable source before the first arithmetic step — otherwise you're chaining off of stale state.

## Ambiguities requiring clarification

None. The pattern is established; follow GlobePositionBridge.

## Handoff / outputs consumed by later tickets

- F2-7 will benchmark idle-spin frame time; expect a measurable reduction (less GC = flatter frame curve).

## How to verify

1. `npm run build && npm start` → navigate to `/globe`.
2. Open Chrome DevTools → Performance; record 10 s of idle spin with 10 trips / 500 pins of seeded data.
3. Inspect the "Memory" and "GC" tracks. Before: sawtooth. After: flat.
4. Switch to React DevTools → Profiler. Confirm no visible regressions in commit count during idle.
5. Hover a pin; confirm the fade-on-back-of-globe visual is unchanged at the silhouette.
