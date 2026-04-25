'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGlobeTrip } from './GlobeContext'
import { useReducedMotion } from '@/lib/useReducedMotion'

interface Props {
  tripId: string
  children: React.ReactNode
}

/**
 * Syncs route-provided trip id into the GlobeProvider so the panel stays
 * open behind the sliver (§8.1). Mirrors GlobeArticleReveal.
 */
export default function TripArticleReveal({ tripId, children }: Props) {
  const { lockedTrip, setLockedTrip } = useGlobeTrip()
  const reduced = useReducedMotion()

  useEffect(() => {
    if (lockedTrip !== tripId) setLockedTrip(tripId)
  }, [tripId, lockedTrip, setLockedTrip])

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: reduced ? 1 : 0 }}
      transition={{ duration: reduced ? 0 : 0.3, ease: 'easeOut' }}
      className="w-full h-full overflow-y-auto"
    >
      {children}
    </motion.div>
  )
}
