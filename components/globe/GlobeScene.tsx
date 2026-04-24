'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'
import { computeFitCamera, GLOBE_RADIUS, sphericalToCartesian } from '@/lib/globe'
import type { Coordinates } from '@/lib/types'
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
// Camera vertical FOV (degrees). Must match the Canvas prop in
// GlobeCanvas.tsx. Threaded through the trip-fit distances below.
const CAMERA_FOV_DEG = 45

// Target viewport fractions for the trip-fit animation endpoints,
// expressed as `globe vertical angular diameter / camera vertical FOV`.
// Values > 1 mean the globe intentionally overflows the viewport
// (tight-cluster close-up feel). Both distances are derived from these
// fractions so they stay coupled to the camera FOV and globe radius.
const TRIP_FIT_MIN_VIEWPORT_FRAC = 1.25 // tight clusters overflow by ~25%
const TRIP_FIT_MAX_VIEWPORT_FRAC = 0.6 // hemisphere-spread trips at ~60%

/** distance(viewport_fraction) — inverse of `2·asin(R/D) / FOV`. */
function distanceForViewportFraction(fraction: number): number {
  const halfAngle = (fraction * CAMERA_FOV_DEG * Math.PI) / 360
  return GLOBE_RADIUS / Math.sin(halfAngle)
}

// Closest the trip-fit animation will land (tight clusters like Japan
// Spring '22). Kept above `OrbitControls minDistance = 4` so the fit
// doesn't collide with the user-zoom floor — asserted below.
const TRIP_FIT_MIN_DISTANCE = distanceForViewportFraction(TRIP_FIT_MIN_VIEWPORT_FRAC)
// Farthest the trip-fit animation will land (globe-spanning trips).
// See §16 Q4 — originally spec'd as ~40% visible, bumped to 60% after
// the RTW visual review (the globe read as too small).
const TRIP_FIT_MAX_DISTANCE = distanceForViewportFraction(TRIP_FIT_MAX_VIEWPORT_FRAC)

// Cinematic rotate-to-fit duration for trip lock (§17.3). Nudged up
// from the spec's 800ms after PR review flagged trip-to-trip transitions
// as "whiplash-y" — the longer runway softens the mid-animation peak
// velocity without changing the ease curve.
const TRIP_FIT_DURATION = 1.1

const FIT_CAMERA_OPTS = {
  globeRadius: GLOBE_RADIUS,
  minDistance: TRIP_FIT_MIN_DISTANCE,
  maxDistance: TRIP_FIT_MAX_DISTANCE,
} as const

type RotateState = {
  active: boolean
  elapsed: number
  startPos: THREE.Vector3
  endPos: THREE.Vector3
}

export default function GlobeScene() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const {
    pins,
    selectedPin,
    lockedTrip,
    layoutState,
    isMobile,
    activeTripSlug,
    tripsWithVisits,
    addPauseReason,
    removePauseReason,
  } = useGlobe()
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

  // Rotate-to-fit for locked trips (C5). Separate ref from rotateRef so
  // pin-click and trip-lock can both be in-flight without clobbering each
  // other's bookkeeping — the useFrame tick runs both; later write wins.
  const rotateToFitTripRef = useRef<RotateState & { duration: number }>({
    active: false,
    elapsed: 0,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    duration: TRIP_FIT_DURATION,
  })
  const prevLockedTripRef = useRef<string | null>(null)
  const pendingTripFit = useRef(false)
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

  // Keep `tripsWithVisits` in a ref so resolver identity (and the effects
  // that depend on it) don't re-fire when the layout re-renders with a new
  // array reference but equivalent data — which would otherwise re-trigger
  // the article-open zoom mid-view.
  const tripsWithVisitsRef = useRef(tripsWithVisits)
  useEffect(() => {
    tripsWithVisitsRef.current = tripsWithVisits
  }, [tripsWithVisits])

  // Resolve the pin to zoom to for the currently open article. Pin articles
  // use the currently selected pin; trip articles (§8.1) target the first
  // (earliest) visit of the trip.
  const resolveArticleZoomPinId = useCallback((): string | null => {
    if (selectedPin) return selectedPin
    if (activeTripSlug) {
      const trip = tripsWithVisitsRef.current.find((t) => t.slug.current === activeTripSlug)
      if (trip && trip.visits.length > 0) return trip.visits[0].location._id
    }
    return null
  }, [selectedPin, activeTripSlug])

  // Article open/close → drive a camera zoom animation and disable controls.
  useEffect(() => {
    const prev = prevLayoutState.current
    prevLayoutState.current = layoutState

    if (layoutState === 'article-open' && prev !== 'article-open') {
      const zoomPin = resolveArticleZoomPinId()
      if (!entranceDone.current || !zoomPin) {
        pendingArticleZoom.current = true
        return
      }
      startArticleZoom(zoomPin)
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
  }, [layoutState, camera, startArticleZoom, resolveArticleZoomPinId])

  // When selectedPin / trip data resolves after a deep-link, trigger the pending zoom.
  useEffect(() => {
    if (!pendingArticleZoom.current) return
    if (!entranceDone.current) return
    if (layoutState !== 'article-open') return
    const zoomPin = resolveArticleZoomPinId()
    if (!zoomPin) return
    pendingArticleZoom.current = false
    startArticleZoom(zoomPin)
  }, [selectedPin, activeTripSlug, tripsWithVisits, layoutState, startArticleZoom, resolveArticleZoomPinId])

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
    // C5/C7: if this pin belongs to the locked trip, skip pin-rotate.
    // The trip-fit framing stays in place; C7 owns the panel-scroll
    // behavior for in-trip pin clicks.
    if (lockedTrip && pin.tripIds.includes(lockedTrip)) return

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
  }, [selectedPin, pins, camera, lockedTrip])

  // Kick off the fit animation for a given lockedTrip id. Shared between
  // the `useEffect` driven by `lockedTrip` changes and the entrance-done
  // consumer in `useFrame` (cold `?trip=` URL). Caller is responsible for
  // the guards (entranceDone, layoutState) — this helper only does the
  // coord-collection and animation bookkeeping.
  const kickOffTripFit = useCallback(
    (tripId: string) => {
      const coords: Coordinates[] = []
      for (const p of pins) {
        for (const v of p.visits) {
          if (v.trip._id === tripId) {
            coords.push(p.coordinates)
            break
          }
        }
      }
      if (coords.length === 0) return
      prevLockedTripRef.current = tripId
      const fit = computeFitCamera(coords, FIT_CAMERA_OPTS)
      rotateToFitTripRef.current = {
        active: true,
        elapsed: 0,
        startPos: camera.position.clone(),
        endPos: new THREE.Vector3(fit.x, fit.y, fit.z),
        duration: TRIP_FIT_DURATION,
      }
      // Don't touch `autoRotate` — the OrbitControls prop is already
      // gated on `layoutState === 'default'`, so lock suppresses rotation
      // without needing an explicit disable. Mirrors the pin-rotate path,
      // so deselecting a trip returns to passive spin just like a pin.
      setControlsEnabled(false)
    },
    [pins, camera],
  )

  // C5: rotate-to-fit when a trip locks. Runs when lockedTrip changes to a
  // new non-null id. Pulls visit coordinates from the already-hydrated pins
  // list — if pins haven't arrived yet, the effect re-fires once they do.
  useEffect(() => {
    const prev = prevLockedTripRef.current
    if (!lockedTrip) {
      prevLockedTripRef.current = null
      return
    }
    if (prev === lockedTrip) return
    if (!entranceDone.current) {
      // Cold `?trip=…` URL: defer until entrance finishes. Mark pending
      // but keep prevRef stale so this effect re-fires once state settles.
      pendingTripFit.current = true
      return
    }
    // Article-open owns its own camera state — don't stomp it. We
    // intentionally do NOT update prevLockedTripRef here so that when
    // the article later closes, a re-fire of this effect still sees
    // `prev !== lockedTrip` and lands the fit.
    if (layoutState === 'article-open') return
    kickOffTripFit(lockedTrip)
  }, [lockedTrip, layoutState, kickOffTripFit])

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
        if (pendingArticleZoom.current && layoutState === 'article-open') {
          const zoomPin = resolveArticleZoomPinId()
          if (zoomPin) {
            pendingArticleZoom.current = false
            startArticleZoom(zoomPin)
          }
        }
        if (pendingTripFit.current && lockedTrip && layoutState !== 'article-open') {
          pendingTripFit.current = false
          kickOffTripFit(lockedTrip)
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

    // 3) Trip rotate-to-fit (C5) — cinematic ease-in-out, 800ms.
    const tripFit = rotateToFitTripRef.current
    if (tripFit.active) {
      tripFit.elapsed += delta
      const t = Math.min(tripFit.elapsed / tripFit.duration, 1)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      camera.position.lerpVectors(tripFit.startPos, tripFit.endPos, eased)
      camera.lookAt(0, 0, 0)

      if (t >= 1) {
        tripFit.active = false
        // Re-enable controls so the user can drag-to-take-over (§9.3).
        // We don't snap back on release — OrbitControls just owns the
        // camera from here until the trip unlocks or another lock fires.
        if (layoutState !== 'article-open') setControlsEnabled(true)
        if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0)
          controlsRef.current.update()
        }
      }
    }

    // 4) Article zoom (in / out)
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
      // §5.5: clicking-and-dragging the globe pauses playback. OrbitControls
      // `start` fires for both drag and zoom; we pause on either — cheap
      // simplification (documented as a minor deviation from spec drag-only).
      addPauseReason('globe-drag')
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current)
    }
    const handleEnd = () => {
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current)
      // Release the playback pause immediately so the provider's idle-resume
      // timer (IDLE_RESUME_MS) runs from the moment interaction ends. Passive
      // spin has its own AUTO_ROTATE_RESUME_DELAY — the two resume delays are
      // independent but similar enough that they land close together.
      removePauseReason('globe-drag')
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
      // Defense: if the component unmounts mid-drag, release the reason.
      removePauseReason('globe-drag')
    }
  }, [controlsEnabled, addPauseReason, removePauseReason])

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enabled={controlsEnabled}
        enablePan={false}
        enableZoom={true}
        minDistance={4}
        // Deliberately looser than TRIP_FIT_MAX_DISTANCE so the user can
        // wheel-zoom out past the trip-fit cap during an unlocked session.
        maxDistance={13}
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
