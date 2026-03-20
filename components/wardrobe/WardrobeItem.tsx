'use client'

import { motion, useTransform, type MotionValue } from 'framer-motion'
import Image from 'next/image'
import type { ContentSummary } from '@/lib/types'
import { urlFor } from '@/lib/sanity'

// Tight arc — items pack close like a real garment rack.
// Progressive angle: ±1 at 45°, ±2 at 75°. Radius kept small enough
// that all 5 items fit on a 375px mobile screen simultaneously.
// CSS 3D depth ordering means ±2 items naturally sit behind ±1 items
// wherever they overlap in 2D — no image bleed, exactly like the reference.
const RADIUS = 155

function arcAngleRad(rel: number): number {
  const dist = Math.abs(rel)
  const sign = rel < 0 ? -1 : 1
  let deg: number
  if (dist <= 1)      deg = dist * 45
  else if (dist <= 2) deg = 45 + (dist - 1) * 30   // 45° → 75°
  else                deg = 75 + (dist - 2) * 30
  return sign * deg * (Math.PI / 180)
}

export const ITEM_W = 150
export const ITEM_H = 210  // sleeve proportion

interface Props {
  item: ContentSummary
  index: number
  offset: MotionValue<number>
  onClick: () => void
}

export default function WardrobeItem({ item, index, offset, onClick }: Props) {
  // ── 3D position on progressive arc ───────────────────────────────────────
  const transform = useTransform(offset, (off) => {
    const rel = index - off
    const angle = arcAngleRad(rel)
    const x = RADIUS * Math.sin(angle)
    const z = RADIUS * (Math.cos(angle) - 1)
    const rotY = -(angle * 180) / Math.PI
    return `translate3d(${x.toFixed(2)}px, 0, ${z.toFixed(2)}px) rotateY(${rotY.toFixed(2)}deg) translate(-50%, -50%)`
  })

  // ── Opacity: all 5 items clearly visible ─────────────────────────────────
  const opacity = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    if (dist > 2.6) return 0
    if (dist > 1.6) return 0.72  // ±2 — clearly visible slivers
    if (dist > 0.6) return 0.9   // ±1 — strong
    return 1
  })

  // ── Floor shadow ──────────────────────────────────────────────────────────
  const shadowOpacity = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    return Math.max(0, 0.32 - dist * 0.1)
  })

  const shadowScaleX = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    return 1 + dist * 0.3
  })

  // ── Diagonal gloss ────────────────────────────────────────────────────────
  const glossGradient = useTransform(offset, (off) => {
    const rel = index - off
    const angle = arcAngleRad(rel)
    const xPct = Math.round(50 - (angle / (Math.PI / 2)) * 60)
    const strength = Math.max(0.12, 0.52 - Math.abs(rel) * 0.09)
    const fade = Math.max(0, strength - 0.18)
    return (
      `linear-gradient(130deg, ` +
      `rgba(255,255,255,${strength.toFixed(2)}) 0%, ` +
      `rgba(255,255,255,${fade.toFixed(2)}) ${Math.max(0, xPct - 10)}%, ` +
      `rgba(255,255,255,0.03) ${xPct + 18}%, ` +
      `rgba(255,255,255,0) 100%)`
    )
  })

  // ── Refraction streak ─────────────────────────────────────────────────────
  const refractionGradient = useTransform(offset, (off) => {
    const rel = index - off
    const angle = arcAngleRad(rel)
    const dist = Math.abs(rel)
    const strength = dist < 0.4 ? 0 : Math.min(0.42, (dist - 0.4) * 0.28)
    if (strength < 0.02) return 'none'
    const x = Math.max(6, Math.min(88, Math.round(50 + (angle / (Math.PI / 2)) * 80)))
    return (
      `linear-gradient(90deg, ` +
      `transparent ${x - 6}%, ` +
      `rgba(255,255,255,${strength.toFixed(2)}) ${x}%, ` +
      `rgba(255,255,255,${(strength * 0.45).toFixed(2)}) ${x + 3}%, ` +
      `rgba(255,255,255,${(strength * 0.12).toFixed(2)}) ${x + 6}%, ` +
      `transparent ${x + 11}%)`
    )
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
          bottom: -20,
          left: '50%',
          x: '-50%',
          width: ITEM_W * 0.85,
          height: 30,
          scaleX: shadowScaleX,
          opacity: shadowOpacity,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 72%)',
          transformOrigin: 'center center',
          pointerEvents: 'none',
        }}
      />

      {/* ── Acrylic / glossy plastic sleeve ──────────────────────────────── */}
      {/* Outer box-shadow: a multi-layer acrylic frame edge (bright top/left
          rims + outer floating drop shadow). Inner padding gives the item
          room to "hang" inside the sleeve — correct for transparent-bg images. */}
      <div
        className="w-full h-full relative overflow-hidden select-none"
        style={{
          borderRadius: '4px',
          border: '1.5px solid rgba(230,230,230,0.75)',
          background: 'rgba(252,252,250,0.12)',
          boxShadow: [
            // Acrylic rim edges — top is brightest (overhead light source)
            'inset 0 2px 0 rgba(255,255,255,1)',
            'inset 2px 0 0 rgba(255,255,255,0.65)',
            'inset -1px 0 0 rgba(255,255,255,0.3)',
            'inset 0 -1px 0 rgba(255,255,255,0.18)',
            // Outer floating shadows
            '0 6px 28px rgba(0,0,0,0.13)',
            '0 2px 8px rgba(0,0,0,0.08)',
          ].join(', '),
        }}
      >
        {/* Cover image — object-contain so transparent-bg items float inside */}
        {item.cover_image ? (
          <Image
            src={urlFor(item.cover_image).width(300).height(420).url()}
            alt={item.title}
            fill
            className="object-contain p-2"
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

        {/* Static top-light bar: overhead light hitting the plastic rim.
            Always present — like the bright strip at the top of a plastic bag. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: '38%',
            background:
              'linear-gradient(to bottom, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.1) 35%, rgba(255,255,255,0) 100%)',
          }}
        />

        {/* Position-aware diagonal gloss sweep */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: glossGradient }}
        />

        {/* Rotation-coupled refraction streak */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: refractionGradient }}
        />

        {/* Inner acrylic frame highlight — closes the illusion of physical depth */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '4px',
            boxShadow:
              'inset 0 0 0 1px rgba(255,255,255,0.45), inset 0 1px 4px rgba(255,255,255,0.55)',
          }}
        />
      </div>
    </motion.div>
  )
}
