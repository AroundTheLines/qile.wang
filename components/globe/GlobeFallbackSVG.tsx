'use client'

export default function GlobeFallbackSVG() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        fill="none"
        className="opacity-20 text-black dark:text-white"
      >
        {/* Outer circle */}
        <circle cx="140" cy="140" r="130" stroke="currentColor" strokeWidth="1" />
        {/* Equator */}
        <ellipse cx="140" cy="140" rx="130" ry="30" stroke="currentColor" strokeWidth="0.5" />
        {/* Latitude lines */}
        <ellipse cx="140" cy="90" rx="110" ry="22" stroke="currentColor" strokeWidth="0.3" />
        <ellipse cx="140" cy="190" rx="110" ry="22" stroke="currentColor" strokeWidth="0.3" />
        {/* Meridian */}
        <ellipse cx="140" cy="140" rx="30" ry="130" stroke="currentColor" strokeWidth="0.5" />
        {/* Secondary meridian */}
        <ellipse cx="140" cy="140" rx="90" ry="130" stroke="currentColor" strokeWidth="0.3" />
      </svg>
    </div>
  )
}
