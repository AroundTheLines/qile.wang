'use client'

import { useRef, useState } from 'react'
import { useMotionValue, useMotionValueEvent, animate } from 'framer-motion'
import WardrobeItem from './WardrobeItem'
import type { ContentSummary } from '@/lib/types'

const DRAG_PX_PER_ITEM = 90

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
    const next = dragStartOffset.current - dx / DRAG_PX_PER_ITEM
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
          Height is 55vh minus the navbar. On a 375×812 phone that's ~399px —
          big enough to show items with breathing room above and below. */}
      <div
        className="relative w-full touch-pan-y"
        style={{
          height: 'calc(55vh - 3rem)',
          perspective: '600px',
          cursor: 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
          {items.map((item, i) => (
            <WardrobeItem
              key={item._id}
              item={item}
              index={i}
              offset={offset}
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
    </div>
  )
}
