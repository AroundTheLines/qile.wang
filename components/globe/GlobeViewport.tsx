'use client'

import dynamic from 'next/dynamic'
import { useRef, useCallback, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGlobe } from './GlobeContext'
import { clampPanelTop } from '@/lib/globe'
import GlobeFallbackSVG from './GlobeFallbackSVG'
import GlobeDetailPanel from './GlobeDetailPanel'
import GlobeTooltip from './GlobeTooltip'
import GlobeHoverConnector from './GlobeHoverConnector'
import GlobeClickConnector from './GlobeClickConnector'
import GlobeArticleConnector from './GlobeArticleConnector'

const GlobeCanvas = dynamic(() => import('./GlobeCanvas'), {
  ssr: false,
  loading: () => <GlobeFallbackSVG />,
})

// Fraction of the viewport width occupied by the globe sliver in article-open.
const ARTICLE_GLOBE_WIDTH_FRAC = 0.3

export default function GlobeViewport({ children }: { children?: React.ReactNode }) {
  const {
    selectedPin,
    selectPin,
    selectedPinScreenY,
    tier,
    isMobile,
    isDesktop,
    pins,
    layoutState,
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

  const panelTop = clampPanelTop(selectedPinScreenY, viewportH || 800)
  const selectedPinData = pins.find((p) => p.group === selectedPin)

  if (isMobile) {
    // Mobile navigates away to /[slug] on item tap, so article-open doesn't
    // render the globe here. If we're somehow on /globe/[slug] at mobile size
    // (e.g. resize from desktop), fall through to render the article plainly.
    if (layoutState === 'article-open') {
      return (
        <div className="fixed inset-0 w-screen h-screen overflow-y-auto bg-white dark:bg-black pt-20">
          {children}
        </div>
      )
    }
    return (
      <div className="fixed inset-0 w-screen h-screen" style={{ touchAction: 'none' }}>
        <motion.div
          className="relative w-full h-full"
          animate={{
            scale: selectedPin ? 0.85 : 1,
            x: selectedPin ? '-10%' : '0%',
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 30 }}
        >
          <GlobeCanvas dragDistanceRef={dragDistance} />
        </motion.div>

        {/* Scrim */}
        <AnimatePresence>
          {selectedPin && (
            <motion.div
              className="fixed inset-0 z-40"
              style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => selectPin(null)}
            />
          )}
        </AnimatePresence>

        {/* Mobile panel overlay */}
        <AnimatePresence>
          {selectedPin && selectedPinData && (
            <motion.div
              className="fixed top-0 right-0 z-50 h-full"
              style={{ width: '85vw', maxWidth: 380 }}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.x > 100) selectPin(null)
              }}
            >
              <GlobeDetailPanel pin={selectedPinData} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // Tablet + desktop: side-by-side layout.
  const SLIDE_TRANSITION = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }

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
  const globeX = isArticle ? 0 : selectedPin ? -panelWidthPx / 2 : 0

  return (
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-white dark:bg-black"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
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
        style={{
          pointerEvents: isArticle ? 'none' : undefined,
        }}
      >
        <GlobeCanvas dragDistanceRef={dragDistance} />
        <GlobeTooltip />
        <GlobeHoverConnector />
        <GlobeClickConnector />
      </motion.div>

      {/* Article area (desktop/tablet) */}
      <AnimatePresence>
        {isArticle && (
          <motion.div
            key="globe-article-area"
            className="absolute top-0 right-0 bottom-0 overflow-y-auto pt-20"
            style={{ width: `${(1 - ARTICLE_GLOBE_WIDTH_FRAC) * 100}vw` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Article connector: pin → article title */}
      {isArticle && <GlobeArticleConnector />}

      <AnimatePresence>
        {selectedPin && selectedPinData && layoutState === 'panel-open' && (
          <motion.div
            className="absolute top-0 bottom-0"
            style={{ width: panelWidthPx, right: 16 }}
            initial={{ x: '110%' }}
            animate={{ x: '0%' }}
            exit={{ x: '110%' }}
            transition={SLIDE_TRANSITION}
          >
            <div
              className="absolute left-0 w-full"
              style={{ top: panelTop, maxHeight: 'calc(100vh - 48px)' }}
            >
              <GlobeDetailPanel pin={selectedPinData} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
