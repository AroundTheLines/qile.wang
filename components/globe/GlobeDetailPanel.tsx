'use client'

import { useGlobe } from './GlobeContext'
import PinPanel from './panels/PinPanel'

export default function GlobeDetailPanel() {
  const { panelVariant, pins, selectedPin, lockedTrip } = useGlobe()

  if (panelVariant === 'pin' && selectedPin) {
    const pin = pins.find((p) => p.location._id === selectedPin)
    if (!pin) return null
    return <PinPanel pin={pin} />
  }

  if (panelVariant === 'trip' && lockedTrip) {
    // TripPanel lands in C4.
    return (
      <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full p-4 text-xs tracking-widest uppercase text-gray-400">
        Trip panel pending (C4)
      </div>
    )
  }

  return null
}
