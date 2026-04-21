'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'
import { sphericalToCartesian } from '@/lib/globe'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

const ENTRANCE_DURATION = 0.75
// Camera resting distance. Bumped from 5 → 6.5 so the globe occupies a
// more editorial ~55% of the viewport height instead of filling it.
const RESTING_DISTANCE = 6.5
const FAR_DISTANCE = 15
const AUTO_ROTATE_RESUME_DELAY = 2000
const PIN_ROTATE_DURATION = 0.3
const ARTICLE_ZOOM_DURATION = 0.4
// When zoomed for article-open, pull camera closer than resting.
const ARTICLE_CAMERA_DISTANCE = 4.2

type RotateState = {
  active: boolean
  elapsed: number
  startPos: THREE.Vector3
  endPos: THREE.Vector3
}

export default function GlobeScene() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { pins, selectedPin, layoutState, isMobile } = useGlobe()
  const { camera } = useThree()

  // Reactive enabled state — avoids the "React re-renders and reapplies
  // enabled={false}" bug that imperative `controls.enabled = true` had.
  const [controlsEnabled, setControlsEnabled] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)

  // Entrance
  const entranceDone = useRef(false)
  const entranceElapsed = useRef(0)
  const targetDir = useRef(new THREE.Vector3(0, 0, 1))

  // Pin-switch rotation
  const rotateRef = useRef<RotateState>({
    active: false,
    elapsed: 0,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
  })

  // Article zoom state — animates camera into / out of the pinned sliver view.
  const articleZoomRef = useRef<RotateState & { duration: number }>({
    active: false,
    elapsed: 0,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    duration: ARTICLE_ZOOM_DURATION,
  })
  const preArticleCameraPos = useRef<THREE.Vector3 | null>(null)
  // Init to 'default' so a mount directly in article-open still detects
  // the transition and queues the zoom.
  const prevLayoutState = useRef<'default' | 'panel-open' | 'article-open'>(
    'default',
  )

  const prevSelectedPin = useRef<string | null>(null)
  const interactionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Compute entrance target based on most recent pin
  useEffect(() => {
    if (pins.length > 0) {
      const mostRecent = pins[0] // sorted latestDate desc
      const [x, y, z] = sphericalToCartesian(
        mostRecent.coordinates.lat,
        mostRecent.coordinates.lng,
        1,
      )
      targetDir.current.set(x, y, z).normalize()
    } else {
      const [x, y, z] = sphericalToCartesian(20, 0, 1)
      targetDir.current.set(x, y, z).normalize()
    }
    camera.position.copy(targetDir.current).multiplyScalar(FAR_DISTANCE)
    camera.lookAt(0, 0, 0)
  }, [pins, camera])

  const startArticleZoom = useCallback(
    (pinId: string) => {
      const pin = pins.find((p) => p.location._id === pinId)
      if (!pin) return

      preArticleCameraPos.current = camera.position.clone()

      const [x, y, z] = sphericalToCartesian(
        pin.coordinates.lat,
        pin.coordinates.lng,
        1,
      )
      // Camera sits along the pin's outward normal and looks at the globe
      // origin, so the pin projects to the canvas center on both axes.
      // Mobile: the wrapper translates that canvas-center into the visible
      // sliver. Desktop: the wrapper shrinks to the left sliver, so the
      // canvas center IS the sliver center — pin is centered horizontally.
      const distance = isMobile ? RESTING_DISTANCE : ARTICLE_CAMERA_DISTANCE
      const endPos = new THREE.Vector3(x, y, z).setLength(distance)

      articleZoomRef.current = {
        active: true,
        elapsed: 0,
        startPos: camera.position.clone(),
        endPos,
        duration: ARTICLE_ZOOM_DURATION,
      }
      setAutoRotate(false)
      setControlsEnabled(false)
    },
    [pins, camera, isMobile],
  )

  const pendingArticleZoom = useRef(false)

  // Article open/close → drive a camera zoom animation and disable controls.
  useEffect(() => {
    const prev = prevLayoutState.current
    prevLayoutState.current = layoutState

    if (layoutState === 'article-open' && prev !== 'article-open') {
      if (!entranceDone.current || !selectedPin) {
        pendingArticleZoom.current = true
        return
      }
      startArticleZoom(selectedPin)
      return
    }

    if (prev === 'article-open' && layoutState !== 'article-open') {
      pendingArticleZoom.current = false
      const saved = preArticleCameraPos.current
      if (!saved) return
      articleZoomRef.current = {
        active: true,
        elapsed: 0,
        startPos: camera.position.clone(),
        endPos: saved.clone(),
        duration: ARTICLE_ZOOM_DURATION,
      }
      preArticleCameraPos.current = null
    }
  }, [layoutState, selectedPin, camera, startArticleZoom])

  // When selectedPin resolves after a deep-link, trigger the pending zoom.
  useEffect(() => {
    if (!pendingArticleZoom.current) return
    if (!entranceDone.current) return
    if (layoutState !== 'article-open' || !selectedPin) return
    pendingArticleZoom.current = false
    startArticleZoom(selectedPin)
  }, [selectedPin, layoutState, startArticleZoom])

  // On any pin selection (initial click OR switch between pins), rotate
  // the camera so the pin sits at the center of the canvas. With the
  // panel-open transform shifting the globe wrapper, "centered in canvas"
  // == "centered in the visible globe region next to the panel/sidecar."
  // This applies on both desktop and mobile: the panel reduces visible
  // real estate, so centering the pin is what makes the connection legible.
  useEffect(() => {
    const prev = prevSelectedPin.current
    prevSelectedPin.current = selectedPin

    if (!selectedPin || prev === selectedPin) return
    if (!entranceDone.current) return

    const pin = pins.find((p) => p.location._id === selectedPin)
    if (!pin) return

    const [x, y, z] = sphericalToCartesian(
      pin.coordinates.lat,
      pin.coordinates.lng,
      1,
    )
    const dist = camera.position.length()
    const endPos = new THREE.Vector3(x, y, z).normalize().multiplyScalar(dist)

    rotateRef.current = {
      active: true,
      elapsed: 0,
      startPos: camera.position.clone(),
      endPos,
    }
    // Disable controls during programmatic rotation
    setControlsEnabled(false)
  }, [selectedPin, pins, camera])

  // Single useFrame driving entrance + programmatic rotation
  useFrame((_, delta) => {
    // 1) Entrance animation
    if (!entranceDone.current) {
      entranceElapsed.current += delta
      const t = Math.min(entranceElapsed.current / ENTRANCE_DURATION, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const dist = FAR_DISTANCE + (RESTING_DISTANCE - FAR_DISTANCE) * eased
      const dir = targetDir.current.clone()
      camera.position.copy(dir.multiplyScalar(dist))
      camera.lookAt(0, 0, 0)

      if (t >= 1) {
        entranceDone.current = true
        setControlsEnabled(true)
        setTimeout(() => setAutoRotate(true), 500)
        if (pendingArticleZoom.current && layoutState === 'article-open' && selectedPin) {
          pendingArticleZoom.current = false
          startArticleZoom(selectedPin)
        }
      }
      return
    }

    // 2) Pin-switch programmatic rotation
    const rot = rotateRef.current
    if (rot.active) {
      rot.elapsed += delta
      const t = Math.min(rot.elapsed / PIN_ROTATE_DURATION, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      camera.position.lerpVectors(rot.startPos, rot.endPos, eased)
      camera.lookAt(0, 0, 0)

      if (t >= 1) {
        rot.active = false
        // Only re-enable controls if we're not in article-open.
        if (layoutState !== 'article-open') setControlsEnabled(true)
        if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0)
          controlsRef.current.update()
        }
      }
    }

    // 3) Article zoom (in / out)
    const zoom = articleZoomRef.current
    if (zoom.active) {
      zoom.elapsed += delta
      const t = Math.min(zoom.elapsed / zoom.duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      camera.position.lerpVectors(zoom.startPos, zoom.endPos, eased)
      camera.lookAt(0, 0, 0)

      if (t >= 1) {
        zoom.active = false
        if (layoutState === 'article-open') {
          setControlsEnabled(false)
        } else {
          setControlsEnabled(true)
          if (controlsRef.current) {
            controlsRef.current.target.set(0, 0, 0)
            controlsRef.current.update()
          }
        }
      }
    }
  })

  // Auto-rotate resume behavior tied to OrbitControls interaction events
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const handleStart = () => {
      setAutoRotate(false)
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current)
    }
    const handleEnd = () => {
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current)
      interactionTimeout.current = setTimeout(
        () => setAutoRotate(true),
        AUTO_ROTATE_RESUME_DELAY,
      )
    }

    controls.addEventListener('start', handleStart)
    controls.addEventListener('end', handleEnd)
    return () => {
      controls.removeEventListener('start', handleStart)
      controls.removeEventListener('end', handleEnd)
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current)
    }
  }, [controlsEnabled])

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enabled={controlsEnabled}
        enablePan={false}
        enableZoom={true}
        minDistance={4}
        maxDistance={11}
        enableDamping={true}
        dampingFactor={0.05}
        rotateSpeed={0.5}
        // Auto-rotate only in the default (no-panel) state. If a pin is
        // selected, auto-rotation would drift the pin across the globe and
        // eventually to the back face — where the connector line fades to
        // opacity 0 along with the dot, making the "line to the panel"
        // silently disappear while the panel itself stays open. Keep the
        // view anchored while any panel is open.
        autoRotate={
          layoutState === 'default' && autoRotate && controlsEnabled
        }
        autoRotateSpeed={0.3}
      />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={0.9} />
    </>
  )
}
