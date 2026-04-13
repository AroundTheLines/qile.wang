'use client'

import { useState } from 'react'
import { motion, useMotionValueEvent, useTransform } from 'framer-motion'
import WardrobeSleeveVisual from './WardrobeSleeveVisual'
import { useWardrobeContext } from './WardrobeContext'

/**
 * The transit element. Lives outside the carousel's 3D context (rendered
 * as a direct child of WardrobeProvider, sibling to <main>) so that
 * `position: fixed` resolves against the viewport rather than the
 * `perspective` ancestor.
 *
 * It IS the persistent navbar icon. At progress = 1 the element sits
 * exactly on top of the invisible navbar anchor at the icon end-state
 * size. At progress = 0 it sits exactly over the centered sleeve in the
 * carousel. There is no second mounted icon and no fade swap — the
 * spring-driven `transitProgress` interpolates the transform between the
 * two extremes, and that's the entire transition.
 */
export default function WardrobeTransit() {
  const {
    sourceRect,
    targetRect,
    activeItem,
    transitProgress,
    isTransitActive,
    scrollToShell,
  } = useWardrobeContext()

  // Mirror "progress is near 1" into React state so we can flip pointer
  // events. We only want the icon to be tappable once it's parked at the
  // navbar — at progress = 0 it's overlaying the carousel sleeve and
  // would otherwise eat drag/click events.
  const [isParked, setIsParked] = useState(false)
  useMotionValueEvent(transitProgress, 'change', (v) => {
    const next = v > 0.95
    setIsParked((prev) => (prev === next ? prev : next))
  })

  // The transform string is the entire animation. Width/height/top/left
  // are fixed at the SOURCE state (carousel sleeve position + size) so
  // that at progress = 0 the transit is pixel-identical to the carousel
  // sleeve — same border thickness, same padding, same proportions.
  // transform: translate(...) scale(...) moves and shrinks the element
  // towards the navbar anchor at progress = 1.
  //
  // sourceRect is in document coords (set in WardrobeCarousel). targetRect
  // is from a fixed-positioned element, so its viewport coords equal its
  // document coords at scroll = 0.
  //
  // Critical: the element is position:fixed (viewport coords) but the
  // carousel sleeve scrolls with the page. At p=0 the transit must track
  // the page so it stays aligned with the sleeve; at p=1 it must be
  // fixed to the navbar. We blend between the two by incorporating
  // window.scrollY — at p=0 we fully compensate for scroll, at p=1
  // we ignore it (the element is parked at the navbar).
  const transform = useTransform(transitProgress, (p) => {
    if (!sourceRect || !targetRect) return 'none'
    const sx = targetRect.width / sourceRect.width
    const sy = targetRect.height / sourceRect.height
    const tx = targetRect.x - sourceRect.x
    const ty = targetRect.y - sourceRect.y
    // At p=0: compensate for scroll so transit tracks the page.
    // At p=1: ignore scroll, land on the navbar anchor.
    const scrollY = window.scrollY
    const x = tx * p
    const y = -scrollY * (1 - p) + ty * p
    const scaleX = 1 + (sx - 1) * p
    const scaleY = 1 + (sy - 1) * p
    return `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`
  })

  if (!sourceRect || !targetRect || !activeItem) return null

  return (
    <motion.div
      role="button"
      aria-label={`Return to wardrobe (${activeItem.title})`}
      tabIndex={isParked ? 0 : -1}
      onClick={() => {
        if (isParked) scrollToShell()
      }}
      onKeyDown={(e) => {
        if (isParked && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          scrollToShell()
        }
      }}
      style={{
        position: 'fixed',
        // Pin to the carousel sleeve's top-left (document coords, which
        // equal viewport coords at scroll = 0 when progress = 0). The
        // transform handles the motion towards the navbar anchor.
        top: sourceRect.y,
        left: sourceRect.x,
        width: sourceRect.width,
        height: sourceRect.height,
        transform,
        transformOrigin: 'top left',
        // pointer-events gated on isParked: at progress < 0.95 the
        // transit overlays the carousel sleeve and would steal drags;
        // at >= 0.95 it's over the navbar anchor where it should be
        // interactive.
        pointerEvents: isParked ? 'auto' : 'none',
        cursor: isParked ? 'pointer' : 'default',
        zIndex: 60,  // above navbar (z-50) and bottom scrim (z-40)
        willChange: 'transform',
        // At rest (progress = 0) both this transit element and the
        // carousel's centered sleeve sit at the same position. Hiding the
        // transit at rest avoids doubling up the gloss/refraction
        // overlays. The instant the user starts scrolling, isTransitActive
        // flips true (epsilon = 0.001), the carousel sleeve hides via
        // its own visibility:hidden, and this element appears in its
        // place — visually seamless because the transform is still
        // essentially the source-state identity at that moment.
        visibility: isTransitActive ? 'visible' : 'hidden',
      }}
    >
      <WardrobeSleeveVisual
        item={activeItem}
        width={sourceRect.width}
        height={sourceRect.height}
        showShadow
      />
    </motion.div>
  )
}
