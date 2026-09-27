'use client'

import { useSyncExternalStore } from 'react'
import { THEME_KEY } from '@/lib/theme'

type Theme = 'system' | 'light' | 'dark'

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<Theme, string> = { system: 'Otomatis', light: 'Terang', dark: 'Gelap' }

const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const read = (): Theme => {
  const t = document.documentElement.dataset.theme
  return t === 'light' || t === 'dark' ? t : 'system'
}

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {}
  listeners.forEach((l) => l())
}

// Cycles Otomatis (follow device) → Terang → Gelap. `compact` shows only the icon.
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme)
  return (
    <button
      type="button"
      onClick={() => apply(NEXT[theme])}
      aria-label={`Tema: ${LABEL[theme]}. Ketuk untuk ganti.`}
      title={`Tema: ${LABEL[theme]}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-xs"
    >
      <Icon theme={theme} />
      {!compact && LABEL[theme]}
    </button>
  )
}

function Icon({ theme }: { theme: Theme }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true }
  if (theme === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (theme === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}
