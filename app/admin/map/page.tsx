"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import MemoizedStack from '@/components/map/MemoizedStack'
import Link from "next/link"
import { Save, ZoomIn, ZoomOut, Move, Grid, Layers, Loader2, MousePointer2, Info, Box, ArrowUp, ArrowDown, Search, X as SearchX, Home, Plus, Square, DoorOpen, Trash2, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import WarehouseScene3D from '@/components/map/WarehouseScene3D'

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

export default function WarehouseMapPage() {
    const [locations, setLocations] = useState<LocationNode[]>([])
    const [stacks, setStacks] = useState<StackNode[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [mode, setMode] = useState<'EDIT' | 'HEATMAP'>('HEATMAP')
    const [is3D, setIs3D] = useState(false)
    const [scale, setScale] = useState(1)

    // Search State
    const [searchQuery, setSearchQuery] = useState('')
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
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
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

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
    const [origin, setOrigin] = useState({ x: 0, y: 0 }) // Transform Origin for centering

    // Interaction State
    const [showEmptySlots, setShowEmptySlots] = useState(false) // Toggle for highlighting empty stacks
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
    const canvasRef = useRef<HTMLDivElement>(null) // For wheel zoom
    const dragStartPositions = useRef<Map<string, { x: number, y: number }>>(new Map())

    const [hasChanges, setHasChanges] = useState(false)

    // Map Elements State
    const [mapElements, setMapElements] = useState<DrawElement[]>([])
    const [drawMode, setDrawMode] = useState<'NONE' | 'WALL' | 'DOOR'>('NONE')
    const isDrawing = useRef(false)
    const drawStart = useRef({ x: 0, y: 0 })
    const [tempDraw, setTempDraw] = useState<DrawElement | null>(null)
    const [elementToDelete, setElementToDelete] = useState<string | null>(null)

    // Hover Tooltip State
    const [hoveredStack, setHoveredStack] = useState<StackNode | null>(null)
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

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

    // Mouse wheel zoom handler - Throttled for performance
    useEffect(() => {
        let throttleTimeout: NodeJS.Timeout | null = null

        const handleDocumentWheel = (e: WheelEvent) => {
            const canvas = canvasRef.current
            if (!canvas) return

            // Check if mouse is within canvas bounds
            const rect = canvas.getBoundingClientRect()
            const mouseX = e.clientX
            const mouseY = e.clientY

            if (
                mouseX >= rect.left &&
                mouseX <= rect.right &&
                mouseY >= rect.top &&
                mouseY <= rect.bottom
            ) {
                // Mouse is over map - handle zoom (ONLY scale, NO offset change)
                e.preventDefault()
                e.stopPropagation()

                // Throttle zoom updates to max 60fps (16ms)
                if (!throttleTimeout) {
                    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
                    setScale(prev => Math.min(Math.max(prev * zoomFactor, 0.2), 5))

                    throttleTimeout = setTimeout(() => {
                        throttleTimeout = null
                    }, 16) // ~60fps
                }
            }
        }

        // Attach to document instead of element
        document.addEventListener('wheel', handleDocumentWheel, { passive: false })
        return () => {
            document.removeEventListener('wheel', handleDocumentWheel)
            if (throttleTimeout) clearTimeout(throttleTimeout)
        }
    }, [])

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
                    const targetLocalX = 0 // Scatter starts at X=0
                    const targetLocalY = startY * GRID_SIZE

                    const targetCenterX = targetLocalX
                    const targetCenterY = targetLocalY

                    const viewportCenterX = viewportSize.width / 2
                    const viewportCenterY = viewportSize.height / 2

                    // CRITICAL: In 3D mode, rotation happens around 'transformOrigin'. 
                    // To center a point perfectly in 3D, we must move the 'transformOrigin' to that point,
                    // so the rotation doesn't swing it away from the center.
                    setOrigin({ x: targetCenterX, y: targetCenterY })

                    // Then place that Origin at the center of the Viewport
                    // Offset = ViewportCenter - TargetCenter (since Translate happens before Scale relative to 0,0?)
                    // We simply align the new Origin (Target) to the Viewport Center.
                    setOffset({ x: viewportCenterX - targetCenterX, y: viewportCenterY - targetCenterY })

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
                // Auto-corrected stack levels
            }
        }

        if (!actionTaken && draggingStackId && mode === 'EDIT') {
            const droppedStack = stacks.find(s => s.id === draggingStackId)

            if (droppedStack) {
                // Check overlap with other stacks
                const targetStack = stacks.find(s =>
                    s.id !== draggingStackId &&
                    Math.abs(s.pos_x - droppedStack.pos_x) < 1 &&
                    Math.abs(s.pos_y - droppedStack.pos_y) < 1
                )

                if (targetStack) {
                    // REQUIRE ALT KEY TO MERGE
                    if (e.altKey) {
                        if (confirm(`Gộp ${droppedStack.baseCode} vào ${targetStack.baseCode}?`)) {
                            // Merge dropped -> target
                            const newLocs = locations.map(l => {
                                // Find if this location belongs to dropped stack
                                const inDropped = droppedStack.id === l.id || droppedStack.levels.some(dl => dl.id === l.id)
                                if (inDropped) {
                                    return {
                                        ...l,
                                        pos_x: targetStack.pos_x,
                                        pos_y: targetStack.pos_y,
                                        width: targetStack.width,
                                        height: targetStack.height
                                    }
                                }
                                return l
                            })
                            setLocations(newLocs)
                            setHasChanges(true)

                            // Remove selection after merge to avoid confusion
                            setSelectedIds(new Set())
                        } else {
                            // Cancel merge - Revert visual state by fetching
                            fetchData()
                            return
                        }
                    } else {
                        // Prevent accidental merge - Just move to new spot (allowing overlap visually but NOT merging data)
                        // Commit moves for all selected stacks
                        setLocations(prev => prev.map(l => {
                            // Check if this location belongs to a selected stack
                            const belongingStack = stacks.find(s => s.levels.some(lev => lev.id === l.id || s.id === l.id))

                            if (belongingStack && selectedIds.has(belongingStack.id)) {
                                // Update with the position from Stacks state (visually updated in MouseMove)
                                return {
                                    ...l,
                                    pos_x: belongingStack.pos_x,
                                    pos_y: belongingStack.pos_y
                                }
                            }
                            return l
                        }))
                        setHasChanges(true)
                    }
                } else {
                    // No overlap - Commit move for all selected
                    setLocations(prev => prev.map(l => {
                        const belongingStack = stacks.find(s => s.levels.some(lev => lev.id === l.id || s.id === l.id))
                        if (belongingStack && selectedIds.has(belongingStack.id)) {
                            return {
                                ...l,
                                pos_x: belongingStack.pos_x,
                                pos_y: belongingStack.pos_y
                            }
                        }
                        return l
                    }))
                    setHasChanges(true)
                }
            }
            setDraggingStackId(null)
            setResizingStackId(null)
            return
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
        // Color based on utilization % (green=low, amber=medium, rose=high/full)
        if (utilizationPercent === 0) return 'bg-slate-200 border-slate-300 text-slate-500 shadow-sm' // Empty - Gray (Default)
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

                    {/* 3D View Toggle */}
                    <div className="flex glass-strong p-1 rounded-lg ml-4">
                        <button
                            onClick={() => setIs3D(!is3D)}
                            className={`
                                px-3 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2
                                ${is3D
                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg ring-2 ring-white/20'
                                    : 'text-white/80 hover:text-white hover:bg-white/10'
                                }
                            `}
                            title="Chế độ xem 3D (Isometric)"
                        >
                            <Box size={18} className={is3D ? "animate-pulse" : ""} />
                            <span className="hidden xl:inline">3D View</span>
                        </button>
                    </div>

                    {/* Empty Slot Finder Toggle */}
                    <div className="flex glass-strong p-1 rounded-lg ml-4">
                        <button
                            onClick={() => setShowEmptySlots(!showEmptySlots)}
                            className={`
                                px-3 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2
                                ${showEmptySlots
                                    ? 'bg-emerald-500 text-white shadow-lg ring-2 ring-emerald-300 animate-pulse'
                                    : 'text-white/80 hover:text-white hover:bg-white/10'
                                }
                            `}
                            title="Nhấp nháy các kệ đang trống"
                        >
                            <LayoutGrid size={18} />
                            <span className="hidden xl:inline">Tìm Chỗ Trống</span>
                        </button>
                    </div>

                    {/* Add Zone Dropdown (Edit Mode Only) */}
                    {/* Drawing Tools (Edit Mode Only) */}
                    {mode === 'EDIT' && (
                        <div className="flex bg-white/10 p-1 rounded-lg ml-4 gap-1">
                            <button
                                onMouseDown={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    setDrawMode(drawMode === 'WALL' ? 'NONE' : 'WALL')
                                }}
                                className={`p-2 rounded transition-colors ${drawMode === 'WALL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-white hover:bg-white/20'}`}
                                title="Vẽ Tường (Kéo thả)"
                            >
                                <Square size={18} />
                            </button>
                            <button
                                onMouseDown={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    setDrawMode(drawMode === 'DOOR' ? 'NONE' : 'DOOR')
                                }}
                                className={`p-2 rounded transition-colors ${drawMode === 'DOOR' ? 'bg-white text-indigo-600 shadow-sm' : 'text-white hover:bg-white/20'}`}
                                title="Thêm Cửa (Click)"
                            >
                                <DoorOpen size={18} />
                            </button>
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
                                <span className="text-xs text-amber-200 font-bold px-2 py-1 bg-amber-500/30 rounded animate-pulse whitespace-nowrap">
                                    Chưa lưu!
                                </span>
                            )}
                            <button
                                onClick={handleDiscard}
                                disabled={!hasChanges}
                                className="glass-strong px-4 py-2 rounded-lg text-white font-medium hover:bg-rose-500/30 disabled:opacity-30 transition-all whitespace-nowrap"
                            >
                                Hủy Bỏ
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:scale-105 hover:elevation-md disabled:opacity-50 transition-all flex items-center gap-2 whitespace-nowrap"
                            >
                                {saving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save size={16} />}
                                Lưu
                            </button>
                        </div>
                    )}
                </div>
            </div >


            {/* Viewport */}
            < div
                ref={canvasRef}
                className={`flex-1 relative overflow-visible ${mode === 'EDIT' ? 'cursor-default' : 'cursor-grab'} ${isPanning.current ? 'cursor-grabbing' : ''}`
                }
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={(e) => {
                    // Clear selection if clicking background (and not handled by child)
                    if (!isPanning.current) {
                        setSelectedIds(new Set())
                    }
                }}
            >
                {/* Unstack Zone Overlay */}
                {
                    mode === 'EDIT' && draggingStackId && (
                        <div
                            ref={unstackZoneRef}
                            className="absolute top-28 left-6 w-64 h-32 bg-orange-100 border-2 border-dashed border-orange-400 rounded-xl flex flex-col items-center justify-center z-50 opacity-90 shadow-lg pointer-events-auto"
                        >
                            <Layers className="text-orange-500 mb-2" size={32} />
                            <span className="font-bold text-orange-700">Kéo vào đây để TÁCH KỆ</span>
                            <span className="text-xs text-orange-600">(Unstack)</span>
                        </div>
                    )
                }

                {is3D && (
                    <div className="absolute inset-0 z-0">
                        <WarehouseScene3D
                            stacks={stacks}
                            mapElements={mapElements}
                            GRID_SIZE={GRID_SIZE}
                            scale={scale}
                            is3D={is3D}
                            highlightedIds={highlightedIds}
                            selectedIds={selectedIds}
                            onStackClick={(id) => {
                                // 1. Toggle Tooltip Selection
                                const newSet = new Set(selectedIds)
                                if (newSet.has(id)) newSet.delete(id)
                                else {
                                    newSet.clear(); newSet.add(id)
                                }
                                setSelectedIds(newSet)

                                // 2. Trigger Detail Panel (The User's Request)
                                const clickedStack = stacks.find(s => s.id === id)
                                if (clickedStack) {
                                    setSelectedStack(clickedStack)
                                } else {
                                    setSelectedStack(null)
                                }
                            }}
                        />
                    </div>
                )}

                <div
                    className="absolute transition-all duration-700 ease-in-out"
                    style={{
                        transformOrigin: `${origin.x}px ${origin.y}px`,
                        transform: is3D
                            ? `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotateX(55deg) rotateZ(45deg)`
                            : `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        width: '200000px', height: '200000px',
                        transformStyle: 'preserve-3d',
                        display: is3D ? 'none' : 'block' // Hide 2D layer when 3D is active
                    }}
                >
                    {/* Grid Background */}
                    <div
                        className="absolute inset-0 pointer-events-none opacity-30"
                        style={{
                            backgroundImage: `linear-gradient(#334155 2px, transparent 2px), linear-gradient(90deg, #334155 2px, transparent 2px)`,
                            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
                        }}
                    ></div>

                    {/* SVG Layer for Walls */}
                    <svg className="absolute inset-0 pointer-events-none z-10 overflow-visible"
                        style={{ width: '200000px', height: '200000px' }}
                    >
                        {/* Filter out zero-length elements (dots) */}
                        {mapElements.filter(el => el.type === 'WALL' && (el.x !== (el.metadata?.endX ?? el.x) || el.y !== (el.metadata?.endY ?? el.y))).map(el => (
                            <g key={el.id} onClick={(e) => {
                                if (mode === 'EDIT') {
                                    e.stopPropagation()
                                    if (e.shiftKey || e.ctrlKey) {
                                        setSelectedIds(prev => {
                                            const next = new Set(prev)
                                            if (next.has(el.id)) next.delete(el.id)
                                            else next.add(el.id)
                                            return next
                                        })
                                    } else {
                                        setSelectedIds(new Set([el.id]))
                                    }
                                }
                            }} className="pointer-events-auto cursor-pointer">
                                {/* Invisible thicker line for easier clicking */}
                                <line
                                    x1={el.x * GRID_SIZE}
                                    y1={el.y * GRID_SIZE}
                                    x2={(el.metadata?.endX ?? el.x) * GRID_SIZE}
                                    y2={(el.metadata?.endY ?? el.y) * GRID_SIZE}
                                    stroke="transparent"
                                    strokeWidth={20}
                                />
                                {/* Visible Wall Line */}
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
                        {/* Doors - Blue Dashed Lines */}
                        {mapElements.filter(el => el.type === 'DOOR').map(el => (
                            <g key={el.id} onClick={(e) => {
                                if (mode === 'EDIT') {
                                    e.stopPropagation()
                                    if (e.shiftKey || e.ctrlKey) {
                                        setSelectedIds(prev => {
                                            const next = new Set(prev)
                                            if (next.has(el.id)) next.delete(el.id)
                                            else next.add(el.id)
                                            return next
                                        })
                                    } else {
                                        setSelectedIds(new Set([el.id]))
                                    }
                                }
                            }} className="pointer-events-auto cursor-pointer">
                                {/* Invisible thicker line for easier clicking */}
                                <line
                                    x1={el.x * GRID_SIZE}
                                    y1={el.y * GRID_SIZE}
                                    x2={(el.metadata?.endX ?? el.x) * GRID_SIZE}
                                    y2={(el.metadata?.endY ?? el.y) * GRID_SIZE}
                                    stroke="transparent"
                                    strokeWidth={20}
                                />
                                {/* Visible Door Line */}
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
                                {/* Door Label */}
                                {(() => {
                                    const x1 = el.x * GRID_SIZE
                                    const y1 = el.y * GRID_SIZE
                                    const x2 = (el.metadata?.endX ?? el.x) * GRID_SIZE
                                    const y2 = (el.metadata?.endY ?? el.y) * GRID_SIZE
                                    const cx = (x1 + x2) / 2
                                    const cy = (y1 + y2) / 2

                                    // Determine if line is more vertical or horizontal
                                    const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1)

                                    // Calculate angle, flip for readibility (C at bottom for vertical)
                                    let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)

                                    // For vertical lines going down, rotate -90 (text reads bottom to top)
                                    // For vertical lines, we want text on the LEFT side, rotated so it reads naturally
                                    let offsetX = 0
                                    let offsetY = -50

                                    if (isVertical) {
                                        // Vertical line - put text to the LEFT, rotate -90
                                        offsetX = -60
                                        offsetY = 0
                                        angle = -90 // Text reads from bottom to top (C at bottom)
                                    }

                                    const textX = cx + offsetX
                                    const textY = cy + offsetY

                                    return (
                                        <text
                                            x={textX}
                                            y={textY}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            className="font-black fill-blue-600 pointer-events-none"
                                            style={{
                                                fontSize: '80px',
                                                transform: `rotate(${angle}deg)`,
                                                transformOrigin: `${textX}px ${textY}px`
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

                    {/* Old Door Elements - REMOVED */}

                    {/* Stacks Loop */}
                    {stacks.map(stack => (
                        <MemoizedStack
                            key={stack.id}
                            stack={stack}
                            mode={mode}
                            is3D={is3D}
                            scale={scale}
                            GRID_SIZE={GRID_SIZE}
                            isSelected={selectedIds.has(stack.id)}
                            isHighlighted={highlightedIds.has(stack.id) || stack.levels?.some(l => highlightedIds.has(l.id))}
                            isFlashing={showEmptySlots && stack.total_boxes === 0}
                            isDragging={draggingStackId === stack.id}
                            getStackColor={getStackColor}
                            onMouseDown={handleStackMouseDown}
                            onClick={(e, s) => {
                                e.stopPropagation()
                                if (mode === 'HEATMAP') {
                                    setSelectedStack(s)
                                }
                            }}
                            onMouseEnter={(e, s) => {
                                setHoveredStack(s)
                                setTooltipPos({ x: e.clientX, y: e.clientY })
                            }}
                            onMouseLeave={() => setHoveredStack(null)}
                            onResizeStart={handleResizeStart}
                        />
                    ))}
                </div>
            </div >

            {/* Footer */}
            < div className="bg-white border-t px-4 py-2 text-xs text-muted-foreground flex justify-between shadow-sm z-10 shrink-0" >
                <div className="flex gap-4">
                    <span className="flex items-center gap-1"><Info size={12} /> {mode === 'EDIT' ? 'Kéo thả để di chuyển. Kéo vào góc dưới phải để tách kệ.' : 'Click vào Kệ để xem chi tiết.'}</span>
                </div>
                <div>Racks: {stacks.length} | Locations: {locations.length}</div>
            </div >

            {/* Detail Dialog */}
            < Dialog open={!!selectedStack} onOpenChange={(open) => !open && setSelectedStack(null)}>
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
            </Dialog >

            {/* Delete Confirmation Dialog */}
            {/* Delete Confirmation Dialog */}
            <Dialog open={!!elementToDelete} onOpenChange={(open) => !open && setElementToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Xác nhận xóa</DialogTitle>
                        <DialogDescription>
                            {elementToDelete === 'BATCH'
                                ? `Bạn có chắc chắn muốn xóa ${selectedIds.size} đối tượng đã chọn?`
                                : "Bạn có chắc chắn muốn xóa đối tượng này không?"}
                            Hành động này không thể hoàn tác.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setElementToDelete(null)}>Hủy</Button>
                        <Button variant="destructive" onClick={executeDelete}>Xóa</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Mini Map */}
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
                        const scaleX = 192 / contentW // 48 tailwind w-48 = 192px? No w-48 is 12rem = 192px. 
                        const scaleY = 192 / contentH
                        const mmScale = Math.min(scaleX, scaleY)

                        // 2. Calculate Click Position in Map Units (Grid Coordinates)
                        const gridClickX = (clickX / mmScale) + minX
                        const gridClickY = (clickY / mmScale) + minY

                        // 3. Convert Grid Units to Pixel Coordinates for the main map
                        const targetCenterX = gridClickX * GRID_SIZE
                        const targetCenterY = gridClickY * GRID_SIZE

                        // 2. We want to center the viewport on this point
                        // New Origin wil be this point? NO, origin is always content center (fixed for layout)
                        // We just change Offset.
                        // Formula: Offset = ViewportCenter - TargetCenter * Scale ? NO.

                        // Current Formula: P_screen = (P_map - Origin) * Scale + Origin + Offset
                        // We want P_screen_center = ViewportCenter
                        // ViewportCenter = (TargetCenter - Origin) * Scale + Origin + Offset
                        // Offset = ViewportCenter - Origin - (TargetCenter - Origin) * Scale

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

                        {/* Map Elements Scaed Down */}
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

                                    {/* Viewport Box */}
                                    {/* Viewport Box (Current View) */}
                                    {(() => {
                                        // Calculate Viewport Rect in Map Coordinates
                                        if (viewportSize.width === 0) return null // Wait for client render

                                        const viewW = (viewportSize.width - 260) // Sidebar
                                        const viewH = (viewportSize.height - 80) // Header

                                        // Calculate boundaries in Pixels first (Inverse Transform from Screen to Map Pixel)
                                        const tlX_px = ((0 - origin.x - offset.x) / scale) + origin.x
                                        const tlY_px = ((0 - origin.y - offset.y) / scale) + origin.y

                                        const brX_px = ((viewW - origin.x - offset.x) / scale) + origin.x
                                        const brY_px = ((viewH - origin.y - offset.y) / scale) + origin.y

                                        // Convert to Grid Units for the Mini Map SVG
                                        const tlX = tlX_px / GRID_SIZE
                                        const tlY = tlY_px / GRID_SIZE
                                        const width = (brX_px - tlX_px) / GRID_SIZE
                                        const height = (brY_px - tlY_px) / GRID_SIZE

                                        return (
                                            <rect
                                                x={tlX}
                                                y={tlY}
                                                width={width}
                                                height={height}
                                                fill="transparent"
                                                stroke="#f43f5e"
                                                strokeWidth={2 / mmScale}
                                                vectorEffect="non-scaling-stroke"
                                            />
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
                    {/* Visual Bar representing 1 meter (1 Grid Unit) */}
                    <div className="flex flex-col items-center gap-0.5">
                        <div
                            className="h-2 bg-slate-800 border border-slate-400 relative transition-all duration-300 ease-out"
                            style={{ width: Math.max(20, GRID_SIZE * scale) }}
                        >
                            <div className="absolute top-0 left-0 w-px h-full bg-white/50"></div>
                            <div className="absolute top-0 right-0 w-px h-full bg-white/50"></div>
                        </div>
                        <span className="text-xs font-bold text-slate-800">1m</span>
                    </div>
                </div>
                <span className="text-[10px] text-slate-400">(1 ô = 1 mét)</span>
            </div>

            {/* Hover Tooltip - Fixed to Screen */}
            {hoveredStack && (
                <div
                    className="fixed z-[100] bg-white border border-slate-200 p-4 rounded-xl shadow-2xl text-base pointer-events-none min-w-[300px]"
                    style={{ left: tooltipPos.x, top: tooltipPos.y }}
                >
                    <div className="font-bold text-slate-800 text-lg mb-3 border-b pb-2">{hoveredStack.baseCode}</div>

                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Số lượng kệ (Tầng):</span>
                            <span className="font-semibold">{hoveredStack.levels.length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Tổng thùng:</span>
                            <span className="font-semibold text-indigo-600 text-lg">{hoveredStack.total_boxes}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Tổng sản phẩm:</span>
                            <span className="font-semibold text-indigo-600 text-lg">{hoveredStack.total_items}</span>
                        </div>
                    </div>
                </div>
            )}

        </div >
    )
}
