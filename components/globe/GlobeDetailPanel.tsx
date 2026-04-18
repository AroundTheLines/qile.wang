'use client'

import { useGlobe } from './GlobeContext'
import GlobeDetailItem from './GlobeDetailItem'
import type { GlobePin } from '@/lib/globe'

export default function GlobeDetailPanel({ pin }: { pin: GlobePin }) {
  const { selectPin } = useGlobe()

  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div>
          <h2 className="text-sm tracking-widest uppercase font-light text-black dark:text-white">
            {pin.group}
          </h2>
          <span className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500">
            {pin.items.length} {pin.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <button
          onClick={() => selectPin(null)}
          className="w-12 h-12 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white transition-colors text-lg cursor-pointer"
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
