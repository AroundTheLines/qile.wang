'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from 'framer-motion'

import type { ContentSummary } from '@/lib/types'
import {
  WardrobeContext,
  NAVBAR_H,
  type DOMRectLike,
  type WardrobeContextValue,
} from './WardrobeContext'
import WardrobeNavbar from './WardrobeNavbar'
import WardrobeTransit from './WardrobeTransit'

// next/dynamic with ssr: false must be declared inside a Client Component.
// This is the same SSR boundary the old WardrobeShell.tsx used to provide.
const WardrobeCarousel = dynamic(() => import('./WardrobeCarousel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <p className="text-xs tracking-widest uppercase text-gray-200">Loading</p>
    </div>
  ),
})

function toRectLike(r: DOMRect): DOMRectLike {
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

interface Props {
  items: ContentSummary[]
  children: React.ReactNode
}

export default function WardrobeProvider({ items, children }: Props) {
  const pathname = usePathname()

  // ── Initial active index derived from URL (mount-only) ─────────────────
  const initialIndex = useMemo(() => {
    if (!pathname.startsWith('/wardrobe/')) return 0
    const slug = pathname.slice('/wardrobe/'.length)
    if (!slug) return 0
    const idx = items.findIndex(i => i.slug.current === slug)
    return idx >= 0 ? idx : 0
    // Mount-only: subsequent URL changes (router.push from the carousel)
    // are driven by setActiveIndex itself, so we don't want this useMemo
    // to recompute on every pathname change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const activeItem = items[activeIndex] ?? null

  // ── Source rect (centered sleeve) — pushed from WardrobeCarousel ───────
  const [sourceRect, setSourceRect] = useState<DOMRectLike | null>(null)

  // ── Navbar auto-hide (values declared early — effects below) ────────────
  const navbarHideOffset = useMotionValue(0)
  const hideTargetRef = useRef(0)

  // ── Target rect (invisible navbar anchor) ──────────────────────────────
  const navbarAnchorRef = useRef<HTMLDivElement | null>(null)
  const [targetRect, setTargetRect] = useState<DOMRectLike | null>(null)

  useEffect(() => {
    const el = navbarAnchorRef.current
    if (!el) return
    const measure = () => {
      // Skip while the navbar is translated off-screen — getBoundingClientRect
      // includes the CSS transform, so the reported Y would be wrong.
      if (navbarHideOffset.get() > 0.01) return
      setTargetRect(toRectLike(el.getBoundingClientRect()))
    }
    measure()

    // Settle re-measurements: the first useEffect tick can run before
    // hydration/CSS finalize the navbar grid layout, which shifts the
    // anchor horizontally by a few px. Re-measure across the next few
    // frames so the parked transit ends up aligned with the live anchor.
    // We schedule several timers because empirically the layout can
    // jitter for ~300ms after load (font swap, hydration, etc).
    const settleTimers = [
      requestAnimationFrame(measure),
      setTimeout(measure, 100),
      setTimeout(measure, 350),
      setTimeout(measure, 800),
    ]

    // Observe BOTH the anchor and the navbar header. The anchor's own
    // size is fixed (36×50), so it won't fire on viewport-driven shifts;
    // the header is `position: fixed; left: 0; right: 0` so its width
    // tracks the viewport, and its layout drives the anchor's grid
    // position. Observing the header catches every viewport-induced move.
    const header = el.closest('header')
    const ro = new ResizeObserver(measure)
    if (header) ro.observe(header)
    ro.observe(el)
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      cancelAnimationFrame(settleTimers[0] as number)
      for (let i = 1; i < settleTimers.length; i++) {
        clearTimeout(settleTimers[i] as number)
      }
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // ── Scroll-driven transit progress (spring-wrapped) ────────────────────
  // shellRef wraps the carousel. useScroll observes the shell's
  // intersection with the viewport: progress 0 when its top touches the
  // viewport top, progress 1 when its bottom does.
  const shellRef = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: shellRef,
    offset: ['start start', 'end start'],
  })

  // Compress the active range so the transit completes within the first
  // ~30% of the shell's scroll height. The exact upper bound is a tunable
  // — feel for it in the browser; mobile is the primary target so it
  // wants to be a relatively short scroll distance.
  //
  // No spring wrapper — the transit tracks scroll position directly so
  // the visibility swap between the carousel sleeve and transit element
  // is instantaneous with zero lag in either direction.
  const transitProgress = useTransform(scrollYProgress, [0, 0.3], [0, 1], {
    clamp: true,
  })

  // ── isTransitActive: snapshot of "progress > 0" as React state ─────────
  // The carousel needs to render differently during transit (lock drag,
  // hide centered sleeve), and re-rendering off a MotionValue requires a
  // subscription. We mirror the spring's > 0 region into React state so
  // any consumer can read it without subscribing themselves.
  const [isTransitActive, setIsTransitActive] = useState(false)
  useMotionValueEvent(transitProgress, 'change', (v) => {
    // Tiny epsilon avoids flicker right at the rest position.
    const next = v > 0.001
    setIsTransitActive((prev) => (prev === next ? prev : next))

    // Force-show navbar when returning to carousel (transit un-parking).
    if (v < 0.9 && navbarHideOffset.get() > 0) {
      hideTargetRef.current = 0
      animate(navbarHideOffset, 0, { duration: 0.2 })
    }
  })

  // ── Navbar auto-hide (effects) ───────────────────────────────────────
  // Once the transit is parked, scrolling down slides the navbar mostly
  // off-screen — only the bottom edge of the image and its shadow peek
  // out from the top. Scrolling up reveals it again.
  useEffect(() => {
    let lastY = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY
      lastY = y

      if (Math.abs(delta) < 2) return

      const p = transitProgress.get()

      if (p > 0.95 && delta > 5 && hideTargetRef.current === 0) {
        // Deliberate scroll-down while parked → hide navbar
        hideTargetRef.current = 1
        animate(navbarHideOffset, 1, { duration: 0.3, ease: 'easeOut' })
      } else if (delta < -2 && hideTargetRef.current === 1) {
        // Any upward scroll → reveal immediately
        hideTargetRef.current = 0
        animate(navbarHideOffset, 0, { duration: 0.25, ease: 'easeOut' })
      } else if (p < 0.9 && hideTargetRef.current === 1) {
        // Returning to carousel → reveal
        hideTargetRef.current = 0
        animate(navbarHideOffset, 0, { duration: 0.2 })
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [transitProgress, navbarHideOffset])

  // ── Tap-to-return ──────────────────────────────────────────────────────
  // Smooth-scrolls back to the shell. The spring-wrapped transitProgress
  // automatically reverses, which makes the icon spring back into the
  // centered sleeve position.
  const scrollToShell = () => {
    const el = shellRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Stable identity for sourceRect setter so consumers can put it in
  // dependency arrays without thrashing. Without useCallback this would
  // be a fresh function every render, which causes WardrobeCarousel's
  // measurement useLayoutEffect (which lists it in the dep array) to
  // re-run on every render — and since the effect itself calls this
  // function, that becomes an infinite loop.
  const reportSourceRect = useCallback(
    (rect: DOMRectLike | null) => setSourceRect(rect),
    [],
  )

  const value: WardrobeContextValue = {
    items,
    activeIndex,
    setActiveIndex,
    activeItem,
    sourceRect,
    reportSourceRect,
    navbarAnchorRef,
    targetRect,
    transitProgress,
    isTransitActive,
    scrollToShell,
    navbarHideOffset,
  }

  return (
    <WardrobeContext.Provider value={value}>
      <WardrobeNavbar />
      <main className="min-h-screen bg-white flex flex-col items-center" style={{ paddingTop: NAVBAR_H }}>
        {/* `position: relative` is required by framer-motion's useScroll
            so it can compute the scroll offset against this container.
            Without it, useScroll falls back to the document and warns. */}
        <div ref={shellRef} className="relative w-full flex flex-col items-center">
          <WardrobeCarousel />
        </div>
        {children}
      </main>
      <WardrobeTransit />
      {/* Scroll cue: fades out content at the bottom edge of the viewport */}
      <div
        className="fixed bottom-0 left-0 right-0 h-24 pointer-events-none z-40"
        style={{ background: 'linear-gradient(to bottom, transparent, white)' }}
      />
    </WardrobeContext.Provider>
  )
}
