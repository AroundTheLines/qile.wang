'use client'

import { Skeleton } from 'boneyard-js/react'
import PanelChrome from './PanelChrome'
import VisitSection from './VisitSection'
import { useGlobePin } from '../GlobeContext'
import type { PinWithVisits } from '@/lib/types'

interface Props {
  pin: PinWithVisits
}

export default function PinPanel({ pin }: Props) {
  const { selectPin } = useGlobePin()

  const subtitle =
    pin.visits.length > 1 ? `${pin.visits.length} visits` : undefined

  return (
    <Skeleton name="pin-panel-multi" loading={false} fixture={<PinPanelFixture />}>
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

export function PinPanelFixture() {
  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      <div className="p-4 pb-2 border-b border-gray-100 dark:border-gray-900">
        <h2 className="text-sm tracking-widest uppercase font-light">Location name</h2>
        <span className="text-[10px] tracking-widest uppercase text-gray-400 block mt-0.5">2 visits</span>
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="border-b border-gray-100 dark:border-gray-900">
          <div className="px-4 py-3 flex items-baseline justify-between">
            <div>
              <p className="text-xs tracking-widest uppercase">June 2024</p>
              <p className="text-[10px] text-gray-400">Trip name</p>
            </div>
            <div className="text-[10px] uppercase border border-black dark:border-white px-2 py-1">View trip article</div>
          </div>
          <div className="px-4 py-2 text-[10px] uppercase text-gray-500">8 items</div>
        </div>
      ))}
    </div>
  )
}
