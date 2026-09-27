// Loading feedback for buttons and links. The spinner only appears after a short delay
// (.pending-* in globals.css), so fast actions don't flicker; the button is disabled at once.

export function Spinner({ className = 'size-[1.2em]' }: Readonly<{ className?: string }>) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// Button content: while pending, the label is swapped for a centered spinner without changing
// the button's size. The button itself needs `relative`.
export function PendingLabel({ pending, children }: Readonly<{ pending: boolean; children: React.ReactNode }>) {
  return (
    <>
      <span className={pending ? 'pending-label' : undefined}>{children}</span>
      {pending && (
        <span className="pending-spinner absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </>
  )
}
