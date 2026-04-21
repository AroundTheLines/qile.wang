'use client'

import { Skeleton } from 'boneyard-js/react'
import PanelChrome from './PanelChrome'
import VisitSection from './VisitSection'
import { useGlobe } from '../GlobeContext'
import type { PinWithVisits } from '@/lib/types'

interface Props {
  pin: PinWithVisits
}

export default function PinPanel({ pin }: Props) {
  const { selectPin } = useGlobe()

  const subtitle =
    pin.visits.length > 1 ? `${pin.visits.length} visits` : undefined

  return (
    <Skeleton name="pin-panel-multi" loading={false}>
      <PanelChrome
        title={pin.location.name}
        subtitle={subtitle}
        onClose={() => selectPin(null)}
      >
        {pin.visits.map((visit) => (
          <VisitSection
            key={visit._id}
            visit={visit}
            showViewTripArticleLink
            sticky
          />
        ))}
      </PanelChrome>
    </Skeleton>
  )
}
