# 5C-D2 — URL state sync: `?trip=<slug>`, history, deep-link

**Epic**: D. Routing & URL state · **Owner**: Dev A · **Can be run by agent?**: Partial — Next.js 16 routing quirks need runtime validation · **Estimated size**: M

## Dependencies

### Hard
- **C1** — provider has `lockedTrip`, `activeTripSlug`, `activeArticleSlug` state.
- **D1** — `/trip/<slug>` route exists for the redirect target.

### Soft
- None.

### Blocks
- **D3** (escape key + 404 behavior depends on state/URL sync).

---

## Goal

Wire bi-directional synchronization between provider state and URL. Deep-links work; browser back/forward produce expected states; no history pollution from internal transitions.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §8.4 URL state and deep linking
- §8.6 Switching trips while article sliver is open
- §8.7 Browser history (read carefully — flags Next.js App Router quirks)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §8.4, §8.6, §8.7
- [`../../components/globe/GlobeProvider.tsx`](../../components/globe/GlobeProvider.tsx) (post-C1) — current URL derivations
- [`../../AGENTS.md`](../../AGENTS.md) — Next.js 16 breaking changes reminder
- [`../../node_modules/next/dist/docs/`] — check relevant files for useSearchParams, router.push

## Files to create

- None.

## Files to modify

- `components/globe/GlobeProvider.tsx` — add URL write side + equality-checked pushes
- `components/globe/GlobeContext.tsx` — no new fields (all added in C1)

## Files to delete

- None.

---

## Implementation guidance

### State ↔ URL mapping

From README and spec:

| Provider state | URL |
|---|---|
| `selectedPin = X, lockedTrip = null, *Slug = null` | `/globe` (pin selection is session-only) |
| `lockedTrip = T, *Slug = null` | `/globe?trip=<T.slug>` |
| `activeArticleSlug = S` | `/globe/<S>` (unchanged) |
| `activeTripSlug = T.slug` | `/trip/<T.slug>` |
| Default | `/globe` |

### Read side (URL → state) — already in C1

C1's useEffects:

1. `activeArticleSlug` from `/globe/<slug>` path.
2. `activeTripSlug` from `/trip/<slug>` path.
3. `lockedTrip` from `?trip=<slug>` query (or from `/trip/<slug>` — derive matching).

Confirm these are in place. If not, add.

### Write side (state → URL) — this ticket

New `useEffect` in GlobeProvider: when `lockedTrip` changes, push a URL update — but only if the current URL doesn't already reflect that state.

```tsx
// In GlobeProvider.tsx

useEffect(() => {
  const currentTripQuery = searchParams.get('trip')
  const lockedTripSlug = lockedTrip
    ? trips.find((t) => t._id === lockedTrip)?.slug.current ?? null
    : null

  // Only push URL updates when on /globe (not /trip/* or /globe/* article routes).
  // Those routes own their URL.
  if (pathname !== '/globe') return

  if (lockedTripSlug && lockedTripSlug !== currentTripQuery) {
    router.push(`/globe?trip=${encodeURIComponent(lockedTripSlug)}`, { scroll: false })
  } else if (!lockedTripSlug && currentTripQuery) {
    router.push('/globe', { scroll: false })
  }
}, [lockedTrip, pathname, searchParams, router, trips])
```

### Cold load flows

Handled by C1's read-side effects:

- **`/globe`**: no lockedTrip, no article. Default.
- **`/globe?trip=<slug>`**: lockedTrip resolves from query → rotate-to-fit fires (C5), trip panel opens (C4).
- **`/trip/<slug>`**: activeTripSlug sets → trip article sliver opens (D1), lockedTrip sets (from D1's TripArticleReveal).
- **`/globe/<item-slug>`**: activeArticleSlug sets → item article sliver opens (Phase 5B behavior preserved).

### Trip switch while article sliver is open (§8.6)

Scenario: user is on `/trip/A` with sliver open. They click trip B's label.

Expected flow per spec:
1. Sliver for trip A closes.
2. Globe shifts back to center.
3. Camera rotates to fit trip B's visits.
4. Trip panel updates to show trip B.
5. URL goes to `/globe?trip=<B.slug>`.
6. User does NOT auto-see trip B's sliver — they click "View trip article" to open B's.

Implementation: timeline's click handler (B4) calls `setLockedTrip(B.id)` + `router.push('/globe?trip=B', { scroll: false })`. The write-side effect above is a no-op (URL is already correct). The `pathname` changes from `/trip/A` to `/globe` — `activeTripSlug` becomes null — sliver closes.

Confirm: the router.push above must fully replace the pathname, not append `?trip=B` to `/trip/A`. Use absolute path `/globe?trip=...`.

### Browser back from `/trip/<slug>` (§8.7)

Expected: back returns to `/globe?trip=<slug>` (trip still locked).

Mechanism: when user arrives at `/trip/<slug>` via TripPanel's "View trip article" button, they came from `/globe?trip=<slug>`. That URL is the history predecessor. Browser back pops it.

**Edge case**: cold load directly on `/trip/<slug>`. History predecessor is wherever the user came from (Google, external link, or nothing). Back button goes there, not to `/globe?trip=<slug>`. Spec §8.7 says "Back from `/trip/<slug>` → `/globe?trip=<slug>`."

To implement this strictly, on cold load we'd push a synthetic history entry. But spec §8.4 says cold load on `/trip/<slug>` "After the user dismisses the sliver, they land in the /globe?trip=<slug> state" — dismiss is an explicit push, not back-button behavior. So on cold load, back button goes to external (fine); on normal flow, back goes to `/globe?trip=<slug>` (works natively).

**Decision**: no synthetic history on cold load. Browser back behavior is correct for the normal flow. Cold-load back is "whatever browser had" — acceptable.

### `router.push` vs `router.replace`

- All normal state transitions: `push`.
- 404 redirect (D3): `replace` to avoid polluting history with the invalid URL.
- URL write-side effect above: `push`. Equality check prevents redundant pushes.

### Preventing write-side effect loops

Scenario: URL changes → read-side updates `lockedTrip` → write-side effect sees `lockedTrip`-URL mismatch → pushes URL. Loop.

Mitigation: both sides check equality before acting. If `lockedTrip === derivedFromUrl`, both bail.

Concretely, read-side sets `lockedTrip` from URL. Write-side reads URL — they match. Write-side does nothing. No loop.

If write-side pushes a URL, that triggers a pathname/searchParams change. Read-side re-runs. It sees `lockedTrip` matches the URL (because write-side just pushed it based on state). Bails. No loop.

Double-check with actual code — the equality check is `lockedTripSlug !== currentTripQuery`. If both derive from the same source, they match. Good.

### Next.js 16 quirks (§8.7)

Spec §8.7 explicitly flags Next.js 16 history-API quirks. Before coding, read `node_modules/next/dist/docs/` for the App Router routing model.

Things to verify at runtime:
- `router.push('/globe?trip=X', { scroll: false })` — does it actually update `searchParams` via `useSearchParams()`? Expected yes.
- Back button after `router.push` — does the push create a history entry? Expected yes.
- `useSearchParams()` readable synchronously inside effects? Expected yes.

If any of these behave unexpectedly, adjust. Log findings in PR.

---

## Acceptance criteria

- [ ] Clicking a trip label on `/globe` updates URL to `/globe?trip=<slug>`.
- [ ] Navigating directly to `/globe?trip=berlin-2022` (cold load): page loads, trip Berlin '22 is locked, panel open, camera rotated.
- [ ] Navigating directly to `/trip/berlin-2022` (cold load): page loads, trip article sliver open, trip locked.
- [ ] From `/trip/<slug>`, clicking globe sliver (article close): URL becomes `/globe?trip=<slug>`, trip panel visible, sliver closed.
- [ ] From `/trip/A` sliver open, clicking trip B's timeline label: URL → `/globe?trip=<B.slug>`, B trip panel visible (no sliver), camera rotated to B.
- [ ] Browser back from `/trip/<slug>` → `/globe?trip=<slug>` (after normal forward navigation).
- [ ] Browser back from `/globe?trip=<slug>` → `/globe` (trip deselects).
- [ ] Browser back from `/globe` → wherever user came from.
- [ ] Forward button inverse of back — symmetric.
- [ ] No URL write-side loops (verify by watching Network tab during interactions — no runaway pushes).
- [ ] Clicking the already-locked trip label deselects (URL → `/globe`, trip panel closes).

## Non-goals

- **404 redirect behavior** — D3.
- **Escape key** — D3.
- **URL-based pin selection** — intentionally not supported (pin selection is session state).

## Gotchas

- **`router.push` with `{ scroll: false }` is essential** for all inline transitions. Lose the option and page scrolls to top.
- **`useSearchParams()` in client components only** — GlobeProvider is client. Fine.
- **`useSearchParams()` returns a stable object**: reads return latest; changes trigger re-render. No subscription needed.
- **Route group caveat**: if D1 used a route group `(globe)`, the `pathname` values are `/globe` and `/trip/<slug>` (group hidden). All URL comparisons work on the user-visible path.
- **`trips` not hydrated at cold-load-time**: the provider fetches trips server-side and passes via props. Client-side hydration makes trips available immediately. The URL → state effect reads `trips` to find by slug — if trips is empty (shouldn't happen with SSR), effect does nothing. Fine.
- **`searchParams` serialization**: spec uses `/globe?trip=<slug>`. Slugs are URL-safe, but `encodeURIComponent` is defensive.
- **`pathname` changes before `searchParams`** during router.push — use `usePathname` and `useSearchParams` separately; they stay in sync per React rendering. No race.
- **Sliver close handler (`closeArticle` in C1)**: for trip articles, it pushes `/globe?trip=<slug>`. For item articles, `/globe`. Confirm C1's implementation branches on `activeTripSlug` vs `activeArticleSlug`.

## Ambiguities requiring clarification before starting

1. **Sliver switch on label click (§8.6)**: my interpretation — clicking label B while on `/trip/A` immediately closes A's sliver and goes to `/globe?trip=B`. Spec says "user does not automatically see trip B's article sliver." Implementation above achieves this: `router.push('/globe?trip=B')` changes pathname → `activeTripSlug` becomes null → sliver closes.

2. **History pollution from rapid pushes**: if user rapid-clicks different labels, each push creates a history entry. Back button walks through them one-at-a-time. Acceptable but potentially annoying. Could use `router.replace` for rapid repeated label clicks within a short window. Over-engineered for now.

   **Action**: use push. Accept minor history buildup.

3. **Next.js 16 verification**: spec §8.7 explicitly tells implementer to validate. During implementation, open browser devtools, click a label, check `window.history.length` before/after. Confirms a push happened. Do the same for browser back and verify the predecessor URL.

4. **Does setting `lockedTrip` from the URL-read side trigger the write-side push?**: the write-side's equality check (`lockedTripSlug !== currentTripQuery`) prevents the push when they match. On cold load, `lockedTrip` derives from URL → both sides match → no push. Good.

## Handoff / outputs consumed by later tickets

- URL state fully wired — D3 builds escape handling on top.
- No code handoff.

## How to verify

1. Sequence:
   - Home `/`
   - Click "Globe" → `/globe`
   - Click "Japan Spring '22" label → URL becomes `/globe?trip=japan-spring-2022`
   - Click "View trip article" in panel → URL becomes `/trip/japan-spring-2022`, sliver opens
   - Click globe sliver → URL becomes `/globe?trip=japan-spring-2022`, sliver closes
   - Click another label "Berlin '22" → URL becomes `/globe?trip=berlin-2022`
   - Click empty timeline → URL becomes `/globe`
2. Browser back from step-5 state → `/globe?trip=japan-spring-2022`. Back again → `/globe?trip=japan-spring-2022` (same? No — back from `/globe?trip=berlin-2022` goes to the previous push which was `/globe?trip=japan-spring-2022`). Continue back → `/trip/japan-spring-2022`. Back → `/globe?trip=japan-spring-2022`. Back → `/globe`. Back → `/`.
3. Cold load `/globe?trip=berlin-2022` — page loads, panel open, camera rotated.
4. Cold load `/trip/berlin-2022` — page loads, sliver open.
5. Cold load `/trip/does-not-exist` — 404 (D3 redirects).
6. DevTools Network: no loops, one push per intentional action.
