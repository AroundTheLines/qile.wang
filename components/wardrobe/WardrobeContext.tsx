'use client'

import { createContext, useContext, type RefObject } from 'react'
import type { MotionValue } from 'framer-motion'
import type { ContentSummary } from '@/lib/types'

/** Navbar height in px — shared so the navbar and the main content
 *  padding stay in sync. */
export const NAVBAR_H = 72

// Plain shape mirroring the parts of DOMRect we actually use. Easier to
// stash in state than the live DOMRect, which is mutated by the browser.
export interface DOMRectLike {
  x: number
  y: number
  width: number
  height: number
}

export interface WardrobeContextValue {
  // Content
  items: ContentSummary[]
  activeIndex: number
  setActiveIndex: (index: number) => void
  activeItem: ContentSummary | null

  // Source (centered sleeve) measurement — pushed from WardrobeCarousel
  sourceRect: DOMRectLike | null
  reportSourceRect: (rect: DOMRectLike | null) => void

  // Target (invisible navbar anchor) measurement — ref attached by
  // WardrobeNavbar, read & re-measured by WardrobeProvider.
  navbarAnchorRef: RefObject<HTMLDivElement | null>
  targetRect: DOMRectLike | null

  // Spring-wrapped scroll progress — drives WardrobeTransit. 0 = sleeve
  // sits in the carousel; 1 = transit element sits over the navbar anchor.
  transitProgress: MotionValue<number>

  // True while progress > 0 — used to lock the carousel from interaction
  // during transit. Read as a snapshot (not a MotionValue) so that the
  // carousel re-renders when entering/exiting the locked state.
  isTransitActive: boolean

  // Tap-to-return: triggers a smooth scroll back to the shell, which the
  // spring then turns into a reverse transit animation.
  scrollToShell: () => void

  // Mobile navbar auto-hide. 0 = fully visible, 1 = hidden (peek only).
  // Driven by scroll direction when the transit is parked on mobile.
  navbarHideOffset: MotionValue<number>
}

export const WardrobeContext = createContext<WardrobeContextValue | null>(null)

export function useWardrobeContext(): WardrobeContextValue {
  const ctx = useContext(WardrobeContext)
  if (!ctx) {
    throw new Error('useWardrobeContext must be used inside <WardrobeProvider>')
  }
  return ctx
}
