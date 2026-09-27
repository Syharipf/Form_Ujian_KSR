// Tiled name + NIM over the whole exam so a leaked photo identifies its source.
// Two tints: dark text on the light theme, light text on the dark theme, so it stays visible in both.
export default function Watermark({ text }: { text: string }) {
  const safe = text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const tile = (fill: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='140'>` +
        `<text x='20' y='80' transform='rotate(-25 130 70)' font-family='sans-serif' font-size='16' fill='${fill}'>${safe}</text></svg>`,
    )}")`
  return (
    <>
      <div aria-hidden className="watermark-light pointer-events-none fixed inset-0 z-40" style={{ backgroundImage: tile('rgba(15,23,42,0.12)') }} />
      <div
        aria-hidden
        className="watermark-dark pointer-events-none fixed inset-0 z-40"
        style={{ backgroundImage: tile('rgba(241,245,249,0.12)') }}
      />
    </>
  )
}
