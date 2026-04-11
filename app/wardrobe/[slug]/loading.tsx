'use client'

import { Skeleton } from 'boneyard-js/react'

export default function Loading() {
  return (
    <div className="w-full mt-20">
      <Skeleton name="article-content" loading={true} animate="shimmer">{null}</Skeleton>
    </div>
  )
}
