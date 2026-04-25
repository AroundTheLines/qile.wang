# F2-4 — Context isolation regression tests

**Epic**: F. Polish · **Can be run by agent?**: Yes (fully) · **Estimated size**: S

## Dependencies

### Hard
- **F2-2** — six contexts + hooks exist.
- **F2-3** — consumers migrated. (Tests import the hooks; behavior assertions are written against the hooks regardless of consumers, but running tests requires the provider tree to assemble.)

### Soft
- None.

### Blocks
- None.

---

## Goal

Pin the performance win from the context split with a **regression test suite**. The optimization value of six narrower contexts is that a consumer subscribed to only `GlobeDataContext` does **not** re-render when `GlobePlaybackContext`'s value changes. Today that invariant holds by construction. Three months from now, someone may accidentally pass a cross-context value through `useGlobeData` — and nothing will fail until a user complains about jank. These tests are the insurance.

## Spec references

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5.1
- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md) "Benchmarks"
- Parent plan: `~/.claude/plans/currently-complete-tickets-a1-eventual-castle.md` Track 3 §"Tests for the split"

## Files to read first

- [`components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — shape of each context.
- [`components/globe/GlobeProvider.tsx`](../../components/globe/GlobeProvider.tsx) — to understand what a real provider instance needs (props, etc.).
- Any existing Vitest config: `vitest.config.ts` / `vite.config.ts`. Check for React Testing Library or `@testing-library/react` already installed via `package.json`.

## Files to create

- `components/globe/__tests__/context-isolation.test.tsx` — new.

## Files to modify

- None.

## Files to delete

- None.

---

## Implementation guidance

### Step 1 — check harness

Confirm `@testing-library/react` is installed (grep `package.json`). If not, stop and flag — do not add dependencies in this ticket; escalate.

### Step 2 — test strategy

Two approaches possible:

**(A) Test providers individually.** Render a test tree with each `GlobeXContext.Provider` directly (not `<GlobeProvider>`), feeding a stable memoized value. A `Probe` component subscribes to one context's hook, uses a render-counter ref. Update the value of a **different** context; assert the probe rendered exactly once (the initial mount).

**(B) Test through `<GlobeProvider>`.** Wire the full provider with a seeded props, then drive state changes through the imperative setters exposed by each context. Assert render counts on targeted probes.

**Recommendation: (A).** It's independent of the rest of the provider and specifically verifies the split contract. (B) is implicitly covered by any integration test of the app. (A) is precise.

### Step 3 — test scaffolding

Write a small helper:

```tsx
// components/globe/__tests__/context-isolation.test.tsx
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import {
  GlobeDataContext,
  GlobePinContext,
  GlobePlaybackContext,
  GlobeRouteContext,
  GlobeTripContext,
  GlobeUIContext,
  type GlobeDataContextValue,
  type GlobePinContextValue,
  type GlobePlaybackContextValue,
  type GlobeRouteContextValue,
  type GlobeTripContextValue,
  type GlobeUIContextValue,
  useGlobeData,
  useGlobePin,
  useGlobePlayback,
  useGlobeRoute,
  useGlobeTrip,
  useGlobeUI,
} from '../GlobeContext'

function makeProbe<T>(hook: () => T) {
  const renderCounts = { current: 0 }
  function Probe() {
    hook()
    renderCounts.current += 1
    return null
  }
  return { Probe, renderCounts }
}
```

Then a test per context pair. Example (playback-only consumer ignores pin updates):

```tsx
it('pin context updates do not re-render playback-only consumer', () => {
  const { Probe, renderCounts } = makeProbe(useGlobePlayback)

  const pinValue: GlobePinContextValue = {
    selectedPin: null,
    selectPin: () => {},
    hoveredPin: null,
    setHoveredPin: () => {},
    pinSubregionHighlight: null,
    setPinSubregionHighlight: () => {},
    pinToScrollTo: null,
    requestPinScroll: () => {},
    clearPinScroll: () => {},
    selectedPinScreenY: null,
  }
  const playbackValue: GlobePlaybackContextValue = { /* zeros */ }

  let setValue: React.Dispatch<React.SetStateAction<GlobePinContextValue>>
  function Harness() {
    const [pin, setPin] = useState(pinValue)
    setValue = setPin
    return (
      <GlobePinContext.Provider value={pin}>
        <GlobePlaybackContext.Provider value={playbackValue}>
          <Probe />
        </GlobePlaybackContext.Provider>
      </GlobePinContext.Provider>
    )
  }

  render(<Harness />)
  expect(renderCounts.current).toBe(1)

  act(() => setValue!({ ...pinValue, selectedPin: 'pin-a' }))
  expect(renderCounts.current).toBe(1) // still 1 — playback-only probe ignores pin change
})
```

### Step 4 — coverage

Write one test per protective direction. Six contexts × 5 other contexts = 30 pairs, but many are redundant. Cover these **5 critical directions** at minimum:

1. Playback updates → Data-only consumer does not re-render. (Most important: playback is the hot path.)
2. Pin updates → UI-only consumer does not re-render. (Pin hover is frequent.)
3. Trip updates → Pin-only consumer does not re-render.
4. UI updates → Playback-only consumer does not re-render.
5. Route updates → Trip-only consumer does not re-render.

Plus one positive assertion:

6. Playback updates → Playback-subscribed consumer **does** re-render.

### Step 5 — running the tests

`npm test -- components/globe/__tests__/context-isolation.test.tsx` should pass.

---

## Acceptance criteria

- [ ] `components/globe/__tests__/context-isolation.test.tsx` exists with at least 6 test cases (5 isolation + 1 positive).
- [ ] All tests pass under `npm test`.
- [ ] Each test is independent (no shared state bleeding between `it` blocks).
- [ ] Tests use stable `useMemo`ized values where the test author explicitly wants to keep identity stable — otherwise they don't measure what we think they measure.
- [ ] `npm run lint` clean on the new file.
- [ ] `npm run build` unaffected.

## Non-goals

- Do not test every permutation — 5 critical pairs + 1 positive is enough.
- Do not test the actual `GlobeProvider` — that's an integration concern.
- Do not add snapshot tests.
- Do not add performance timing assertions (e.g., "commits within 5 ms"). Render counts are the right level of abstraction.

## Gotchas

- **StrictMode double-invoke**: `@testing-library/react` renders in StrictMode by default on React 19, which can double-increment the render counter on initial mount. Two options: (a) render outside `<StrictMode>` by wrapping in a plain component, or (b) accept 2 initial renders and assert the delta after the act. Pick (b) for simplicity — initial count is 2; after an unrelated update, it should still be 2.
- **Closure capture in `setValue`**: the `let setValue: ... | undefined` pattern is intentionally imperative. Make sure the `expect(setValue).toBeDefined()` guard runs before calling it.
- **`act` wrapping**: every state update must be inside `act(() => ...)` or the test will warn + flake.
- **Value identity**: `useState`'s initial value is preserved by reference, so passing `pinValue` directly (not via `{...pinValue}`) ensures the first render doesn't spuriously recompute.
- **Fake hooks that throw**: a hook called outside its provider throws. Keep every test inside the correct provider nest.

## Ambiguities requiring clarification

None.

## Handoff / outputs consumed by later tickets

- None. Tests are a safety net, not a contract for downstream work.

## How to verify

1. `npm test` — all new tests pass.
2. `npm test -- --watch` and purposefully break the isolation (e.g., temporarily make `useGlobeData` also subscribe to `GlobePinContext`). Confirm the test fails. Revert.
3. `npm run lint` — clean.
