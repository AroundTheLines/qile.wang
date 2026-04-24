# F2-7 — Final profiling pass + PR documentation

**Epic**: F. Polish · **Can be run by agent?**: Partial (profiling + interpretation require human judgment) · **Estimated size**: S

## Dependencies

### Hard
- **F2-1** — allocation fixes landed.
- **F2-3** — consumer migration landed.
- **F2-5** — memo wrappers landed.
- **F2-6** — subscriber audit done.

### Soft
- **F2-4** — isolation tests don't gate profiling, but they must pass before merge.

### Blocks
- **F3** (verification matrix).

---

## Goal

Run the full five-interaction profiling battery against the production build, document before/after numbers, and produce the PR description F3 will cross-reference. This is the ticket that turns "code merged" into "F2 is provably done."

## Spec references

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5.2 Expected scale ceiling
- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md) "Benchmarks (target)" and "How to verify"
- Parent plan: `~/.claude/plans/currently-complete-tickets-a1-eventual-castle.md`

## Files to read first

- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md) — the benchmarks table and acceptance criteria. Targets:

| Dataset | FPS (desktop) | FPS (mobile) | Hover → paint |
|---|---|---|---|
| 10 trips / 15 visits / 9 pins (fixtures) | 60 | 55+ | < 16ms |
| 50 trips / 200 visits / 500 pins (synthetic) | 60 | 40+ | < 25ms |

## Files to create

- None.

## Files to modify

- None (documentation lives in the PR description, not in the repo).

## Files to delete

- None.

---

## Implementation guidance

### Step 1 — baseline re-profile (sanity)

If F2-1, F2-3, F2-5, F2-6 have already landed on the F2 integration branch, the "baseline" referenced in the PR description should be the **pre-F2 commit** (the parent of F2-1). Check out that parent in a separate worktree and record the same 5 interactions so the before/after comparison is real.

```bash
git worktree add /tmp/pre-f2 <pre-f2-commit-sha>
cd /tmp/pre-f2 && npm ci && npm run build && npm start
# (profile in Chrome)
```

### Step 2 — run the 5-interaction bench (pre-F2 and post-F2)

For each build:

1. `npm run build && npm start` (NOT `npm run dev`).
2. Open Chrome in incognito. Disable cache (Network tab → Disable cache). CPU throttling: 1× (no throttle) for desktop; 4× for mobile bench.
3. Enable FPS meter: Performance tab → settings → FPS.
4. Record a 30 s Performance trace covering the five interactions:
   - 5 s idle (passive spin + playback active).
   - 5 s timeline label hover/unhover.
   - 5 s pin hover/unhover.
   - 5 s globe drag.
   - 5 s lock a trip, close panel.
   - 5 s open + close article sliver.
5. Stop recording. Capture:
   - FPS average + minimum for each interaction.
   - Longest single task duration (ms).
   - Scripting time / rendering time ratio.
   - Presence or absence of long-task bars (yellow, > 50 ms).
6. Switch to React DevTools → Profiler. Record the same 30 s. Capture:
   - Total commits.
   - Commits during idle.
   - Commits per playback highlight change.
   - Commits per pin hover.

### Step 3 — mobile emulation bench

Repeat Step 2 with Chrome devtools → device emulation → iPhone 12 (or Pixel 5) and CPU throttle 4×.

### Step 4 — memory bench

1. Open devtools → Memory → take heap snapshot (label: "t0").
2. Run a 2-minute scripted interaction loop:
   - Rotate through the 5 interactions 4 times.
3. Take a second heap snapshot (label: "t2min").
4. Compare retained size. Target: plateau (±5%). Linear growth = leak.

### Step 5 — bundle-size check

```bash
npm run build 2>&1 | grep -A 20 "Route (app)"
```

Record total first-load JS for `/globe`. Compare against the pre-F2 commit. Target: within +15–30 KB gzipped of pre-5C baseline (from spec §F2 acceptance criteria).

### Step 6 — grep sanity

```bash
rg -n "useFrame" components/globe --type tsx | while read -r line; do
  # For each file, ensure no `new THREE.*` or `.clone()` appears within useFrame body.
  # (Visual inspection.)
  echo "$line"
done

rg -n "useGlobe\b\s*\(" components app
# Expected: zero matches.
```

### Step 7 — write the PR description

Template:

```markdown
## Phase 5C · F2 — Performance optimization pass

Landed in [commits X..Y]. Cross-reference for F3.

### Tracks

- F2-1: per-frame allocation hoisting (GlobePins, GlobeScene)
- F2-2 + F2-3: six-way context split + consumer migration (23 files)
- F2-4: context isolation regression tests
- F2-5: React.memo on hot-path children
- F2-6: frame subscriber cleanup audit (findings: [N bugs / no bugs])

### Before / after — desktop (1× CPU)

| Interaction | FPS avg (pre) | FPS avg (post) | Longest task (pre) | Longest task (post) |
|---|---|---|---|---|
| Idle spin | ... | ... | ... | ... |
| Timeline hover | ... | ... | ... | ... |
| Pin hover | ... | ... | ... | ... |
| Drag | ... | ... | ... | ... |
| Lock + close | ... | ... | ... | ... |
| Article sliver | ... | ... | ... | ... |

### Before / after — mobile (iPhone 12 emulation, 4× CPU)

| Interaction | FPS avg (pre) | FPS avg (post) |
|---|---|---|
| Idle spin | ... | ... |
| ... | ... | ... |

### React Profiler — commits per playback highlight change

- Pre: N components committed (23 useGlobe consumers + descendants).
- Post: N components committed (only playback-context subscribers + memoed children that saw prop changes).
- Reduction: ~X%.

### Memory — 2 minute interaction loop

- Heap at t=0: X MB.
- Heap at t=2min: Y MB.
- Delta: +Z MB (plateau / linear growth).

### Bundle size

- `/globe` first-load JS pre: X KB gzip.
- `/globe` first-load JS post: Y KB gzip.
- Delta: +/- Z KB.

### Deliberately deferred (out of scope per §13.5.2)

- Pin clustering.
- Timeline virtualization.
- Merged arc geometry (not needed — measurements below target).
- Panel lazy-loading (bundle-size target met without it).
- Dispatch/state split within each context (not needed — measurements below target).

### Verification matrix for F3

[paste acceptance criteria checklist from 5c-f2-perf-pass.md with ✓/✗ per item]
```

### Step 8 — if any target missed

If any benchmark misses its target:

- **Desktop < 58 fps on any interaction**: re-profile; identify the hottest component in the React Profiler; consider one of the deferred optimizations (most likely: merged arc geometry if ArcLine dominates, or a per-child memo with a custom comparator).
- **Mobile < 45 fps on any interaction**: same. Mobile is usually bound by fill rate (GPU), not JS — consider reducing pixel-level detail (fewer sphere geometry segments, simpler shader) before adding more React layers.
- **Memory growing linearly**: re-audit F2-6 subscribers; also check event listeners on `window`.
- **Bundle size > +30 KB gzipped over pre-5C**: now consider panel lazy-loading. Only then.

Document whichever escape hatch is used in the PR.

---

## Acceptance criteria

- [ ] All benchmarks recorded pre and post; numbers documented in PR description.
- [ ] Desktop ≥ 58 fps on every interaction with the 10/15/9 fixture dataset.
- [ ] Mobile (iPhone 12 emulation, 4× CPU) ≥ 45 fps on every interaction.
- [ ] No long tasks > 50 ms on any interaction.
- [ ] React Profiler commits per playback highlight change reduced vs. pre-F2.
- [ ] Heap plateau after 2 min interaction loop.
- [ ] Bundle size within +15–30 KB gzipped of pre-5C baseline.
- [ ] Grep sanity checks clean (`new THREE.*` not inside `useFrame`; `useGlobe(` call count zero).
- [ ] `npm run build`, `npm test`, `npm run lint` all green.

## Non-goals

- No additional code changes unless a benchmark misses target. This ticket is the measure-and-document step.
- No new profiling infrastructure (Lighthouse CI, etc.).
- No tests beyond what F2-4 already covers.

## Gotchas

- **Dev vs. prod mode**: always profile the production build. `next dev` double-renders in StrictMode and displays inflated numbers.
- **Chrome extensions**: use an incognito window or a fresh profile. React DevTools itself adds 5–10% overhead but is needed for the Profiler recordings; live with it.
- **First trace is noisy**: record each interaction twice; use the second trace. The first often has compilation / warm-up artifacts.
- **Mobile emulation ≠ real device**: devtools emulation is an approximation. If you have a real iPhone 12 / Pixel 5, run there too. If not, 4× CPU on a 2020 laptop is a reasonable proxy.
- **React Profiler commit counts vary run-to-run**: record three times; report the median.
- **FPS meter is a rough average**: prefer `window.requestAnimationFrame` timestamps if you need precision. For this ticket, the Performance-panel FPS is enough.

## Ambiguities requiring clarification

- **Which commit serves as "pre-F2" baseline?** The commit immediately before F2-1 (the first F2 ticket to land). If F2 tickets land out of the documented order, use the earliest F2-* commit's parent.
- **Mobile device or emulation?** Per the parent F2 ticket: modern mid-range, emulation is acceptable. If a real device is available and results diverge materially from emulation, note both in the PR.

## Handoff / outputs consumed by later tickets

- **F3 (verification matrix)** uses the numbers and checklist from this ticket's PR description as input. Do not delete the PR description or replace the numbers after F3 starts.

## How to verify

1. Read the PR description. Every benchmark has a pre and post number.
2. Every acceptance criterion is checked or (if missed) has an accompanying escape-hatch note.
3. Re-run any one interaction locally; confirm the post numbers reproduce within ±10%.
