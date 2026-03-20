'use client'

import { motion, useTransform, type MotionValue } from 'framer-motion'
import Image from 'next/image'
import type { ContentSummary } from '@/lib/types'
import { urlFor } from '@/lib/sanity'

const ANGLE_STEP_RAD = (25 * Math.PI) / 180
const RADIUS = 420

// Item dimensions — larger for presence
export const ITEM_W = 150
export const ITEM_H = 200

interface Props {
  item: ContentSummary
  index: number
  offset: MotionValue<number>
  onClick: () => void
}

export default function WardrobeItem({ item, index, offset, onClick }: Props) {
  // ── 3D position on arc ────────────────────────────────────────────────────
  const transform = useTransform(offset, (off) => {
    const rel = index - off
    const angle = rel * ANGLE_STEP_RAD
    const x = RADIUS * Math.sin(angle)
    const z = RADIUS * (Math.cos(angle) - 1)
    const rotY = -(angle * 180) / Math.PI
    return `translate3d(${x.toFixed(2)}px, 0, ${z.toFixed(2)}px) rotateY(${rotY.toFixed(2)}deg) translate(-50%, -50%)`
  })

  // ── Opacity: fade items as they recede ────────────────────────────────────
  const opacity = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    if (dist > 3.5) return 0
    if (dist > 2.5) return 0.15
    if (dist > 1.5) return 0.55
    return 1
  })

  // ── Floor shadow: ellipse beneath the item, driven by distance from centre ─
  // Centre item: tight, dark, close. Side items: wide, faint, offset away.
  const shadowOpacity = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    return Math.max(0, 0.28 - dist * 0.1)
  })

  const shadowScaleX = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    // Shadow widens as item recedes (perspective foreshortening illusion)
    return 1 + dist * 0.25
  })

  const shadowBlur = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    return `${6 + dist * 10}px`
  })

  // ── Gloss: specular highlight shifts with rotation angle ──────────────────
  // Centre item faces viewer → highlight top-left.
  // Left items angled right → highlight shifts to right edge.
  // Right items angled left → highlight shifts to left edge.
  const glossGradient = useTransform(offset, (off) => {
    const rel = index - off
    const angle = rel * ANGLE_STEP_RAD
    // Map angle to a gradient origin: -π/2..+π/2 → 100%..0%
    const xPct = Math.round(50 - (angle / (Math.PI / 2)) * 55)
    const strength = Math.max(0.06, 0.22 - Math.abs(rel) * 0.06)
    return `linear-gradient(135deg, rgba(255,255,255,${strength}) 0% ${xPct}%, rgba(255,255,255,0) ${xPct + 40}%)`
  })

  return (
    <motion.div
      style={{
        transform,
        opacity,
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${ITEM_W}px`,
        height: `${ITEM_H}px`,
        willChange: 'transform',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      {/* ── Floor shadow ──────────────────────────────────────────────────── */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -18,
          left: '50%',
          x: '-50%',
          width: ITEM_W * 0.85,
          height: 28,
          scaleX: shadowScaleX,
          opacity: shadowOpacity,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 72%)',
          transformOrigin: 'center center',
          pointerEvents: 'none',
        }}
      />

      {/* ── Acrylic sleeve ────────────────────────────────────────────────── */}
      <div
        className="w-full h-full relative overflow-hidden select-none"
        style={{
          borderRadius: '3px',
          border: '1px solid rgba(210,210,210,0.6)',
          background: 'rgba(250,250,250,0.4)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 0 0 1px rgba(255,255,255,0.25)',
        }}
      >
        {/* Cover image */}
        {item.cover_image ? (
          <Image
            src={urlFor(item.cover_image).width(300).height(400).url()}
            alt={item.title}
            fill
            className="object-cover"
            sizes="150px"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gray-50 flex items-center justify-center p-4">
            <span className="text-[9px] tracking-widest uppercase text-center text-gray-300 leading-relaxed">
              {item.title}
            </span>
          </div>
        )}

        {/* Position-aware specular gloss overlay */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: glossGradient }}
        />

        {/* Plastic film edge — subtle inner border highlight */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '3px',
            boxShadow:
              'inset 0 0 0 1px rgba(255,255,255,0.5), inset 0 1px 3px rgba(255,255,255,0.6)',
          }}
        />
      </div>
    </motion.div>
  )
}
