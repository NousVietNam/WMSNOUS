"use client"

import React from 'react'
import MemoizedStack from './MemoizedStack'

interface LocationNode {
    id: string
    code: string
    type: 'SHELF' | 'PATH' | 'OBSTACLE' | 'OFFICE' | 'SHIPPING' | 'RECEIVING'
    pos_x: number
    pos_y: number
    width: number
    height: number
    rotation?: number
    level_order?: number
    capacity?: number
    stats?: {
        box_count: number
        total_items: number
        boxes?: { id: string, code: string, items: number }[]
    }
}

interface StackNode {
    id: string
    baseCode: string
    pos_x: number
    pos_y: number
    width: number
    height: number
    levels: LocationNode[]
    total_boxes: number
    total_items: number
}

interface ShelfStacksLayerProps {
    stacks: StackNode[]
    mode: 'EDIT' | 'HEATMAP'
    is3D: boolean
    scale: number
    GRID_SIZE: number
    selectedIds: Set<string>
    highlightedIds: Set<string>
    showEmptySlots: boolean
    draggingStackId: string | null
    resizingStackId: string | null
    viewportSize: { width: number, height: number }
    origin: { x: number, y: number }
    offset: { x: number, y: number }
    getStackColor: (stack: StackNode) => string
    handleStackMouseDown: (e: React.MouseEvent, stack: StackNode) => void
    setSelectedStack: (s: StackNode | null) => void
    setHoveredStack: (s: StackNode | null) => void
    setTooltipPos: (pos: { x: number, y: number }) => void
    handleResizeStart: (e: React.MouseEvent, stackId: string) => void
}

const ShelfStacksLayer = ({
    stacks, mode, is3D, scale, GRID_SIZE,
    selectedIds, highlightedIds, showEmptySlots,
    draggingStackId, resizingStackId, viewportSize,
    origin, offset, getStackColor,
    handleStackMouseDown, setSelectedStack,
    setHoveredStack, setTooltipPos, handleResizeStart
}: ShelfStacksLayerProps) => {

    // Viewport boundaries in map pixels
    const viewW = (viewportSize.width - 260)
    const viewH = (viewportSize.height - 80)

    // Buffer in mapped pixels
    const buffer_px = 500 / (scale || 1)

    // Inverse Transform: Screen -> Map Pixel
    const minX_px = ((0 - origin.x - offset.x) / (scale || 1)) + origin.x - buffer_px
    const minY_px = ((0 - origin.y - offset.y) / (scale || 1)) + origin.y - buffer_px
    const maxX_px = ((viewW - origin.x - offset.x) / (scale || 1)) + origin.x + buffer_px
    const maxY_px = ((viewH - origin.y - offset.y) / (scale || 1)) + origin.y + buffer_px

    return (
        <>
            {stacks.map(stack => {
                // Check visibility for virtualization
                const sX1 = stack.pos_x * GRID_SIZE
                const sY1 = stack.pos_y * GRID_SIZE
                const sX2 = (stack.pos_x + stack.width) * GRID_SIZE
                const sY2 = (stack.pos_y + stack.height) * GRID_SIZE

                const isVisible = (viewportSize.width === 0 || viewportSize.height === 0) || (
                    sX1 < maxX_px &&
                    sX2 > minX_px &&
                    sY1 < maxY_px &&
                    sY2 > minY_px
                )

                if (!isVisible && draggingStackId !== stack.id && resizingStackId !== stack.id) return null

                return (
                    <MemoizedStack
                        key={stack.id}
                        stack={stack}
                        mode={mode}
                        is3D={is3D}
                        scale={scale}
                        GRID_SIZE={GRID_SIZE}
                        isSelected={selectedIds.has(stack.id)}
                        isHighlighted={highlightedIds.has(stack.id)}
                        isFlashing={showEmptySlots && stack.total_boxes === 0}
                        isDragging={draggingStackId === stack.id}
                        getStackColor={getStackColor}
                        onMouseDown={handleStackMouseDown}
                        onClick={(e, s) => {
                            e.stopPropagation()
                            if (mode !== 'EDIT') {
                                setSelectedStack(s)
                            }
                        }}
                        onMouseEnter={(e, s) => {
                            setHoveredStack(s)
                            setTooltipPos({ x: e.clientX + 15, y: e.clientY + 15 })
                        }}
                        onMouseLeave={() => setHoveredStack(null)}
                        onResizeStart={handleResizeStart}
                    />
                )
            })}
        </>
    )
}

export default ShelfStacksLayer
