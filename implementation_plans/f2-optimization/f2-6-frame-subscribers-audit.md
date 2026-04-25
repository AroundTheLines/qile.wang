# F2-6 — Frame subscriber cleanup audit

**Epic**: F. Polish · **Can be run by agent?**: Yes (fully) · **Estimated size**: XS

## Dependencies

### Hard
- None.

### Soft
- None.

### Blocks
- None. F2-7 runs a memory-leak check that will fail if this ticket missed something.

---

## Goal

Audit every callsite that adds a callback to `frameSubscribersRef.current`. Every `.add(fn)` must be paired with a matching `.delete(fn)` inside the effect's cleanup, otherwise the closure is retained for the component's entire lifetime and beyond — a classic React memory leak that will show up as linear memory growth in Chrome's 2-minute heap-snapshot test (§F2 spec "Memory leak check").

## Spec references

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5.1 "Avoid animation thrash on playback" (implicit via frame-subscriber coordination)
- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md) "Memory leak check" → "Common culprits: Frame subscribers never removed"

## Files to read first

- [`components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — type of `frameSubscribersRef` (a `Set<() => void>`).
- [`components/globe/GlobePositionBridge.tsx`](../../components/globe/GlobePositionBridge.tsx) — consumer of the ref on the publish side (calls every subscriber at the end of every frame).
- Every file from F2-3's migration table that receives `frameSubscribersRef` (the subscriber side):
  - `components/globe/GlobePositionBridge.tsx`
  - `components/globe/GlobeHoverConnector.tsx`
  - `components/globe/GlobeClickConnector.tsx`

## Files to create

- None.

## Files to modify

- Only files where the audit finds a missing cleanup. May be zero files.

## Files to delete

- None.

---

## Implementation guidance

### Step 1 — enumerate `.add(` and `.delete(` callsites

```bash
rg -n "frameSubscribersRef\.current\.(add|delete)\(" components
```

For every `.add(fn)` call, identify:

1. Which effect hook it lives in (`useEffect` block line range).
2. Whether that effect returns a cleanup function.
3. Whether the cleanup calls `frameSubscribersRef.current.delete(fn)` with the **same function reference** as was added.

### Step 2 — flag common leak patterns

Examples of bugs to watch for:

**Bug A — closure captured twice:**
```ts
useEffect(() => {
  frameSubscribersRef.current.add(() => { /* inline */ })
  return () => {
    frameSubscribersRef.current.delete(() => { /* inline */ }) // DIFFERENT reference
  }
}, [])
```
The inline `() => {}` is a new function each time. The `delete` removes nothing. **Fix**: hoist to a named function inside the effect:
```ts
useEffect(() => {
  const subscriber = () => { /* ... */ }
  frameSubscribersRef.current.add(subscriber)
  return () => frameSubscribersRef.current.delete(subscriber)
}, [])
```

**Bug B — no cleanup at all:**
```ts
useEffect(() => {
  frameSubscribersRef.current.add(tick)
}, [])
```
Subscriber lives forever. **Fix**: add the return cleanup.

**Bug C — conditional skip of add but unconditional delete (or vice versa):**
```ts
useEffect(() => {
  if (tier !== 'desktop') return  // no add, no cleanup
  frameSubscribersRef.current.add(tick)
  return () => frameSubscribersRef.current.delete(tick)
}, [tier])
```
This pattern is fine — the early return skips both. Inspect each file carefully for asymmetries.

**Bug D — stale dep capture:**
```ts
useEffect(() => {
  const subscriber = () => useSomeState() // wrong — state doesn't exist inside subscriber
  frameSubscribersRef.current.add(subscriber)
  return () => frameSubscribersRef.current.delete(subscriber)
}, [])
```
The subscriber's captured values are from the effect's first run. If the closure reads stale state and the effect never re-runs because deps are `[]`, behavior is wrong but not a leak. This is out-of-scope for F2-6 (which is about leaks, not correctness). Flag in PR comments if found.

### Step 3 — fix only actual bugs

Do **not** restructure any subscriber unless there's an actual cleanup missing. If the cleanup is present and correct, leave it alone — no "cleanup for style."

### Step 4 — also audit pause-reason ref

While you're here, run the same audit for `pauseReasonsRef`:

```bash
rg -n "pauseReasonsRef\.current\.(add|delete)\(" components
```

Any `add` that lives in an effect must have a matching `delete` in the cleanup. Provider-side usage in `GlobeProvider.tsx:216-224` is already correctly paired via `useEffect` cleanup; audit every consumer-side use.

---

## Acceptance criteria

- [ ] Every `frameSubscribersRef.current.add(fn)` has a matching `.delete(fn)` in the enclosing effect's cleanup, with the **same function reference**.
- [ ] Every `pauseReasonsRef.current.add(reason)` has a matching `.delete(reason)` in the cleanup, or is intentionally long-lived with a comment explaining why.
- [ ] A search of `rg -n "frameSubscribersRef\.current\.add" components` returns only subscriber-add sites with adjacent cleanups visible (human-verified).
- [ ] `npm run build` green.
- [ ] `npm test` green.
- [ ] `npm run lint` green.
- [ ] If no bugs found: the PR description explicitly states "Audit completed; no leaks identified. Zero changes to source."

## Non-goals

- Do not restructure subscriber logic.
- Do not optimize the subscriber set (e.g., swap `Set` for `Map`). That's unrelated.
- Do not change how `GlobePositionBridge` iterates subscribers.
- Do not touch pause reason string names.

## Gotchas

- **`React.StrictMode` in dev**: effects run twice. If the cleanup is incorrect, the second mount's subscriber will stack on top of the first. This amplifies the bug in dev — but the test only matters in production, which is single-mount. Don't "fix" it for StrictMode symptoms alone; fix the underlying ref mismatch.
- **The ref object is stable, the `.current` set is not**: `frameSubscribersRef` itself never changes identity. The `Set` at `.current` is created once in `useState`/`useRef`. Adding/removing from that set is fine across any number of re-renders; leaks come from subscribers added without pairs, not from ref identity issues.
- **Async effects**: if any `useEffect` is async (`useEffect(async () => ...)`), that's a React antipattern regardless. Stop and flag it rather than trying to patch around it.

## Ambiguities requiring clarification

None. The audit is mechanical.

## Handoff / outputs consumed by later tickets

- **F2-7** runs the 2-minute heap-snapshot bench. Any subscriber leak would show as linear growth there. This ticket's job is to prevent that failure.

## How to verify

1. `rg -n "frameSubscribersRef\.current\.add" components` — list all adds; visually confirm each is paired with a `.delete` in the same effect block.
2. `rg -n "pauseReasonsRef\.current\.add" components` — same check.
3. `npm run dev`, mount/unmount the globe page twice (e.g., navigate to `/` and back), check via React DevTools that subscriber counts return to baseline. (Requires a small debug snippet — flag as optional; production heap snapshot in F2-7 is authoritative.)
