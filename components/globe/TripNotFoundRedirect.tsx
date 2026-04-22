/**
 * Stub for D1 — renders a simple "Trip not found" message. D3 will upgrade
 * this to include the 1.5s auto-redirect to /globe (at which point this file
 * must be re-marked `'use client'`).
 */
export default function TripNotFoundRedirect() {
  return (
    <div className="w-full px-6 pt-0 pb-16 max-w-xl mx-auto">
      <p className="text-sm text-gray-400 dark:text-gray-500">Trip not found.</p>
    </div>
  )
}
