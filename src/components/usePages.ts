import { useMemo } from 'react'
import type { Fabrication } from '../geometry/fabrication'
import { layoutPages, pieceDrawing, type Page } from '../output/layout'
import { useDesignStore } from '../store/designStore'

export function usePages(fabrication: Fabrication | null): Page[] {
  const print = useDesignStore((s) => s.design.print)
  return useMemo(() => {
    if (!fabrication || fabrication.errors.length > 0) return []
    const drawings = fabrication.unrolled.map((u, i) => pieceDrawing(u, fabrication.fab.pieces[i], fabrication.unrolled.length))
    return layoutPages(drawings, print)
  }, [fabrication, print])
}
