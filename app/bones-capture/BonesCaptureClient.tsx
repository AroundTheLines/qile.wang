'use client'

import { Skeleton } from 'boneyard-js/react'
import { PinPanelFixture } from '@/components/globe/panels/PinPanel'
import { TripPanelFixture } from '@/components/globe/panels/TripPanel'

export default function BonesCaptureClient() {
  return (
    <main className="min-h-screen bg-white dark:bg-black flex flex-col gap-8 p-8">
      <section className="max-w-md w-full h-[600px]">
        <Skeleton name="pin-panel-multi" loading={false} fixture={<PinPanelFixture />}>
          {null}
        </Skeleton>
      </section>
      <section className="max-w-md w-full h-[600px]">
        <Skeleton name="trip-panel" loading={false} fixture={<TripPanelFixture />}>
          {null}
        </Skeleton>
      </section>
    </main>
  )
}
