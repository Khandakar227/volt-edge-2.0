import { useCallback, useEffect, useRef, type ReactNode } from "react"

/** Two-pane horizontal split with a draggable divider. When `fullscreen`,
 *  the right pane is hidden and the left fills the width. */
export function ResizableSplit({
  left,
  right,
  leftWidth,
  onLeftWidth,
  fullscreen,
  minLeft = 320,
  minRight = 360,
}: {
  left: ReactNode
  right: ReactNode
  leftWidth: number
  onLeftWidth: (w: number) => void
  fullscreen: boolean
  minLeft?: number
  minRight?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const next = e.clientX - rect.left
      const clamped = Math.max(minLeft, Math.min(next, rect.width - minRight))
      onLeftWidth(clamped)
    },
    [minLeft, minRight, onLeftWidth],
  )

  useEffect(() => {
    const stop = () => {
      dragging.current = false
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", stop)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", stop)
    }
  }, [onMove])

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <div
        className="h-full min-h-0"
        style={{ width: fullscreen ? "100%" : leftWidth, flexShrink: 0 }}
      >
        {left}
      </div>
      {!fullscreen && (
        <>
          <div
            onMouseDown={() => {
              dragging.current = true
              document.body.style.userSelect = "none"
              document.body.style.cursor = "col-resize"
            }}
            className="w-1 shrink-0 cursor-col-resize bg-[var(--border)] transition-colors hover:bg-[var(--accent)]"
          />
          <div className="h-full min-h-0 flex-1">{right}</div>
        </>
      )}
    </div>
  )
}
