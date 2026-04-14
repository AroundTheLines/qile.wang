'use client'

import { createContext, useContext, type MutableRefObject } from 'react'
import type { GlobePin } from '@/lib/globe'

export interface ScreenPosition {
  x: number
  y: number
  visible: boolean
}

export type ViewportTier = 'desktop' | 'tablet' | 'mobile'

export interface GlobeContextValue {
  pins: GlobePin[]
  selectedPin: string | null
  selectPin: (group: string | null) => void
  hoveredPin: string | null
  setHoveredPin: (group: string | null) => void
  layoutState: 'default' | 'panel-open'
  slideComplete: boolean
  selectedPinScreenY: number | null
  pinPositionRef: MutableRefObject<Record<string, ScreenPosition>>
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
}

export const GlobeContext = createContext<GlobeContextValue | null>(null)

export function useGlobe(): GlobeContextValue {
  const ctx = useContext(GlobeContext)
  if (!ctx) {
    throw new Error('useGlobe must be used inside <GlobeProvider>')
  }
  return ctx
}
