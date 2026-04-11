'use client'

import { useRef, useState, useEffect } from 'react'
import { useMotionValue, useMotionValueEvent, animate, AnimatePresence, motion } from 'framer-motion'
import { PortableText } from '@portabletext/react'
import type { PortableTextComponents } from '@portabletext/react'
import WardrobeItem from './WardrobeItem'
import type { ContentSummary } from '@/lib/types'

// Reference viewport the design was built for (iPhone 14 Pro / ~390px wide)
const REF_WIDTH = 390
// Base item height must match WardrobeItem's BASE_ITEM_H
const BASE_ITEM_H = 210
// ─── Tune this to control how large items get on wide/tall screens ───────────
const MAX_SCALE = 1.8

const bodyComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => (
      <p className="text-gray-500 text-base font-light leading-relaxed mb-5">{children}</p>
    ),
    h2: ({ children }) => (
      <h2 className="text-[10px] tracking-[0.2em] uppercase text-gray-300 mt-10 mb-3">{children}</h2>
    ),
  },
  list: {
    bullet: ({ children }) => <ul className="mb-5 flex flex-col gap-2">{children}</ul>,
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="text-gray-500 text-base font-light leading-relaxed flex gap-3">
        <span className="text-gray-300 select-none shrink-0">—</span>
        <span>{children}</span>
      </li>
    ),
  },
  marks: {
    strong: ({ children }) => <strong className="font-medium text-gray-700">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
  },
}

const BASE_DRAG_PX_PER_ITEM = 70

interface Props {
  items: ContentSummary[]
  initialIndex?: number
}

export default function WardrobeCarousel({ items, initialIndex = 0 }: Props) {
  const offset = useMotionValue(initialIndex)
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartOffset = useRef(initialIndex)

  // ── Responsive scale ────────────────────────────────────────────────────
  // Scale based purely on viewport width so items occupy the same fraction
  // of the screen as on the reference mobile viewport (~390px).
  // Capped at 3× so items don't become enormous on ultra-wide monitors.
  //
  // Stage height adapts to the scaled items rather than being viewport-
  // percentage-based — this prevents short laptop screens from clamping scale
  // to near 1× (landscape desktops are wide but not tall).
  const [scale, setScale] = useState(1)
  const [stageHeight, setStageHeight] = useState(323) // BASE_ITEM_H + shadow + breathing
  const [textMaxWidth, setTextMaxWidth] = useState(512)
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const s = Math.max(1, Math.min(vw / REF_WIDTH, MAX_SCALE))
      setScale(s)
      // Stage must contain the item + its shadow + padding.
      // Also keep at least 55 vh minus navbar for a natural look on mobile.
      const naturalH = Math.round(vh * 0.55 - 48)
      const contentH = Math.round(BASE_ITEM_H * s + 100) // 100 px for shadow + breathing
      setStageHeight(Math.max(naturalH, contentH))
      // Body text: scale gently but never exceed viewport width minus comfortable margins.
      // Hard cap at 680 px keeps line lengths readable on large screens.
      setTextMaxWidth(Math.min(Math.round(512 * s), 680, vw - 64))
    }
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])

  useMotionValueEvent(offset, 'change', (val) => {
    const rounded = Math.round(val)
    if (rounded >= 0 && rounded < items.length) setActiveIndex(rounded)
  })

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
  }

  const goTo = (index: number) => {
    animate(offset, Math.max(0, Math.min(items.length - 1, index)), {
      type: 'spring', stiffness: 420, damping: 42,
    })
  }

  const activeItem = items[activeIndex]

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs tracking-widest uppercase text-gray-300">No items yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center w-full select-none">

      {/* ── 3D Stage ─────────────────────────────────────────────────────────
          Height is computed from scale so items always fit. Minimum is 55 vh
          minus the navbar (natural mobile feel); grows with scale on desktop. */}
      <div
        className="relative w-full touch-pan-y"
        style={{
          height: stageHeight,
          cursor: 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* perspective lives here — items are direct children, so it applies
            correctly without preserve-3d. z-index then controls stacking order. */}
        <div className="absolute inset-0" style={{ perspective: `${Math.round(700 * scale)}px` }}>
          {items.map((item, i) => (
            <WardrobeItem
              key={item._id}
              item={item}
              index={i}
              offset={offset}
              scale={scale}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-10 py-5 shrink-0">
        <button
          onClick={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0}
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
              aria-label={`Go to item ${i + 1}`}
              className="transition-all duration-300"
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
          disabled={activeIndex === items.length - 1}
          className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-black transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Next item"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Museum label ──────────────────────────────────────────────────── */}
      {activeItem && (
        <div className="shrink-0 text-center px-6">
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
        </div>
      )}

      {/* ── Item body ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeItem?.body && activeItem.body.length > 0 && (
          <motion.div
            key={activeItem._id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="w-full px-8 pt-10 pb-20"
            style={{ maxWidth: textMaxWidth }}
          >
            <div className="w-6 h-px bg-gray-200 mx-auto mb-10" />
            <PortableText value={activeItem.body} components={bodyComponents} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
