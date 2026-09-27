'use client'

export default function ConfirmButton({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
  return (
    <button className={className} onClick={(e) => !confirm(message) && e.preventDefault()}>
      {children}
    </button>
  )
}
