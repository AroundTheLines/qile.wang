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
  /** Inside the camera frustum (z < 1 in NDC). */
  visible: boolean
  /** Pin sits on the far hemisphere of the globe — the dot is occluded
      and any line attached to it should be clipped at the silhouette. */
  behind: boolean
}

export type ViewportTier = 'desktop' | 'tablet' | 'mobile'

// ---------- 1. Data (server props + mutable refs; never change identity) ----------
export interface GlobeDataContextValue {
  trips: TripSummary[]
  pins: PinWithVisits[]
  /** Trips with embedded visits+items. Drives TripPanel (C4). */
  tripsWithVisits: TripWithVisits[]
  fetchError: boolean
  pinPositionRef: MutableRefObject<Record<string, ScreenPosition>>
  /** Globe silhouette in screen-space (canvas-local pixels). Null until
      the first frame is projected. Connectors read this to occlude the
      back-of-globe segment of their line. */
  globeScreenRef: MutableRefObject<GlobeScreenCircle | null>
  /** Callbacks invoked by GlobePositionBridge at the end of every R3F
      frame, after pin positions and the globe silhouette are written. */
  frameSubscribersRef: MutableRefObject<Set<() => void>>
}
export const GlobeDataContext = createContext<GlobeDataContextValue | null>(null)
export function useGlobeData(): GlobeDataContextValue {
  const ctx = useContext(GlobeDataContext)
  if (!ctx) {
    throw new Error('useGlobeData must be used inside <GlobeProvider>')
  }
  return ctx
}

// ---------- 2. Pin (selection, hover, scroll signal) ----------
export interface GlobePinContextValue {
  /** Pin identity = locationDoc._id. Was globe_group string pre-5C. */
  selectedPin: string | null
  selectPin: (id: string | null) => void
  hoveredPin: string | null
  /** React setter — supports functional updates so callers can compare
      against the current value without racing context reads. */
  setHoveredPin: Dispatch<SetStateAction<string | null>>
  /** Pin id whose visit sub-regions should light up on the timeline. Set by C2. */
  pinSubregionHighlight: string | null
  setPinSubregionHighlight: Dispatch<SetStateAction<string | null>>
  /** Pin whose visit section should be scrolled to in the open trip panel.
   *  Carries a nonce so repeat clicks on the same pin are distinguishable —
   *  identical-id setState would bail out and the pulse wouldn't replay.
   *  Consumed by TripPanel; cleared by TripPanel after scroll completes,
   *  or by the provider when lockedTrip clears. (C7) */
  pinToScrollTo: { id: string; nonce: number } | null
  /** Request a pin-scroll. Always bumps the nonce so the consumer's effect
   *  re-fires even if the same pin is clicked twice in a row. */
  requestPinScroll: (id: string) => void
  clearPinScroll: () => void
  selectedPinScreenY: number | null
}
export const GlobePinContext = createContext<GlobePinContextValue | null>(null)
export function useGlobePin(): GlobePinContextValue {
  const ctx = useContext(GlobePinContext)
  if (!ctx) {
    throw new Error('useGlobePin must be used inside <GlobeProvider>')
  }
  return ctx
}

// ---------- 3. Trip (lock, hover, mobile preview) ----------
export interface GlobeTripContextValue {
  lockedTrip: string | null
  setLockedTrip: (id: string | null) => void
  hoveredTrip: string | null
  setHoveredTrip: Dispatch<SetStateAction<string | null>>
  /** Mobile-only preview state (E3). */
  previewTrip: string | null
  setPreviewTrip: (id: string | null) => void
}
export const GlobeTripContext = createContext<GlobeTripContextValue | null>(null)
export function useGlobeTrip(): GlobeTripContextValue {
  const ctx = useContext(GlobeTripContext)
  if (!ctx) {
    throw new Error('useGlobeTrip must be used inside <GlobeProvider>')
  }
  return ctx
}

// ---------- 4. Playback (sweep highlight + pause reasons) ----------
export interface GlobePlaybackContextValue {
  /** Trip ids currently lit by the playback sweep. Set by B6. */
  playbackHighlightedTripIds: string[]
  setPlaybackHighlightedTripIds: (ids: string[]) => void
  /** Active after 5s idle; gates the playback RAF loop. Computed. */
  playbackActive: boolean
  addPauseReason: (reason: string) => void
  removePauseReason: (reason: string) => void
  /** Computed: any pause reason set, OR a locked trip, OR an open article. */
  isPaused: boolean
}
export const GlobePlaybackContext = createContext<GlobePlaybackContextValue | null>(null)
export function useGlobePlayback(): GlobePlaybackContextValue {
  const ctx = useContext(GlobePlaybackContext)
  if (!ctx) {
    throw new Error('useGlobePlayback must be used inside <GlobeProvider>')
  }
  return ctx
}

// ---------- 5. UI (viewport tier, theme, layout derivation) ----------
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
  /** Which panel to render. Null = nothing. */
  panelVariant: 'pin' | 'trip' | null
}
export const GlobeUIContext = createContext<GlobeUIContextValue | null>(null)
export function useGlobeUI(): GlobeUIContextValue {
  const ctx = useContext(GlobeUIContext)
  if (!ctx) {
    throw new Error('useGlobeUI must be used inside <GlobeProvider>')
  }
  return ctx
}

// ---------- 6. Route (URL-derived state + close action) ----------
export interface GlobeRouteContextValue {
  activeArticleSlug: string | null // /globe/<slug> item article
  activeTripSlug: string | null // /trip/<slug> trip article
  closeArticle: () => void
}
export const GlobeRouteContext = createContext<GlobeRouteContextValue | null>(null)
export function useGlobeRoute(): GlobeRouteContextValue {
  const ctx = useContext(GlobeRouteContext)
  if (!ctx) {
    throw new Error('useGlobeRoute must be used inside <GlobeProvider>')
  }
  return ctx
}
