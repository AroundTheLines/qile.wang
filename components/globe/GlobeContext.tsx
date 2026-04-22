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

export interface GlobeContextValue {
  // --- Server-fed data ---
  trips: TripSummary[]
  pins: PinWithVisits[]
  /** Trips with embedded visits+items. Drives TripPanel (C4). */
  tripsWithVisits: TripWithVisits[]
  fetchError: boolean

  // --- Pin selection ---
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

  // --- Trip selection (new in 5C) ---
  lockedTrip: string | null
  setLockedTrip: (id: string | null) => void
  hoveredTrip: string | null
  setHoveredTrip: Dispatch<SetStateAction<string | null>>
  /** Mobile-only preview state (E3). */
  previewTrip: string | null
  setPreviewTrip: (id: string | null) => void

  // --- Playback coordination (B6/B7) ---
  /** Trip ids currently lit by the playback sweep. Set by B6. */
  playbackHighlightedTripIds: string[]
  setPlaybackHighlightedTripIds: (ids: string[]) => void
  /** Active after 5s idle; gates the playback RAF loop. Computed. */
  playbackActive: boolean
  addPauseReason: (reason: string) => void
  removePauseReason: (reason: string) => void
  /** Computed: any pause reason set, OR a locked trip, OR an open article. */
  isPaused: boolean

  // --- Layout state ---
  layoutState: 'default' | 'panel-open' | 'article-open'
  slideComplete: boolean
  selectedPinScreenY: number | null
  pinPositionRef: MutableRefObject<Record<string, ScreenPosition>>
  /** Globe silhouette in screen-space (canvas-local pixels). Null until
      the first frame is projected. Connectors read this to occlude the
      back-of-globe segment of their line. */
  globeScreenRef: MutableRefObject<GlobeScreenCircle | null>
  /** Callbacks invoked by GlobePositionBridge at the end of every R3F
      frame, after pin positions and the globe silhouette are written. */
  frameSubscribersRef: MutableRefObject<Set<() => void>>

  // --- URL state ---
  activeArticleSlug: string | null // /globe/<slug> item article
  activeTripSlug: string | null // /trip/<slug> trip article
  closeArticle: () => void

  // --- Viewport + theme ---
  tier: ViewportTier
  isDesktop: boolean
  isTablet: boolean
  isMobile: boolean
  showHover: boolean
  showConnectors: boolean
  isDark: boolean

  // --- Derived ---
  /** Which panel to render. Null = nothing. */
  panelVariant: 'pin' | 'trip' | null
}

export const GlobeContext = createContext<GlobeContextValue | null>(null)

export function useGlobe(): GlobeContextValue {
  const ctx = useContext(GlobeContext)
  if (!ctx) {
    throw new Error('useGlobe must be used inside <GlobeProvider>')
  }
  return ctx
}
