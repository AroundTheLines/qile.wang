'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()
  const label = pathname.startsWith('/feed') ? 'Feed' : ''

  return (
    // CSS grid with 3 equal columns guarantees the middle cell is
    // mathematically centred regardless of sibling content width.
    <header className="fixed top-0 left-0 right-0 z-50 grid grid-cols-3 items-center h-12 px-6">
      <Link
        href="/"
        className="text-[10px] tracking-[0.2em] uppercase text-gray-400 hover:text-black transition-colors justify-self-start"
      >
        ← Home
      </Link>

      {label && (
        <span className="text-[10px] tracking-[0.2em] uppercase text-gray-300 text-center">
          {label}
        </span>
      )}

      {/* Right slot — reserved for Phase 4 hero-to-navbar icon */}
      <div className="justify-self-end w-16" />
    </header>
  )
}
