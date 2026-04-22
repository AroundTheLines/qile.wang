'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useGlobe } from './GlobeContext'
import PinPanel from './panels/PinPanel'
import TripPanel from './panels/TripPanel'

/**
 * Panel dispatcher. Cross-fades the inner content on variant switch (§7.3.2).
 *
 * We drive the cross-fade manually rather than via `<AnimatePresence>`:
 * - `mode="wait"` stalled here — the outgoing child never completed its exit
 *   when nested inside GlobeViewport's already-animated slide-in container.
 * - `mode="sync"` left the outgoing panel mounted indefinitely.
 *
 * Manual two-phase fade keeps the contract explicit: target key change →
 * fade current out (200ms) → swap content → fade in. The keyed remount also
 * resets scroll position and item-expansion state (§7.3.2) because React
 * unmounts the old panel tree.
 *
 * The outer slide-in container lives in GlobeViewport and stays keyed on
 * "panel open vs not" — it does NOT resize or translate when the variant
 * switches, per spec §7.3.2.
 */
const FADE_MS = 200

export default function GlobeDetailPanel() {
  const { panelVariant, pins, selectedPin, lockedTrip, tripsWithVisits } = useGlobe()

  const pin =
    panelVariant === 'pin' && selectedPin
      ? pins.find((p) => p.location._id === selectedPin)
      : null
  const trip =
    panelVariant === 'trip' && lockedTrip
      ? tripsWithVisits.find((t) => t._id === lockedTrip)
      : null

  const targetKey = pin ? `pin-${pin.location._id}` : trip ? `trip-${trip._id}` : null
  const targetContent: React.ReactNode = pin
    ? <PinPanel pin={pin} />
    : trip
      ? <TripPanel trip={trip} />
      : null

  const [displayed, setDisplayed] = useState<{ key: string | null; node: React.ReactNode }>(
    { key: targetKey, node: targetContent },
  )
  const [opacity, setOpacity] = useState(1)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track the last key we kicked a fade for, so the initial mount (which
  // React runs effects for even when targetKey === displayed.key) doesn't
  // flash the panel opacity down and back up.
  const lastFadeKey = useRef(targetKey)
  useEffect(() => {
    if (targetKey === lastFadeKey.current) return
    lastFadeKey.current = targetKey
    setOpacity(0)
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => {
      setDisplayed({ key: targetKey, node: targetContent })
      setOpacity(1)
    }, FADE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  useEffect(() => () => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
  }, [])

  return (
    <div className="h-full">
      {displayed.node && (
        <motion.div
          key={displayed.key ?? 'empty'}
          animate={{ opacity }}
          initial={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000 }}
          className="h-full"
        >
          {displayed.node}
        </motion.div>
      )}
    </div>
  )
}
