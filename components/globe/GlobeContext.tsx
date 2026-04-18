'use client'

import { createContext, useContext, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
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
  /** React setter — supports functional updates so callers can compare
      against the current value without racing context reads (e.g. the
      "only clear if I'm the hovered pin" guard in GlobePins). */
  setHoveredPin: Dispatch<SetStateAction<string | null>>
  layoutState: 'default' | 'panel-open' | 'article-open'
  slideComplete: boolean
  selectedPinScreenY: number | null
  pinPositionRef: MutableRefObject<Record<string, ScreenPosition>>
  /** Slug of the article currently open in article-open state, or null */
  activeArticleSlug: string | null
  /** Ref to the article's <h1>, set by ArticleContent when globe={true} */
  articleTitleRef: MutableRefObject<HTMLHeadingElement | null>
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
