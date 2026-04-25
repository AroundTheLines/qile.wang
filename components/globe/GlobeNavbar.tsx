'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useGlobePin, useGlobeUI } from './GlobeContext'

// Mirror the panel widths from GlobeViewport so the navbar's right edge
// retreats in lockstep when the side panel is open. Uses an identical
// duration + easing as the viewport's slide so they move together.
const SLIDE_TRANSITION = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }

export default function GlobeNavbar() {
  const { selectedPin } = useGlobePin()
  const { isDesktop, isTablet } = useGlobeUI()
  const [viewportW, setViewportW] = useState(0)

  useEffect(() => {
    const read = () => setViewportW(window.innerWidth)
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  // Computed as a *number* so framer-motion actually interpolates it.
  const panelWidthPx = viewportW
    ? isDesktop
      ? Math.min(Math.max(viewportW * 0.4, 320), 420)
      : isTablet
        ? viewportW * 0.45
        : 0
    : 0
  const rightPx = selectedPin && (isDesktop || isTablet) ? panelWidthPx : 0

  return (
    <motion.header
      className="fixed top-0 left-0 z-50 h-[72px] flex items-center justify-between px-6 pointer-events-none"
      initial={false}
      animate={{ right: rightPx }}
      transition={SLIDE_TRANSITION}
    >
      <Link
        href="/"
        className="text-xs tracking-widest uppercase text-black dark:text-white hover:opacity-50 transition-opacity pointer-events-auto"
      >
        Home
      </Link>
      <span className="text-xs tracking-widest uppercase text-gray-400 dark:text-gray-500">
        Globe
      </span>
      <div className="w-10" />
    </motion.header>
  )
}
