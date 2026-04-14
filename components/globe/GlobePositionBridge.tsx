'use client'

import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'
import { sphericalToCartesian } from '@/lib/globe'

const GLOBE_RADIUS = 2

export default function GlobePositionBridge() {
  const { camera, size } = useThree()
  const { pins, pinPositionRef } = useGlobe()

  useFrame(() => {
    const positions: Record<string, { x: number; y: number; visible: boolean }> = {}
    const vec = new THREE.Vector3()

    for (const pin of pins) {
      const [x, y, z] = sphericalToCartesian(
        pin.coordinates.lat,
        pin.coordinates.lng,
        GLOBE_RADIUS * 1.01,
      )
      vec.set(x, y, z)
      vec.project(camera)

      positions[pin.group] = {
        x: (vec.x * 0.5 + 0.5) * size.width,
        y: (-vec.y * 0.5 + 0.5) * size.height,
        visible: vec.z < 1,
      }
    }

    pinPositionRef.current = positions
  })

  return null
}
