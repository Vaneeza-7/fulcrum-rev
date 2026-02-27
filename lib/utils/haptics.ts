/**
 * Haptic feedback utility using the Web Vibration API.
 * Safe to call on iOS/Android in browsers that support navigator.vibrate.
 * No-ops silently on desktop or unsupported browsers.
 *
 * Vibration patterns are in milliseconds: [vibrate, pause, vibrate, ...]
 */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return
  if (!navigator.vibrate) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Silently fail if vibration is not permitted
  }
}

/** Strong double pulse — used for swipe-right (approve) */
export function hapticApprove(): void {
  vibrate([60, 40, 60])
}

/** Sharp single buzz — used for swipe-left (reject) */
export function hapticReject(): void {
  vibrate([100])
}

/** Light single tap — used for chip selection */
export function hapticTap(): void {
  vibrate([30])
}
