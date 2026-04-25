'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TripNotFoundRedirect() {
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/globe')
    }, 1500)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="w-full px-6 pt-0 pb-16 max-w-xl mx-auto">
      <p className="text-sm text-gray-400 dark:text-gray-500">Trip not found.</p>
    </div>
  )
}
