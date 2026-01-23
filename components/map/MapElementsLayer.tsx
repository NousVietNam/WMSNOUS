"use client"

import React from 'react'

interface DrawElement {
    id: string
    type: 'WALL' | 'DOOR'
    x: number
    y: number
    width: number
    height: number
    rotation: number
    metadata?: {
        endX?: number
        endY?: number
        [key: string]: any
    }
}

interface MapElementsLayerProps {
    mapElements: DrawElement[]
    mode: 'EDIT' | 'HEATMAP'
    selectedIds: Set<string>
    GRID_SIZE: number
    deleteElement: (id: string) => void
    setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void
    tempDraw: DrawElement | null
}

const MapElementsLayer = ({
    mapElements, mode, selectedIds, GRID_SIZE,
    deleteElement, setSelectedIds, tempDraw
}: MapElementsLayerProps) => {
    return (
        <svg
            className="absolute inset-0 pointer-events-none z-10 overflow-visible"
            style={{ width: '200000px', height: '200000px' }}
        >
            {/* Walls */}
            {mapElements.filter(el => el.type === 'WALL' && (el.x !== (el.metadata?.endX ?? el.x) || el.y !== (el.metadata?.endY ?? el.y))).map(el => (
                <g key={el.id} onClick={(e) => {
                    if (mode === 'EDIT') {
                        e.stopPropagation()
                        setSelectedIds(prev => {
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                const next = new Set(prev)
                                if (next.has(el.id)) next.delete(el.id)
                                else next.add(el.id)
                                return next
                            } else {
                                if (prev.has(el.id)) return prev
                                return new Set([el.id])
                            }
                        })
                    }
                }} className="pointer-events-auto cursor-pointer">
                    <line
                        x1={el.x * GRID_SIZE}
                        y1={el.y * GRID_SIZE}
                        x2={(el.metadata?.endX ?? el.x) * GRID_SIZE}
                        y2={(el.metadata?.endY ?? el.y) * GRID_SIZE}
                        stroke="transparent"
                        strokeWidth={20}
                    />
                    <line
                        x1={el.x * GRID_SIZE}
                        y1={el.y * GRID_SIZE}
                        x2={(el.metadata?.endX ?? el.x) * GRID_SIZE}
                        y2={(el.metadata?.endY ?? el.y) * GRID_SIZE}
                        stroke={selectedIds.has(el.id) ? "#3b82f6" : "#334155"}
                        strokeWidth={8}
                        strokeLinecap="round"
                    />
                    {mode === 'EDIT' && selectedIds.has(el.id) && (
                        <circle
                            cx={(el.x + ((el.metadata?.endX ?? el.x) - el.x) / 2) * GRID_SIZE}
                            cy={(el.y + ((el.metadata?.endY ?? el.y) - el.y) / 2) * GRID_SIZE}
                            r={10}
                            fill="#ef4444"
                            className="cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); deleteElement(el.id) }}
                        />
                    )}
                </g>
            ))}

            {/* Doors */}
            {mapElements.filter(el => el.type === 'DOOR').map(el => (
                <g key={el.id} onClick={(e) => {
                    if (mode === 'EDIT') {
                        e.stopPropagation()
                        setSelectedIds(prev => {
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                const next = new Set(prev)
                                if (next.has(el.id)) next.delete(el.id)
                                else next.add(el.id)
                                return next
                            } else {
                                if (prev.has(el.id)) return prev
                                return new Set([el.id])
                            }
                        })
                    }
                }} className="pointer-events-auto cursor-pointer">
                    <line
                        x1={el.x * GRID_SIZE}
                        y1={el.y * GRID_SIZE}
                        x2={(el.metadata?.endX ?? el.x) * GRID_SIZE}
                        y2={(el.metadata?.endY ?? el.y) * GRID_SIZE}
                        stroke="transparent"
                        strokeWidth={20}
                    />
                    <line
                        x1={el.x * GRID_SIZE}
                        y1={el.y * GRID_SIZE}
                        x2={(el.metadata?.endX ?? el.x) * GRID_SIZE}
                        y2={(el.metadata?.endY ?? el.y) * GRID_SIZE}
                        stroke={selectedIds.has(el.id) ? "#ef4444" : "#3b82f6"}
                        strokeWidth={8}
                        strokeDasharray="15,10"
                        strokeLinecap="round"
                    />
                    {mode === 'EDIT' && selectedIds.has(el.id) && (
                        <circle
                            cx={(el.x + ((el.metadata?.endX ?? el.x) - el.x) / 2) * GRID_SIZE}
                            cy={(el.y + ((el.metadata?.endY ?? el.y) - el.y) / 2) * GRID_SIZE}
                            r={10}
                            fill="#ef4444"
                            className="cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); deleteElement(el.id) }}
                        />
                    )}
                    {/* Label */}
                    {(() => {
                        const x1 = el.x * GRID_SIZE
                        const y1 = el.y * GRID_SIZE
                        const x2 = (el.metadata?.endX ?? el.x) * GRID_SIZE
                        const y2 = (el.metadata?.endY ?? el.y) * GRID_SIZE
                        const cx = (x1 + x2) / 2
                        const cy = (y1 + y2) / 2
                        const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1)
                        let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
                        let offX = 0, offY = -50
                        if (isVertical) {
                            offX = -60; offY = 0; angle = -90
                        }
                        const tx = cx + offX, ty = cy + offY
                        return (
                            <text
                                x={tx} y={ty}
                                textAnchor="middle" dominantBaseline="middle"
                                className="font-black fill-blue-600 pointer-events-none"
                                style={{
                                    fontSize: '80px',
                                    transform: `rotate(${angle}deg)`,
                                    transformOrigin: `${tx}px ${ty}px`
                                }}
                            >
                                Cửa Kho
                            </text>
                        )
                    })()}
                </g>
            ))}

            {/* Temp Draw */}
            {tempDraw && (
                <line
                    x1={tempDraw.x * GRID_SIZE}
                    y1={tempDraw.y * GRID_SIZE}
                    x2={(tempDraw.metadata?.endX ?? tempDraw.x) * GRID_SIZE}
                    y2={(tempDraw.metadata?.endY ?? tempDraw.y) * GRID_SIZE}
                    stroke={tempDraw.type === 'WALL' ? "#334155" : "#3b82f6"}
                    strokeWidth={8}
                    strokeDasharray="10,10"
                    strokeLinecap="round"
                    className="opacity-70"
                />
            )}
        </svg>
    )
}

export default MapElementsLayer
