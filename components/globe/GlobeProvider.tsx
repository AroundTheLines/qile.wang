'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { GlobeContext, type ScreenPosition, type ViewportTier } from './GlobeContext'
import type { GlobePin, GlobeScreenCircle } from '@/lib/globe'

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
  const globeScreenRef = useRef<GlobeScreenCircle | null>(null)
  const frameSubscribersRef = useRef<Set<() => void>>(new Set())
  const articleTitleRef = useRef<HTMLHeadingElement | null>(null)
  const tier = useViewportTier()
  const isDark = useIsDark()

  const pathname = usePathname()
  const router = useRouter()
  const activeArticleSlug =
    pathname && pathname.startsWith('/globe/') && pathname !== '/globe'
      ? pathname.slice('/globe/'.length).split('/')[0] || null
      : null

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

  const layoutState: 'default' | 'panel-open' | 'article-open' = activeArticleSlug
    ? 'article-open'
    : selectedPin
      ? 'panel-open'
      : 'default'

  const closeArticle = useCallback(() => {
    router.push('/globe', { scroll: false })
  }, [router])

  // Deep-link / refresh on /globe/[slug]: resolve the article's pin so the
  // selected state is consistent with the open article. We deliberately do
  // *not* depend on `selectedPin` — otherwise clearing selectedPin (e.g. a
  // mobile "close panel" action) while still on /globe/[slug] would cause
  // this effect to immediately re-set it before the URL has a chance to
  // transition back to /globe.
  useEffect(() => {
    if (!activeArticleSlug) return
    const match = pins.find((p) =>
      p.items.some((i) => i.slug.current === activeArticleSlug),
    )
    if (!match) return
    const pos = pinPositionRef.current[match.group]
    if (pos) setSelectedPinScreenY(pos.y)
    setSelectedPin((prev) => (prev === match.group ? prev : match.group))
  }, [activeArticleSlug, pins])

  // If selectedPinScreenY is null (deep-link case), poll the pin's screen
  // position via RAF until it's available, then capture it so the panel and
  // click-connector align with the pin.
  useEffect(() => {
    if (!selectedPin || selectedPinScreenY != null) return
    let raf = 0
    const tick = () => {
      const pos = pinPositionRef.current[selectedPin]
      if (pos) {
        setSelectedPinScreenY(pos.y)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selectedPin, selectedPinScreenY])

  // On transition from article-open back to panel-open, the pin may have
  // moved on screen during zoom-in/out. Re-capture its Y once the zoom-out
  // animation settles so the panel re-aligns with the pin.
  const prevLayoutRef = useRef(layoutState)
  useEffect(() => {
    const prev = prevLayoutRef.current
    prevLayoutRef.current = layoutState
    if (prev !== 'article-open' || layoutState === 'article-open') return
    if (!selectedPin) return
    const t = setTimeout(() => {
      const pos = pinPositionRef.current[selectedPin]
      if (pos) setSelectedPinScreenY(pos.y)
    }, 450)
    return () => clearTimeout(t)
  }, [layoutState, selectedPin])

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
        globeScreenRef,
        frameSubscribersRef,
        activeArticleSlug,
        articleTitleRef,
        closeArticle,
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
