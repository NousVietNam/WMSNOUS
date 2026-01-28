
import React, { memo } from 'react'
import { Move, Info, Box } from "lucide-react"

// --- Types ---
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

interface MemoizedStackProps {
    stack: StackNode
    mode: 'EDIT' | 'HEATMAP'
    is3D: boolean
    scale: number
    GRID_SIZE: number
    isSelected: boolean
    isHighlighted: boolean
    isFlashing?: boolean
    isDragging: boolean
    getStackColor: (stack: StackNode) => string
    onMouseDown: (e: React.MouseEvent, stack: StackNode) => void
    onClick: (e: React.MouseEvent, stack: StackNode) => void
    onMouseEnter: (e: React.MouseEvent, stack: StackNode) => void
    onMouseLeave: () => void
    onResizeStart: (e: React.MouseEvent, stackId: string) => void
}

const MemoizedStack = memo(({
    stack, mode, is3D, scale, GRID_SIZE,
    isSelected, isHighlighted, isFlashing, isDragging,
    getStackColor, onMouseDown, onClick, onMouseEnter, onMouseLeave, onResizeStart
}: MemoizedStackProps) => {

    const stackHeight = is3D ? Math.max((stack.levels?.length || 0) * 80, 10) : 0

    return (
        <div
            onMouseDown={(e) => onMouseDown(e, stack)}
            className={`
                absolute border-2 rounded-md shadow-md flex flex-col items-center justify-between p-1 transition-all duration-500 overflow-visible
                ${mode === 'EDIT'
                    ? 'bg-slate-100 border-blue-600 hover:ring-2 ring-blue-300 cursor-grab active:cursor-grabbing'
                    : isHighlighted
                        ? '' // Important: Bypass heatmap color when highlighted to allow animation bgcolor
                        : getStackColor(stack)
                }
                ${isDragging ? 'z-50 shadow-2xl scale-105 transition-none' : 'z-auto hover:shadow-md'}
                ${isFlashing
                    ? is3D
                        ? 'bg-emerald-300 border-emerald-500 z-40' // 3D: Solid Green Top Face, No Ring/Pulse
                        : 'ring-4 ring-green-500 ring-offset-2 z-40 animate-pulse bg-green-100' // 2D: Pulse Ring
                    : isHighlighted
                        ? 'z-50 animate-fast-blink ring-4 ring-cyan-500 ring-offset-4 shadow-[0_0_50px_rgba(34,211,238,1)]'
                        : isSelected
                            ? 'ring-4 ring-purple-600 ring-offset-2 z-40 bg-purple-50'
                            : ''
                }
            `}
            style={{
                left: stack.pos_x * GRID_SIZE + 2,
                top: stack.pos_y * GRID_SIZE + 2,
                width: stack.width * GRID_SIZE - 4,
                height: stack.height * GRID_SIZE - 4,
                transform: is3D ? `translateZ(${stackHeight}px)` : 'none',
                transformStyle: 'preserve-3d',
                transition: isDragging ? 'none' : 'left 0.2s, top 0.2s'
            }}
            onClick={(e) => onClick(e, stack)}
            onMouseEnter={(e) => onMouseEnter(e, stack)}
            onMouseLeave={onMouseLeave}
        >
            {/* 3D Faces */}
            {is3D && (
                <>
                    {/* Front Face */}
                    <div
                        className={`absolute top-full left-[-2px] w-[calc(100%+4px)] border border-slate-500/30 ${isFlashing ? 'bg-emerald-500' : 'bg-slate-400'}`}
                        style={{
                            height: stackHeight,
                            transformOrigin: 'top',
                            transform: 'rotateX(-90deg)'
                        }}
                    >
                        {/* Level Dividers */}
                        {(stack.levels?.length || 0) > 1 && Array.from({ length: (stack.levels?.length || 1) - 1 }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute w-full h-[2px] bg-slate-700/50"
                                style={{ top: `${((i + 1) / (stack.levels?.length || 1)) * 100}%` }}
                            />
                        ))}
                    </div>
                    {/* Right Face */}
                    <div
                        className={`absolute top-[-2px] left-full h-[calc(100%+4px)] border border-slate-400/30 ${isFlashing ? 'bg-emerald-400' : 'bg-slate-300'}`}
                        style={{
                            width: stackHeight,
                            transformOrigin: 'left',
                            transform: 'rotateY(90deg)'
                        }}
                    >
                        {/* Level Dividers */}
                        {(stack.levels?.length || 0) > 1 && Array.from({ length: (stack.levels?.length || 1) - 1 }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute h-full w-[2px] bg-slate-600/50"
                                style={{ left: `${((i + 1) / (stack.levels?.length || 1)) * 100}%` }}
                            />
                        ))}
                    </div>
                    {/* Shadow */}
                    <div
                        className="absolute top-0 left-0 w-full h-full bg-black/20 pointer-events-none rounded-full"
                        style={{
                            transform: `translateZ(${-stackHeight}px) scale(0.9)`
                        }}
                    />
                </>
            )}

            {/* Content */}
            {mode === 'HEATMAP' && (
                <div className="absolute inset-0 flex flex-col p-2.5 pointer-events-none rounded-md">
                    {scale <= 0.5 ? (
                        <div className="flex-1 flex items-center justify-center">
                            <span className={`font-black leading-none tracking-tight ${is3D ? 'text-6xl text-slate-900 drop-shadow-[0_2px_4px_rgba(255,255,255,0.9)]' : 'text-5xl text-slate-700'}`}>
                                {stack.baseCode}
                            </span>
                        </div>
                    ) : (
                        <>
                            <div className="absolute top-1 right-1 bottom-1 w-1.5 bg-slate-200 rounded-full overflow-hidden flex flex-col justify-end">
                                {(() => {
                                    const maxCapacity = stack.levels?.reduce((sum, level) => sum + (level.capacity || 15), 0) || 15
                                    const percentage = Math.min(100, Math.max(5, (stack.total_boxes / maxCapacity) * 100))
                                    const barColor = percentage > 90 ? 'bg-red-500' :
                                        percentage > 70 ? 'bg-yellow-500' :
                                            'bg-indigo-500'

                                    return (
                                        <div
                                            className={`w-full transition-all duration-500 ${barColor}`}
                                            style={{ height: `${percentage}%` }}
                                        />
                                    )
                                })()}
                            </div>

                            <div className="w-full h-full flex flex-col pr-3">
                                <div className="flex items-center justify-between w-full mb-1">
                                    <span className="font-extrabold text-lg text-slate-800 leading-none tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex-1">
                                        {(stack.levels?.length || 0) > 1
                                            ? stack.baseCode.substring(0, 5)
                                            : stack.baseCode}
                                    </span>
                                    {(stack.levels?.length || 0) > 1 && (
                                        <span className="flex items-center justify-center bg-slate-700 text-white text-[10px] font-bold h-4 px-1.5 rounded ml-1">
                                            {stack.levels?.length}F
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                                    {stack.total_boxes > 0 ? (
                                        <>
                                            <span className={`text-4xl font-black leading-none ${stack.total_items > 500 ? 'text-red-700' :
                                                stack.total_items > 100 ? 'text-yellow-700' :
                                                    'text-slate-700'
                                                }`}>
                                                {stack.total_boxes}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Thùng</span>
                                        </>
                                    ) : (
                                        <span className="text-sm text-slate-300 italic font-light">Empty</span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Edit Visuals */}
            {mode === 'EDIT' && (
                <>
                    <div className="flex-1 flex items-center justify-center text-slate-300 pointer-events-none">
                        <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-slate-400">{stack.baseCode}</span>
                            <Move size={16} />
                        </div>
                    </div>
                    <div
                        onMouseDown={(e) => onResizeStart(e, stack.id)}
                        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize pointer-events-auto bg-indigo-500 hover:bg-indigo-600 rounded-tl flex items-center justify-center text-white shadow-md transition-all z-10"
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-80">
                            <path d="M10 10 L10 7 L7 10 Z M10 10 L10 3 L3 10 Z" fill="currentColor" />
                        </svg>
                    </div>
                </>
            )}
        </div>
    )
}, (prev, next) => {
    // Custom comparison for performance
    return (
        prev.stack.id === next.stack.id &&
        prev.stack.pos_x === next.stack.pos_x &&
        prev.stack.pos_y === next.stack.pos_y &&
        prev.stack.width === next.stack.width &&
        prev.stack.height === next.stack.height &&
        prev.stack.total_boxes === next.stack.total_boxes && // Optimization: Only deep check if needed
        prev.mode === next.mode &&
        prev.is3D === next.is3D &&
        prev.scale === next.scale && // Rerender if scale changes (for detail view toggle)
        prev.isSelected === next.isSelected &&
        prev.isHighlighted === next.isHighlighted &&
        prev.isFlashing === next.isFlashing &&
        prev.isDragging === next.isDragging
    )
})

export default MemoizedStack
