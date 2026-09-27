// Browsers without the Fullscreen API (e.g. iPhone Safari) are treated as always fullscreen.
const supported = () => typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'

export const isFullscreen = () => !supported() || document.fullscreenElement !== null

export function enterFullscreen() {
  if (supported() && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
}

export function exitFullscreen() {
  if (supported() && document.fullscreenElement) document.exitFullscreen().catch(() => {})
}

export function subscribeFullscreen(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}
