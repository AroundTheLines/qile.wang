'use client'

import { useRef, useEffect, useState } from 'react'
import { useGlobe } from './GlobeContext'
import { clipLineByGlobe } from '@/lib/globe'

// The article content fades in (300ms) + globe zoom settles (~400ms).
// Start drawing once both have reasonably settled.
const DRAW_IN_DELAY_MS = 500
const DRAW_IN_MS = 200
const RETRACT_MS = 150

export default function GlobeArticleConnector() {
  const {
    selectedPin,
    pinPositionRef,
    globeScreenRef,
    frameSubscribersRef,
    articleTitleRef,
    closeArticle,
    isDark,
    showConnectors,
    layoutState,
  } = useGlobe()

  const lineRef = useRef<SVGLineElement>(null)
  const closeButtonRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [progress, setProgress] = useState(0)
  // Once layoutState leaves article-open, we retract then unmount.
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  // Draw-in when entering article-open
  useEffect(() => {
    if (layoutState !== 'article-open') return
    setMounted(true)
    let raf = 0
    const delay = setTimeout(() => {
      let start: number | null = null
      const step = (t: number) => {
        if (start === null) start = t
        const p = Math.min((t - start) / DRAW_IN_MS, 1)
        setProgress(p)
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, DRAW_IN_DELAY_MS)
    return () => {
      clearTimeout(delay)
      cancelAnimationFrame(raf)
    }
  }, [layoutState])

  // Retract on exit (layoutState no longer article-open)
  useEffect(() => {
    if (layoutState === 'article-open') return
    if (progress === 0) {
      setMounted(false)
      return
    }
    let raf = 0
    let start: number | null = null
    const from = progress
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min((t - start) / RETRACT_MS, 1)
      setProgress(from * (1 - p))
      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setMounted(false)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutState])

  // Subscribe to the bridge's frame tick so the line and × stay locked to
  // the pin in the same paint as the canvas.
  useEffect(() => {
    if (!mounted || !selectedPin || progress === 0) return
    const subscribers = frameSubscribersRef.current
    const update = () => {
      const pos = pinPositionRef.current[selectedPin]
      const titleEl = articleTitleRef.current
      if (!pos || !lineRef.current) return
      // End point: left edge of article title (or clamp to top of article
      // area if title has scrolled off-screen).
      let endX: number
      let endY: number
      if (titleEl) {
        const rect = titleEl.getBoundingClientRect()
        endX = rect.left
        endY = rect.top + rect.height / 2
        // Clamp: if title is above the article viewport, clamp to top.
        if (endY < 80) endY = 80
      } else {
        // Title not yet mounted — fall back to midpoint of viewport height.
        endX = viewport.w * 0.35
        endY = viewport.h * 0.5
      }

      const drawnEndX = pos.x + (endX - pos.x) * progress
      const drawnEndY = pos.y + (endY - pos.y) * progress

      const clipped = clipLineByGlobe(
        pos.x,
        pos.y,
        drawnEndX,
        drawnEndY,
        pos.behind,
        globeScreenRef.current,
      )

      lineRef.current.setAttribute('x1', String(clipped.x1))
      lineRef.current.setAttribute('y1', String(clipped.y1))
      lineRef.current.setAttribute('x2', String(clipped.x2))
      lineRef.current.setAttribute('y2', String(clipped.y2))
      lineRef.current.style.opacity = pos.visible && clipped.visible ? '1' : '0'

      if (closeButtonRef.current) {
        // Anchor the × at the midpoint of the *visible* segment so it never
        // sits inside the globe disc when the pin is on the back face.
        const midX = (clipped.x1 + clipped.x2) / 2
        const midY = (clipped.y1 + clipped.y2) / 2
        closeButtonRef.current.style.left = `${midX}px`
        closeButtonRef.current.style.top = `${midY}px`
        closeButtonRef.current.style.opacity =
          progress >= 1 && pos.visible && clipped.visible ? '1' : '0'
      }
    }
    subscribers.add(update)
    return () => {
      subscribers.delete(update)
    }
  }, [mounted, selectedPin, progress, pinPositionRef, globeScreenRef, frameSubscribersRef, articleTitleRef, viewport.w, viewport.h])

  if (!mounted || !showConnectors || !selectedPin || progress === 0) return null

  return (
    <>
      <svg
        className="fixed inset-0 pointer-events-none z-30"
        width={viewport.w}
        height={viewport.h}
      >
        <line ref={lineRef} stroke={isDark ? 'white' : 'black'} strokeWidth="1.5" />
      </svg>
      <div
        ref={closeButtonRef}
        className="fixed z-40 -translate-x-1/2 -translate-y-1/2 transition-opacity"
        style={{ opacity: 0 }}
      >
        <button
          onClick={closeArticle}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-black border border-black dark:border-white text-black dark:text-white text-xs leading-none cursor-pointer hover:opacity-70 transition-opacity"
          aria-label="Close article"
        >
          &times;
        </button>
      </div>
    </>
  )
}
