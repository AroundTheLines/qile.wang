'use client'

import { useRef, useEffect, useState } from 'react'
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

type RotateState = {
  active: boolean
  elapsed: number
  startPos: THREE.Vector3
  endPos: THREE.Vector3
}

export default function GlobeScene() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { pins, selectedPin, pinPositionRef } = useGlobe()
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

  // Detect pin switch to a back-face pin → programmatic rotation
  useEffect(() => {
    const prev = prevSelectedPin.current
    prevSelectedPin.current = selectedPin

    if (!selectedPin || !prev || prev === selectedPin) return
    if (!entranceDone.current) return

    const pos = pinPositionRef.current[selectedPin]
    // If pin is currently visible on front face, no rotation needed
    if (pos?.visible) return

    const pin = pins.find((p) => p.group === selectedPin)
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
  }, [selectedPin, pins, pinPositionRef, camera])

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
        setControlsEnabled(true)
        if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0)
          controlsRef.current.update()
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
        autoRotate={autoRotate && !selectedPin && controlsEnabled}
        autoRotateSpeed={0.3}
      />
      <ambientLight intensity={1} />
    </>
  )
}
