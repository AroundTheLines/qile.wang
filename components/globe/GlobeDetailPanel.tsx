'use client'

import { useGlobe } from './GlobeContext'
import GlobeDetailItem from './GlobeDetailItem'
import type { GlobePin } from '@/lib/globe'

export default function GlobeDetailPanel({ pin }: { pin: GlobePin }) {
  const { selectPin } = useGlobe()

  return (
    <div className="bg-white border-l border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div>
          <h2 className="text-sm tracking-widest uppercase font-light text-black">
            {pin.group}
          </h2>
          <span className="text-[10px] tracking-widest uppercase text-gray-400">
            {pin.items.length} {pin.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <button
          onClick={() => selectPin(null)}
          className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-black transition-colors text-lg cursor-pointer"
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>

      {/* Item list — scrollable */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        {pin.items.map((item) => (
          <GlobeDetailItem key={item._id} item={item} />
        ))}
      </div>
    </div>
  )
}
