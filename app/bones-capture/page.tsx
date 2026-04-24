// Capture-only page used by `npx boneyard-js build`. Renders each
// Skeleton surface standalone so the CLI can snapshot bones for names
// that only mount behind user interaction at runtime (e.g. PinPanel
// requires a pin click). 404s in production — only reachable in dev.

import { notFound } from 'next/navigation'
import BonesCaptureClient from './BonesCaptureClient'

export const metadata = {
  title: 'Bones capture',
  robots: { index: false, follow: false },
}

export default function BonesCapturePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <BonesCaptureClient />
}
