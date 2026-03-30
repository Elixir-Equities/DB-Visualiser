import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 60
const DEFAULT_WIDTH = 150

/**
 * Returns per-column widths and a mousedown handler to attach to each resize handle.
 * Resets widths whenever `columns` changes (i.e. new query result).
 */
export function useColumnResize(columns) {
  const [widths, setWidths] = useState({})
  const dragState = useRef(null)

  // Reset when columns change
  useEffect(() => {
    setWidths({})
  }, [columns])

  const startResize = useCallback((e, col, thEl) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = thEl.offsetWidth || DEFAULT_WIDTH

    function onMouseMove(e) {
      const next = Math.max(MIN_WIDTH, startWidth + (e.clientX - startX))
      setWidths((prev) => ({ ...prev, [col]: next }))
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      dragState.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    dragState.current = { col }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  function getWidth(col) {
    return widths[col] ?? DEFAULT_WIDTH
  }

  return { getWidth, startResize }
}
