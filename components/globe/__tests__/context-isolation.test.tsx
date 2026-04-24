// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { memo, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { describe, expect, it } from 'vitest'
import {
  GlobeDataContext,
  GlobePinContext,
  GlobePlaybackContext,
  GlobeRouteContext,
  GlobeTripContext,
  GlobeUIContext,
  useGlobeData,
  useGlobePin,
  useGlobePlayback,
  useGlobeTrip,
  useGlobeUI,
  type GlobeDataContextValue,
  type GlobePinContextValue,
  type GlobePlaybackContextValue,
  type GlobeRouteContextValue,
  type GlobeTripContextValue,
  type GlobeUIContextValue,
} from '../GlobeContext'

// ---------- probe helper ----------
function makeProbe<T>(hook: () => T) {
  const renderCounts = { current: 0 }
  // React.memo so the Probe only re-renders when the specific context(s)
  // the hook subscribes to change — not when an unrelated parent re-renders.
  // Without memo, any parent state change would propagate through normal
  // reconciliation and drown out the signal we're measuring.
  const Probe = memo(function Probe() {
    hook()
    renderCounts.current += 1
    return null
  })
  return { Probe, renderCounts }
}

// Capture a state setter from inside the Harness without reassigning an
// outer `let` binding (which trips react-hooks/globals). We mutate a
// property on a stable holder object instead.
type SetterHolder<T> = { current: Dispatch<SetStateAction<T>> | null }
function createSetterHolder<T>(): SetterHolder<T> {
  return { current: null }
}

// ---------- stable bare context values ----------

const noop = () => {}

const DATA_VALUE: GlobeDataContextValue = {
  trips: [],
  pins: [],
  tripsWithVisits: [],
  fetchError: false,
  pinPositionRef: { current: {} },
  globeScreenRef: { current: null },
  frameSubscribersRef: { current: new Set() },
}

const PIN_VALUE: GlobePinContextValue = {
  selectedPin: null,
  selectPin: noop,
  hoveredPin: null,
  setHoveredPin: noop as Dispatch<SetStateAction<string | null>>,
  pinSubregionHighlight: null,
  setPinSubregionHighlight: noop as Dispatch<SetStateAction<string | null>>,
  pinToScrollTo: null,
  requestPinScroll: noop,
  clearPinScroll: noop,
  selectedPinScreenY: null,
}

const TRIP_VALUE: GlobeTripContextValue = {
  lockedTrip: null,
  setLockedTrip: noop,
  hoveredTrip: null,
  setHoveredTrip: noop as Dispatch<SetStateAction<string | null>>,
  previewTrip: null,
  setPreviewTrip: noop,
}

const PLAYBACK_VALUE: GlobePlaybackContextValue = {
  playbackHighlightedTripIds: [],
  setPlaybackHighlightedTripIds: noop,
  playbackActive: false,
  addPauseReason: noop,
  removePauseReason: noop,
  isPaused: false,
}

const UI_VALUE: GlobeUIContextValue = {
  tier: 'desktop',
  isDesktop: true,
  isTablet: false,
  isMobile: false,
  showHover: true,
  showConnectors: true,
  isDark: false,
  layoutState: 'default',
  slideComplete: false,
  panelVariant: null,
}

const ROUTE_VALUE: GlobeRouteContextValue = {
  activeArticleSlug: null,
  activeTripSlug: null,
  closeArticle: noop,
}

describe('globe context isolation', () => {
  // -------- 1. Playback updates → Data-only consumer does NOT re-render --------
  it('playback updates do not re-render data-only consumer', () => {
    const { Probe, renderCounts } = makeProbe(useGlobeData)
    const setter = createSetterHolder<GlobePlaybackContextValue>()

    function Harness() {
      const [playback, setPb] = useState(PLAYBACK_VALUE)
      useEffect(() => { setter.current = setPb }, [setPb])
      return (
        <GlobeDataContext.Provider value={DATA_VALUE}>
          <GlobePlaybackContext.Provider value={playback}>
            <Probe />
          </GlobePlaybackContext.Provider>
        </GlobeDataContext.Provider>
      )
    }

    render(<Harness />)
    const baseline = renderCounts.current

    expect(setter.current).not.toBeNull()
    act(() => setter.current!({ ...PLAYBACK_VALUE, playbackActive: true }))
    expect(renderCounts.current).toBe(baseline)
  })

  // -------- 2. Pin updates → UI-only consumer does NOT re-render --------
  it('pin updates do not re-render ui-only consumer', () => {
    const { Probe, renderCounts } = makeProbe(useGlobeUI)
    const setter = createSetterHolder<GlobePinContextValue>()

    function Harness() {
      const [pin, setP] = useState(PIN_VALUE)
      useEffect(() => { setter.current = setP }, [setP])
      return (
        <GlobeUIContext.Provider value={UI_VALUE}>
          <GlobePinContext.Provider value={pin}>
            <Probe />
          </GlobePinContext.Provider>
        </GlobeUIContext.Provider>
      )
    }

    render(<Harness />)
    const baseline = renderCounts.current

    expect(setter.current).not.toBeNull()
    act(() => setter.current!({ ...PIN_VALUE, hoveredPin: 'pin-a' }))
    expect(renderCounts.current).toBe(baseline)
  })

  // -------- 3. Trip updates → Pin-only consumer does NOT re-render --------
  it('trip updates do not re-render pin-only consumer', () => {
    const { Probe, renderCounts } = makeProbe(useGlobePin)
    const setter = createSetterHolder<GlobeTripContextValue>()

    function Harness() {
      const [trip, setT] = useState(TRIP_VALUE)
      useEffect(() => { setter.current = setT }, [setT])
      return (
        <GlobePinContext.Provider value={PIN_VALUE}>
          <GlobeTripContext.Provider value={trip}>
            <Probe />
          </GlobeTripContext.Provider>
        </GlobePinContext.Provider>
      )
    }

    render(<Harness />)
    const baseline = renderCounts.current

    expect(setter.current).not.toBeNull()
    act(() => setter.current!({ ...TRIP_VALUE, lockedTrip: 'trip-a' }))
    expect(renderCounts.current).toBe(baseline)
  })

  // -------- 4. UI updates → Playback-only consumer does NOT re-render --------
  it('ui updates do not re-render playback-only consumer', () => {
    const { Probe, renderCounts } = makeProbe(useGlobePlayback)
    const setter = createSetterHolder<GlobeUIContextValue>()

    function Harness() {
      const [ui, setU] = useState(UI_VALUE)
      useEffect(() => { setter.current = setU }, [setU])
      return (
        <GlobePlaybackContext.Provider value={PLAYBACK_VALUE}>
          <GlobeUIContext.Provider value={ui}>
            <Probe />
          </GlobeUIContext.Provider>
        </GlobePlaybackContext.Provider>
      )
    }

    render(<Harness />)
    const baseline = renderCounts.current

    expect(setter.current).not.toBeNull()
    act(() => setter.current!({ ...UI_VALUE, layoutState: 'panel-open' }))
    expect(renderCounts.current).toBe(baseline)
  })

  // -------- 5. Route updates → Trip-only consumer does NOT re-render --------
  it('route updates do not re-render trip-only consumer', () => {
    const { Probe, renderCounts } = makeProbe(useGlobeTrip)
    const setter = createSetterHolder<GlobeRouteContextValue>()

    function Harness() {
      const [route, setR] = useState(ROUTE_VALUE)
      useEffect(() => { setter.current = setR }, [setR])
      return (
        <GlobeTripContext.Provider value={TRIP_VALUE}>
          <GlobeRouteContext.Provider value={route}>
            <Probe />
          </GlobeRouteContext.Provider>
        </GlobeTripContext.Provider>
      )
    }

    render(<Harness />)
    const baseline = renderCounts.current

    expect(setter.current).not.toBeNull()
    act(() => setter.current!({ ...ROUTE_VALUE, activeArticleSlug: 'hello' }))
    expect(renderCounts.current).toBe(baseline)
  })

  // -------- 6. POSITIVE: Playback updates → Playback-subscribed consumer DOES re-render --------
  it('playback updates re-render a playback-subscribed consumer', () => {
    const { Probe, renderCounts } = makeProbe(useGlobePlayback)
    const setter = createSetterHolder<GlobePlaybackContextValue>()

    function Harness() {
      const [playback, setPb] = useState(PLAYBACK_VALUE)
      useEffect(() => { setter.current = setPb }, [setPb])
      return (
        <GlobePlaybackContext.Provider value={playback}>
          <Probe />
        </GlobePlaybackContext.Provider>
      )
    }

    render(<Harness />)
    const baseline = renderCounts.current

    expect(setter.current).not.toBeNull()
    act(() => setter.current!({ ...PLAYBACK_VALUE, playbackActive: true }))
    // Exactly one commit per state update (StrictMode double-invokes render,
    // not commit — so the delta is 1, not 2).
    expect(renderCounts.current).toBe(baseline + 1)
  })
})
