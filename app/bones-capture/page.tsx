'use client'

// Capture-only page used by `npx boneyard-js build`. Renders each
// Skeleton surface standalone so the CLI can snapshot bones for names
// that only mount behind user interaction at runtime (e.g. PinPanel
// requires a pin click). Not linked from the app. Safe to leave in
// production — it's static markup with no data deps.

import { Skeleton } from 'boneyard-js/react'
import { PinPanelFixture } from '@/components/globe/panels/PinPanel'
import { TripPanelFixture } from '@/components/globe/panels/TripPanel'

export default function BonesCapturePage() {
  return (
    <main className="min-h-screen bg-white dark:bg-black flex flex-col gap-8 p-8">
      <section className="max-w-md w-full h-[600px]">
        <Skeleton name="pin-panel-multi" loading={false} fixture={<PinPanelFixture />}>
          <PinPanelFixture />
        </Skeleton>
      </section>
      <section className="max-w-md w-full h-[600px]">
        <Skeleton name="trip-panel" loading={false} fixture={<TripPanelFixture />}>
          <TripPanelFixture />
        </Skeleton>
      </section>
    </main>
  )
}
