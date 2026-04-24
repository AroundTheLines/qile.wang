// @vitest-environment jsdom
//
// Behavioral pin for the setter-wrapper invariants in GlobeProvider.
// After PR #56, several derived-state clears moved from reactive effects
// into the `selectPin` / `setLockedTrip` wrappers. Anyone who sidesteps a
// wrapper (e.g., calling a raw `useState` setter, or adding a new code path
// that flips these fields) could silently break the invariant without these
// tests catching it.
import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// next/navigation mocks. `searchParams` is controlled by a module-scope
// URLSearchParams that each test can mutate before render / between acts.
const routerMock = { push: vi.fn(), replace: vi.fn() }
let currentSearchParams = new URLSearchParams()
let currentPathname = '/globe'

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => routerMock,
  useSearchParams: () => currentSearchParams,
}))

import GlobeProvider from '../GlobeProvider'
import { useGlobeData, useGlobePin, useGlobeTrip } from '../GlobeContext'
import type { PinWithVisits, TripSummary, TripWithVisits } from '@/lib/types'

// Minimal fixture: one trip, one pin.
const TRIP: TripSummary = {
  _id: 'trip-1',
  title: 'Test Trip',
  slug: { current: 'test-trip' },
  startDate: '2026-01-01',
  endDate: '2026-01-07',
  visitCount: 1,
  hasArticle: false,
}

const PIN: PinWithVisits = {
  location: {
    _id: 'loc-1',
    name: 'Somewhere',
    coordinates: { lat: 0, lng: 0 },
    slug: { current: 'somewhere' },
  },
  visits: [],
  coordinates: { lat: 0, lng: 0 },
  visitCount: 1,
  tripIds: ['trip-1'],
}

type PinCtx = ReturnType<typeof useGlobePin>
type TripCtx = ReturnType<typeof useGlobeTrip>
type DataCtx = ReturnType<typeof useGlobeData>
type Snapshot = { pin: PinCtx; trip: TripCtx; data: DataCtx }

function Probe({ onSnapshot }: { onSnapshot: (snap: Snapshot) => void }) {
  const pin = useGlobePin()
  const trip = useGlobeTrip()
  const data = useGlobeData()
  useEffect(() => {
    onSnapshot({ pin, trip, data })
  })
  return null
}

function renderWithProvider(
  snapshots: Snapshot[],
  { trips = [TRIP], pins = [PIN] }: { trips?: TripSummary[]; pins?: PinWithVisits[] } = {},
) {
  const tripsWithVisits: TripWithVisits[] = []
  const result = render(
    <GlobeProvider
      trips={trips}
      pins={pins}
      tripsWithVisits={tripsWithVisits}
      fetchError={false}
    >
      <Probe onSnapshot={(snap) => snapshots.push(snap)} />
    </GlobeProvider>,
  )
  return {
    ...result,
    latest: () => snapshots[snapshots.length - 1],
  }
}

// Seed the pin's projected screen position so `selectPin(id)` captures a
// non-null `selectedPinScreenY`. Without this, the field stays null on the
// whole path and the "clears selectedPinScreenY" assertions would be
// trivially satisfied — not actually testing the wrapper's clear.
function seedPinScreenPos(data: DataCtx, id: string, y = 200) {
  data.pinPositionRef.current[id] = { x: 100, y, visible: true, behind: false }
}

describe('GlobeProvider setter invariants', () => {
  beforeAll(() => {
    // jsdom doesn't implement matchMedia — provider's useIsDark calls it
    // via useSyncExternalStore on mount.
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia
    }
  })

  beforeEach(() => {
    currentSearchParams = new URLSearchParams()
    currentPathname = '/globe'
    routerMock.push.mockReset()
    routerMock.replace.mockReset()
  })

  // --- Invariant 1: selectPin(null) ---
  it('selectPin(null) clears selectedPin, selectedPinScreenY, pinSubregionHighlight', () => {
    const snapshots: Snapshot[] = []
    const { latest } = renderWithProvider(snapshots)

    seedPinScreenPos(latest().data, 'loc-1', 200)
    act(() => {
      latest().pin.selectPin('loc-1')
      latest().pin.setPinSubregionHighlight('loc-1')
    })
    expect(latest().pin.selectedPin).toBe('loc-1')
    expect(latest().pin.selectedPinScreenY).toBe(200)
    expect(latest().pin.pinSubregionHighlight).toBe('loc-1')

    act(() => latest().pin.selectPin(null))
    expect(latest().pin.selectedPin).toBeNull()
    expect(latest().pin.selectedPinScreenY).toBeNull()
    expect(latest().pin.pinSubregionHighlight).toBeNull()
  })

  // --- Invariant 2: setLockedTrip(non-null) ---
  it('setLockedTrip(tripId) clears selectedPin, selectedPinScreenY, pinSubregionHighlight', () => {
    const snapshots: Snapshot[] = []
    const { latest } = renderWithProvider(snapshots)

    seedPinScreenPos(latest().data, 'loc-1', 200)
    act(() => {
      latest().pin.selectPin('loc-1')
      latest().pin.setPinSubregionHighlight('loc-1')
    })
    expect(latest().pin.selectedPin).toBe('loc-1')
    expect(latest().pin.selectedPinScreenY).toBe(200)
    expect(latest().pin.pinSubregionHighlight).toBe('loc-1')

    act(() => latest().trip.setLockedTrip('trip-1'))
    expect(latest().trip.lockedTrip).toBe('trip-1')
    expect(latest().pin.selectedPin).toBeNull()
    expect(latest().pin.selectedPinScreenY).toBeNull()
    expect(latest().pin.pinSubregionHighlight).toBeNull()
  })

  // --- Invariant 3: setLockedTrip(null) ---
  it('setLockedTrip(null) clears pinToScrollTo', () => {
    const snapshots: Snapshot[] = []
    const { latest } = renderWithProvider(snapshots)

    act(() => latest().trip.setLockedTrip('trip-1'))
    act(() => latest().pin.requestPinScroll('loc-1'))
    expect(latest().pin.pinToScrollTo?.id).toBe('loc-1')

    act(() => latest().trip.setLockedTrip(null))
    expect(latest().trip.lockedTrip).toBeNull()
    expect(latest().pin.pinToScrollTo).toBeNull()
  })

  // --- Invariant 4: URL-sync unlock flows through setLockedTrip(null) ---
  // The deep-link resolution effect calls `setLockedTrip(null)` (the wrapper),
  // not the raw `setLockedTripState`, so `pinToScrollTo` gets the same cleanup
  // regardless of whether the unlock came from a direct caller or a URL edit.
  it('URL-sync unlock (?trip= removed on /globe) clears pinToScrollTo', () => {
    currentPathname = '/globe'
    currentSearchParams = new URLSearchParams('trip=test-trip')

    const snapshots: Snapshot[] = []
    const { latest, rerender } = renderWithProvider(snapshots)

    // Deep-link effect resolves ?trip=test-trip → lockedTrip='trip-1'.
    expect(latest().trip.lockedTrip).toBe('trip-1')

    // Seed a stranded scroll signal — the sort of thing a pin click inside a
    // trip panel would produce. If invariant #4 regresses (e.g., URL-sync
    // stops routing through the wrapper), this will leak across unlock.
    act(() => latest().pin.requestPinScroll('loc-1'))
    expect(latest().pin.pinToScrollTo?.id).toBe('loc-1')

    // Navigate to /globe without ?trip= — same shape as the back button from
    // /globe?trip=test-trip → /globe.
    act(() => {
      currentSearchParams = new URLSearchParams()
      rerender(
        <GlobeProvider trips={[TRIP]} pins={[PIN]} tripsWithVisits={[]} fetchError={false}>
          <Probe onSnapshot={(snap) => snapshots.push(snap)} />
        </GlobeProvider>,
      )
    })

    expect(latest().trip.lockedTrip).toBeNull()
    expect(latest().pin.pinToScrollTo).toBeNull()
  })
})
