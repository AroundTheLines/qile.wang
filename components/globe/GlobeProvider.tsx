'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { GlobeContext, type ScreenPosition, type ViewportTier } from './GlobeContext'
import type { GlobePin } from '@/lib/globe'

function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>('desktop')
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth
      if (w >= 1024) setTier('desktop')
      else if (w >= 768) setTier('tablet')
      else setTier('mobile')
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])
  return tier
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDark
}

// Total delay before the connector re-draws. Covers both the initial
// panel-slide (300ms) and the pin-switch rotate-in-place (up to ~300ms)
// with a small buffer.
const PANEL_SETTLE_MS = 450

export default function GlobeProvider({
  pins,
  children,
}: {
  pins: GlobePin[]
  children: React.ReactNode
}) {
  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [hoveredPin, setHoveredPin] = useState<string | null>(null)
  const [slideComplete, setSlideComplete] = useState(false)
  const [selectedPinScreenY, setSelectedPinScreenY] = useState<number | null>(null)
  const pinPositionRef = useRef<Record<string, ScreenPosition>>({})
  const tier = useViewportTier()
  const isDark = useIsDark()

  const selectPin = useCallback((group: string | null) => {
    if (group === null) {
      setSelectedPin(null)
      setSelectedPinScreenY(null)
      return
    }
    // Capture screen Y at moment of click
    const pos = pinPositionRef.current[group]
    if (pos) setSelectedPinScreenY(pos.y)
    setSelectedPin(group)
  }, [])

  // Drive slideComplete purely off selectedPin changes — that way
  // pin-switching (same panel, different pin) also triggers the
  // retract → settle → extend sequence, and we don't depend on
  // motion.div.onAnimationComplete (which doesn't fire when width
  // is unchanged).
  useEffect(() => {
    if (!selectedPin) {
      setSlideComplete(false)
      return
    }
    setSlideComplete(false)
    const t = setTimeout(() => setSlideComplete(true), PANEL_SETTLE_MS)
    return () => clearTimeout(t)
  }, [selectedPin])

  const layoutState = selectedPin ? 'panel-open' : 'default'

  const isDesktop = tier === 'desktop'
  const isTablet = tier === 'tablet'
  const isMobile = tier === 'mobile'

  return (
    <GlobeContext.Provider
      value={{
        pins,
        selectedPin,
        selectPin,
        hoveredPin,
        setHoveredPin,
        layoutState,
        slideComplete,
        selectedPinScreenY,
        pinPositionRef,
        tier,
        isDesktop,
        isTablet,
        isMobile,
        showHover: !isMobile,
        showConnectors: isDesktop,
        isDark,
      }}
    >
      {children}
    </GlobeContext.Provider>
  )
}
