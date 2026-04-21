'use client'

import { createContext, useContext, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { GlobeScreenCircle } from '@/lib/globe'
import type { PinWithVisits, TripSummary } from '@/lib/types'

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
  pins: PinWithVisits[]
  /** TODO(C1): consumed by timeline + provider state once the trip/visit
      state is wired. A3 merely threads it through. */
  trips: TripSummary[]
  /** TODO(C1): surfaced inline in the timeline via §12.7. */
  fetchError: boolean
  selectedPin: string | null
  selectPin: (group: string | null) => void
  hoveredPin: string | null
  /** React setter — supports functional updates so callers can compare
      against the current value without racing context reads (e.g. the
      "only clear if I'm the hovered pin" guard in GlobePins). */
  setHoveredPin: Dispatch<SetStateAction<string | null>>
  layoutState: 'default' | 'panel-open' | 'article-open'
  slideComplete: boolean
  selectedPinScreenY: number | null
  pinPositionRef: MutableRefObject<Record<string, ScreenPosition>>
  /** Globe silhouette in screen-space (canvas-local pixels). Null until
      the first frame is projected. Connectors read this to occlude the
      back-of-globe segment of their line. */
  globeScreenRef: MutableRefObject<GlobeScreenCircle | null>
  /** Callbacks invoked by GlobePositionBridge at the end of every R3F
      frame, after pin positions and the globe silhouette are written.
      Connector components register here instead of running their own
      requestAnimationFrame loops — that way the SVG line is updated in
      the same browser tick the canvas paints, eliminating the one-frame
      lag that lets the line lag behind the pin during rotation. */
  frameSubscribersRef: MutableRefObject<Set<() => void>>
  /** Slug of the article currently open in article-open state, or null */
  activeArticleSlug: string | null
  /** Exit article-open back to panel-open (desktop only) */
  closeArticle: () => void
  /** 'desktop' ≥1024, 'tablet' 768–1023, 'mobile' <768 */
  tier: ViewportTier
  /** Derived conveniences */
  isDesktop: boolean
  isTablet: boolean
  isMobile: boolean
  /** Hover UI is shown on desktop + tablet */
  showHover: boolean
  /** Connector lines are shown on desktop only */
  showConnectors: boolean
  /** System dark-mode preference */
  isDark: boolean
}

export const GlobeContext = createContext<GlobeContextValue | null>(null)

export function useGlobe(): GlobeContextValue {
  const ctx = useContext(GlobeContext)
  if (!ctx) {
    throw new Error('useGlobe must be used inside <GlobeProvider>')
  }
  return ctx
}
