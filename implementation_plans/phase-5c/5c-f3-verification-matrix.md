# 5C-F3 — Fixture-driven verification matrix

**Epic**: F. Polish · **Owner**: All three (collaborate) · **Can be run by agent?**: No — manual UX verification · **Estimated size**: M

## Dependencies

### Hard
- **All prior tickets** — F3 is the capstone verification pass.

### Soft
- **F2** — perf numbers provide context for acceptance.

### Blocks
- **Phase 5C DoD** (per README §9).

---

## Goal

Walk through every edge case + empty state + expected behavior from the spec against the seeded fixtures from A4. Confirm each case behaves as specified. Produce a checklist + list of bugs (fixed inline where trivial, filed otherwise).

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §11.2 Fixture authoring checklist
- §12 Empty states & edge cases
- §13 Accessibility & Deferred UX (confirm deferred items are absent, not partially-implemented)
- README [§6 Smoke test](./README.md#61-smoke-test-after-full-merge)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §11, §12, §13
- [README](./README.md) full
- All Phase 5C tickets' Acceptance criteria (cross-reference)

## Files to create

- None.

## Files to modify

- Any files needed to fix bugs surfaced during verification. Scope each fix to 10 lines or less; anything bigger should become a follow-up ticket.

## Files to delete

- None.

---

## Implementation guidance

### Verification matrix

Run through each row. Mark ✓ or ✗. For ✗, either fix inline (trivial) or file a bug.

Each row includes the seed fixture, expected behavior, acceptance criteria, and associated spec section.

#### Data model cases (§11.2)

| # | Case | Fixture | Expected |
|---|---|---|---|
| 1 | Single-visit trip | Morocco '18 | One pin on globe for Marrakech. Trip segment renders as short bar on timeline. Locking opens trip panel with single visit section. |
| 2 | Multi-visit trip + article | Japan Spring '22 | Three pins (Tokyo, Kyoto, Osaka). Arcs connect them chronologically. Trip panel lists Tokyo → Kyoto → Osaka. "View trip article" active → opens sliver. |
| 3 | Same location / different trips | Berlin '22 + Berlin '24 | One Berlin pin. Pin panel shows 2 sections (Berlin 2024 first, then Berlin 2022). Each section has own "View trip article" link. |
| 4 | Trip with no article body | Weekend in Lisbon | Trip segment renders normally. Trip panel's "View trip article" button is grayed out. Hover on desktop shows "No content available for this trip." tooltip. Tap on mobile shows same. |
| 5 | Overlapping trips in time | SF Q4 '23 + Seattle Q4 '23 | Timeline segments stack or render side-by-side. Playhead entering the overlap region highlights both. Floating label shows "SF Q4 '23 · Seattle Q4 '23". |
| 6 | Single-day trip | NYC Day Trip | Renders as a dot on timeline (not a zero-width bar). Dot participates in hover/click. Playhead lights up the dot as it crosses. |
| 7 | Item with no visits | Any content doc not referenced by visits | Appears in /wardrobe. Does not appear on globe or in any trip/pin panel. |
| 8 | Item in 2+ visits of one trip | `black-ma-1-bomber` in Tokyo + Osaka of Japan Spring '22 | Appears in both visit sections of Japan Spring '22 trip panel. Two entries. |
| 9 | Item in visits across 2+ trips | `silk-scarf-navy` in Japan Spring '22 + Berlin '22 | Visible in both trips' panels. |
| 10 | 5+ year fixture span | Tokyo 2019 → Berlin 2024 | Timeline compresses empty years but keeps all trips visible. Year labels render. |
| 11 | Globe-spanning trip | Round-the-World (Tokyo + NYC + Sydney) | Arcs span long distances across the globe. Camera rotate-to-fit caps at ~40% globe visible. |

#### Empty states & edge cases (§12)

| # | Case | How to trigger | Expected |
|---|---|---|---|
| 12 | Zero trips | Wipe trips + visits, leave content | Timeline shows "Nothing yet". Globe empty. |
| 13 | Single-trip user | Leave only 1 trip | Playback loops normally. Sweep passes trip, loops back. |
| 14 | Visit with zero items | Weekend in Lisbon | Pin visible. Section renders without item count (or "0 items"). No "items coming soon" placeholder. |
| 15 | Trip all empty visits | Trip with no items in any visit | Timeline segment + label render. Panel shows empty sections. |
| 16 | Loading state | Throttle network, hard reload | Boneyard skeletons render for timeline + trip list. Globe does passive spin during data load. Playback starts only after data resolves. |
| 17 | First paint | Cold load with cache cleared | Globe spin visible first, timeline bones, then real content populates without mid-animation pop-in. |
| 18 | Data fetch failure | Mock Sanity to reject | Globe empty. Timeline shows "Could not load timeline. Retry." Retry button reloads the page. |
| 19 | Escape layered dismiss | See §12.8 | Sliver open → Escape closes sliver → panel visible. Escape again → closes panel. Escape → no-op. |
| 20 | Browser back/forward | Click lock, open article, back, forward | Lock → URL `/globe?trip=<slug>`. Article open → `/trip/<slug>`. Back → `/globe?trip=<slug>` (trip locked, panel visible). Back → `/globe`. Forward → `/globe?trip=<slug>`. Forward → `/trip/<slug>`. |

#### Interaction matrix (§9)

| # | Case | Expected |
|---|---|---|
| 21 | Timeline label hover (desktop) | Segment + label accent-colored. Arcs for that trip highlight. Pins glow. Playback pauses during hover; resumes 5s after. |
| 22 | Timeline label click (desktop) | Lock. Camera rotates. Panel opens. URL updates. Arcs pulse. |
| 23 | Click already-locked label | Deselect. Camera stays. URL → `/globe`. |
| 24 | Click different label while locked | Instant swap (desktop). |
| 25 | Click different label while sliver open | Sliver closes, new trip's panel opens (no auto-sliver). |
| 26 | Pin hover (desktop) | Tooltip appears: "Location · N visits". Arcs for containing trips highlight. Timeline visit bands appear. Playback pauses. |
| 27 | Pin click (nothing locked) | Pin panel opens. Timeline visit bands appear. |
| 28 | Pin click (trip locked, pin in trip) | Panel auto-scrolls to visit section. Pulse animation. No new pin panel. Lock remains. |
| 29 | Pin click (trip locked, pin NOT in trip) | Trip unlocks. Pin panel opens. Camera rotates to pin. |
| 30 | Empty timeline click | Deselect lock. |
| 31 | Empty globe click | Deselect pin / unlock / close sliver (one layer per click). |
| 32 | Drag globe | Camera rotates. Playback pauses. Passive spin halts. 5s resume after release. |
| 33 | Zoom timeline | Cursor-anchored zoom. Playback pauses. On release: 5s timer → timeline zooms back to full history + playback resumes. |

#### Mobile cases

| # | Case | Expected |
|---|---|---|
| 34 | Mobile layout default | Globe top 45vh, timeline below sticky, trip list below. |
| 35 | Scroll past globe | Timeline sticks to top with slight squeeze. Trip list flows below. |
| 36 | Tap pin | Pin panel replaces trip list inline. Back arrow at top. |
| 37 | Tap trip label (first time) | Preview expands inline. Shows title, dates, "View trip" button. |
| 38 | Tap "View trip" | Trip locks. Camera rotates. Trip panel replaces content region. |
| 39 | Tap different label while preview shown | Preview swaps. |
| 40 | Tap another label while one locked | Second enters preview state (lighter accent) alongside locked (full accent). |
| 41 | Tap "View trip" on preview while one locked | Swap lock. |
| 42 | Tap item in panel | Content region shows article body. Close X at top. Globe still above. |

#### Playback + camera (§5)

| # | Case | Expected |
|---|---|---|
| 43 | Sweep direction | Present → past (right to left). |
| 44 | Reach earliest | Playhead stops at left. All highlights clear. 5s hold. |
| 45 | Hold complete | Playhead teleports to right. Resume sweep. |
| 46 | Passive spin during playback | Continues. |
| 47 | Lock during playback | Playback pauses indefinitely. Camera rotate-to-fit. Passive spin stops. |
| 48 | Deselect trip | 5s later, playback + passive spin resume. |

#### Performance (§13.5)

| # | Case | Expected |
|---|---|---|
| 49 | 60fps desktop | Record 30s of mixed interaction. Verify. |
| 50 | 45+ fps mobile | Devtools emulation or real device. Verify. |

#### Deferred items absent (§13)

| # | Case | Expected |
|---|---|---|
| 51 | Keyboard nav on timeline | No-op (not implemented). Tab/arrow keys don't navigate segments. |
| 52 | Screen reader playback announce | Not announced. |
| 53 | Per-trip colors | All highlights same accent color. |
| 54 | Item dedup in trip panel | Duplicates visible. |
| 55 | Search/filter UI | Not present. |

---

## Acceptance criteria

- [ ] Every row (1–55) is marked ✓.
- [ ] Bugs found and fixed inline (trivial): documented in PR.
- [ ] Bugs filed as follow-up tickets (non-trivial): linked in PR.
- [ ] `npm run build` succeeds.
- [ ] `npm run lint` succeeds.
- [ ] Smoke test (README §6.1) runs end-to-end without issues.
- [ ] Perf numbers from F2 attached to PR as a baseline for future phases.

## Non-goals

- **Automated tests** — not in scope. Manual.
- **Regressions in Phase 5A/5B** — out of scope beyond smoke-test sanity (wardrobe, item articles still work).
- **New features** — do not add anything new here.

## Gotchas

- **Fixture dependency**: A4 must have seeded all coverage cases. If a case isn't in the dataset, either seed it now or skip the row with a note.
- **Spec-vs-implementation disagreements**: if you find a behavior that works but diverges from spec, either (a) fix it to match, (b) update the spec (with reviewer approval), or (c) note as known deviation.
- **Time sink**: F3 can take a full day. Allocate accordingly.
- **Cross-browser check**: at minimum, Chrome + Safari. Firefox if time allows. Mobile Safari on real iPhone for row 34–42.
- **Follow-up ticket template**: for each non-trivial bug, file with: reproduction steps, expected (from spec), actual, severity. Link to the spec section.

## Ambiguities requiring clarification before starting

1. **What counts as "trivial" inline fix vs follow-up ticket?**: rule of thumb — if the fix is < 10 lines in a single file and the verifier is confident about the change, fix inline. Otherwise file.

2. **Which matrix rows are blocking vs non-blocking for phase close-out?**: everything flagged MUST (rows 1–48) is blocking. Perf (49–50) blocking. Deferred-absent (51–55) non-blocking (they're negative confirmations).

   **Action**: 1–50 block the DoD checklist.

3. **Reviewer pairing**: solo verification is prone to blindspots. Recommend two engineers run through the matrix together, or have one run + another sample-spot-check.

## Handoff / outputs consumed by later tickets

- Nothing downstream — F3 is the last. Closes Phase 5C.

## How to verify

1. Open this ticket's matrix.
2. Work through rows 1–55 systematically. Tick boxes.
3. For each ✗, either fix or file a follow-up ticket.
4. When complete, close the ticket + mark Phase 5C complete in SPEC.md.
