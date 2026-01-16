"use client"

import React, { useState, useEffect, useRef } from 'react'
import MemoizedStack from '@/components/map/MemoizedStack'
import Link from "next/link"
import { Save, ZoomIn, ZoomOut, Move, Grid, Layers, Loader2, MousePointer2, Info, Box, ArrowUp, ArrowDown, Search, X as SearchX, Home, Plus, Square, DoorOpen, Trash2, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import WarehouseScene3D from '@/components/map/WarehouseScene3D'
import { useHeader } from "@/components/providers/HeaderProvider"

// -- Types --

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

const GRID_SIZE = 120

export default function WarehouseMapPageClient() {
    const [locations, setLocations] = useState<LocationNode[]>([])
    const [stacks, setStacks] = useState<StackNode[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [mode, setMode] = useState<'EDIT' | 'HEATMAP'>('HEATMAP')
    const [is3D, setIs3D] = useState(false)
    const [scale, setScale] = useState(1)

    // Search State
    const [searchQuery, setSearchQuery] = useState('')
    const canvasRef = useRef<HTMLDivElement>(null)
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isSearching, setIsSearching] = useState(false)

    // Canvas State
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

    const [origin, setOrigin] = useState({ x: 0, y: 0 }) // Transform Origin for centering

    // Interaction State
    const [showEmptySlots, setShowEmptySlots] = useState(false) // Toggle for highlighting empty stacks
    const [draggingStackId, setDraggingStackId] = useState<string | null>(null)
    const [resizingStackId, setResizingStackId] = useState<string | null>(null)
    const [selectedStack, setSelectedStack] = useState<StackNode | null>(null)

    const [hasChanges, setHasChanges] = useState(false)

    // Map Elements State
    const [mapElements, setMapElements] = useState<DrawElement[]>([])
    const [drawMode, setDrawMode] = useState<'NONE' | 'WALL' | 'DOOR'>('NONE')
    const [tempDraw, setTempDraw] = useState<DrawElement | null>(null)
    const [elementToDelete, setElementToDelete] = useState<string | null>(null)

    // Hover Tooltip State
    const [hoveredStack, setHoveredStack] = useState<StackNode | null>(null)
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

    // --- Dynamic Header Injection ---
    const { setActions, setTitle } = useHeader()

    useEffect(() => {
        setTitle("Sơ Đồ Kho")
        setActions(
            <div className="flex items-center gap-3 w-full max-w-4xl justify-between animate-fade-in">

                {/* Left: View Controls */}
                <div className="flex items-center gap-2">
                    <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                        <Button
                            size="sm"
                            variant={mode === 'HEATMAP' ? 'secondary' : 'ghost'}
                            className={mode === 'HEATMAP' ? "bg-indigo-600 text-white hover:bg-indigo-500" : "text-slate-400 hover:text-white"}
                            onClick={() => setMode('HEATMAP')}
                        >
                            <LayoutGrid className="h-4 w-4 mr-2" /> Heatmap
                        </Button>
                        <Button
                            size="sm"
                            variant={mode === 'EDIT' ? 'secondary' : 'ghost'}
                            className={mode === 'EDIT' ? "bg-indigo-600 text-white hover:bg-indigo-500" : "text-slate-400 hover:text-white"}
                            onClick={() => setMode('EDIT')}
                        >
                            <Move className="h-4 w-4 mr-2" /> Chỉnh Sửa
                        </Button>
                    </div>

                    <Button
                        size="sm"
                        variant={is3D ? "default" : "outline"}
                        onClick={() => setIs3D(!is3D)}
                        className={is3D ? "bg-purple-600 hover:bg-purple-500 text-white border-0" : "bg-transparent border-white/10 text-slate-300 hover:bg-white/10"}
                    >
                        <Box className="h-4 w-4 mr-2" /> 3D View
                    </Button>
                    <Button
                        size="sm"
                        variant={showEmptySlots ? "default" : "outline"}
                        onClick={() => setShowEmptySlots(!showEmptySlots)}
                        className={showEmptySlots ? "bg-emerald-600 hover:bg-emerald-500 text-white border-0" : "bg-transparent border-white/10 text-slate-300 hover:bg-white/10"}
                    >
                        <LayoutGrid className="h-4 w-4 mr-2" /> Tìm Chỗ Trống
                    </Button>
                </div>


                {/* Center: Search (In Header) */}
                <div className="relative w-96 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    <Input
                        placeholder="Tìm vị trí (A1-01)..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 bg-white/5 border-white/10 text-slate-200 focus:ring-indigo-500/50 focus:border-indigo-500/50 h-9 rounded-lg placeholder:text-slate-600"
                    />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-indigo-400" />}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {mode === 'EDIT' && (
                        <>
                            {/* Draw Tools */}
                            <div className="flex gap-1 border-r border-white/10 pr-2 mr-2">
                                <Button
                                    size="icon"
                                    variant={drawMode === 'WALL' ? 'default' : 'ghost'}
                                    onClick={() => setDrawMode(drawMode === 'WALL' ? 'NONE' : 'WALL')}
                                    className={drawMode === 'WALL' ? "bg-indigo-600 hover:bg-indigo-500" : "text-slate-400 hover:bg-white/10"}
                                    title="Vẽ Tường"
                                >
                                    <Square className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant={drawMode === 'DOOR' ? 'default' : 'ghost'}
                                    onClick={() => setDrawMode(drawMode === 'DOOR' ? 'NONE' : 'DOOR')}
                                    className={drawMode === 'DOOR' ? "bg-indigo-600 hover:bg-indigo-500" : "text-slate-400 hover:bg-white/10"}
                                    title="Vẽ Cửa"
                                >
                                    <DoorOpen className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Delete Button */}
                            {(selectedIds.size > 0 || elementToDelete) && (
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={executeDelete}
                                    className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" /> Xóa ({selectedIds.size})
                                </Button>
                            )}

                            {/* Unstack Zone Ref (Hidden visual, used for logic) */}
                            <div ref={unstackZoneRef} className="hidden" />
                        </>
                    )}

                    {hasChanges && (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" onClick={handleDiscard}>Hủy</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white font-bold shadow-lg shadow-green-900/20">
                                {saving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4 mr-2" />}
                                Lưu Thay Đổi
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        )
        // Cleanup to avoid ghost buttons
        // return () => setActions(null) 
        // Actually keep it or it flickers? Let's leave cleanup
    }, [mode, is3D, searchQuery, isSearching, hasChanges, saving, selectedIds, drawMode, elementToDelete, showEmptySlots])



    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!searchQuery.trim()) {
                setHighlightedIds(new Set())
                return
            }

            setIsSearching(true)
            try {
                const res = await fetch(`/api/map/search?q=${encodeURIComponent(searchQuery)}`)
                const json = await res.json()
                if (json.success) {
                    setHighlightedIds(new Set(json.data))
                }
            } catch (e) {
                console.error("Search failed", e)
            } finally {
                setIsSearching(false)
            }
        }, 500) // 500ms debounce

        return () => clearTimeout(timer)
    }, [searchQuery])




    useEffect(() => {
        // Initialize viewport size on client mount
        setViewportSize({
            width: window.innerWidth,
            height: window.innerHeight
        })

        const handleResize = () => {
            setViewportSize({
                width: window.innerWidth,
                height: window.innerHeight
            })
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])


    const isPanning = useRef(false)
    const lastMousePos = useRef({ x: 0, y: 0 })
    const dragStartPos = useRef({ x: 0, y: 0 }) // For node drag
    const nodeStartPos = useRef({ x: 0, y: 0 }) // Initial node grid pos
    const resizeStartSize = useRef({ width: 0, height: 0 })
    const resizeStartMouse = useRef({ x: 0, y: 0 })
    const unstackZoneRef = useRef<HTMLDivElement>(null)
    const dragStartPositions = useRef<Map<string, { x: number, y: number }>>(new Map())


    const isDrawing = useRef(false)
    const drawStart = useRef({ x: 0, y: 0 })


    useEffect(() => {
        fetchData()
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Prevent deletion if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
                // Trigger delete for all selected
                setElementToDelete('BATCH') // Use special flag for batch
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedIds])

    useEffect(() => {
        // Group locations into Stacks
        const grouped = new Map<string, LocationNode[]>()

        locations.forEach(loc => {
            const key = `${loc.pos_x},${loc.pos_y}`
            if (!grouped.has(key)) grouped.set(key, [])
            grouped.get(key)?.push(loc)
        })

        const newStacks: StackNode[] = []
        grouped.forEach((locs) => {
            // Sort by code to guess levels (e.g. 01, 02)
            locs.sort((a, b) => a.code.localeCompare(b.code))

            const first = locs[0]
            // Calculate Aggregates
            const total_boxes = locs.reduce((sum, l) => sum + (l.stats?.box_count || 0), 0)
            const total_items = locs.reduce((sum, l) => sum + (l.stats?.total_items || 0), 0)

            newStacks.push({
                id: first.id,
                baseCode: locs.length > 1 ? first.code.split('-').slice(0, -1).join('-') : first.code, // Try to find common prefix
                pos_x: first.pos_x,
                pos_y: first.pos_y,
                width: first.width,
                height: first.height,
                levels: locs,
                total_boxes,
                total_items
            })
        })
        setStacks(newStacks)

    }, [locations])

    // Auto-fit view once when stacks are loaded
    useEffect(() => {
        if (stacks.length > 0 && !hasChanges) {
            // Small delay to ensure rendering is complete
            const timer = setTimeout(() => {
                fitView()
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [stacks.length]) // Only run when stacks length changes from 0 to >0

    // Auto-fit when switching 2D/3D
    useEffect(() => {
        if (stacks.length > 0) {
            fitView()
        }
    }, [is3D])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [layoutRes, statsRes, elementsRes] = await Promise.all([
                fetch('/api/map/layout'),
                fetch('/api/map/stats'),
                fetch('/api/map/elements')
            ])
            const layoutJson = await layoutRes.json()
            const statsJson = await statsRes.json()
            const elementsJson = await elementsRes.json()

            if (elementsJson.success) {
                setMapElements(elementsJson.data)
            }

            if (layoutJson.success) {
                const statsMap = new Map(statsJson.data?.map((s: any) => [s.id, s]) || [])
                const nodes = layoutJson.data.map((l: any, index: number) => ({
                    ...l,
                    pos_x: (l.pos_x !== null && l.pos_x !== undefined) ? Number(l.pos_x) : (index % 10) * 2,
                    pos_y: (l.pos_y !== null && l.pos_y !== undefined) ? Number(l.pos_y) : Math.floor(index / 10) * 2,
                    stats: statsMap.get(l.id)
                }))
                setLocations(nodes)
                setHasChanges(false) // Reset on load
            }
        } catch (e) {
            console.error(e)
            alert("Lỗi tải bản đồ")
        } finally {
            setLoading(false)
        }
    }

    // ... (logic)

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>

    const handleDiscard = () => {
        if (confirm("Hủy bỏ thay đổi?")) {
            fetchData()
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            // Sanitize payload: Remove stats, ensure numbers
            const updates = locations.map(l => ({
                id: l.id,
                code: l.code,
                type: l.type,
                pos_x: Number(l.pos_x) || 0,
                pos_y: Number(l.pos_y) || 0,
                width: Number(l.width) || 2,
                height: Number(l.height) || 2,
                rotation: Number(l.rotation || 0),
                level_order: Number(l.level_order) !== undefined ? Number(l.level_order) : 0
            }))

            const res = await fetch('/api/map/layout', {
                method: 'POST',
                body: JSON.stringify({ updates })
            })
            const json = await res.json()
            if (json.success) {
                alert("Đã lưu sơ đồ!")
                setHasChanges(false)
            } else {
                alert("Lỗi lưu: " + json.error)
            }
        } catch (e) {
            alert("Lỗi kết nối")
        } finally {
            setSaving(false)
        }
    }

    const saveElement = async (el: DrawElement) => {
        await fetch('/api/map/elements', {
            method: 'POST',
            body: JSON.stringify({ action: 'UPSERT', element: el })
        })
        fetchData()
    }

    const deleteElement = (id: string) => {
        setSelectedIds(new Set([id]))
        setElementToDelete(id)
    }

    const executeDelete = async () => {
        if (!elementToDelete && selectedIds.size === 0) return

        const idsToDelete = elementToDelete === 'BATCH' ? Array.from(selectedIds) : (elementToDelete ? [elementToDelete] : [])

        // Parallel delete requests (or bulk API if supported, sticking to loop for safety now)
        await Promise.all(idsToDelete.map(id =>
            fetch('/api/map/elements', {
                method: 'POST',
                body: JSON.stringify({ action: 'DELETE', id })
            })
        ))

        setSelectedIds(new Set())
        setElementToDelete(null)
        fetchData()
    }

    // --- Mouse Handlers ---

    const handleMouseDown = (e: React.MouseEvent) => {
        // Drawing Logic
        if (drawMode === 'WALL') {
            isDrawing.current = true
            const rect = e.currentTarget.getBoundingClientRect()
            const x = (e.clientX - rect.left - offset.x) / (GRID_SIZE * scale)
            const y = (e.clientY - rect.top - offset.y) / (GRID_SIZE * scale)

            // Snap to nearest grid intersection for cleaner lines
            const gridX = Math.max(0, Math.round(x))
            const gridY = Math.max(0, Math.round(y))

            drawStart.current = { x: gridX, y: gridY }
            setTempDraw({
                id: 'temp',
                type: 'WALL',
                x: gridX,
                y: gridY,
                width: 0,
                height: 0,
                rotation: 0,
                metadata: { endX: gridX, endY: gridY }
            })
            return
        }

        if (drawMode === 'DOOR') {
            isDrawing.current = true
            const rect = e.currentTarget.getBoundingClientRect()
            const x = (e.clientX - rect.left - offset.x) / (GRID_SIZE * scale)
            const y = (e.clientY - rect.top - offset.y) / (GRID_SIZE * scale)

            const gridX = Math.max(0, Math.round(x))
            const gridY = Math.max(0, Math.round(y))

            drawStart.current = { x: gridX, y: gridY }
            setTempDraw({
                id: 'temp',
                type: 'DOOR',
                x: gridX,
                y: gridY,
                width: 0,
                height: 0,
                rotation: 0,
                metadata: { endX: gridX, endY: gridY }
            })
            return
        }

        // Canvas Pan Handler
        if (e.button === 0) { // Left Click
            isPanning.current = true
            lastMousePos.current = { x: e.clientX, y: e.clientY }
        }
    }

    const handleResizeStart = (e: React.MouseEvent, stackId: string) => {
        e.stopPropagation()
        const stack = stacks.find(s => s.id === stackId)
        if (!stack || !stack.levels[0]) return

        setResizingStackId(stackId)
        resizeStartSize.current = { width: stack.levels[0].width, height: stack.levels[0].height }
        resizeStartMouse.current = { x: e.clientX, y: e.clientY }
    }

    const handleStackMouseDown = (e: React.MouseEvent, stack: StackNode) => {
        if (mode !== 'EDIT') return
        e.stopPropagation() // Prevent Panning

        let newSelectedIds = new Set(selectedIds)

        // Multi-select Logic
        if (e.shiftKey || e.ctrlKey) {
            // If already selected, DO NOT DESELECT here - wait to see if it's a drag or click
            // For now, prioritize dragging group, so we keep it selected.
            // If user wants to deselect, they can click distinctively (toggle) but overlapping drag/toggle behavior favors Drag.
            if (!newSelectedIds.has(stack.id)) {
                newSelectedIds.add(stack.id)
            }
            // If it HAS it, do nothing (keep selected to enable drag)
        } else {
            // If clicking an item that is NOT in the current selection, clear and select it.
            // If clicking an item that IS in the selection, keep selection to drag the group.
            if (!newSelectedIds.has(stack.id)) {
                newSelectedIds = new Set([stack.id])
            }
        }

        setSelectedIds(newSelectedIds)
        setDraggingStackId(stack.id)
        dragStartPos.current = { x: e.clientX, y: e.clientY }

        // Snapshot initial positions for ALL selected stacks
        const positions = new Map<string, { x: number, y: number }>()
        stacks.forEach(s => {
            if (newSelectedIds.has(s.id)) {
                positions.set(s.id, { x: s.pos_x, y: s.pos_y })
            }
        })
        dragStartPositions.current = positions
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        // Drawing Resize
        if (isDrawing.current && (drawMode === 'WALL' || drawMode === 'DOOR') && tempDraw) {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = (e.clientX - rect.left - offset.x) / (GRID_SIZE * scale)
            const y = (e.clientY - rect.top - offset.y) / (GRID_SIZE * scale)

            const gridX = Math.max(0, Math.round(x))
            const gridY = Math.max(0, Math.round(y))

            setTempDraw(prev => prev ? ({
                ...prev,
                metadata: { ...prev.metadata, endX: gridX, endY: gridY }
            }) : null)
            return
        }

        // Handle resize
        if (resizingStackId && mode === 'EDIT') {
            const deltaX = e.clientX - resizeStartMouse.current.x
            const deltaY = e.clientY - resizeStartMouse.current.y
            const gridDeltaX = Math.round(deltaX / (GRID_SIZE * scale))
            const gridDeltaY = Math.round(deltaY / (GRID_SIZE * scale))

            const newWidth = Math.max(1, resizeStartSize.current.width + gridDeltaX)
            const newHeight = Math.max(1, resizeStartSize.current.height + gridDeltaY)

            setLocations(prev => prev.map(loc => {
                const stack = stacks.find(s => s.id === resizingStackId)
                if (stack && stack.levels.some(l => l.id === loc.id)) {
                    return { ...loc, width: newWidth, height: newHeight }
                }
                return loc
            }))

            setHasChanges(true)
            return
        }

        // 1. Panning
        if (isPanning.current) {
            const dx = e.clientX - lastMousePos.current.x
            const dy = e.clientY - lastMousePos.current.y
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
            lastMousePos.current = { x: e.clientX, y: e.clientY }
            return
        }

        // 2. Node Dragging (Multi-Stack Support)
        if (draggingStackId && mode === 'EDIT') {
            const deltaX = e.clientX - dragStartPos.current.x
            const deltaY = e.clientY - dragStartPos.current.y

            let gridDeltaX = 0
            let gridDeltaY = 0

            if (is3D) {
                // Inverse Isometric Projection
                // alpha = 45deg (rotateZ), beta = 55deg (rotateX)
                // cos(45)=sin(45) ~ 0.707, cos(55) ~ 0.574
                const cosBeta = 0.574
                const gamma = 1.414 // 2 * sin(45)

                const u = deltaX / scale
                const v = deltaY / (scale * cosBeta)

                gridDeltaX = Math.round((u + v) / gamma / GRID_SIZE)
                gridDeltaY = Math.round((v - u) / gamma / GRID_SIZE)
            } else {
                gridDeltaX = Math.round(deltaX / (GRID_SIZE * scale))
                gridDeltaY = Math.round(deltaY / (GRID_SIZE * scale))
            }

            setStacks(prev => prev.map(s => {
                const initialPos = dragStartPositions.current.get(s.id)
                if (initialPos) {
                    return {
                        ...s,
                        pos_x: Math.max(0, initialPos.x + gridDeltaX),
                        pos_y: Math.max(0, initialPos.y + gridDeltaY)
                    }
                }
                return s
            }))

            setHasChanges(true)
        }
    }

    const fitView = () => {
        if (stacks.length === 0 && mapElements.length === 0) return

        // 1. Calculate Bounding Box of Layout
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

        stacks.forEach(s => {
            minX = Math.min(minX, s.pos_x)
            minY = Math.min(minY, s.pos_y)
            maxX = Math.max(maxX, s.pos_x + s.width)
            maxY = Math.max(maxY, s.pos_y + s.height)
        })

        // Include Map Elements (Walls/Doors)
        mapElements.forEach(el => {
            // Start point
            minX = Math.min(minX, el.x)
            minY = Math.min(minY, el.y)
            maxX = Math.max(maxX, el.x + (el.width || 0)) // Some elements might have width
            maxY = Math.max(maxY, el.y + (el.height || 0))

            // End point (for lines/walls)
            if (el.metadata?.endX !== undefined) {
                minX = Math.min(minX, el.metadata.endX)
                maxX = Math.max(maxX, el.metadata.endX)
            }
            if (el.metadata?.endY !== undefined) {
                minY = Math.min(minY, el.metadata.endY)
                maxY = Math.max(maxY, el.metadata.endY)
            }
        })

        if (minX === Infinity) return // No content

        // Convert to Pixels
        const padding = 40 // px
        // Add small buffer explicitly to width/height to prevent cutting off edges
        const contentW = (maxX - minX + 2) * GRID_SIZE
        const contentH = (maxY - minY + 2) * GRID_SIZE

        // Viewport Dimensions (Current Window)
        const sidebarWidth = 260 // Sidebar approx
        const headerHeight = 80 // Header approx
        const viewW = window.innerWidth - sidebarWidth
        const viewH = window.innerHeight - headerHeight

        // 2. Calculate Scale to Fit
        const scaleX = viewW / contentW
        const scaleY = viewH / contentH
        const newScale = Math.min(Math.min(scaleX, scaleY), 1.2) // Cap max zoom at 1.2 for better aesthetics
        const safeScale = Math.max(newScale, 0.35)

        // 3. Center Logic
        // We want the CENTER of the content to be at the CENTER of the viewport
        const contentCenterX = ((minX + maxX) / 2) * GRID_SIZE
        const contentCenterY = ((minY + maxY) / 2) * GRID_SIZE

        // Viewport Center
        const viewportCenterX = viewW / 2
        const viewportCenterY = viewH / 2

        // Set Transform Origin to Content Center so rotation/scaling happens around it
        setOrigin({ x: contentCenterX, y: contentCenterY })

        // Calculate Offset to place Content Center at Viewport Center
        // Offset = ViewportCenter - ContentCenter
        const newOffsetX = viewportCenterX - contentCenterX
        const newOffsetY = viewportCenterY - contentCenterY

        setScale(safeScale)
        setOffset({ x: newOffsetX, y: newOffsetY })
    }

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isDrawing.current && (drawMode === 'WALL' || drawMode === 'DOOR') && tempDraw) {
            isDrawing.current = false

            // Prevent zero-length elements (dots)
            const endX = tempDraw.metadata?.endX ?? tempDraw.x
            const endY = tempDraw.metadata?.endY ?? tempDraw.y
            if (tempDraw.x === endX && tempDraw.y === endY) {
                setTempDraw(null)
                return
            }

            const newElement = { ...tempDraw, id: crypto.randomUUID() }

            // Optimistic Update
            setMapElements(prev => [...prev, newElement])
            saveElement(newElement)

            setTempDraw(null)
            // drawMode remains active for continuous drawing? Or reset?
            // User usually wants to draw multiple lines. Let's keep it active.
            // setDrawMode('NONE') 
            return
        }

        if (resizingStackId) {
            // Commit Resize Changes
            const stack = stacks.find(s => s.id === resizingStackId)
            if (stack) {
                setLocations(prev => prev.map(l => {
                    // Update all levels in this stack (or just the stack definition if it's 1-to-1)
                    if (l.id === stack.id || stack.levels.some(level => level.id === l.id)) {
                        return {
                            ...l,
                            pos_x: stack.pos_x,
                            pos_y: stack.pos_y,
                            width: stack.width,
                            height: stack.height
                        }
                    }
                    return l
                }))
                setHasChanges(true)
            }
            setResizingStackId(null)
            return
        }
        let actionTaken = false

        if (draggingStackId && mode === 'EDIT' && unstackZoneRef.current) {
            const zoneRect = unstackZoneRef.current.getBoundingClientRect()

            // Check if dropped inside Unstack Zone
            if (
                e.clientX >= zoneRect.left &&
                e.clientX <= zoneRect.right &&
                e.clientY >= zoneRect.top &&
                e.clientY <= zoneRect.bottom
            ) {
                const targetStack = stacks.find(s => s.id === draggingStackId)
                if (targetStack && targetStack.levels.length > 1) {
                    // Scatter Logic - Create dedicated unstack zone with better spacing
                    // Calculate max Y position (bottom edge of all existing locations AND map elements)
                    const maxLocY = Math.max(...locations.map(l => (Number(l.pos_y) || 0) + (Number(l.height) || 2)), 0)
                    const maxMapY = Math.max(...mapElements.map(el => Math.max(el.y, el.metadata?.endY ?? el.y)), 0)
                    const maxY = Math.max(maxLocY, maxMapY)

                    // Add 5 rows of spacing to create a clear separation zone
                    const startY = maxY + 5
                    const gap = 3 // Gap between scattered piles

                    setLocations(prev => {
                        const newLocs = [...prev]
                        const removed = newLocs.filter(l => targetStack.levels.some(lvl => lvl.id === l.id))

                        // Remove old
                        const remaining = newLocs.filter(l => !targetStack.levels.some(lvl => lvl.id === l.id))

                        // Add new separated
                        removed.forEach((l, index) => {
                            remaining.push({
                                ...l,
                                pos_x: 0 + (index * (Number(l.width) + gap)), // Horizontal spread
                                pos_y: startY // In the dedicated zone below
                            })
                        })
                        return remaining
                    })
                    setHasChanges(true)
                    actionTaken = true
                }
            }
        }

        isPanning.current = false
        isDrawing.current = false
        setDraggingStackId(null)
        setResizingStackId(null)
    }

    const getStackColor = (stack: StackNode) => {
        // Use the type of the first level to determine color
        const type = stack.levels?.[0]?.type || 'SHELF'
        switch (type) {
            case 'SHELF': return 'bg-slate-800/80 border-slate-700'
            case 'PATH': return 'bg-white/5 border-transparent'
            case 'OBSTACLE': return 'bg-red-900/20 border-red-500/30 dashed border-2'
            case 'OFFICE': return 'bg-blue-900/20 border-blue-500/30'
            case 'RECEIVING': return 'bg-emerald-900/20 border-emerald-500/30'
            case 'SHIPPING': return 'bg-orange-900/20 border-orange-500/30'
            default: return 'bg-slate-800 border-slate-700'
        }
    }

    const zoomIn = () => setScale(s => Math.min(s * 1.2, 5))
    const zoomOut = () => setScale(s => Math.max(s / 1.2, 0.2))

    // Mouse wheel zoom with native event listener
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) {
            console.log('WarehouseMap: Canvas ref not found')
            return
        }

        console.log('WarehouseMap: Attaching wheel listener to canvas')

        const handleWheel = (e: WheelEvent) => {
            console.log('Wheel event fired!', e.deltaY)
            e.preventDefault()
            e.stopPropagation()

            const rect = canvas.getBoundingClientRect()
            const mouseX = e.clientX - rect.left
            const mouseY = e.clientY - rect.top

            setScale(prevScale => {
                setOffset(prevOffset => {
                    const worldX = (mouseX - prevOffset.x) / prevScale
                    const worldY = (mouseY - prevOffset.y) / prevScale

                    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
                    const newScale = Math.min(Math.max(prevScale * zoomFactor, 0.2), 5)

                    const newOffsetX = mouseX - worldX * newScale
                    const newOffsetY = mouseY - worldY * newScale

                    return { x: newOffsetX, y: newOffsetY }
                })

                const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
                return Math.min(Math.max(prevScale * zoomFactor, 0.2), 5)
            })
        }

        canvas.addEventListener('wheel', handleWheel, { passive: false })
        return () => {
            console.log('WarehouseMap: Removing wheel listener')
            canvas.removeEventListener('wheel', handleWheel)
        }
    }, [])


    return (
        <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-[#111111] relative rounded-xl border border-white/10 shadow-2xl">
            {/* Toolbar - Now minimal, mostly info */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                <div className="bg-black/50 backdrop-blur-md p-2 rounded-lg border border-white/10 text-xs text-slate-400">
                    <div className="font-bold text-slate-200 mb-1">Thống Kê</div>
                    <div>Racks: {stacks.length}</div>
                    <div>Locations: {locations.length}</div>
                    <div>Scale: {scale.toFixed(2)}x</div>
                </div>
            </div>

            {/* Zoom Controls */}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
                <Button size="icon" variant="secondary" onClick={zoomIn}><ZoomIn className="h-4 w-4" /></Button>
                <Button size="icon" variant="secondary" onClick={zoomOut}><ZoomOut className="h-4 w-4" /></Button>
                <Button size="icon" variant="secondary" onClick={fitView} title="Fit View"><Home className="h-4 w-4" /></Button>
            </div>

            {/* 3D View Overlay */}
            {is3D && (
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-900 to-black">
                    <WarehouseScene3D
                        locations={stacks}
                        onSelect={handleStackMouseDown} // Re-use selection logic?
                    />
                </div>
            )}

            {/* 2D Canvas */}
            {!is3D && (
                <div
                    ref={canvasRef}
                    className="flex-1 relative cursor-grab active:cursor-grabbing overflow-hidden"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}

                    style={{
                        backgroundImage: `
                            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                        `,
                        backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
                        backgroundPosition: `${offset.x}px ${offset.y}px`,
                        touchAction: 'none',
                        overscrollBehavior: 'contain'
                    }}
                >
                    {/* Transform Container - Centered */}
                    <div
                        style={{
                            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                            transformOrigin: '0 0', // We handle origin manually in offset
                            width: '100%',
                            height: '100%',
                            position: 'absolute',
                            top: 0,
                            left: 0
                        }}
                    >
                        {/* Map Elements (Walls/Doors) */}
                        {mapElements.map(el => (
                            <div
                                key={el.id}
                                className={`absolute border-2 ${el.type === 'WALL' ? 'bg-slate-700/50 border-slate-600' : 'bg-blue-500/20 border-blue-400 dashed'}
                                            ${selectedIds.has(el.id) ? 'ring-2 ring-indigo-500' : ''}`}
                                style={{
                                    left: Math.min(el.x, el.metadata?.endX ?? el.x) * GRID_SIZE,
                                    top: Math.min(el.y, el.metadata?.endY ?? el.y) * GRID_SIZE,
                                    width: Math.abs((el.metadata?.endX ?? el.x) - el.x) * GRID_SIZE || 10, // Min width for vertical
                                    height: Math.abs((el.metadata?.endY ?? el.y) - el.y) * GRID_SIZE || 10,
                                    zIndex: 0
                                }}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (mode === 'EDIT') {
                                        setSelectedIds(new Set([el.id]))
                                        setElementToDelete(el.id)
                                    }
                                }}
                            >
                                {el.type === 'DOOR' && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-blue-200">DOOR</div>}
                            </div>
                        ))}

                        {/* Active Drawing Preview */}
                        {tempDraw && (
                            <div
                                className={`absolute border-2 ${tempDraw.type === 'WALL' ? 'bg-slate-700/50 border-slate-600' : 'bg-blue-500/20 border-blue-400 dashed'}`}
                                style={{
                                    left: Math.min(tempDraw.x, tempDraw.metadata?.endX ?? tempDraw.x) * GRID_SIZE,
                                    top: Math.min(tempDraw.y, tempDraw.metadata?.endY ?? tempDraw.y) * GRID_SIZE,
                                    width: Math.abs((tempDraw.metadata?.endX ?? tempDraw.x) - tempDraw.x) * GRID_SIZE || 10,
                                    height: Math.abs((tempDraw.metadata?.endY ?? tempDraw.y) - tempDraw.y) * GRID_SIZE || 10,
                                    zIndex: 10
                                }}
                            />
                        )}


                        {/* Render Stacks */}
                        {stacks.map(stack => (
                            <MemoizedStack
                                key={stack.id}
                                stack={stack}
                                gridSize={GRID_SIZE}
                                isSelected={selectedIds.has(stack.id)}
                                isHighlighted={highlightedIds.has(stack.id)}
                                isEmpty={showEmptySlots && stack.total_boxes === 0 && stack.levels.every(l => l.capacity !== 0)} // Simple Empty Logic
                                onMouseDown={(e) => handleStackMouseDown(e, stack)}
                                onResizeStart={(e) => handleResizeStart(e, stack.id)}
                                showDetails={scale > 0.6}
                                mode={mode}
                                onMouseEnter={(e) => {
                                    setHoveredStack(stack);
                                    // Calculate relative position for tooltip or use mouse
                                }}
                                onMouseLeave={() => setHoveredStack(null)}
                            />
                        ))}
                    </div>

                    {/* Drag Selection Box (Optional - Future) */}

                    {/* Unstack / Delete Zone (Visible when dragging) */}
                    {draggingStackId && mode === 'EDIT' && (
                        <div
                            ref={unstackZoneRef}
                            className="absolute bottom-8 left-1/2 -translate-x-1/2 w-64 h-32 border-2 border-dashed border-red-500/50 bg-red-500/10 rounded-xl flex items-center justify-center text-red-300 font-bold z-20"
                        >
                            <div className="text-center">
                                <Trash2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                Kéo vào đây để Xóa
                                <div className="text-xs font-normal opacity-70">(Hoặc tách chồng)</div>
                            </div>
                        </div>
                    )}

                    {/* Hover Tooltip */}
                    {hoveredStack && mode === 'VIEW' && (
                        <div
                            className="fixed z-50 pointer-events-none bg-slate-900/90 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-200"
                            style={{
                                left: lastMousePos.current.x + 15,
                                top: lastMousePos.current.y + 15
                            }}
                        >
                            <div className="font-bold text-indigo-400 mb-1">{hoveredStack.baseCode}</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <span className="text-slate-500">Items:</span> <span>{hoveredStack.total_items}</span>
                                <span className="text-slate-500">Boxes:</span> <span>{hoveredStack.total_boxes}</span>
                                <span className="text-slate-500">Levels:</span> <span>{hoveredStack.levels.length}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
