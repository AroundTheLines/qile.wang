'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMotionValue, useMotionValueEvent, animate, AnimatePresence, motion } from 'framer-motion'
import { prepare, layout } from '@chenglou/pretext'
import WardrobeItem, { BASE_ITEM_H } from './WardrobeItem'
import { useWardrobeContext } from './WardrobeContext'
import { useRouter, usePathname } from 'next/navigation'

// Reference viewport the design was built for (iPhone 14 Pro / ~390px wide)
const REF_WIDTH = 390
const MAX_SCALE = 1.8
const BASE_DRAG_PX_PER_ITEM = 70

// Font string must match the resolved CSS value on the museum label <h2>.
// h2 inherits body font-family (Arial, Helvetica, sans-serif) and uses
// text-xl (20px) font-light (weight 300). pretext only supports standard
// system fonts — custom web fonts like Geist are not yet supported.
const LABEL_FONT = '300 20px/1.4 Arial, Helvetica, sans-serif'

export default function WardrobeCarousel() {
  const router = useRouter()
  const pathname = usePathname()
  const ctx = useWardrobeContext()
  const {
    items,
    activeIndex,
    setActiveIndex,
    activeItem,
    reportSourceRect,
    isTransitActive,
  } = ctx

  const offset = useMotionValue(activeIndex)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartOffset = useRef(activeIndex)

  // ── Navigate to initial item on mount if no slug in URL ─────────────────
  useEffect(() => {
    const slugFromPath = pathname.startsWith('/wardrobe/')
      ? pathname.slice('/wardrobe/'.length)
      : null
    if (!slugFromPath && items.length > 0) {
      router.replace('/wardrobe/' + items[activeIndex].slug.current, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Responsive scale ────────────────────────────────────────────────────
  const [scale, setScale] = useState(1)
  const [stageHeight, setStageHeight] = useState(BASE_ITEM_H + 113)
  const [textMaxWidth, setTextMaxWidth] = useState(512)
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const s = Math.max(1, Math.min(vw / REF_WIDTH, MAX_SCALE))
      setScale(s)
      const naturalH = Math.round(vh * 0.55 - 48)
      const contentH = Math.round(BASE_ITEM_H * s + 100)
      setStageHeight(Math.max(naturalH, contentH))
      setTextMaxWidth(Math.min(Math.round(512 * s), 680, vw - 64))
    }
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])

  useMotionValueEvent(offset, 'change', (val) => {
    const rounded = Math.round(val)
    if (rounded >= 0 && rounded < items.length && rounded !== activeIndex) {
      setActiveIndex(rounded)
    }
  })

  const navigateTo = (index: number) => {
    const item = items[index]
    if (item) router.push('/wardrobe/' + item.slug.current, { scroll: false })
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTransitActive) return  // locked during transit
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartOffset.current = offset.get()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStartX.current
    const next = dragStartOffset.current - dx / (BASE_DRAG_PX_PER_ITEM * scale)
    offset.set(Math.max(-0.4, Math.min(items.length - 1 + 0.4, next)))
  }

  const handlePointerUp = () => {
    if (!isDragging.current) return
    isDragging.current = false
    const snapped = Math.max(0, Math.min(items.length - 1, Math.round(offset.get())))
    animate(offset, snapped, { type: 'spring', stiffness: 500, damping: 48 })
    navigateTo(snapped)
  }

  const goTo = (index: number) => {
    if (isTransitActive) return  // locked during transit
    const idx = Math.max(0, Math.min(items.length - 1, index))
    animate(offset, idx, { type: 'spring', stiffness: 420, damping: 42 })
    navigateTo(idx)
  }

  // ── Source rect measurement (centered sleeve) ────────────────────────────
  // The centered sleeve element is the only item that ever serves as the
  // transit source. We attach a ref via a callback so it can swap as
  // activeIndex changes, then measure on layout effects + ResizeObserver.
  const activeSleeveRef = useRef<HTMLDivElement | null>(null)
  const setActiveSleeveEl = useCallback((el: HTMLDivElement | null) => {
    activeSleeveRef.current = el
  }, [])

  // useLayoutEffect runs only on the client because WardrobeCarousel is
  // dynamically imported with ssr: false from WardrobeProvider.
  useLayoutEffect(() => {
    const measure = () => {
      const el = activeSleeveRef.current
      if (!el) {
        reportSourceRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      // Store source rect in DOCUMENT coordinates (not viewport), so a
      // mid-page scroll-restoration landing produces a measurement that
      // still describes "where the sleeve sits when scroll = 0." The
      // navbar target is fixed-positioned, so its viewport coords are
      // already document-equivalent — consistent with source.
      reportSourceRect({
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
      })
    }
    measure()

    // Re-measure once the drag-snap spring has had time to settle.
    // activeIndex flips mid-spring (via the useMotionValueEvent on
    // offset rounding), so the immediate measurement above can be a
    // few px off until offset lands on the integer. 280ms covers the
    // typical snap duration with stiffness 500 / damping 48.
    const settleTimer = setTimeout(measure, 280)

    const el = activeSleeveRef.current
    let ro: ResizeObserver | null = null
    if (el) {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      clearTimeout(settleTimer)
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
    // Re-measure when active item changes or scale changes (which
    // re-sizes every sleeve).
  }, [activeIndex, scale, reportSourceRect])

  // ── Pretext pre-sizing for museum label ─────────────────────────────────
  const preparedTitle = activeItem ? prepare(activeItem.title, LABEL_FONT) : null
  const labelLayout = preparedTitle
    ? layout(preparedTitle, textMaxWidth - 48, 1.4 * 20)
    : null

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs tracking-widest uppercase text-gray-300">No items yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center w-full select-none">

      {/* ── 3D Stage ───────────────────────────────────────────────────────── */}
      <div
        className="relative w-full touch-pan-y"
        style={{ height: stageHeight, cursor: isTransitActive ? 'default' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-0" style={{ perspective: `${Math.round(700 * scale)}px` }}>
          {items.map((item, i) => (
            <WardrobeItem
              key={item._id}
              item={item}
              index={i}
              offset={offset}
              scale={scale}
              onClick={() => goTo(i)}
              hideForTransit={isTransitActive && i === activeIndex}
              innerRef={i === activeIndex ? setActiveSleeveEl : undefined}
            />
          ))}
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-10 py-5 shrink-0">
        <button
          onClick={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0 || isTransitActive}
          className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-black transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Previous item"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              disabled={isTransitActive}
              aria-label={`Go to item ${i + 1}`}
              className="transition-all duration-300 disabled:cursor-not-allowed"
              style={{
                width: i === activeIndex ? '16px' : '4px',
                height: '4px',
                borderRadius: '2px',
                background: i === activeIndex ? '#000' : '#d1d5db',
              }}
            />
          ))}
        </div>

        <button
          onClick={() => goTo(activeIndex + 1)}
          disabled={activeIndex === items.length - 1 || isTransitActive}
          className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-black transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Next item"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Museum label ──────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeItem && (
          <motion.div
            key={activeItem._id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-center px-6"
            style={labelLayout ? { minHeight: labelLayout.height } : undefined}
          >
            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-400">
              {activeItem.content_type}
              {activeItem.acquired_at ? ` · ${new Date(activeItem.acquired_at).getFullYear()}` : ''}
            </p>
            <h2 className="text-xl font-light text-black mt-1.5 tracking-wide">
              {activeItem.title}
            </h2>
            {activeItem.tags && activeItem.tags.length > 0 && (
              <p className="text-[10px] tracking-widest uppercase text-gray-300 mt-2">
                {activeItem.tags.join(' · ')}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
