'use client'

import { motion, useTransform, type MotionValue } from 'framer-motion'
import Image from 'next/image'
import type { ContentSummary } from '@/lib/types'
import { urlFor } from '@/lib/sanity'

// Two independent axes — decoupled like the reference photo:
//
//  posAngle  — gentle 22°/step arc that controls X/Z world position.
//              Keeps items evenly spaced with clear gaps between them.
//
//  rotAngle  — fast-saturating rotation that hits ~82° by ±1 items,
//              so they appear as near-edge-on slivers regardless of
//              their position on the arc.
//
// Using a single coupled angle (old approach) meant you couldn't get
// aggressive card rotation without also cramming items together.

const BASE_POS_RADIUS = 220        // arc radius for world position at scale=1
const POS_STEP_RAD = (40 * Math.PI) / 180  // 40° step — keeps projected edges ~40px apart

/** World-space X/Z position: smooth gentle arc */
function posAngle(rel: number): number {
  return rel * POS_STEP_RAD
}

/** Card face rotation: saturates quickly to 82° at ±1, then plateaus */
function rotAngleRad(rel: number): number {
  const sign = rel < 0 ? -1 : 1
  const dist  = Math.abs(rel)
  const deg   = dist <= 1 ? dist * 82 : 82 + (dist - 1) * 8
  return sign * deg * (Math.PI / 180)
}

export const BASE_ITEM_W = 150
export const BASE_ITEM_H = 210  // sleeve proportion

interface Props {
  item: ContentSummary
  index: number
  offset: MotionValue<number>
  onClick: () => void
  scale: number
}

export default function WardrobeItem({ item, index, offset, onClick, scale }: Props) {
  // ── Scaled geometry — all pixel values derived from the scale factor ──────
  const ITEM_W    = BASE_ITEM_W * scale
  const ITEM_H    = BASE_ITEM_H * scale
  const POS_RADIUS = BASE_POS_RADIUS * scale
  // Shadow tuning — rectangular projection, light source above + slightly behind
  const SHADOW_GAP = 18 * scale               // px between card bottom and shadow top edge
  const SHADOW_H   = 55 * scale               // how far the shadow projects downward
  const SHADOW_W   = Math.round(ITEM_W * 0.88) // slightly narrower than card

  // ── 3D position (gentle arc) + card rotation (aggressive, decoupled) ─────
  const transform = useTransform(offset, (off) => {
    const rel   = index - off
    const pa    = posAngle(rel)
    const x     = POS_RADIUS * Math.sin(pa)
    const z     = POS_RADIUS * (Math.cos(pa) - 1)
    const rotY  = -(rotAngleRad(rel) * 180) / Math.PI
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

  // ── Z-index: center item always on top ───────────────────────────────────
  const zIndex = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    return Math.round(Math.max(0, 20 - dist * 5))
  })

  // ── Floor shadow ──────────────────────────────────────────────────────────
  const shadowOpacity = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    return Math.max(0, 0.55 - dist * 0.48)  // centre≈0.55, ±1≈0.07, ±2+ → 0
  })

  const shadowScaleX = useTransform(offset, (off) => {
    const dist = Math.abs(index - off)
    return Math.max(0.5, 1 - dist * 0.2)   // shrinks for side items
  })

  // ── Diagonal gloss — driven by card rotation angle ───────────────────────
  const glossGradient = useTransform(offset, (off) => {
    const rel   = index - off
    const angle = rotAngleRad(rel)   // visual rotation, not position
    const xPct  = Math.round(50 - (angle / (Math.PI / 2)) * 60)
    const strength = Math.max(0.12, 0.52 - Math.abs(rel) * 0.09)
    const fade  = Math.max(0, strength - 0.18)
    return (
      `linear-gradient(130deg, ` +
      `rgba(255,255,255,${strength.toFixed(2)}) 0%, ` +
      `rgba(255,255,255,${fade.toFixed(2)}) ${Math.max(0, xPct - 10)}%, ` +
      `rgba(255,255,255,0.03) ${xPct + 18}%, ` +
      `rgba(255,255,255,0) 100%)`
    )
  })

  // ── Refraction streak — driven by card rotation angle ────────────────────
  const refractionGradient = useTransform(offset, (off) => {
    const rel   = index - off
    const angle = rotAngleRad(rel)   // visual rotation, not position
    const dist  = Math.abs(rel)
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
        zIndex,
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: ITEM_W,
        height: ITEM_H,
        transformOrigin: '0 0',
        willChange: 'transform',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      {/* ── Floor shadow ──────────────────────────────────────────────────── */}
      {/* Rectangular projection — matches blocky item shape. Light is above +
          slightly behind, so shadow falls forward below the item. Darkest at
          the top edge (nearest item) and fades out downward. blur() keeps
          edges soft while the rectangle character is preserved. */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          top: ITEM_H + SHADOW_GAP,
          left: `${(ITEM_W - SHADOW_W) / 2}px`,
          width: SHADOW_W,
          height: SHADOW_H,
          scaleX: shadowScaleX,
          opacity: shadowOpacity,
          transformOrigin: 'top center',
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.14) 42%, rgba(0,0,0,0) 100%)',
          filter: 'blur(6px)',
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
            src={urlFor(item.cover_image).width(Math.round(BASE_ITEM_W * 3)).height(Math.round(BASE_ITEM_H * 3)).url()}
            alt={item.title}
            fill
            className="object-contain p-2"
            sizes={`${Math.round(ITEM_W)}px`}
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
