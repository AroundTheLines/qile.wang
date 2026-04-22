'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGlobe } from './GlobeContext'

interface Props {
  tripId: string
  children: React.ReactNode
}

/**
 * Syncs route-provided trip id into the GlobeProvider so the panel stays
 * open behind the sliver (§8.1). Mirrors GlobeArticleReveal.
 */
export default function TripArticleReveal({ tripId, children }: Props) {
  const { lockedTrip, setLockedTrip } = useGlobe()

  useEffect(() => {
    if (lockedTrip !== tripId) setLockedTrip(tripId)
  }, [tripId, lockedTrip, setLockedTrip])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full overflow-y-auto"
    >
      {children}
    </motion.div>
  )
}
