'use client'

import type { CompressedMap } from '@/lib/timelineCompression'

interface Props {
  compressed: CompressedMap
  containerWidth: number
  leftOffset: number
}

export default function TimelineAxis({ compressed, containerWidth, leftOffset }: Props) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ paddingLeft: leftOffset, paddingRight: leftOffset }}
    >
      {compressed.tickMarks.map((tick) => (
        <span
          key={`${tick.kind}-${tick.date}`}
          className={`absolute top-0 -translate-x-1/2 ${
            tick.kind === 'year'
              ? 'text-[9px] tracking-widest uppercase text-black/40 dark:text-white/40'
              : 'text-[8px] text-black/25 dark:text-white/25'
          }`}
          style={{ left: tick.x * containerWidth }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  )
}
