
"use client"

import React, { useMemo, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Html } from '@react-three/drei'
import { EffectComposer, N8AO, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// --- Types (Mirrored from page.tsx for now to avoid circular deps or complex shared types file if not exists) ---
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

interface WarehouseSceneProps {
    stacks: StackNode[]
    mapElements: any[] // Walls/Doors
    GRID_SIZE: number
    scale: number
    is3D: boolean
    highlightedIds: Set<string>
    selectedIds?: Set<string>
    onStackClick: (stackId: string, isMultiSelect: boolean) => void
    onClearSelection?: () => void
}

const Shelves = ({ stacks, GRID_SIZE, highlightedIds, selectedIds, onStackClick }: {
    stacks: StackNode[],
    GRID_SIZE: number,
    highlightedIds: Set<string>
    selectedIds: Set<string>
    onStackClick: (id: string, isMultiSelect: boolean) => void
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null)
    const [hoveredInstance, setHoveredInstance] = useState<number | null>(null)
    const [hoveredStackIdx, setHoveredStackIdx] = useState<number | null>(null)

    // Derived Selection State for Tooltip (Persistent)
    const selectedStackIdx = useMemo(() => {
        if (!selectedIds || selectedIds.size === 0) return null
        const id = Array.from(selectedIds)[0]
        const idx = stacks.findIndex(s => s.id === id)
        return idx
    }, [selectedIds, stacks])

    // Pre-calculate total levels to set instance count
    const totalLevels = useMemo(() => stacks.reduce((sum, s) => sum + (s.levels.length || 1), 0), [stacks])

    // Map instanceId back to Stack for interaction
    const instanceToStackMap = useMemo(() => {
        const map: number[] = [] // Index -> Stack Index
        stacks.forEach((s, sIdx) => {
            const count = s.levels.length || 1
            for (let i = 0; i < count; i++) map.push(sIdx)
        })
        return map
    }, [stacks])

    const { tempObject } = useMemo(() => {
        const tempObject = new THREE.Object3D()
        return { tempObject }
    }, []) // Removed colorArray from here as it's now calculated inside useEffect

    // Base Colors Ref to avoid re-calculating everything
    const baseColors = useRef<Float32Array | null>(null)

    // Initial Color Calculation (Run once or when stacks change)
    useEffect(() => {
        if (!meshRef.current) return

        const count = totalLevels
        const colors = new Float32Array(count * 3)
        const color = new THREE.Color()
        const tempObject = new THREE.Object3D()
        let instanceIdx = 0

        stacks.forEach((stack, sIdx) => {
            // Position Base
            const x = (stack.pos_x * GRID_SIZE) + (stack.width * GRID_SIZE) / 2
            const y = -((stack.pos_y * GRID_SIZE) + (stack.height * GRID_SIZE) / 2)

            const width = Math.max(stack.width * GRID_SIZE - 4, 20)
            const depth = Math.max(stack.height * GRID_SIZE - 4, 20)
            const levelHeight = 60
            const gap = 20

            const levelsFromBottom = stack.levels.length > 0 ? stack.levels : [{} as any]

            levelsFromBottom.forEach((level, lvlIdx) => {
                const z = (lvlIdx * (levelHeight + gap)) + (levelHeight / 2)

                tempObject.position.set(x, y, z)
                tempObject.scale.set(width, depth, levelHeight)
                tempObject.updateMatrix()
                meshRef.current!.setMatrixAt(instanceIdx, tempObject.matrix)

                // Color Logic (Per Level)
                const boxCount = level.stats?.box_count || 0
                const capacity = level.capacity || 10
                const util = capacity > 0 ? (boxCount / capacity) * 100 : 0

                let c = '#cbd5e1' // Slate-300
                if (util > 0) {
                    if (util < 50) c = '#6ee7b7'
                    else if (util < 80) c = '#fcd34d'
                    else c = '#fca5a5'
                }
                if (level.type === 'OFFICE') c = '#93c5fd'
                if (level.type === 'SHIPPING') c = '#6ee7b7'
                if (level.type === 'RECEIVING') c = '#fdba74'
                if (highlightedIds.has(stack.id)) c = '#facc15'

                color.set(c)
                color.toArray(colors, instanceIdx * 3)

                // Apply to mesh immediately
                meshRef.current!.setColorAt(instanceIdx, color)
                instanceIdx++
            })
        })

        baseColors.current = colors
        meshRef.current.instanceMatrix.needsUpdate = true
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true

    }, [stacks, GRID_SIZE, highlightedIds, totalLevels, tempObject]) // Removed hoveredStackIdx

    useEffect(() => {
        if (!meshRef.current || !baseColors.current) return

        // 1. Reset ALL instances to base colors
        // This ensures unselected/unhovered items revert to their original state
        const count = totalLevels
        for (let i = 0; i < count; i++) {
            const r = baseColors.current[i * 3 + 0]
            const g = baseColors.current[i * 3 + 1]
            const b = baseColors.current[i * 3 + 2]
            meshRef.current.setColorAt(i, new THREE.Color(r, g, b))
        }

        // 2. Apply Hover Highlight
        if (hoveredStackIdx !== null) {
            let idx = 0
            stacks.forEach((s, sIdx) => {
                const levels = s.levels.length || 1
                if (sIdx === hoveredStackIdx) {
                    for (let i = 0; i < levels; i++) {
                        meshRef.current!.setColorAt(idx + i, new THREE.Color('#38bdf8')) // Sky-400
                    }
                }
                idx += levels
            })
        }

        // 3. Apply Selection Highlight
        // Note: Selection overrides hover if we want, or blends. 
        // Here we let selection override hover if both exist on same (unlikely if single select, but possible)
        if (selectedIds && selectedIds.size > 0) {
            let idx = 0
            stacks.forEach((s, sIdx) => {
                const levels = s.levels.length || 1
                if (selectedIds.has(s.id)) {
                    for (let i = 0; i < levels; i++) {
                        meshRef.current!.setColorAt(idx + i, new THREE.Color('#4f46e5')) // Indigo-600
                    }
                }
                idx += levels
            })
        }

        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true

        // No need for prevHoveredRef logic anymore since we brute-force reset. 
        // Performance should be fine for <10k instances.

        // CRITICAL: Compute bounding sphere for Raycasting to work!
        if (meshRef.current) {
            meshRef.current.computeBoundingSphere()
        }

    }, [hoveredStackIdx, stacks, selectedIds, totalLevels])


    return (
        <>
            <instancedMesh
                ref={meshRef}
                args={[undefined, undefined, totalLevels]}
                frustumCulled={false} // Prevent culling issues when rotating
                onClick={(e) => {
                    e.stopPropagation() // Stop triggering onPointerMissed
                    const instanceId = e.instanceId

                    if (instanceId !== undefined && instanceToStackMap[instanceId] !== undefined) {
                        const stackId = stacks[instanceToStackMap[instanceId]].id
                        // Check for modifier keys from the native event
                        const isMultiSelect = e.nativeEvent.ctrlKey || e.nativeEvent.metaKey || e.nativeEvent.shiftKey
                        onStackClick(stackId, isMultiSelect)
                    }
                }}
                onPointerOver={(e) => {
                    e.stopPropagation()
                    const idx = e.instanceId
                    setHoveredInstance(idx ?? null)
                    setHoveredStackIdx(idx !== undefined ? instanceToStackMap[idx] : null)
                    document.body.style.cursor = 'pointer'
                }}
                onPointerOut={() => {
                    setHoveredInstance(null)
                    setHoveredStackIdx(null)
                    document.body.style.cursor = 'auto'
                }}
            >
                <boxGeometry args={[1, 1, 1]} />
                {/* Modern Material: Slightly glossy, rounded edges effect via roughness */}
                <meshPhysicalMaterial
                    color="#ffffff"
                    transmission={0}
                    roughness={0.2}
                    metalness={0.1}
                    clearcoat={0.5}
                    clearcoatRoughness={0.1}
                />
            </instancedMesh>

            {/* Tooltip for Hover OR Selection */}
            {((hoveredStackIdx !== null && stacks[hoveredStackIdx]) || (selectedStackIdx !== null && selectedStackIdx !== -1 && stacks[selectedStackIdx])) && (
                <Html
                    position={[
                        (stacks[hoveredStackIdx ?? selectedStackIdx!].pos_x * GRID_SIZE) + (stacks[hoveredStackIdx ?? selectedStackIdx!].width * GRID_SIZE) + 40,
                        -((stacks[hoveredStackIdx ?? selectedStackIdx!].pos_y * GRID_SIZE) + (stacks[hoveredStackIdx ?? selectedStackIdx!].height * GRID_SIZE) / 2),
                        Math.max((stacks[hoveredStackIdx ?? selectedStackIdx!].levels.length || 1) * 80, 10) + 40
                    ]}
                    center
                    style={{ pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10000 }} // High zIndex + pointerEvents none
                    pointerEvents="none"
                    zIndexRange={[100, 0]} // Force on top
                >
                    <div className={`
                    backdrop-blur text-white px-4 py-3 rounded-lg shadow-2xl border text-sm shadow-blue-500/20 translate-x-[50%] min-w-[180px]
                    ${selectedStackIdx !== null && hoveredStackIdx === null ? 'bg-indigo-900/95 border-indigo-500 ring-2 ring-indigo-400' : 'bg-slate-900/90 border-slate-700'}
                `}>
                        <div className="font-bold text-base text-yellow-400 mb-2 border-b border-white/10 pb-1">
                            {stacks[hoveredStackIdx ?? selectedStackIdx!].baseCode}
                            {(selectedStackIdx !== null && hoveredStackIdx === null) && <span className="text-xs text-white/50 ml-2">(Đang chọn)</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
                            <span>Thùng:</span>
                            <span className="font-mono text-white text-right">{stacks[hoveredStackIdx ?? selectedStackIdx!].total_boxes}</span>
                            <span>Items:</span>
                            <span className="font-mono text-white text-right">{stacks[hoveredStackIdx ?? selectedStackIdx!].total_items}</span>
                            <span>Tầng:</span>
                            <span className="font-mono text-white text-right">{stacks[hoveredStackIdx ?? selectedStackIdx!].levels.length}</span>
                        </div>
                    </div>
                </Html>
            )}
        </>
    )
}

// --- Text Labels (Modern & Fit) ---
const Labels = ({ stacks, GRID_SIZE }: { stacks: StackNode[], GRID_SIZE: number }) => {
    return (
        <group>
            {stacks.map(stack => {
                const x = (stack.pos_x * GRID_SIZE) + (stack.width * GRID_SIZE) / 2
                const y = -((stack.pos_y * GRID_SIZE) + (stack.height * GRID_SIZE) / 2)
                const height = Math.max((stack.levels.length || 1) * 80, 10)
                // Dynamic Font Size: Fit within width, but max 60
                const maxWidth = stack.width * GRID_SIZE * 0.9
                const fontSize = Math.min(maxWidth / 3, 60) // Rough estimate mapping

                return (
                    <Text
                        key={stack.id}
                        position={[x, y, height + 15]} // Just above top
                        fontSize={fontSize}
                        color="#1e293b" // Slate-800
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, 0]}
                        maxWidth={maxWidth}
                        textAlign="center"
                        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff" // Optional: Inter font for modern look
                    >
                        {stack.baseCode}
                    </Text>
                )
            })}
        </group>
    )
}

// --- Main Scene Component ---
export default function WarehouseScene3D({
    stacks,
    mapElements,
    GRID_SIZE,
    highlightedIds,
    selectedIds,
    onStackClick,
    onClearSelection
}: WarehouseSceneProps) {

    // Calculate center for camera
    const center = useMemo(() => {
        if (stacks.length === 0) return [0, 0, 0]
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        stacks.forEach(s => {
            minX = Math.min(minX, s.pos_x)
            minY = Math.min(minY, s.pos_y)
            maxX = Math.max(maxX, s.pos_x + s.width)
            maxY = Math.max(maxY, s.pos_y + s.height)
        })
        const cx = ((minX + maxX) / 2) * GRID_SIZE
        const cy = -((minY + maxY) / 2) * GRID_SIZE // Negate center Y too
        return [cx, cy, 0]
    }, [stacks, GRID_SIZE])


    return (
        <div className="w-full h-full bg-slate-50">
            <Canvas
                shadows
                camera={{ position: [center[0], center[1] - 2000, 2000], fov: 50, near: 1, far: 500000, up: [0, 0, 1] }}
                style={{ width: '100%', height: '100%' }}
                onPointerMissed={(e) => {
                    if (e.type === 'click') {
                        onClearSelection?.()
                    }
                }}
            >
                <ambientLight intensity={0.5} />
                <hemisphereLight intensity={0.5} groundColor="#f0f2f5" />
                <directionalLight
                    position={[1000, 1000, 3000]}
                    intensity={1.5}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                />

                <OrbitControls
                    target={[center[0], center[1], 0]}
                    maxPolarAngle={Math.PI / 2 - 0.1} // Prevent going below or perfectly flat
                    minPolarAngle={0}
                />

                <group>
                    {/* Floor Grid - maybe use Grid helper or just a plane */}
                    <gridHelper
                        args={[20000, 200, 0xcbd5e1, 0xe2e8f0]}
                        rotation={[Math.PI / 2, 0, 0]}
                        position={[center[0], center[1], 0]}
                    />

                    {/* Shelves Instanced Mesh */}
                    <Shelves
                        stacks={stacks}
                        GRID_SIZE={GRID_SIZE}
                        highlightedIds={highlightedIds}
                        selectedIds={selectedIds || new Set()} // Propagate
                        onStackClick={onStackClick}
                    />

                    {/* Labels */}
                    <Labels stacks={stacks} GRID_SIZE={GRID_SIZE} />

                    {/* Walls/Doors (Simple Box Geometries) */}
                    {mapElements.map(el => {
                        if (el.type !== 'WALL') return null
                        const endX = el.metadata?.endX ?? el.x
                        const endY = el.metadata?.endY ?? el.y

                        // Filter zero-length walls (dots)
                        if (el.x === endX && el.y === endY) return null

                        // Calculate Center, Width/Height/Angle for line-like wall
                        const x1 = el.x * GRID_SIZE
                        const y1 = el.y * GRID_SIZE
                        const x2 = endX * GRID_SIZE
                        const y2 = endY * GRID_SIZE

                        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
                        const cx = (x1 + x2) / 2
                        const cy = -(y1 + y2) / 2 // Negate Wall Center Y
                        const angle = Math.atan2(-(y2 - y1), x2 - x1) // Negate DY for angle calculation

                        return (
                            <mesh
                                key={el.id}
                                position={[cx, cy, 100]} // Wall height 200, pos 100
                                rotation={[0, 0, angle]}
                            >
                                <boxGeometry args={[length, 20, 200]} />
                                <meshStandardMaterial color="#64748b" />
                            </mesh>
                        )
                    })}
                </group>

            </Canvas>
        </div>
    )
}
