"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import MemoizedStack from '@/components/map/MemoizedStack'
import Link from "next/link"
import { Save, ZoomIn, ZoomOut, Move, Grid, Layers, Loader2, MousePointer2, Info, Box, ArrowUp, ArrowDown, Search, X as SearchX, Home, Plus, Square, DoorOpen, Trash2, LayoutGrid } from "lucide-react"
import ShelfStacksLayer from '@/components/map/ShelfStacksLayer'
import MapElementsLayer from '@/components/map/MapElementsLayer'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import WarehouseScene3D from '@/components/map/WarehouseScene3D'

// -- Types --
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

const GRID_SIZE = 120 // 1 unit = 120px (Original)

export default function WarehouseMap() {
    const [locations, setLocations] = useState<LocationNode[]>([])
    const [stacks, setStacks] = useState<StackNode[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [mode, setMode] = useState<'HEATMAP' | 'EDIT'>('HEATMAP')
    const [searchQuery, setSearchQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [selectedStack, setSelectedStack] = useState<StackNode | null>(null)
    const [hoveredStack, setHoveredStack] = useState<StackNode | null>(null)
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

    // Viewport State
    const [scale, setScale] = useState(0.35)
    const [offset, setOffset] = useState({ x: 100, y: 100 })
    const [origin, setOrigin] = useState({ x: 0, y: 0 })
    const [is3D, setIs3D] = useState(false)
    const [showEmptySlots, setShowEmptySlots] = useState(false)

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())

    // Interaction State
    const isPanning = useRef(false)
    const lastMousePos = useRef({ x: 0, y: 0 })
    const panStartOffset = useRef({ x: 0, y: 0 }) // Reference offset when pan starts
    const [draggingStackIdState, setDraggingStackId] = useState<string | null>(null)
    const dragStartPos = useRef({ x: 0, y: 0 })
    const [resizingStackIdState, setResizingStackId] = useState<string | null>(null)
    const resizeStartMouse = useRef({ x: 0, y: 0 })
    const resizeStartSize = useRef({ width: 0, height: 0 })
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
    const [drawMode, setDrawMode] = useState<'NONE' | 'WALL' | 'DOOR'>('NONE')
    const isDrawing = useRef(false)
    const [tempDraw, setTempDraw] = useState<DrawElement | null>(null)

    const unstackZoneRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLDivElement>(null)
    const dragStartPositions = useRef<Map<string, { x: number, y: number }>>(new Map())
    const rafId = useRef<number | null>(null)

    const [hasChanges, setHasChanges] = useState(false)
    const [lassoRect, setLassoRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null)
    const isLassoing = useRef(false)
    const lassoStartPos = useRef({ x: 0, y: 0 })

    // Map Elements State
    const [mapElements, setMapElements] = useState<DrawElement[]>([])

    // Data Fetching
    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
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
                setHasChanges(false)
            }
        } catch (error) {
            console.error('Failed to fetch data:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight })
        handleResize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [fetchData])

    const handleSave = async () => {
        try {
            setSaving(true)
            const updates = locations.map(l => ({
                id: l.id,
                code: l.code,
                type: l.type,
                pos_x: Number(l.pos_x) || 0,
                pos_y: Number(l.pos_y) || 0,
                width: Number(l.width) || 2,
                height: Number(l.height) || 2,
                rotation: Number(l.rotation || 0),
                level_order: l.level_order ?? 0
            }))

            const res = await fetch('/api/map/layout', {
                method: 'POST',
                body: JSON.stringify({ updates })
            })
            const json = await res.json()
            if (json.success) {
                setHasChanges(false)
                fetchData()
            }
        } catch (error) {
            console.error('Failed to save:', error)
        } finally {
            setSaving(false)
        }
    }

    const handleDiscard = () => {
        if (confirm('Hủy bỏ các thay đổi chưa lưu?')) {
            fetchData()
            setHasChanges(false)
        }
    }

    // Process locations into stacks
    useEffect(() => {
        const groups = new Map<string, LocationNode[]>()
        locations.forEach(loc => {
            const key = `${loc.pos_x},${loc.pos_y}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)?.push(loc)
        })

        const newStacks: StackNode[] = []
        groups.forEach((levels, key) => {
            levels.sort((a, b) => (a.level_order || 0) - (b.level_order || 0))
            const [x, y] = key.split(',').map(Number)
            if (isNaN(x) || isNaN(y)) return

            newStacks.push({
                id: levels[0].id, // Use ID of first level as stack ID (Original)
                baseCode: levels.length > 1 ? levels[0].code.split('-').slice(0, -1).join('-') : levels[0].code,
                pos_x: x,
                pos_y: y,
                width: levels[0].width || 2,
                height: levels[0].height || 2,
                levels: levels,
                total_boxes: levels.reduce((sum, l) => sum + (l.stats?.box_count || 0), 0),
                total_items: levels.reduce((sum, l) => sum + (l.stats?.total_items || 0), 0)
            })
        })
        setStacks(newStacks)
    }, [locations])

    // Fit View logic
    // Fit View logic
    const fitView = useCallback(() => {
        if (stacks.length === 0) return

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        stacks.forEach(s => {
            minX = Math.min(minX, s.pos_x)
            minY = Math.min(minY, s.pos_y)
            maxX = Math.max(maxX, s.pos_x + s.width)
            maxY = Math.max(maxY, s.pos_y + s.height)
        })

        const contentW = (maxX - minX + 2) * GRID_SIZE
        const contentH = (maxY - minY + 2) * GRID_SIZE

        const viewW = viewportSize.width - 260
        const viewH = viewportSize.height - 100

        if (viewW <= 0 || viewH <= 0) return

        const newScale = Math.min(viewW / contentW, viewH / contentH, 1.2)
        const safeScale = Math.max(newScale, 0.35)

        // Simplified math for centering with 0,0 origin
        const targetX = (viewW / 2) - (((minX + maxX) / 2) * GRID_SIZE * safeScale)
        const targetY = (viewH / 2) - (((minY + maxY) / 2) * GRID_SIZE * safeScale)

        setOffset({ x: targetX, y: targetY })
        setScale(safeScale)
    }, [stacks, viewportSize])

    // Auto-fit on first data load
    const hasAutoFitted = useRef(false)
    useEffect(() => {
        if (stacks.length > 0 && !hasAutoFitted.current && viewportSize.width > 0) {
            setTimeout(fitView, 100)
            hasAutoFitted.current = true
        }
    }, [stacks, viewportSize, fitView])

    // Zoom-to-Mouse
    useEffect(() => {
        let throttleTimeout: NodeJS.Timeout | null = null
        const handleDocumentWheel = (e: WheelEvent) => {
            const canvas = canvasRef.current
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            const mouseX = e.clientX, mouseY = e.clientY
            if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
                e.preventDefault()
                e.stopPropagation()
                if (!throttleTimeout) {
                    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
                    const newScale = Math.min(Math.max(scale * zoomFactor, 0.2), 5)

                    if (newScale !== scale) {
                        // Formula for zooming to point with 0,0 origin:
                        // newOffset = mouse - (mouse - oldOffset) * (newScale / oldScale)
                        const ratio = newScale / scale
                        setOffset(prev => ({
                            x: mouseX - (mouseX - prev.x) * ratio,
                            y: mouseY - (mouseY - prev.y) * ratio
                        }))
                        setScale(newScale)
                    }
                    throttleTimeout = setTimeout(() => { throttleTimeout = null }, 16)
                }
            }
        }
        window.addEventListener('wheel', handleDocumentWheel, { passive: false })
        return () => window.removeEventListener('wheel', handleDocumentWheel)
    }, [scale, offset])

    // Interaction Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1 || e.button === 2) {
            const rect = e.currentTarget.getBoundingClientRect()
            const relativeX = e.clientX - rect.left
            const relativeY = e.clientY - rect.top

            // Shift + Left Click in EDIT mode ALWAYS starts Lasso
            if (mode === 'EDIT' && e.shiftKey && e.button === 0) {
                isLassoing.current = true
                lassoStartPos.current = { x: relativeX, y: relativeY }
                setLassoRect({ x: relativeX, y: relativeY, w: 0, h: 0 })
                return
            }

            // If not Lassoing, check for drawing tools
            if (drawMode !== 'NONE' && mode === 'EDIT' && e.button === 0) {
                const x = (e.clientX - rect.left - offset.x) / scale
                const y = (e.clientY - rect.top - offset.y) / scale
                const gridX = Math.round(x / GRID_SIZE), gridY = Math.round(y / GRID_SIZE)
                isDrawing.current = true
                setTempDraw({ id: `temp-${Date.now()}`, type: drawMode, x: gridX, y: gridY, width: 0, height: 0, rotation: 0, metadata: { endX: gridX, endY: gridY } })
                return
            }

            // Panning: Middle click OR Right click OR Left click (on background)
            const shouldPan = e.button === 1 || e.button === 2 || (e.button === 0 && !e.shiftKey)

            if (shouldPan) {
                isPanning.current = true
                lastMousePos.current = { x: e.clientX, y: e.clientY }
                panStartOffset.current = { ...offset }

                // If clicking background without shift, clear selection immediately
                if (e.button === 0 && !e.shiftKey) {
                    setSelectedIds(new Set())
                    setSelectedStack(null)
                }
            }
        }
    }

    const handleStackMouseDown = (e: React.MouseEvent, stack: StackNode) => {
        if (mode !== 'EDIT') return

        // If Shift is held (Lasso) or if it's a panning button (Right/Middle), 
        // let it bubble to the viewport's handleMouseDown
        if ((e.shiftKey && e.button === 0) || e.button === 1 || e.button === 2) return

        e.stopPropagation()

        // Use functional update to ensure we always have the latest set during rapid clicks
        setSelectedIds(prev => {
            let next: Set<string>
            if (e.ctrlKey || e.metaKey) {
                next = new Set(prev)
                if (next.has(stack.id)) next.delete(stack.id)
                else next.add(stack.id)
            } else {
                // If already selected, keep group for drag. Otherwise start fresh.
                if (prev.has(stack.id)) {
                    next = prev
                } else {
                    next = new Set([stack.id])
                    setSelectedStack(null)
                }
            }

            // Capture initial positions for ALL racks in the NEW selection set
            const initialMap = new Map<string, { x: number, y: number }>()
            stacks.forEach(s => {
                if (next.has(s.id)) initialMap.set(s.id, { x: s.pos_x, y: s.pos_y })
            })
            dragStartPositions.current = initialMap

            return next
        })

        setDraggingStackId(stack.id)
        dragStartPos.current = { x: e.clientX, y: e.clientY }
    }

    const handleResizeStart = (e: React.MouseEvent, stackId: string) => {
        e.stopPropagation()
        setResizingStackId(stackId)
        resizeStartMouse.current = { x: e.clientX, y: e.clientY }
        const stack = stacks.find(s => s.id === stackId)
        if (stack) resizeStartSize.current = { width: stack.width, height: stack.height }
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (rafId.current) cancelAnimationFrame(rafId.current)

        // Capture necessary values OUTSIDE requestAnimationFrame to avoid null e.currentTarget
        const clientX = e.clientX
        const clientY = e.clientY
        const currentTarget = e.currentTarget as HTMLElement
        const rect = currentTarget.getBoundingClientRect()

        rafId.current = requestAnimationFrame(() => {
            if (isDrawing.current && tempDraw) {
                const x = (clientX - rect.left - offset.x - origin.x) / scale + origin.x
                const y = (clientY - rect.top - offset.y - origin.y) / scale + origin.y
                const gridX = Math.round(x / GRID_SIZE), gridY = Math.round(y / GRID_SIZE)
                setTempDraw(p => p ? ({ ...p, metadata: { ...p.metadata, endX: gridX, endY: gridY } }) : null)
                return
            }
            if (resizingStackIdState) {
                const gridDeltaX = Math.round((clientX - resizeStartMouse.current.x) / (GRID_SIZE * scale))
                const gridDeltaY = Math.round((clientY - resizeStartMouse.current.y) / (GRID_SIZE * scale))
                const newW = Math.max(1, resizeStartSize.current.width + gridDeltaX)
                const newH = Math.max(1, resizeStartSize.current.height + gridDeltaY)
                setLocations(prev => prev.map(loc => {
                    const stack = stacks.find(s => s.id === resizingStackIdState)
                    if (stack && stack.levels.some(l => l.id === loc.id)) return { ...loc, width: newW, height: newH }
                    return loc
                }))
                setHasChanges(true); return
            }
            if (isPanning.current) {
                setOffset({
                    x: panStartOffset.current.x + (clientX - lastMousePos.current.x),
                    y: panStartOffset.current.y + (clientY - lastMousePos.current.y)
                })
                return
            }
            if (isLassoing.current) {
                const relX = clientX - rect.left
                const relY = clientY - rect.top
                const x = Math.min(relX, lassoStartPos.current.x), y = Math.min(relY, lassoStartPos.current.y)
                const w = Math.abs(relX - lassoStartPos.current.x), h = Math.abs(relY - lassoStartPos.current.y)
                setLassoRect({ x, y, w, h }); return
            }
            if (draggingStackIdState) {
                const dx = Math.round((clientX - dragStartPos.current.x) / (GRID_SIZE * scale))
                const dy = Math.round((clientY - dragStartPos.current.y) / (GRID_SIZE * scale))
                setStacks(prev => prev.map(s => {
                    const init = dragStartPositions.current.get(s.id)
                    if (init) return { ...s, pos_x: Math.max(0, init.x + dx), pos_y: Math.max(0, init.y + dy) }
                    return s
                }))
                setHasChanges(true)
            }
        })
    }

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isDrawing.current && tempDraw) {
            isDrawing.current = false
            const newEl = { ...tempDraw, id: `el-${Date.now()}` }
            setMapElements(prev => [...prev, newEl])
            fetch('/api/map/elements', { method: 'POST', body: JSON.stringify({ action: 'UPSERT', element: newEl }) })
                .then(() => fetchData())
            setTempDraw(null); setHasChanges(true); return
        }
        if (isLassoing.current && lassoRect) {
            isLassoing.current = false
            const newSelected = new Set(selectedIds)

            // Normalize lasso coordinates for intersection check
            const lX = lassoRect.x, lY = lassoRect.y, lW = lassoRect.w, lH = lassoRect.h

            stacks.forEach(s => {
                // Map coordinates (grid pixels) -> Scale -> Translate (offset)
                // This gives us the coordinate RELATIVE TO THE VIEWPORT CONTAINER
                const x1 = (s.pos_x * GRID_SIZE) * scale + offset.x
                const y1 = (s.pos_y * GRID_SIZE) * scale + offset.y
                const x2 = ((s.pos_x + s.width) * GRID_SIZE) * scale + offset.x
                const y2 = ((s.pos_y + s.height) * GRID_SIZE) * scale + offset.y

                // Intersection check with 2px tolerance for better UX
                const pad = 2
                const intersects = x1 < lX + lW + pad && x2 > lX - pad && y1 < lY + lH + pad && y2 > lY - pad

                if (intersects) {
                    newSelected.add(s.id)
                }
            })
            setSelectedIds(newSelected); setLassoRect(null); return
        }
        if (draggingStackIdState) {
            // Check if dropped in unstack zone
            const unstackRect = unstackZoneRef.current?.getBoundingClientRect()
            const isInsideUnstack = unstackRect &&
                e.clientX >= unstackRect.left && e.clientX <= unstackRect.right &&
                e.clientY >= unstackRect.top && e.clientY <= unstackRect.bottom

            if (isInsideUnstack) {
                const stack = stacks.find(s => s.id === draggingStackIdState)
                if (stack && stack.levels.length > 1) {
                    // Split the stack into single levels
                    const levelIds = stack.levels.map(l => l.id)
                    setLocations(prev => prev.map((l, idx) => {
                        if (levelIds.includes(l.id)) {
                            // Scatter them slightly so they aren't on top of each other
                            const offset = levelIds.indexOf(l.id)
                            return {
                                ...l,
                                pos_x: Math.max(0, stack.pos_x + offset),
                                pos_y: stack.pos_y,
                                level_order: 0 // Reset to level 0 (single level)
                            }
                        }
                        return l
                    }))
                    toast.success(`Đã tách kệ ${stack.baseCode} thành ${stack.levels.length} kệ đơn`)
                }
            } else {
                setLocations(prev => prev.map(l => {
                    const s = stacks.find(st => st.levels.some(lev => lev.id === l.id))
                    if (s && selectedIds.has(s.id)) return { ...l, pos_x: s.pos_x, pos_y: s.pos_y }
                    return l
                }))
            }
            setHasChanges(true)
        }
        isPanning.current = false; setDraggingStackId(null); setResizingStackId(null)
    }

    const deleteElement = async (id: string) => {
        if (confirm('Xóa đối tượng này?')) {
            await fetch('/api/map/elements', { method: 'POST', body: JSON.stringify({ action: 'DELETE', id }) })
            fetchData()
        }
    }

    const getStackColor = (stack: StackNode) => {
        const first = stack.levels[0]; if (!first) return 'bg-slate-200'
        if (first.type === 'OFFICE') return 'bg-blue-100/90 border-blue-500 border-2 text-blue-900'
        if (first.type === 'SHIPPING') return 'bg-green-100/90 border-green-500 border-2 text-green-900'
        if (first.type === 'RECEIVING') return 'bg-orange-100/90 border-orange-500 border-2 text-orange-900'
        const boxes = stack.total_boxes, cap = stack.levels.reduce((sum, l) => sum + (l.capacity || 10), 0)
        const util = cap > 0 ? (boxes / cap) * 100 : 0
        if (util === 0) return 'bg-slate-200 border-slate-300 text-slate-500'
        if (util < 50) return 'bg-emerald-50/90 border-emerald-400 text-emerald-700'
        if (util < 80) return 'bg-amber-50/90 border-amber-400 text-amber-700'
        return 'bg-rose-50/90 border-rose-400 text-rose-700'
    }

    useEffect(() => {
        if (!searchQuery) { setHighlightedIds(new Set()); return }
        const timer = setTimeout(async () => {
            setIsSearching(true)
            try {
                const res = await fetch(`/api/map/search?q=${encodeURIComponent(searchQuery)}`)
                const json = await res.json()
                if (json.success) setHighlightedIds(new Set(json.data))
            } catch (e) {
                console.error("Search failed", e)
            } finally {
                setIsSearching(false)
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [searchQuery])

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden select-none">
            {/* Toolbar */}
            <div className="gradient-primary px-6 py-4 flex items-center justify-between elevation-lg z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/admin" className="glass-strong p-2.5 rounded-lg text-white hover:scale-110 transition-all"><Home className="w-5 h-5" /></Link>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Grid className="w-6 h-6" />Sơ Đồ Kho</h1>
                    <div className="flex items-center glass-strong rounded-lg p-1">
                        <button className="p-2 hover:bg-white/20 rounded text-white" onClick={() => setScale(s => Math.max(0.2, s - 0.1))}><ZoomOut size={18} /></button>
                        <span className="text-sm w-14 text-center font-semibold text-white">{Math.round(scale * 100)}%</span>
                        <button className="p-2 hover:bg-white/20 rounded text-white" onClick={() => setScale(s => Math.min(3, s + 0.1))}><ZoomIn size={18} /></button>
                        <div className="w-px h-6 bg-white/30 mx-1"></div>
                        <button className="px-3 py-2 hover:bg-white/20 rounded text-white text-sm font-medium" onClick={fitView}>Fit</button>
                    </div>
                    <div className="flex glass-strong p-1 rounded-lg">
                        <button onClick={() => setMode('HEATMAP')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${mode === 'HEATMAP' ? 'bg-white text-indigo-600' : 'text-white/80'}`}><Layers size={16} /> Heatmap</button>
                        <button onClick={() => setMode('EDIT')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${mode === 'EDIT' ? 'bg-white text-indigo-600' : 'text-white/80'}`}><MousePointer2 size={16} /> Chỉnh Sửa</button>
                    </div>
                    <div className="flex glass-strong p-1 rounded-lg ml-2">
                        <button onClick={() => setIs3D(!is3D)} className={`px-3 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${is3D ? 'bg-indigo-500 text-white' : 'text-white/80 hover:bg-white/10'}`}>
                            <Box size={18} className={is3D ? "animate-pulse" : ""} />
                            <span>3D View</span>
                        </button>
                    </div>
                    <div className="flex glass-strong p-1 rounded-lg ml-2">
                        <button onClick={() => setShowEmptySlots(!showEmptySlots)} className={`px-3 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${showEmptySlots ? 'bg-emerald-500 text-white animate-pulse' : 'text-white/80 hover:bg-white/10'}`}>
                            <LayoutGrid size={18} />
                            <span>Trống</span>
                        </button>
                    </div>
                    {mode === 'EDIT' && (
                        <div className="flex bg-white/10 p-1 rounded-lg ml-2 gap-1">
                            <button onMouseDown={(e) => { e.preventDefault(); setDrawMode(drawMode === 'WALL' ? 'NONE' : 'WALL') }} className={`p-2 rounded transition-colors ${drawMode === 'WALL' ? 'bg-white text-indigo-600' : 'text-white hover:bg-white/20'}`} title="Vẽ Tường"><Square size={18} /></button>
                            <button onMouseDown={(e) => { e.preventDefault(); setDrawMode(drawMode === 'DOOR' ? 'NONE' : 'DOOR') }} className={`p-2 rounded transition-colors ${drawMode === 'DOOR' ? 'bg-white text-indigo-600' : 'text-white hover:bg-white/20'}`} title="Thêm Cửa"><DoorOpen size={18} /></button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-48 xl:w-64">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-white/60" />
                        <input placeholder="Tìm SP/Vị trí..." className="w-full pl-10 h-10 glass-strong border-white/30 rounded-lg text-white focus:outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    {(mode === 'EDIT' || hasChanges) && (
                        <div className="flex items-center gap-2">
                            {hasChanges && <span className="text-xs text-amber-200 font-bold px-2 py-1 bg-amber-500/30 rounded animate-pulse">Chưa lưu!</span>}
                            <button onClick={handleDiscard} className="glass-strong px-4 py-2 rounded-lg text-white font-medium hover:bg-white/10">Hủy</button>
                            <button onClick={handleSave} className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2">{saving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save size={16} />}Lưu</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Viewport */}
            <div ref={canvasRef} className={`flex-1 relative overflow-hidden ${mode === 'EDIT' ? 'cursor-default' : 'cursor-grab'} ${isPanning.current ? 'cursor-grabbing' : ''}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={(e) => e.preventDefault()}>
                {mode === 'EDIT' && draggingStackIdState && (
                    <div ref={unstackZoneRef} className="absolute top-28 left-6 w-64 h-32 bg-orange-50/80 backdrop-blur border-2 border-dashed border-orange-400 rounded-xl flex flex-col items-center justify-center z-50 shadow-lg animate-in fade-in slide-in-from-left duration-300">
                        <Layers className="text-orange-500 mb-2 animate-bounce" size={32} />
                        <span className="font-bold text-orange-700">Thả vào đây để TÁCH KỆ</span>
                    </div>
                )}

                {is3D && (
                    <div className="absolute inset-0 z-0">
                        <WarehouseScene3D stacks={stacks} mapElements={mapElements} GRID_SIZE={GRID_SIZE} scale={scale} is3D={is3D} highlightedIds={highlightedIds} selectedIds={selectedIds} onStackClick={(id) => {
                            const n = new Set(selectedIds); if (n.has(id)) n.delete(id); else { n.clear(); n.add(id) }; setSelectedIds(n)
                            const s = stacks.find(st => st.id === id); setSelectedStack(s || null)
                        }} />
                    </div>
                )}

                <div className="absolute" style={{
                    transformOrigin: '0 0',
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    width: '300000px', height: '300000px',
                    display: is3D ? 'none' : 'block'
                }}>
                    <div className="absolute inset-0 pointer-events-none opacity-30" style={{ backgroundImage: `linear-gradient(#334155 2px, transparent 2px), linear-gradient(90deg, #334155 2px, transparent 2px)`, backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px` }}></div>
                    <MapElementsLayer mapElements={mapElements} mode={mode} selectedIds={selectedIds} GRID_SIZE={GRID_SIZE} deleteElement={deleteElement} setSelectedIds={setSelectedIds} tempDraw={tempDraw} />
                    <ShelfStacksLayer
                        stacks={stacks} mode={mode} is3D={is3D} scale={scale} GRID_SIZE={GRID_SIZE}
                        selectedIds={selectedIds} highlightedIds={highlightedIds} showEmptySlots={showEmptySlots}
                        draggingStackId={draggingStackIdState} resizingStackId={resizingStackIdState}
                        viewportSize={viewportSize} origin={{ x: 0, y: 0 }} offset={offset} getStackColor={getStackColor}
                        handleStackMouseDown={handleStackMouseDown} setSelectedStack={setSelectedStack}
                        setHoveredStack={setHoveredStack} setTooltipPos={setTooltipPos} handleResizeStart={handleResizeStart}
                    />
                </div>

                {lassoRect && <div className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-[1000] rounded-sm" style={{ left: lassoRect.x, top: lassoRect.y, width: lassoRect.w, height: lassoRect.h }} />}

                {/* Mini Map - Original Implementation */}
                <div className="absolute bottom-6 right-6 w-48 h-48 bg-slate-900/90 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50 transition-opacity hover:opacity-100 opacity-80">
                    <div className="relative w-full h-full cursor-crosshair"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const clickX = e.clientX - rect.left
                            const clickY = e.clientY - rect.top

                            // Recalculate bounds logic matches the render logic below
                            let minX = 0, minY = 0, maxX = 100, maxY = 100
                            if (stacks.length > 0) {
                                minX = Math.min(...stacks.map(s => s.pos_x), ...mapElements.map(e => e.x)) - 10
                                minY = Math.min(...stacks.map(s => s.pos_y), ...mapElements.map(e => e.y)) - 10
                                maxX = Math.max(...stacks.map(s => s.pos_x + s.width), ...mapElements.map(e => Math.max(e.x, e.metadata?.endX || e.x))) + 10
                                maxY = Math.max(...stacks.map(s => s.pos_y + s.height), ...mapElements.map(e => Math.max(e.y, e.metadata?.endY || e.y))) + 10
                            }
                            const contentW = maxX - minX
                            const contentH = maxY - minY
                            const scaleX = 192 / contentW
                            const scaleY = 192 / contentH
                            const mmScale = Math.min(scaleX, scaleY)

                            // 2. Calculate Click Position in Map Units (Grid Coordinates)
                            const gridClickX = (clickX / mmScale) + minX
                            const gridClickY = (clickY / mmScale) + minY

                            // 3. Convert Grid Units to Pixel Coordinates for the main map
                            const targetCenterX = gridClickX * GRID_SIZE
                            const targetCenterY = gridClickY * GRID_SIZE

                            const viewportCenterX = viewportSize.width / 2
                            const viewportCenterY = viewportSize.height / 2

                            const newOffsetX = viewportCenterX - origin.x - (targetCenterX - origin.x) * scale
                            const newOffsetY = viewportCenterY - origin.y - (targetCenterY - origin.y) * scale

                            setOffset({ x: newOffsetX, y: newOffsetY })
                        }}
                    >
                        <svg className="w-full h-full" viewBox="0 0 192 192" preserveAspectRatio="xMinYMin meet">
                            {/* Background */}
                            <rect x="0" y="0" width="192" height="192" fill="#0f172a" />

                            {/* Map Elements Scaled Down */}
                            {(() => {
                                let minX = 0, minY = 0, maxX = 100, maxY = 100
                                if (stacks.length > 0 || mapElements.length > 0) {
                                    const allX = [...stacks.map(s => s.pos_x), ...mapElements.map(e => e.x)]
                                    const allY = [...stacks.map(s => s.pos_y), ...mapElements.map(e => e.y)]
                                    if (allX.length > 0) {
                                        minX = Math.min(...allX) - 10
                                        minY = Math.min(...allY) - 10
                                        maxX = Math.max(...stacks.map(s => s.pos_x + s.width), ...mapElements.map(e => Math.max(e.x, e.metadata?.endX || e.x))) + 10
                                        maxY = Math.max(...stacks.map(s => s.pos_y + s.height), ...mapElements.map(e => Math.max(e.y, e.metadata?.endY || e.y))) + 10
                                    }
                                }
                                const contentW = maxX - minX
                                const contentH = maxY - minY
                                const scaleX = 192 / contentW
                                const scaleY = 192 / contentH
                                const mmScale = Math.min(scaleX, scaleY) || 1

                                return (
                                    <g transform={`scale(${mmScale}) translate(${-minX}, ${-minY})`}>
                                        {/* Stacks */}
                                        {stacks.map(s => (
                                            <rect key={s.id} x={s.pos_x} y={s.pos_y} width={s.width} height={s.height} fill={s.levels.length > 1 ? "#3b82f6" : "#64748b"} opacity={0.6} />
                                        ))}
                                        {/* Walls */}
                                        {mapElements.filter(e => e.type === 'WALL').map(e => (
                                            <line key={e.id}
                                                x1={e.x} y1={e.y}
                                                x2={e.metadata?.endX ?? e.x} y2={e.metadata?.endY ?? e.y}
                                                stroke="#94a3b8" strokeWidth={Math.max(1, 2 / mmScale)}
                                            />
                                        ))}
                                        {/* Doors */}
                                        {mapElements.filter(e => e.type === 'DOOR').map(e => (
                                            <line key={e.id}
                                                x1={e.x} y1={e.y}
                                                x2={e.metadata?.endX ?? e.x} y2={e.metadata?.endY ?? e.y}
                                                stroke="#3b82f6" strokeWidth={Math.max(1, 2 / mmScale)} strokeDasharray={`${5 / mmScale},${3 / mmScale}`}
                                            />
                                        ))}

                                        {/* Viewport Box (Current View) */}
                                        {(() => {
                                            if (viewportSize.width === 0) return null
                                            const vW = (viewportSize.width - 260)
                                            const vH = (viewportSize.height - 80)
                                            const tlX_px = ((0 - origin.x - offset.x) / scale) + origin.x
                                            const tlY_px = ((0 - origin.y - offset.y) / scale) + origin.y
                                            const brX_px = ((vW - origin.x - offset.x) / scale) + origin.x
                                            const brY_px = ((vH - origin.y - offset.y) / scale) + origin.y
                                            const tlX = tlX_px / GRID_SIZE
                                            const tlY = tlY_px / GRID_SIZE
                                            const w = (brX_px - tlX_px) / GRID_SIZE
                                            const h = (brY_px - tlY_px) / GRID_SIZE
                                            return (
                                                <rect x={tlX} y={tlY} width={w} height={h} fill="transparent" stroke="#f43f5e" strokeWidth={2 / mmScale} vectorEffect="non-scaling-stroke" />
                                            )
                                        })()}
                                    </g>
                                )
                            })()}
                        </svg>
                    </div>
                </div>

                {/* Scale Indicator - Bottom Left */}
                <div className="absolute bottom-6 left-6 bg-white/90 glass-strong border border-slate-200 p-2 rounded-lg shadow-lg z-50 flex flex-col items-center gap-1 pointer-events-none transition-opacity hover:opacity-100 opacity-80">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Scale</span>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-center gap-0.5">
                            <div className="h-2 bg-slate-800 border border-slate-400 relative transition-all duration-300 ease-out" style={{ width: Math.max(20, GRID_SIZE * scale) }}>
                                <div className="absolute top-0 left-0 w-px h-full bg-white/50"></div>
                                <div className="absolute top-0 right-0 w-px h-full bg-white/50"></div>
                            </div>
                            <span className="text-xs font-bold text-slate-800">1m</span>
                        </div>
                    </div>
                    <span className="text-[10px] text-slate-400">(1 ô = 1 mét)</span>
                </div>

                {/* Interaction Help Overlay - Pushed higher for better spacing */}
                <div className="absolute bottom-56 right-6 z-[1100] group">
                    <div className="bg-slate-900 border border-white/20 p-5 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 pointer-events-none w-72 absolute bottom-0 right-14 origin-right">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2 border-b border-white/20 pb-2 text-sm uppercase tracking-wider">
                            <Info size={18} className="text-blue-400" /> Hướng dẫn thao tác
                        </h4>
                        <div className="space-y-4 text-[13px] text-white">
                            <div className="flex items-start gap-3">
                                <div className="bg-white/20 p-1.5 rounded border border-white/20 shrink-0"><MousePointer2 size={14} /></div>
                                <div><b className="text-blue-300">Chuột trái:</b> Chọn kệ / Xem chi tiết sản phẩm</div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-white/20 p-1.5 rounded border border-white/20 flex gap-0.5 shrink-0"><div className="w-1.5 h-3 bg-blue-400/50 rounded-sm"></div><div className="w-1.5 h-3 bg-blue-400 rounded-sm"></div></div>
                                <div><b className="text-blue-300">Chuột Phải/Giữa:</b> Giữ và kéo để di chuyển bản đồ</div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-white/20 p-1.5 rounded border border-white/20 shrink-0"><MousePointer2 size={14} className="rotate-180" /></div>
                                <div><b className="text-blue-300">Cuộn chuột:</b> Phóng to / Thu nhỏ</div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-white/20 px-2 py-1 rounded border border-white/20 font-mono text-[10px] shrink-0 text-white font-bold">SHIFT</div>
                                <div><b className="text-blue-300">Shift + Kéo:</b> Quét chọn vùng (Chế độ Edit)</div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-white/20 px-2 py-1 rounded border border-white/20 font-mono text-[10px] shrink-0 text-white font-bold">CTRL</div>
                                <div><b className="text-blue-300">Ctrl + Click:</b> Chọn lẻ nhiều kệ</div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-white/20 p-1.5 rounded border border-white/20 shrink-0"><Layers size={14} /></div>
                                <div><b className="text-blue-300">Kéo kệ:</b> Di chuyển cả nhóm (Chế độ Edit)</div>
                            </div>
                            <div className="flex items-start gap-3 pt-2 border-t border-white/10 italic text-white/80 font-medium text-[11px]">
                                <span>* Click ra vùng trống để bỏ chọn tất cả</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-indigo-600 text-white p-3 rounded-full shadow-lg flex items-center justify-center cursor-help hover:bg-indigo-500 transition-all hover:scale-110 border border-t-white/50 border-white/20">
                        <Info size={24} />
                    </div>
                </div>

            </div>

            {/* Footer */}
            <div className="bg-white border-t px-4 py-2 text-[10px] md:text-xs text-muted-foreground flex justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 font-medium"><MousePointer2 size={12} /> {mode === 'EDIT' ? 'Mode Chỉnh Sửa' : 'Mode Theo Dõi'}</span>
                    <span className="w-px h-3 bg-gray-300"></span>
                    <span className="flex items-center gap-1">Racks: <b className="text-gray-900">{stacks.length}</b></span>
                    <span className="flex items-center gap-1 text-blue-600">Selected: <b className="bg-blue-50 px-1 rounded">{selectedIds.size}</b></span>
                </div>
                <div className="hidden md:block italic">Giữ Shift + Kéo để quét chọn kệ trong Edit Mode</div>
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedStack} onOpenChange={(open) => !open && setSelectedStack(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2"><Box className="w-5 h-5 text-indigo-600" /><span>Chi tiết Kệ {selectedStack?.baseCode}</span></div>
                            <Button onClick={handleSave} disabled={saving || !hasChanges} size="sm" variant={hasChanges ? "default" : "secondary"} className="mr-8">{saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}{hasChanges ? 'Lưu Thay Đổi' : 'Đã Lưu'}</Button>
                        </DialogTitle>
                        <DialogDescription>Tổng {selectedStack?.total_boxes} thùng - {selectedStack?.total_items} sản phẩm</DialogDescription>
                    </DialogHeader>
                    {(() => {
                        if (!selectedStack) return null
                        const s = stacks.find(st => st.id === selectedStack.id) || selectedStack
                        const sorted = [...s.levels].sort((a, b) => (b.level_order || 0) - (a.level_order || 0))
                        const moveLevel = (id: string, dir: 'up' | 'down') => {
                            const curIdx = sorted.findIndex(l => l.id === id)
                            const tarIdx = dir === 'up' ? curIdx - 1 : curIdx + 1
                            if (tarIdx < 0 || tarIdx >= sorted.length) return
                            const newList = [...sorted], [moved] = newList.splice(curIdx, 1); newList.splice(tarIdx, 0, moved)
                            const max = newList.length - 1, map = new Map<string, number>()
                            newList.forEach((l, i) => map.set(l.id, max - i))
                            const ids = new Set(newList.map(l => l.id))

                            // Update locations and selection to trigger re-render
                            const updatedLocations = locations.map(l => ids.has(l.id) ? { ...l, level_order: map.get(l.id) ?? 0 } : l)
                            setLocations(updatedLocations)
                            setHasChanges(true)

                            // Optimization: Update selectedStack to refresh the dialog content immediately
                            const updatedStack = { ...s, levels: s.levels.map(l => ids.has(l.id) ? { ...l, level_order: map.get(l.id) ?? 0 } : l) }
                            setSelectedStack(updatedStack)
                        }
                        return (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
                                {sorted.map((level, idx) => (
                                    <div key={level.id} className="border rounded-md p-4 bg-slate-50">
                                        <div className="flex items-center justify-between mb-3 border-b pb-2">
                                            <div className="flex items-center gap-2"><div className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold text-sm">Tầng {(level.level_order ?? 0) + 1}</div><span className="font-mono text-xs text-slate-500">{level.code}</span></div>
                                            <div className="flex gap-1">
                                                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveLevel(level.id, 'up')}><ArrowUp size={14} /></Button>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === sorted.length - 1} onClick={() => moveLevel(level.id, 'down')}><ArrowDown size={14} /></Button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                                <span>Sơ đồ lấp đầy ({level.stats?.box_count || 0}/{level.capacity || 15})</span>
                                                <span className={level.stats?.box_count && level.stats.box_count >= (level.capacity || 15) ? "text-rose-500" : "text-indigo-400"}>
                                                    {Math.round(((level.stats?.box_count || 0) / (level.capacity || 15)) * 100)}%
                                                </span>
                                            </div>
                                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-inner flex flex-wrap gap-1.5 min-h-[60px] content-start">
                                                {(() => {
                                                    const capacity = level.capacity || 15
                                                    const boxCount = level.stats?.box_count || 0
                                                    const boxes = level.stats?.boxes || []

                                                    return Array.from({ length: capacity }).map((_, i) => {
                                                        const isFilled = i < boxCount
                                                        const boxData = isFilled ? boxes[i % boxes.length] : null

                                                        return (
                                                            <div
                                                                key={i}
                                                                className={`
                                                                    w-8 h-8 rounded-md flex items-center justify-center transition-all duration-300 border-2
                                                                    ${isFilled
                                                                        ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm scale-100'
                                                                        : 'bg-slate-50 border-slate-100 text-slate-200 scale-95 opacity-50'}
                                                                `}
                                                                title={boxData ? `Thùng: ${boxData.code} (${boxData.items} SP)` : 'Vị trí trống'}
                                                            >
                                                                {isFilled ? <Box size={14} className="animate-in zoom-in duration-300" /> : <div className="w-1 h-1 bg-slate-300 rounded-full" />}
                                                            </div>
                                                        )
                                                    })
                                                })()}
                                            </div>
                                        </div>

                                        {level.stats?.boxes && level.stats.boxes.length > 0 && (
                                            <div className="mt-4 flex flex-col gap-2">
                                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">Danh sách thùng:</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {level.stats.boxes.map(b => (
                                                        <div key={b.id} className="group relative bg-white border border-slate-200 pl-2 pr-3 py-1.5 rounded-full text-xs flex items-center gap-2 hover:border-indigo-400 hover:shadow-sm transition-all cursor-default">
                                                            <div className="w-2 h-2 bg-indigo-500 rounded-full group-hover:animate-pulse" />
                                                            <span className="font-mono font-bold text-slate-700">{b.code}</span>
                                                            <span className="text-slate-400 font-medium">{b.items} sp</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    )
}
