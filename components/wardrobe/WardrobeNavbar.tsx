'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMotionValueEvent } from 'framer-motion'
import { useWardrobeContext, NAVBAR_H } from './WardrobeContext'

// Wardrobe-only navbar. Mirrors the visual layout of the shared
// components/Navbar.tsx (3-column grid, ← Home on the left), but its
// center cell holds an invisible measurement anchor sized exactly to the
// transit element's end-state. The transit element will land on top of
// this anchor and become the persistent navbar icon.
export default function WardrobeNavbar() {
  const { navbarAnchorRef, transitProgress } = useWardrobeContext()

  // Transit progress bucketed to ~10 steps to avoid re-rendering every
  // frame. Drives both the background gradient and the shadow.
  const [progress, setProgress] = useState(0)
  useMotionValueEvent(transitProgress, 'change', (v) => {
    const bucketed = Math.round(v * 10) / 10
    setProgress((prev) => (prev === bucketed ? prev : bucketed))
  })

  // Background: top-down gradient that sweeps white downward as
  // progress increases. At p=0 fully transparent; at p=1 fully white.
  // The opaque stop leads the progress, the transparent stop trails
  // slightly behind so there's always a soft feathered edge.
  const opaqueStop = Math.round(progress * 120)         // leads — overshoots to 120% at p=1
  const fadeStop = Math.round(opaqueStop + 20 * (1 - progress)) // feather width shrinks as it fills
  const bg = progress > 0
    ? `linear-gradient(to bottom, rgba(255,255,255,${Math.min(1, progress * 1.4).toFixed(2)}) ${opaqueStop}%, rgba(255,255,255,0) ${fadeStop}%)`
    : 'transparent'

  // Shadow only appears once the bar is mostly opaque (progress > 0.6).
  const shadowAlpha = Math.max(0, (progress - 0.6) / 0.4) * 0.06

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 grid grid-cols-3 items-center px-6"
      style={{
        height: NAVBAR_H,
        background: bg,
        boxShadow: shadowAlpha > 0
          ? `0 1px 6px rgba(0,0,0,${shadowAlpha.toFixed(3)})`
          : 'none',
      }}
    >
      <Link
        href="/"
        className="text-[10px] tracking-[0.2em] uppercase text-gray-400 hover:text-black transition-colors justify-self-start"
      >
        ← Home
      </Link>

      {/* Invisible target anchor — the transit element will land here.
          - 36×50 matches the icon end-state (sleeve aspect, ~150:210).
          - `visibility: hidden` keeps the element in layout so its
            getBoundingClientRect() is meaningful, while making sure no
            pixels paint here. The transit element is the only thing the
            user ever sees at this position.
          - `pointer-events: none` so taps go to the transit element on
            top of it, never to the anchor itself. */}
      <div
        ref={navbarAnchorRef}
        aria-hidden
        className="justify-self-center invisible pointer-events-none"
        style={{ width: 36, height: 50 }}
      />

      <span aria-hidden />
    </header>
  )
}
