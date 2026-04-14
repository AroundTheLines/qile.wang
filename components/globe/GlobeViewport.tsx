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

const GlobeCanvas = dynamic(() => import('./GlobeCanvas'), {
  ssr: false,
  loading: () => <GlobeFallbackSVG />,
})

export default function GlobeViewport() {
  const {
    selectedPin,
    selectPin,
    selectedPinScreenY,
    tier,
    isMobile,
    isDesktop,
    pins,
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

  // Viewport size — drives panel top clamping AND the numeric panel width
  // we hand to framer-motion. (Interpolating a CSS `clamp(...)` string does
  // not actually tween — it snaps — which is why the globe wasn't shrinking
  // smoothly.)
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

  // Tablet + desktop: side-by-side layout. Globe shrinks from the left,
  // panel slides in from the right. Both use an IDENTICAL tween so they
  // finish on the same frame — previously independent springs drifted and
  // produced the jitter the user saw.
  const SLIDE_TRANSITION = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }

  // Panel width as a *number* so framer-motion actually interpolates it
  // (animating a `clamp(...)` string snaps instead of tweening).
  const panelWidthPx = viewportW
    ? isDesktop
      ? Math.min(Math.max(viewportW * 0.4, 320), 420)
      : viewportW * 0.45
    : 0
  const globeRightInsetPx = selectedPin ? panelWidthPx : 0

  return (
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <motion.div
        key={tier}
        className="absolute top-0 left-0 bottom-0"
        initial={false}
        animate={{ right: globeRightInsetPx }}
        transition={SLIDE_TRANSITION}
      >
        <GlobeCanvas dragDistanceRef={dragDistance} />
        <GlobeTooltip />
        <GlobeHoverConnector />
        <GlobeClickConnector />
      </motion.div>

      <AnimatePresence>
        {selectedPin && selectedPinData && (
          <motion.div
            className="absolute top-0 right-0 bottom-0"
            style={{ width: panelWidthPx }}
            initial={{ x: '100%' }}
            animate={{ x: '0%' }}
            exit={{ x: '100%' }}
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
