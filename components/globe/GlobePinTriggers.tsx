'use client'

import { useGlobe } from './GlobeContext'

/**
 * Screen-reader-accessible list of "open panel for {location}" buttons,
 * one per pin. Visually hidden via `sr-only` but focusable by keyboard
 * and clickable via DOM selectors.
 *
 * Two purposes:
 * 1. **Accessibility**: pins live inside a WebGL canvas and are not
 *    reachable without a pointer. This list gives keyboard + AT users
 *    a way to open the pin panel.
 * 2. **Headless testability**: Preview tooling can click a pin by
 *    `[data-pin-trigger="<locationId>"]` without synthesising pointer
 *    events against the R3F raycaster (which doesn't respond to
 *    `dispatchEvent`).
 *
 * TODO: focus management — after activation, focus stays on the trigger.
 * For AT parity with native pin-click we may want to move focus to the
 * panel's close button (or first focusable) once the panel opens. Defer
 * to the A11y polish pass (F-series).
 */
export default function GlobePinTriggers() {
  const { pins, selectPin } = useGlobe()

  if (pins.length === 0) return null

  return (
    <ul className="sr-only" aria-label="Pin locations">
      {pins.map((pin) => (
        <li key={pin.location._id}>
          <button
            type="button"
            data-pin-trigger={pin.location._id}
            data-pin-name={pin.location.name}
            onClick={() => selectPin(pin.location._id)}
          >
            Open panel for {pin.location.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
