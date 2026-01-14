"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Save, ZoomIn, ZoomOut, Move, Grid, Layers, Loader2, MousePointer2, Info, Box, ArrowUp, ArrowDown, Search, X as SearchX, Home, Plus } from "lucide-react"


// Add to interfaces
interface LocationNode {
    id: string
    code: string
    type: 'SHELF' | 'PATH' | 'OBSTACLE' | 'OFFICE' | 'SHIPPING' | 'RECEIVING'
    pos_x: number
    pos_y: number
    width: number
    height: number
    rotation?: number
    level_order?: number // New field
    capacity?: number // Capacity of this location
    stats?: {
        box_count: number
        total_items: number
        boxes?: { id: string, code: string, items: number }[]
    }
}

// ...

// Helper Component for Box Gauge
const BoxGauge = ({ items }: { items: number }) => {
    // 0-100 items scale
    const percent = Math.min(100, Math.max(0, items))
    let color = 'bg-green-500'
    if (percent < 30) color = 'bg-red-500'
    else if (percent < 70) color = 'bg-yellow-500'

    return (
        <div className="w-3 h-4 bg-slate-200 border border-slate-300 rounded-[1px] relative flex items-end overflow-hidden" title={`${items} items`}>
            <div
                className={`w-full ${color} transition-all duration-300`}
                style={{ height: `${percent}%` }}
            ></div>
        </div>
    )
}


// Helper Component for Box Gauge

interface StackNode {
    id: string // Use first location ID as key
    baseCode: string
    pos_x: number
    pos_y: number
    width: number
    height: number
    levels: LocationNode[]
    total_boxes: number
    total_items: number
}

const GRID_SIZE = 120 // px - Increased for better readability

export default function WarehouseMapPage() {
    const [locations, setLocations] = useState<LocationNode[]>([])
    const [stacks, setStacks] = useState<StackNode[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [mode, setMode] = useState<'EDIT' | 'HEATMAP'>('HEATMAP')
    const [scale, setScale] = useState(1)

    // Search State
    const [searchQuery, setSearchQuery] = useState('')
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
    const [isSearching, setIsSearching] = useState(false)

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


    // Canvas State
    const [offset, setOffset] = useState({ x: 0, y: 0 })

    // Interaction State
    const [draggingStackId, setDraggingStackId] = useState<string | null>(null)
    const [resizingStackId, setResizingStackId] = useState<string | null>(null)
    const [selectedStack, setSelectedStack] = useState<StackNode | null>(null)

    const isPanning = useRef(false)
    const lastMousePos = useRef({ x: 0, y: 0 })
    const dragStartPos = useRef({ x: 0, y: 0 }) // For node drag
    const nodeStartPos = useRef({ x: 0, y: 0 }) // Initial node grid pos
    const resizeStartSize = useRef({ width: 0, height: 0 })
    const resizeStartMouse = useRef({ x: 0, y: 0 })
    const unstackZoneRef = useRef<HTMLDivElement>(null)

    const [hasChanges, setHasChanges] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

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

    const fetchData = async () => {
        setLoading(true)
        try {
            const [layoutRes, statsRes] = await Promise.all([
                fetch('/api/map/layout'),
                fetch('/api/map/stats')
            ])
            const layoutJson = await layoutRes.json()
            const statsJson = await statsRes.json()

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

    // --- Mouse Handlers ---

    const handleMouseDown = (e: React.MouseEvent) => {
        // e.target check to see if we clicked a node or canvas
        // Actually, we put onMouseDown on Node specific divs to capture node drag
        // And on container for Pan.
        // But if we bubble up, we can handle everything here if we identify target.
        // Easier: Separate handlers.

        // This is Canvas Pan Handler
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
        setDraggingStackId(stack.id)
        dragStartPos.current = { x: e.clientX, y: e.clientY }
        nodeStartPos.current = { x: stack.pos_x, y: stack.pos_y }
    }

    const handleMouseMove = (e: React.MouseEvent) => {
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

        // 2. Node Dragging
        if (draggingStackId && mode === 'EDIT') {
            // Calculate delta in screen pixels
            const dxPx = (e.clientX - dragStartPos.current.x) / scale
            const dyPx = (e.clientY - dragStartPos.current.y) / scale

            // Convert to Grid Units
            const dxGrid = Math.round(dxPx / GRID_SIZE)
            const dyGrid = Math.round(dyPx / GRID_SIZE)

            // Update local state (Snap to Grid)
            const newX = Math.max(0, nodeStartPos.current.x + dxGrid)
            const newY = Math.max(0, nodeStartPos.current.y + dyGrid)

            // Update ALL locations in this stack
            // We need to find the locations that belong to this stack ID (which is the id of the first element)
            // But wait, we need to update 'locations' state, which will trigger re-stacking.
            // To do this efficiently, we find the subset of locations in the dragged stack.

            const targetStack = stacks.find(s => s.id === draggingStackId)
            if (targetStack) {
                const levelIds = new Set(targetStack.levels.map(l => l.id))

                // Only update if actually moved
                if (newX !== targetStack.pos_x || newY !== targetStack.pos_y) {
                    setHasChanges(true)
                }

                setLocations(prev => prev.map(l =>
                    levelIds.has(l.id) ? { ...l, pos_x: newX, pos_y: newY } : l
                ))
            }
        }
    }

    const fitView = () => {
        if (stacks.length === 0) return

        // 1. Calculate Bounding Box of Layout
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        stacks.forEach(s => {
            minX = Math.min(minX, s.pos_x)
            minY = Math.min(minY, s.pos_y)
            maxX = Math.max(maxX, s.pos_x + s.width)
            maxY = Math.max(maxY, s.pos_y + s.height)
        })

        // Convert to Pixels
        const padding = 40 // px
        const contentW = (maxX - minX) * GRID_SIZE
        const contentH = (maxY - minY) * GRID_SIZE

        // Viewport Dimensions (Approximate, subtracting sidebar/header)
        const viewW = window.innerWidth - 300
        const viewH = window.innerHeight - 150

        // 2. Calculate Scale to Fit
        const scaleX = viewW / contentW
        const scaleY = viewH / contentH
        const newScale = Math.min(Math.min(scaleX, scaleY), 1.5) // Max zoom 1.5
        const safeScale = Math.max(newScale, 0.1) // Min zoom 0.1

        // 3. Center
        // We want (minX * GRID) to be at offset X + padding
        // OffsetX = Padding - (minX * GRID * Scale)
        const newOffsetX = padding + 250 - (minX * GRID_SIZE * safeScale) // +250 for sidebar offset approx
        const newOffsetY = padding - (minY * GRID_SIZE * safeScale)

        setScale(safeScale)
        setOffset({ x: newOffsetX, y: newOffsetY })
    }

    const handleMouseUp = (e: React.MouseEvent) => {
        if (resizingStackId) {
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
                    // Calculate max Y position (bottom edge of all existing locations)
                    const maxY = Math.max(...locations.map(l => (Number(l.pos_y) || 0) + (Number(l.height) || 2)), 0)

                    // Add 5 rows of spacing to create a clear separation zone
                    const startY = maxY + 5

                    // Pre-calculate new positions for deterministic scattering
                    const newPositions = new Map<string, { x: number, y: number }>()
                    let cx = 0
                    let cy = startY
                    targetStack.levels.forEach(l => {
                        newPositions.set(l.id, { x: cx, y: cy })
                        cx += 2 // 2 grid units spacing horizontally
                        if (cx >= 20) { cx = 0; cy += 2 } // Wrap to next row after 10 locations
                    })

                    setLocations(prev => prev.map(l => {
                        if (newPositions.has(l.id)) {
                            const p = newPositions.get(l.id)!
                            return { ...l, pos_x: p.x, pos_y: p.y, level_order: 0 } // Reset level when unstacked
                        }
                        return l
                    }))
                    setHasChanges(true)

                    // Auto-pan to unstack zone
                    const targetLocalY = startY * GRID_SIZE
                    const newOffsetY = 100 - (targetLocalY * scale)
                    setOffset({ x: 0, y: Math.min(0, newOffsetY) })
                    alert(`Đã tách ${targetStack.levels.length} vị trí ra khu vực trống (Row Y=${startY})\n\nCác vị trí đã được đặt cách khu vực chính 5 hàng để tránh đè lên.`)
                    actionTaken = true
                }
            }
        }

        // Auto-fix Level Orders if not unstacked
        if (!actionTaken && draggingStackId && mode === 'EDIT') {
            // Delay slightly to allow React to process the last move? 
            // Actually 'locations' state is already updated by MouseMove. 'stacks' might be stale?
            // stacks is updated in useEffect [locations]. 
            // So we need to calculate based on 'locations' state, not 'stacks'.

            // Group current locations by X,Y
            const grouped = new Map<string, LocationNode[]>()
            locations.forEach(l => {
                const key = `${l.pos_x},${l.pos_y}`
                if (!grouped.has(key)) grouped.set(key, [])
                grouped.get(key)?.push(l)
            })

            let changed = false
            const newLocs = [...locations]

            grouped.forEach((locs) => {
                if (locs.length > 1) {
                    // Check for duplicates in level_order
                    const uniqueOrders = new Set(locs.map(l => l.level_order || 0))
                    if (uniqueOrders.size < locs.length) {
                        // Fix needed
                        // Sort stable: existing order -> ID
                        locs.sort((a, b) => (a.level_order || 0) - (b.level_order || 0) || a.id.localeCompare(b.id))

                        locs.forEach((l, idx) => {
                            const foundIndex = newLocs.findIndex(x => x.id === l.id)
                            if (foundIndex !== -1 && newLocs[foundIndex].level_order !== idx) {
                                newLocs[foundIndex] = { ...newLocs[foundIndex], level_order: idx }
                                changed = true
                            }
                        })
                    }
                }
            })

            if (changed) {
                setLocations(newLocs)
                setHasChanges(true)
                console.log("Auto-corrected stack levels")
            }
        }

        // Auto-fix Level Orders if not unstacked
        if (!actionTaken && draggingStackId && mode === 'EDIT') {
            // Group current locations by X,Y
            const grouped = new Map<string, LocationNode[]>()
            locations.forEach(l => {
                const key = `${l.pos_x},${l.pos_y}`
                if (!grouped.has(key)) grouped.set(key, [])
                grouped.get(key)?.push(l)
            })

            let changed = false
            const newLocs = [...locations]

            grouped.forEach((locs) => {
                if (locs.length > 1) {
                    // Check for duplicates in level_order
                    const uniqueOrders = new Set(locs.map(l => l.level_order || 0))
                    if (uniqueOrders.size < locs.length) {
                        // Fix needed
                        // Sort stable: existing order -> ID
                        locs.sort((a, b) => (a.level_order || 0) - (b.level_order || 0) || a.id.localeCompare(b.id))

                        locs.forEach((l, idx) => {
                            const foundIndex = newLocs.findIndex(x => x.id === l.id)
                            if (foundIndex !== -1 && newLocs[foundIndex].level_order !== idx) {
                                newLocs[foundIndex] = { ...newLocs[foundIndex], level_order: idx }
                                changed = true
                            }
                        })
                    }
                }
            })

            if (changed) {
                setLocations(newLocs)
                setHasChanges(true)
                console.log("Auto-corrected stack levels")
            }
        }

        isPanning.current = false
        setDraggingStackId(null)
    }

    // Modern heatmap colors based on capacity utilization %
    const getStackColor = (stack: StackNode) => {
        // Check if this is a special zone (not a SHELF)
        const firstLevel = stack.levels[0]
        if (firstLevel) {
            if (firstLevel.type === 'OFFICE') {
                return 'bg-blue-100/90 border-blue-500 border-2 text-blue-900' // Office - Blue
            }
            if (firstLevel.type === 'SHIPPING') {
                return 'bg-green-100/90 border-green-500 border-2 text-green-900' // Shipping - Green
            }
            if (firstLevel.type === 'RECEIVING') {
                return 'bg-orange-100/90 border-orange-500 border-2 text-orange-900' // Receiving - Orange
            }
        }

        // Regular shelf color logic
        const boxCount = stack.total_boxes || 0
        // Calculate total capacity from all levels in the stack
        const totalCapacity = stack.levels.reduce((sum, level) => sum + (level.capacity || 10), 0)

        // Calculate utilization percentage
        const utilizationPercent = totalCapacity > 0 ? (boxCount / totalCapacity) * 100 : 0

        // Color based on utilization % (green=low, amber=medium, rose=high/full)
        if (utilizationPercent === 0) return 'bg-slate-50/80 border-slate-300 text-slate-500' // Empty
        if (utilizationPercent < 50) return 'bg-emerald-50/90 border-emerald-400 text-emerald-700' // <50% green
        if (utilizationPercent < 80) return 'bg-amber-50/90 border-amber-400 text-amber-700' // 50-80% amber  
        return 'bg-rose-50/90 border-rose-400 text-rose-700' // >=80% rose (nearly full)
    }

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden select-none">
            {/* Modern Toolbar with Gradient */}
            <div className="gradient-primary px-6 py-4 flex items-center justify-between elevation-lg z-10 shrink-0">
                <div className="flex items-center gap-4">
                    {/* Back Button */}
                    <Link
                        href="/admin"
                        className="glass-strong p-2.5 rounded-lg text-white hover:scale-110 hover:elevation-md transition-all"
                        title="Quay lại Dashboard"
                    >
                        <Home className="w-5 h-5" />
                    </Link>

                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Grid className="w-6 h-6" />
                        Sơ Đồ Kho
                    </h1>

                    {/* Zoom Controls */}
                    <div className="flex items-center glass-strong rounded-lg p-1">
                        <button
                            className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                            onClick={() => setScale(s => Math.max(0.2, s - 0.1))}
                        >
                            <ZoomOut size={18} />
                        </button>
                        <span className="text-sm w-14 text-center font-semibold text-white">{Math.round(scale * 100)}%</span>
                        <button
                            className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                            onClick={() => setScale(s => Math.min(3, s + 0.1))}
                        >
                            <ZoomIn size={18} />
                        </button>
                        <div className="w-px h-6 bg-white/30 mx-1"></div>
                        <button
                            className="px-3 py-2 hover:bg-white/20 rounded transition-colors text-white text-sm font-medium"
                            onClick={fitView}
                            title="Thu phóng vừa màn hình"
                        >
                            Fit
                        </button>
                    </div>

                    {/* Mode Switcher */}
                    <div className="flex glass-strong p-1 rounded-lg">
                        <button
                            onClick={() => setMode('HEATMAP')}
                            className={`
                                px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2
                                ${mode === 'HEATMAP'
                                    ? 'bg-white text-indigo-600 elevation-md'
                                    : 'text-white/80 hover:text-white hover:bg-white/10'
                                }
                            `}
                        >
                            <Layers size={16} /> Heatmap
                        </button>
                        <button
                            onClick={() => setMode('EDIT')}
                            className={`
                                px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2
                                ${mode === 'EDIT'
                                    ? 'bg-white text-indigo-600 elevation-md'
                                    : 'text-white/80 hover:text-white hover:bg-white/10'
                                }
                            `}
                        >
                            <MousePointer2 size={16} /> Chỉnh Sửa
                        </button>
                    </div>

                    {/* Add Zone Dropdown (Edit Mode Only) */}
                    {mode === 'EDIT' && (
                        <div className="relative group">
                            <button className="glass-strong px-4 py-2 rounded-lg text-white font-medium hover:bg-white/20 transition-all flex items-center gap-2">
                                <Plus size={16} />
                                Thêm Khu Vực
                            </button>
                            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[200px]">
                                <button
                                    onClick={async () => {
                                        setLoading(true)
                                        try {
                                            const res = await fetch('/api/map/zones', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ zoneType: 'OFFICE', width: 4, height: 3 })
                                            })
                                            const json = await res.json()
                                            if (json.success) {
                                                alert('Đã thêm Văn phòng kho!')
                                                fetchData()
                                            } else {
                                                alert('Lỗi: ' + json.error)
                                            }
                                        } catch (e) {
                                            alert('Lỗi kết nối')
                                        } finally {
                                            setLoading(false)
                                        }
                                    }}
                                    className="w-full px-4 py-2 text-left hover:bg-slate-100 transition-colors flex items-center gap-2 first:rounded-t-lg"
                                >
                                    <span className="w-3 h-3 bg-blue-500 rounded"></span>
                                    Văn Phòng Kho
                                </button>
                                <button
                                    onClick={async () => {
                                        setLoading(true)
                                        try {
                                            const res = await fetch('/api/map/zones', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ zoneType: 'SHIPPING', width: 5, height: 4 })
                                            })
                                            const json = await res.json()
                                            if (json.success) {
                                                alert('Đã thêm Khu xuất hàng!')
                                                fetchData()
                                            } else {
                                                alert('Lỗi: ' + json.error)
                                            }
                                        } catch (e) {
                                            alert('Lỗi kết nối')
                                        } finally {
                                            setLoading(false)
                                        }
                                    }}
                                    className="w-full px-4 py-2 text-left hover:bg-slate-100 transition-colors flex items-center gap-2"
                                >
                                    <span className="w-3 h-3 bg-green-500 rounded"></span>
                                    Khu Xuất Hàng
                                </button>
                                <button
                                    onClick={async () => {
                                        setLoading(true)
                                        try {
                                            const res = await fetch('/api/map/zones', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ zoneType: 'RECEIVING', width: 5, height: 4 })
                                            })
                                            const json = await res.json()
                                            if (json.success) {
                                                alert('Đã thêm Khu nhập hàng!')
                                                fetchData()
                                            } else {
                                                alert('Lỗi: ' + json.error)
                                            }
                                        } catch (e) {
                                            alert('Lỗi kết nối')
                                        } finally {
                                            setLoading(false)
                                        }
                                    }}
                                    className="w-full px-4 py-2 text-left hover:bg-slate-100 transition-colors flex items-center gap-2 last:rounded-b-lg"
                                >
                                    <span className="w-3 h-3 bg-orange-500 rounded"></span>
                                    Khu Nhập Hàng
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Search Bar */}
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-white/60" />
                        <input
                            placeholder="Tìm SP/Vị trí (A1-01)..."
                            className="w-full pl-10 pr-10 h-10 text-sm glass-strong border-white/30 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-3 text-white/60 hover:text-white transition-colors"
                            >
                                <SearchX className="h-4 w-4" />
                            </button>
                        )}
                        {isSearching && (
                            <div className="absolute right-[-8px] top-[-8px]">
                                <Loader2 className="h-4 w-4 animate-spin text-white" />
                            </div>
                        )}
                    </div>

                    {/* Save Buttons */}
                    {(mode === 'EDIT' || hasChanges) && (
                        <div className="flex items-center gap-2">
                            {hasChanges && (
                                <span className="text-xs text-amber-200 font-bold px-2 py-1 bg-amber-500/30 rounded animate-pulse">
                                    Chưa lưu!
                                </span>
                            )}
                            <button
                                onClick={handleDiscard}
                                disabled={!hasChanges}
                                className="glass-strong px-4 py-2 rounded-lg text-white font-medium hover:bg-rose-500/30 disabled:opacity-30 transition-all"
                            >
                                Hủy Bỏ
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:scale-105 hover:elevation-md disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                {saving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save size={16} />}
                                Lưu
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Viewport */}
            <div
                className={`flex-1 relative overflow-hidden ${mode === 'EDIT' ? 'cursor-default' : 'cursor-grab'} ${isPanning.current ? 'cursor-grabbing' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Unstack Zone Overlay */}
                {
                    mode === 'EDIT' && draggingStackId && (
                        <div
                            ref={unstackZoneRef}
                            className="absolute bottom-12 right-6 w-64 h-32 bg-orange-100 border-2 border-dashed border-orange-400 rounded-xl flex flex-col items-center justify-center z-50 opacity-90 shadow-lg pointer-events-auto"
                        >
                            <Layers className="text-orange-500 mb-2" size={32} />
                            <span className="font-bold text-orange-700">Kéo vào đây để TÁCH KỆ</span>
                            <span className="text-xs text-orange-600">(Unstack)</span>
                        </div>
                    )
                }

                <div
                    className="absolute transition-transform duration-75 ease-out origin-top-left"
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        width: '200000px', height: '200000px'
                    }}
                >
                    {/* Grid Background */}
                    <div
                        className="absolute inset-0 pointer-events-none opacity-10"
                        style={{
                            backgroundImage: `linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)`,
                            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
                        }}
                    ></div>

                    {/* Stacks Loop */}
                    {stacks.map(stack => (
                        <div
                            key={stack.id}
                            onMouseDown={(e) => handleStackMouseDown(e, stack)}
                            className={`
                                absolute border-2 rounded-md shadow-md flex flex-col items-center justify-between p-1 transition-all overflow-hidden
                                ${mode === 'EDIT' ? 'bg-white border-blue-600 hover:ring-2 ring-blue-300 cursor-grab active:cursor-grabbing' : getStackColor(stack)}
                                ${draggingStackId === stack.id ? 'z-50 shadow-2xl scale-105' : 'z-auto hover:shadow-md'}
                                ${
                                // Highlight Check: Check if THIS match ID or ANY level in it matches
                                highlightedIds.has(stack.id) || stack.levels.some(l => highlightedIds.has(l.id))
                                    ? 'ring-4 ring-yellow-400 ring-offset-2 z-40 animate-pulse bg-yellow-100/50'
                                    : ''
                                }
                            `}
                            style={{
                                left: stack.pos_x * GRID_SIZE + 2, // +2 margin
                                top: stack.pos_y * GRID_SIZE + 2,
                                width: stack.width * GRID_SIZE - 4, // -4 margin
                                height: stack.height * GRID_SIZE - 4,
                                transition: draggingStackId === stack.id ? 'none' : 'left 0.2s, top 0.2s'
                            }}
                            onClick={(e) => {
                                e.stopPropagation()
                                if (mode === 'HEATMAP') {
                                    setSelectedStack(stack)
                                }
                            }}
                        >
                            {/* User - Requested Heatmap Design */}
                            {/* Heatmap Mode Display - Reformatted */}
                            {mode === 'HEATMAP' && (
                                <div className="absolute inset-0 flex flex-col p-2.5 pointer-events-none rounded-md">
                                    {/* Top Row: Location Name + Badge - SINGLE LINE ONLY */}
                                    <div className="flex items-center justify-between w-full mb-2">
                                        <span className="font-bold text-sm text-slate-800 leading-none tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex-1">
                                            {stack.levels.length > 1
                                                ? stack.baseCode.substring(0, 5)
                                                : stack.baseCode}
                                        </span>
                                        {stack.levels.length > 1 && (
                                            <span className="flex items-center justify-center bg-slate-700 text-white text-[9px] font-semibold h-4 px-1.5 rounded ml-1" title={`${stack.levels.length} Tầng`}>
                                                {stack.levels.length}F
                                            </span>
                                        )}
                                    </div>

                                    {/* Middle: Box Count */}
                                    <div className="flex-1 flex flex-col items-center justify-center gap-1">
                                        {stack.total_boxes > 0 ? (
                                            <>
                                                <span className={`text-4xl font-black leading-none ${stack.total_items > 500 ? 'text-red-700' :
                                                    stack.total_items > 100 ? 'text-yellow-700' :
                                                        'text-slate-700'
                                                    }`}>
                                                    {stack.total_boxes}
                                                </span>
                                                <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Thùng</span>
                                            </>
                                        ) : (
                                            <span className="text-sm text-slate-300 italic font-light">Empty</span>
                                        )}
                                    </div>

                                    {/* Bottom: Capacity Bar */}
                                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden mt-auto">
                                        {(() => {
                                            const maxCapacity = stack.levels.reduce((sum, level) => sum + (level.capacity || 15), 0) || 15
                                            const percentage = Math.min(100, Math.max(5, (stack.total_boxes / maxCapacity) * 100))
                                            const barColor = percentage > 90 ? 'bg-red-500' :
                                                percentage > 70 ? 'bg-yellow-500' :
                                                    'bg-indigo-500'

                                            return (
                                                <div
                                                    className={`h-full transition-all duration-500 ${barColor}`}
                                                    style={{ width: `${percentage}%` }}
                                                    title={`Sức chứa: ${stack.total_boxes}/${maxCapacity} thùng (${stack.levels.length} tầng)`}
                                                />
                                            )
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Edit Mode Visual */}
                            {mode === 'EDIT' && (
                                <>
                                    <div className="flex-1 flex items-center justify-center text-slate-300 pointer-events-none">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="font-bold text-slate-400">{stack.baseCode}</span>
                                            <Move size={16} />
                                        </div>
                                    </div>
                                    {/* Resize Handle - Bottom Right */}
                                    <div
                                        onMouseDown={(e) => handleResizeStart(e, stack.id)}
                                        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize pointer-events-auto bg-indigo-500 hover:bg-indigo-600 rounded-tl flex items-center justify-center text-white shadow-md transition-all z-10"
                                        title="Kéo để resize"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-80">
                                            <path d="M10 10 L10 7 L7 10 Z M10 10 L10 3 L3 10 Z" fill="currentColor" />
                                        </svg>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div >

            {/* Footer */}
            <div className="bg-white border-t px-4 py-2 text-xs text-muted-foreground flex justify-between shadow-sm z-10 shrink-0">
                <div className="flex gap-4">
                    <span className="flex items-center gap-1"><Info size={12} /> {mode === 'EDIT' ? 'Kéo thả để di chuyển. Kéo vào góc dưới phải để tách kệ.' : 'Click vào Kệ để xem chi tiết.'}</span>
                </div>
                <div>Racks: {stacks.length} | Locations: {locations.length}</div>
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedStack} onOpenChange={(open) => !open && setSelectedStack(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Box className="w-5 h-5 text-indigo-600" />
                                <span>Chi tiết Kệ {selectedStack?.baseCode}</span>
                            </div>
                            <Button
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                size="sm"
                                variant={hasChanges ? "default" : "secondary"}
                                className={`mr-8 ${saving ? 'opacity-50' : ''}`}
                            >
                                {saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                                {hasChanges ? 'Lưu Thay Đổi' : 'Đã Lưu'}
                            </Button>
                        </DialogTitle>
                        <DialogDescription>
                            Tổng {selectedStack?.total_boxes} thùng - {selectedStack?.total_items} sản phẩm
                        </DialogDescription>
                    </DialogHeader>

                    {(() => {
                        if (!selectedStack) return null
                        // Fix stale state: Find the latest version of the selected stack from the 'stacks' array
                        const stack = stacks.find(s => s.id === selectedStack.id) || selectedStack
                        if (!stack) return null

                        // Sort levels descending by level_order (Highest floor first)
                        const sortedLevels = [...stack.levels].sort((a, b) => (b.level_order || 0) - (a.level_order || 0))

                        const moveLevel = (levelId: string, direction: 'up' | 'down') => {
                            // Find current level in the master 'locations' list
                            const levelIndex = locations.findIndex(l => l.id === levelId)
                            if (levelIndex === -1) return

                            // Fix 'All Level 1' bug:
                            // If we detect duplicate level_orders in this stack, we MUST normalize them first.
                            // Or simpler: We treat the current 'sortedLevels' as the TRUTH of order (visual order).
                            // And we simply RE-ASSIGN level_order for the WHOLE stack based on the desired visual swap.

                            const currentVisualIndex = sortedLevels.findIndex(l => l.id === levelId)
                            if (currentVisualIndex === -1) return

                            // Calculate Target Visual Index
                            // Visual UP (Arrow Up) = Previous in List (since list is DESC by level_order, meaning higher floors first)
                            // Wait, sortedLevels = [Floor 2 (Order 1), Floor 1 (Order 0)].
                            // If I am Floor 1 (Index 1). Up Arrow -> I want to be Floor 2.
                            // visual index 1 -> target 0.
                            const targetVisualIndex = direction === 'up' ? currentVisualIndex - 1 : currentVisualIndex + 1

                            if (targetVisualIndex < 0 || targetVisualIndex >= sortedLevels.length) return // Out of bounds

                            // Create a new order array based on the swap
                            const newSortedList = [...sortedLevels]
                            // Swap elements in the list
                            const temp = newSortedList[currentVisualIndex]
                            newSortedList[currentVisualIndex] = newSortedList[targetVisualIndex]
                            newSortedList[targetVisualIndex] = temp

                            // Now, re-assign 'level_order' for EVERY item in this stack based on the new list order.
                            // index 0 = Highest Order (N-1)
                            // index N = Lowest Order (0)
                            const maxOrder = newSortedList.length - 1

                            // Map of ID -> New Order
                            const orderMap = new Map<string, number>()
                            newSortedList.forEach((l, idx) => {
                                orderMap.set(l.id, maxOrder - idx)
                            })

                            // Update Master State
                            // We only touch the locations that are in this stack
                            const stackIds = new Set(newSortedList.map(l => l.id))

                            setLocations(prev => prev.map(l => {
                                if (stackIds.has(l.id)) {
                                    return { ...l, level_order: orderMap.get(l.id) ?? 0 }
                                }
                                return l
                            }))
                            setHasChanges(true)
                        }

                        return (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1 relative">
                                {sortedLevels.map((level, idx) => (
                                    <div key={level.id} className="border rounded-md p-4 bg-slate-50 relative transition-all">
                                        <div className="flex items-center justify-between mb-3 border-b pb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold text-sm">
                                                    Tầng {level.level_order !== undefined ? level.level_order + 1 : idx + 1}
                                                </div>
                                                <span className="font-mono text-xs text-slate-500">{level.code}</span>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="ghost" size="icon" className="h-6 w-6"
                                                    disabled={idx === 0}
                                                    onClick={() => moveLevel(level.id, 'up')}
                                                    title="Chuyển Lên"
                                                >
                                                    <ArrowUp size={14} />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="icon" className="h-6 w-6"
                                                    disabled={idx === sortedLevels.length - 1}
                                                    onClick={() => moveLevel(level.id, 'down')}
                                                    title="Chuyển Xuống"
                                                >
                                                    <ArrowDown size={14} />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Boxes Grid for this Level */}
                                        <div className="grid grid-cols-6 gap-3">
                                            {level.stats?.boxes && level.stats.boxes.length > 0 ? (
                                                level.stats.boxes.map(box => (
                                                    <div key={box.id} className="group relative flex flex-col gap-1">
                                                        <div className="w-full aspect-[3/4] bg-white border border-slate-300 rounded-sm relative flex items-end overflow-hidden shadow-sm">
                                                            <div
                                                                className={`w-full transition-all duration-500 ${box.items > 80 ? 'bg-red-500' : box.items > 30 ? 'bg-yellow-400' : 'bg-green-500'}`}
                                                                style={{ height: `${Math.min(100, box.items)}%` }}
                                                            ></div>
                                                            <span className="absolute inset-x-0 bottom-0 text-[10px] font-bold text-center text-slate-700/80 bg-white/50 backdrop-blur-[1px]">{box.items}</span>
                                                        </div>
                                                        <span className="text-[9px] text-center truncate font-mono text-slate-500" title={box.code}>{box.code.split('-').pop()}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="col-span-6 text-center text-slate-400 text-xs italic py-4 bg-slate-100/50 rounded-lg border border-dashed">
                                                    (Trống)
                                                </div>
                                            )}
                                        </div>
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
