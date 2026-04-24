# F2-2 — Context split: schema + provider rewrite

**Epic**: F. Polish · **Can be run by agent?**: Yes (fully) · **Estimated size**: M

## Dependencies

### Hard
- None.

### Soft
- None.

### Blocks
- **F2-3** (consumer migration — cannot start until the 6 hooks and types exist).
- **F2-4** (isolation tests — rely on the new hooks).
- **F2-5** (React.memo wrappers — stability guarantees come from the memoized provider values).

---

## Goal

Replace the single monolithic `GlobeContext` (publishes a 40-field value recreated every render — see [`components/globe/GlobeProvider.tsx:468-516`](../../components/globe/GlobeProvider.tsx:468)) with **six narrower contexts**, each wrapped in `useMemo`. The only files this ticket touches are `GlobeContext.tsx` and `GlobeProvider.tsx`. Consumer migration is F2-3's job.

## Spec references

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5.1 "Stable React references" and "Avoid animation thrash on playback"
- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md) "Common hotspots → Stable React references"

## Files to read first

- [`components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — current single-type definition and `useGlobe` hook.
- [`components/globe/GlobeProvider.tsx`](../../components/globe/GlobeProvider.tsx) — all state, effects, and the current single Provider.
- [`lib/types.ts`](../../lib/types.ts) — external types referenced by the context (pins, trips, visits).
- [`lib/globe.ts`](../../lib/globe.ts) — for `GlobeScreenCircle`.

## Files to create

- None (both updates are in-place; existing files are rewritten).

## Files to modify

- `components/globe/GlobeContext.tsx` — becomes six contexts + six hooks. Delete `GlobeContextValue` and `useGlobe`.
- `components/globe/GlobeProvider.tsx` — becomes a nested Provider tree with each value `useMemo`ized.

## Files to delete

- None (the composite hook is deleted from within `GlobeContext.tsx`, not by file removal).

---

## Implementation guidance

### Step 1 — rewrite `components/globe/GlobeContext.tsx`

Define six contexts and six typed hooks. Use this structure:

```tsx
'use client'

import {
  createContext,
  useContext,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { PinWithVisits, TripSummary, TripWithVisits } from '@/lib/types'
import type { GlobeScreenCircle } from '@/lib/globe'

export interface ScreenPosition {
  x: number
  y: number
  visible: boolean
  behind: boolean
}

export type ViewportTier = 'desktop' | 'tablet' | 'mobile'

// ---------- 1. Data (server props + mutable refs; never change identity)
export interface GlobeDataContextValue {
  trips: TripSummary[]
  pins: PinWithVisits[]
  tripsWithVisits: TripWithVisits[]
  fetchError: boolean
  pinPositionRef: MutableRefObject<Record<string, ScreenPosition>>
  globeScreenRef: MutableRefObject<GlobeScreenCircle | null>
  frameSubscribersRef: MutableRefObject<Set<() => void>>
}
export const GlobeDataContext = createContext<GlobeDataContextValue | null>(null)
export function useGlobeData(): GlobeDataContextValue {
  const ctx = useContext(GlobeDataContext)
  if (!ctx) throw new Error('useGlobeData must be used inside <GlobeProvider>')
  return ctx
}

// ---------- 2. Pin (selection, hover, scroll signal)
export interface GlobePinContextValue {
  selectedPin: string | null
  selectPin: (id: string | null) => void
  hoveredPin: string | null
  setHoveredPin: Dispatch<SetStateAction<string | null>>
  pinSubregionHighlight: string | null
  setPinSubregionHighlight: Dispatch<SetStateAction<string | null>>
  pinToScrollTo: { id: string; nonce: number } | null
  requestPinScroll: (id: string) => void
  clearPinScroll: () => void
  selectedPinScreenY: number | null
}
export const GlobePinContext = createContext<GlobePinContextValue | null>(null)
export function useGlobePin(): GlobePinContextValue { /* throw-on-null */ }

// ---------- 3. Trip (lock, hover, mobile preview)
export interface GlobeTripContextValue {
  lockedTrip: string | null
  setLockedTrip: (id: string | null) => void
  hoveredTrip: string | null
  setHoveredTrip: Dispatch<SetStateAction<string | null>>
  previewTrip: string | null
  setPreviewTrip: (id: string | null) => void
}
export const GlobeTripContext = createContext<GlobeTripContextValue | null>(null)
export function useGlobeTrip(): GlobeTripContextValue { /* throw-on-null */ }

// ---------- 4. Playback (sweep highlight + pause reasons)
export interface GlobePlaybackContextValue {
  playbackHighlightedTripIds: string[]
  setPlaybackHighlightedTripIds: (ids: string[]) => void
  playbackActive: boolean
  addPauseReason: (reason: string) => void
  removePauseReason: (reason: string) => void
  isPaused: boolean
}
export const GlobePlaybackContext = createContext<GlobePlaybackContextValue | null>(null)
export function useGlobePlayback(): GlobePlaybackContextValue { /* throw-on-null */ }

// ---------- 5. UI (viewport tier, theme, layout derivation)
export interface GlobeUIContextValue {
  tier: ViewportTier
  isDesktop: boolean
  isTablet: boolean
  isMobile: boolean
  showHover: boolean
  showConnectors: boolean
  isDark: boolean
  layoutState: 'default' | 'panel-open' | 'article-open'
  slideComplete: boolean
  panelVariant: 'pin' | 'trip' | null
}
export const GlobeUIContext = createContext<GlobeUIContextValue | null>(null)
export function useGlobeUI(): GlobeUIContextValue { /* throw-on-null */ }

// ---------- 6. Route (URL-derived state + close action)
export interface GlobeRouteContextValue {
  activeArticleSlug: string | null
  activeTripSlug: string | null
  closeArticle: () => void
}
export const GlobeRouteContext = createContext<GlobeRouteContextValue | null>(null)
export function useGlobeRoute(): GlobeRouteContextValue { /* throw-on-null */ }
```

Every hook throws the same "must be used inside `<GlobeProvider>`" error as today's `useGlobe`.

**Delete** the legacy `GlobeContextValue` type, the legacy `GlobeContext`, and the legacy `useGlobe` hook. No backwards-compat shim. (F2-3 will migrate every consumer.)

### Step 2 — rewrite `components/globe/GlobeProvider.tsx`

Same state/effects as today. The only structural changes:

1. Split the single `return <GlobeContext.Provider value={{ ... }}>` into a **nested** Provider tree, ordered most-stable outward:

   ```tsx
   return (
     <GlobeDataContext.Provider value={dataValue}>
       <GlobeUIContext.Provider value={uiValue}>
         <GlobeRouteContext.Provider value={routeValue}>
           <GlobeTripContext.Provider value={tripValue}>
             <GlobePinContext.Provider value={pinValue}>
               <GlobePlaybackContext.Provider value={playbackValue}>
                 {children}
               </GlobePlaybackContext.Provider>
             </GlobePinContext.Provider>
           </GlobeTripContext.Provider>
         </GlobeRouteContext.Provider>
       </GlobeUIContext.Provider>
     </GlobeDataContext.Provider>
   )
   ```

2. Wrap each of the six `value`s in `useMemo`, listing every field in the dep array:

   ```tsx
   const dataValue = useMemo<GlobeDataContextValue>(
     () => ({
       trips,
       pins,
       tripsWithVisits,
       fetchError,
       pinPositionRef,
       globeScreenRef,
       frameSubscribersRef,
     }),
     [trips, pins, tripsWithVisits, fetchError],
     // refs omitted — their .current mutates but the ref object identity is stable
   )

   const pinValue = useMemo<GlobePinContextValue>(
     () => ({
       selectedPin,
       selectPin,
       hoveredPin,
       setHoveredPin,
       pinSubregionHighlight,
       setPinSubregionHighlight,
       pinToScrollTo,
       requestPinScroll,
       clearPinScroll,
       selectedPinScreenY,
     }),
     [
       selectedPin, selectPin, hoveredPin, setHoveredPin,
       pinSubregionHighlight, setPinSubregionHighlight,
       pinToScrollTo, requestPinScroll, clearPinScroll,
       selectedPinScreenY,
     ],
   )

   // ... similarly for tripValue, playbackValue, uiValue, routeValue
   ```

3. **Setter stability**: every setter passed into a value must be a stable reference. `useState` setters (`setHoveredPin`, `setPinSubregionHighlight`, `setHoveredTrip`) are always stable. `selectPin`, `setLockedTrip`, `setPreviewTrip`, `requestPinScroll`, `clearPinScroll`, `addPauseReason`, `removePauseReason`, `closeArticle` must all be wrapped in `useCallback` with correct deps (most are already). Verify each one before listing in the memo dep array — if a callback re-creates every render, the memo's usefulness collapses.

4. **Derived booleans** (`isDesktop`, `isTablet`, `isMobile`, `showHover`, `showConnectors`) must be computed outside the `useMemo` and referenced as `tier === 'desktop'` etc. — listing all of them in the dep array of the `uiValue` memo is correct (they're derived from `tier`).

5. Do **not** add an ESLint-disable for the dep-array. If `react-hooks/exhaustive-deps` complains, fix the code, don't silence the rule.

### Step 3 — preserve every current effect verbatim

Do **not** touch any of the following during this ticket:

- Pin selection ↔ URL sync effects
- Trip lock ↔ URL sync effects
- Escape-key handler
- Playback active/paused state machine
- Pin-hover pause debounce
- `pinToScrollTo` clear-on-unlock
- `selectedPinScreenY` polling + re-capture
- `slideComplete` timer

Move them as-is. The only structural change is the split of the context and the Provider tree.

### Step 4 — `setPlaybackHighlightedTripIds` pass-through

The current provider exposes the raw `useState` setter. The playback controller in `lib/timelinePlayback.ts` already guards against redundant updates via `arrayEq()`. Keep the raw setter — don't double-wrap.

---

## Acceptance criteria

- [ ] `components/globe/GlobeContext.tsx` defines **six** contexts and **six** hooks; the old `GlobeContextValue` and `useGlobe` are removed.
- [ ] Every new hook throws if used outside `<GlobeProvider>`.
- [ ] `components/globe/GlobeProvider.tsx` renders the six providers nested in the specified order.
- [ ] Each provider's `value` prop is a `useMemo` with an explicit, exhaustive dep array.
- [ ] `npm run build` fails with **expected** TypeScript errors in the 23 consumer files — this is fine; F2-3 fixes them. The build of `GlobeProvider.tsx` / `GlobeContext.tsx` themselves must succeed in isolation (`tsc --noEmit` on just those two files, or equivalent).
- [ ] `npm run lint` passes on the two changed files.
- [ ] No `react-hooks/exhaustive-deps` warnings suppressed.
- [ ] No behavioral changes to state logic (all effects preserved).

## Non-goals

- Do **not** migrate any consumer in this ticket. Consumer migration is F2-3. The build will be red at the consumer files until F2-3 lands — that is the expected handoff state.
- Do not split dispatch from state within a context (e.g., `usePinState` vs. `usePinActions`). The 6-way split is the agreed scope.
- Do not optimize any effect. Even if you notice a stale closure, flag it in the PR comment — don't fix it here.
- Do not move the provider's state into Zustand / Jotai / signals. Context stays.

## Gotchas

- **Ref identity**: `MutableRefObject`'s `.current` mutates but the ref object identity is stable for the component lifetime, so refs do not need to be in a memo dep array. Include them in the value object; omit them from deps.
- **Exhaustive-deps rule**: the ESLint rule is strict. It will flag any missing dep. Trust it. If it complains about a setter being unstable, check whether the setter is actually wrapped in `useCallback`.
- **Empty arrays are a trap**: `playbackHighlightedTripIds` starts as `[]`. The array literal has different identity every render unless it's memoized. Since `useState` preserves the initial array reference, the first-render identity is stable — no action needed, but be aware if you tweak initialization.
- **Provider nesting order**: nesting is cosmetic for correctness but not for React's scheduler. Order the tree outermost-stable → innermost-volatile to match the "things that change most often are deepest" mental model. The declared order above is correct.
- **Cycle**: a Provider whose `value` depends on state from a child Provider is impossible in React — the tree is one-way. Our design has no cross-Provider deps; each Provider's value closes over hooks inside the same component. Good.

## Ambiguities requiring clarification

None. The field assignments are fully specified in this ticket and in the parent README.

## Handoff / outputs consumed by later tickets

- **F2-3** consumes the 6 hooks by name:
  - `useGlobeData`
  - `useGlobePin`
  - `useGlobeTrip`
  - `useGlobePlayback`
  - `useGlobeUI`
  - `useGlobeRoute`
- **F2-4** uses the same 6 hooks + the 6 exported context objects to drive isolation tests.
- **F2-5** relies on the fact that once hubs subscribe to narrower contexts, their props to memoed children are already stable.

## How to verify

1. `tsc --noEmit` against just `components/globe/GlobeContext.tsx` and `GlobeProvider.tsx`:
   ```bash
   npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "GlobeContext|GlobeProvider" || echo "clean"
   ```
   Should be "clean" for those two files (errors elsewhere from consumers are expected until F2-3).
2. `npm run lint -- components/globe/GlobeContext.tsx components/globe/GlobeProvider.tsx` — clean.
3. Visual inspection: the six providers nest in the documented order; each value uses `useMemo` with an explicit dep array.
4. `git diff` the two files — state logic must be byte-identical except for the split into `useMemo`ized values.
