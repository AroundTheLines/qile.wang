'use client'

import { useRouter } from 'next/navigation'
import { useGlobePin, useGlobeTrip, useGlobeRoute, useGlobeUI } from './GlobeContext'

interface Props {
  mode: 'back' | 'close'
}

export default function MobileNavChrome({ mode }: Props) {
  const { selectPin } = useGlobePin()
  const { setLockedTrip } = useGlobeTrip()
  const { closeArticle } = useGlobeRoute()
  const { layoutState } = useGlobeUI()
  const router = useRouter()

  const onClick = () => {
    if (layoutState === 'article-open') {
      closeArticle()
      return
    }
    selectPin(null)
    setLockedTrip(null)
    router.push('/globe', { scroll: false })
  }

  const symbol = mode === 'close' ? '\u00d7' : '\u2190'
  const label = mode === 'close' ? 'Close' : 'Back'

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex items-center gap-2 px-4 py-3 w-full text-left text-xs tracking-widest uppercase bg-white dark:bg-black border-b border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
      data-no-skeleton
    >
      <span aria-hidden className="text-base leading-none">
        {symbol}
      </span>
      {label}
    </button>
  )
}
