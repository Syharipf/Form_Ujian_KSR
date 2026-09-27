'use client'

import { useEffect } from 'react'
import { isFullscreen } from '@/lib/fullscreen'

// One slip (switching apps) fires blur + visibilitychange + fullscreenchange together; count it once.
const DEBOUNCE_MS = 2000
// Split screen roughly halves the viewport; rotating the phone keeps the area about the same.
const MIN_AREA_RATIO = 0.6
const BLOCKED = ['contextmenu', 'copy', 'cut', 'selectstart', 'dragstart'] as const

export function useAntiCheat(active: boolean, onViolation: (type: string) => void) {
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    BLOCKED.forEach((t) => document.addEventListener(t, block))
    return () => BLOCKED.forEach((t) => document.removeEventListener(t, block))
  }, [])

  // Keep the screen on: a phone that auto-locks while someone reads a question would count as leaving.
  // The lock is dropped whenever the page is hidden, so take it again on return.
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    let done = false
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (done) l.release().catch(() => {})
          else lock = l
        },
        () => {},
      )
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    let last = 0
    let maxArea = window.innerWidth * window.innerHeight
    const report = (type: string) => {
      const now = Date.now()
      if (now - last < DEBOUNCE_MS) return
      last = now
      onViolation(type)
    }
    const listeners: [EventTarget, string, () => void][] = [
      [document, 'visibilitychange', () => document.visibilityState === 'hidden' && report('hidden')],
      [window, 'blur', () => report('blur')],
      [document, 'fullscreenchange', () => !isFullscreen() && report('fullscreen_exit')],
      [
        window,
        'resize',
        () => {
          const area = window.innerWidth * window.innerHeight
          if (isFullscreen()) maxArea = Math.max(maxArea, area)
          if (area < maxArea * MIN_AREA_RATIO) report('resize')
        },
      ],
    ]
    listeners.forEach(([target, type, fn]) => target.addEventListener(type, fn))
    return () => listeners.forEach(([target, type, fn]) => target.removeEventListener(type, fn))
  }, [active, onViolation])
}
