'use client'

import { motion, type MotionValue } from 'framer-motion'
import Image from 'next/image'
import type { ContentSummary } from '@/lib/types'
import { urlFor } from '@/lib/sanity'

// Aspect ratio of the sleeve at design reference. Drives the cover-image
// sampling resolution. Width and height of any individual sleeve are
// driven by the `width` / `height` props.
const REF_W = 150
const REF_H = 210

// Static center-state values for the gloss sweep — corresponds to
// rel = 0 in WardrobeItem's gradient functions. WardrobeTransit uses
// these defaults; WardrobeItem passes its own MotionValue<string>.
const CENTER_GLOSS = (() => {
  const strength = 0.52
  const fade = 0.34
  const xPct = 50
  return (
    `linear-gradient(130deg, ` +
    `rgba(255,255,255,${strength}) 0%, ` +
    `rgba(255,255,255,${fade}) ${xPct - 10}%, ` +
    `rgba(255,255,255,0.03) ${xPct + 18}%, ` +
    `rgba(255,255,255,0) 100%)`
  )
})()

// At rel = 0 the refraction strength is 0, so the streak is 'none'.
const CENTER_REFRACTION = 'none'

// Allow either a plain value or a MotionValue. motion.div's style prop
// accepts both interchangeably, so consumers can pass through.
type ValueOrMotion<T> = T | MotionValue<T>

interface Props {
  item: ContentSummary
  width: number
  height: number
  // Floor shadow — toggleable so the transit element can render it once
  // and the carousel-side WardrobeItem can suppress when needed.
  showShadow?: boolean
  shadowOpacity?: ValueOrMotion<number>
  shadowScaleX?: ValueOrMotion<number>
  // Sleeve gloss / refraction overlays. Defaults are the center-state
  // values; WardrobeItem overrides with motion-value-driven versions.
  glossGradient?: ValueOrMotion<string>
  refractionGradient?: ValueOrMotion<string>
}

/**
 * The full acrylic sleeve visual: floor shadow, bordered glossy box,
 * cover image, top light bar, gloss sweep, refraction streak, and inner
 * acrylic highlight. Position-agnostic — the parent decides where to
 * place it. Used by WardrobeItem (driven by motion values for the
 * carousel) and by WardrobeTransit (static center-state values).
 */
export default function WardrobeSleeveVisual({
  item,
  width,
  height,
  showShadow = true,
  shadowOpacity = 0.55,
  shadowScaleX = 1,
  glossGradient = CENTER_GLOSS,
  refractionGradient = CENTER_REFRACTION,
}: Props) {
  // Shadow geometry derived directly from the sleeve dimensions, so the
  // same component works at any size without referencing carousel
  // constants. The 18/150 and 55/150 ratios match WardrobeItem's
  // original numbers at the reference width.
  const SHADOW_GAP = (18 / REF_W) * width
  const SHADOW_H = (55 / REF_W) * width
  const SHADOW_W = Math.round(width * 0.88)

  return (
    <>
      {/* ── Floor shadow ──────────────────────────────────────────────────── */}
      {/* Rectangular projection — matches blocky item shape. Light is above +
          slightly behind, so shadow falls forward below the item. Darkest at
          the top edge (nearest item) and fades out downward. blur() keeps
          edges soft while the rectangle character is preserved. */}
      {showShadow && (
        <motion.div
          aria-hidden
          style={{
            position: 'absolute',
            top: height + SHADOW_GAP,
            left: (width - SHADOW_W) / 2,
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
      )}

      {/* ── Acrylic / glossy plastic sleeve ──────────────────────────────── */}
      {/* Outer box-shadow: a multi-layer acrylic frame edge (bright top/left
          rims + outer floating drop shadow). Inner padding gives the item
          room to "hang" inside the sleeve — correct for transparent-bg images. */}
      <div
        className="relative overflow-hidden select-none"
        style={{
          width,
          height,
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
            src={urlFor(item.cover_image).width(Math.round(REF_W * 3)).height(Math.round(REF_H * 3)).url()}
            alt={item.title}
            fill
            className="object-contain p-2"
            sizes={`${Math.round(width)}px`}
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
    </>
  )
}
