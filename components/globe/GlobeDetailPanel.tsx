'use client'

import { useGlobe } from './GlobeContext'
import PinPanel from './panels/PinPanel'

export default function GlobeDetailPanel() {
  const { panelVariant, pins, selectedPin } = useGlobe()

  if (panelVariant === 'pin' && selectedPin) {
    const pin = pins.find((p) => p.location._id === selectedPin)
    if (!pin) return null
    return <PinPanel pin={pin} />
  }

  // panelVariant === 'trip' → TripPanel lands in C4.
  return null
}
