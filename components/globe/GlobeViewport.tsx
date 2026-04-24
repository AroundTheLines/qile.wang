'use client'

import dynamic from 'next/dynamic'
import { useRef, useCallback, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGlobe } from './GlobeContext'
import { clampPanelTop, TRIP_PANEL_TOP_PX } from '@/lib/globe'
import GlobeFallbackSVG from './GlobeFallbackSVG'
import GlobeDetailPanel from './GlobeDetailPanel'
import GlobePinTriggers from './GlobePinTriggers'
import GlobeTooltip from './GlobeTooltip'
import GlobeHoverConnector from './GlobeHoverConnector'
import GlobeClickConnector from './GlobeClickConnector'
import MobileContentRegion from './MobileContentRegion'
import MobileNavChrome from './MobileNavChrome'
import Timeline from './Timeline'

const GlobeCanvas = dynamic(() => import('./GlobeCanvas'), {
  ssr: false,
  loading: () => <GlobeFallbackSVG />,
})

// Fraction of the viewport width occupied by the globe sliver in article-open.
const ARTICLE_GLOBE_WIDTH_FRAC = 0.3

export default function GlobeViewport({ children }: { children?: React.ReactNode }) {
  const {
    selectedPinScreenY,
    tier,
    isMobile,
    isDesktop,
    layoutState,
    panelVariant,
    closeArticle,
  } = useGlobe()

  // Drag-vs-click discriminator — accumulate total travel between
  // pointerdown and pointerup so any wiggle beyond 5px cancels the close.
  const lastPointerPos = useRef<{ x: number; y: number } | null>(null)
  const dragDistance = useRef(0)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    lastPointerPos.current = { x: e.clientX, y: e.clientY }
    dragDistance.current = 0
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!lastPointerPos.current) return
    const dx = e.clientX - lastPointerPos.current.x
    const dy = e.clientY - lastPointerPos.current.y
    dragDistance.current += Math.hypot(dx, dy)
    lastPointerPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const read = () => setViewportSize({ w: window.innerWidth, h: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])
  const viewportW = viewportSize.w
  const viewportH = viewportSize.h

  // Trip panel is always pinned just below the timeline (§7.2) so it reads
  // visually distinct from pin panels, which anchor to their pin's Y and
  // draw a connector from pin → panel header. Fixed anchor keeps trip panels
  // stable regardless of what was selected before.
  const panelTop =
    panelVariant === 'trip'
      ? TRIP_PANEL_TOP_PX
      : clampPanelTop(selectedPinScreenY, viewportH || 800)

  if (isMobile) {
    return (
      <>
        <GlobePinTriggers />
        <MobileGlobeLayout dragDistanceRef={dragDistance} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
          {children}
        </MobileGlobeLayout>
      </>
    )
  }

  // Tablet + desktop: side-by-side layout.
  // Easing matches GlobeScene's article-zoom easing (cubic ease-out, 1-(1-t)^3)
  // so the wrapper width/translate animation and the camera animation stay
  // in lockstep — without this the pin appears to first slide to canvas
  // center, then snap to its panel-open spot when the wrapper finishes.
  const SLIDE_TRANSITION = { duration: 0.4, ease: [0.33, 1, 0.68, 1] as const }

  const panelWidthPx = viewportW
    ? isDesktop
      ? Math.min(Math.max(viewportW * 0.4, 320), 420)
      : viewportW * 0.45
    : 0

  const articleGlobeWidthPx = viewportW * ARTICLE_GLOBE_WIDTH_FRAC

  // Width + translate targets per layout state.
  // - default:     full width, no translate, no panel
  // - panel-open:  full width, translate left by panel/2, panel visible on right
  // - article-open: shrunk to articleGlobeWidthPx, pinned left, article on right
  const isArticle = layoutState === 'article-open'
  const globeWidth = isArticle ? articleGlobeWidthPx : viewportW
  // Shift the globe to make room for the panel whenever any panel variant
  // is open (pin or trip — C4). Keyed on panelVariant rather than selectedPin
  // so a trip-only lock also opens the panel slot.
  const globeX = isArticle ? 0 : panelVariant ? -panelWidthPx / 2 : 0

  return (
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-white dark:bg-black"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <GlobePinTriggers />
      <motion.div
        key={tier}
        className={
          viewportW === 0
            ? 'absolute inset-0'
            : 'absolute top-0 left-0 bottom-0'
        }
        initial={false}
        animate={viewportW === 0 ? {} : { width: globeWidth, x: globeX }}
        transition={SLIDE_TRANSITION}
      >
        <GlobeCanvas dragDistanceRef={dragDistance} />
        <GlobeTooltip />
        <GlobeHoverConnector />
        <GlobeClickConnector />
        {/* When the article is open, the whole globe sliver acts as a back
            button: clicking anywhere on it collapses back to panel-open with
            the active pin still selected. The overlay sits above the canvas
            so neither OrbitControls nor pin onClick handlers receive the
            event. */}
        {isArticle && (
          <button
            type="button"
            onClick={closeArticle}
            aria-label="Close article and return to pin"
            className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          />
        )}
      </motion.div>

      {/* Article area (desktop/tablet) */}
      <AnimatePresence>
        {isArticle && (
          <motion.div
            key="globe-article-area"
            className="absolute top-0 right-0 bottom-0 overflow-y-auto pt-20 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-black"
            style={{ width: `${(1 - ARTICLE_GLOBE_WIDTH_FRAC) * 100}vw` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {/* Close button — sits inside the sidecar as a regular design
                element. Stays put as the article body scrolls underneath. */}
            <button
              onClick={closeArticle}
              className="sticky top-0 float-right mr-6 -mt-12 z-10 w-10 h-10 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white transition-colors text-2xl leading-none cursor-pointer"
              aria-label="Close article"
            >
              &times;
            </button>
            {children}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panelVariant && layoutState === 'panel-open' && (
          <motion.div
            className="absolute top-0 bottom-0"
            style={{ width: panelWidthPx, right: 16 }}
            initial={{ x: '110%' }}
            animate={{ x: '0%' }}
            exit={{ x: '110%' }}
            transition={SLIDE_TRANSITION}
          >
            {/* Animate `top` so variant switches (pin → trip and back)
                tween the panel's Y alongside the inner content cross-fade,
                rather than snapping instantly. Duration matches the inner
                fade (200ms) so the two motions land together. */}
            <motion.div
              className="absolute left-0 w-full"
              style={{ maxHeight: 'calc(100vh - 48px)' }}
              initial={false}
              animate={{ top: panelTop }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <GlobeDetailPanel />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface MobileGlobeLayoutProps {
  children?: React.ReactNode
  dragDistanceRef: React.MutableRefObject<number>
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
}

function MobileGlobeLayout({
  children,
  dragDistanceRef,
  onPointerDown,
  onPointerMove,
}: MobileGlobeLayoutProps) {
  const { layoutState } = useGlobe()

  const isArticle = layoutState === 'article-open'

  return (
    <div className="flex flex-col min-h-screen w-full bg-white dark:bg-black">
      {/* Globe region — not sticky, scrolls with the page. Navbar (fixed, 72px)
          overlaps the top of this region; we accept that so the globe reaches
          full 45vh height without getting cropped. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="relative w-full flex-shrink-0"
        style={{ height: '70vh', touchAction: 'none' }}
      >
        <GlobeCanvas dragDistanceRef={dragDistanceRef} />
        <GlobeTooltip />
      </div>

      {/* Timeline — scrolls with the page on mobile (no sticky pin). */}
      <div className="z-30 w-full bg-white dark:bg-black border-b border-black/5 dark:border-white/5 py-2">
        <Timeline />
      </div>

      {/* Content region — part of the page's vertical flow, not a nested
          scroll container. Page scroll handles overflow.
          `min-h-screen` keeps the document tall enough that switching
          between the (long) trip list and a (shorter) pin/trip panel
          doesn't snap the page's scroll position when MobileTripList
          triggers a smooth-scroll back to the globe. Without it, the
          document shortens mid-animation and scrollY clamps to the new
          max, cutting the animation short. */}
      <div className="flex-1 w-full min-h-screen">
        {isArticle ? (
          <div className="w-full border-t border-gray-100 dark:border-gray-900">
            <MobileNavChrome mode="close" />
            {children}
          </div>
        ) : (
          <MobileContentRegion />
        )}
      </div>
    </div>
  )
}
