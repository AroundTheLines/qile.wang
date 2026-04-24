'use client'

import { useGlobeData, useGlobePin, useGlobeTrip, useGlobeUI } from './GlobeContext'
import MobileTripList from './MobileTripList'
import MobileNavChrome from './MobileNavChrome'
import PinPanel from './panels/PinPanel'
import TripPanel from './panels/TripPanel'

export default function MobileContentRegion() {
  const { pins, tripsWithVisits } = useGlobeData()
  const { selectedPin } = useGlobePin()
  const { lockedTrip } = useGlobeTrip()
  const { panelVariant } = useGlobeUI()

  if (!panelVariant) {
    return <MobileTripList />
  }

  const pin =
    panelVariant === 'pin' && selectedPin
      ? pins.find((p) => p.location._id === selectedPin)
      : null
  const trip =
    panelVariant === 'trip' && lockedTrip
      ? tripsWithVisits.find((t) => t._id === lockedTrip)
      : null

  return (
    <div className="w-full border-t border-gray-100 dark:border-gray-900">
      <MobileNavChrome mode="back" />
      {pin && <PinPanel pin={pin} />}
      {trip && <TripPanel trip={trip} />}
    </div>
  )
}
