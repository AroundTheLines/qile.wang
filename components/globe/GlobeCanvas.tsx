'use client'

import { useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import GlobeScene from './GlobeScene'
import GlobeMesh from './GlobeMesh'
import GlobePins from './GlobePins'
import TripArcs from './TripArcs'
import GlobePositionBridge from './GlobePositionBridge'
import { useGlobe } from './GlobeContext'

const DRAG_THRESHOLD = 5

export default function GlobeCanvas({
  dragDistanceRef,
}: {
  dragDistanceRef: React.MutableRefObject<number>
}) {
  const { selectPin, selectedPin, layoutState, closeArticle } = useGlobe()

  const handleMissed = useCallback(() => {
    // Cumulative drag distance since pointerdown; accumulated by the parent
    // viewport's onPointerMove. If the user dragged the globe at all, treat
    // the pointerup as part of that gesture rather than a click-to-close.
    if (dragDistanceRef.current >= DRAG_THRESHOLD) return
    // Collapse one overlay step per empty-globe click: article-open → panel-open,
    // panel-open → default. Pin clicks never reach here because the pin mesh
    // claims the raycast hit.
    if (layoutState === 'article-open') {
      closeArticle()
    } else if (selectedPin) {
      selectPin(null)
    }
  }, [selectedPin, selectPin, layoutState, closeArticle, dragDistanceRef])

  return (
    <div className="w-full h-full" style={{ touchAction: 'none' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        onPointerMissed={handleMissed}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <GlobeScene />
        <GlobeMesh />
        <GlobePins />
        <TripArcs />
        <GlobePositionBridge />
      </Canvas>
    </div>
  )
}
