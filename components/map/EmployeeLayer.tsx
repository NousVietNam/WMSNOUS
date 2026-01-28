"use client"

import React, { useMemo } from 'react'
import { Users } from 'lucide-react'

interface Employee {
    id: string
    name: string
    locationCode: string
}

interface StackNode {
    id: string
    pos_x: number
    pos_y: number
    width: number
    height: number
    baseCode: string
    levels: { code: string }[]
}

interface EmployeeLayerProps {
    employees: Employee[]
    stacks: StackNode[]
    GRID_SIZE: number
    scale: number
}

const EmployeeLayer = ({ employees, stacks, GRID_SIZE, scale }: EmployeeLayerProps) => {
    // 1. Pre-calculate occupied grid cells
    const occupiedSet = useMemo(() => {
        const set = new Set<string>()
        stacks.forEach(s => {
            for (let x = Math.floor(s.pos_x); x < Math.ceil(s.pos_x + s.width); x++) {
                for (let y = Math.floor(s.pos_y); y < Math.ceil(s.pos_y + s.height); y++) {
                    set.add(`${x},${y}`)
                }
            }
        })
        return set
    }, [stacks])

    // 2. Assign employees to "Empty Holes"
    const renderedEmployees = useMemo(() => {
        const takenCells = new Set<string>()

        return employees.map((emp, i) => {
            const stack = stacks.find(s => s.baseCode === emp.locationCode.split('-')[0] || s.levels.some(l => l.code === emp.locationCode))
            if (!stack) return null

            let bestX = (stack.pos_x + stack.width / 2)
            let bestY = (stack.pos_y + stack.height / 2)
            let found = false

            const searchRadius = 2
            for (let r = 1; r <= searchRadius; r++) {
                for (let dx = -r; dx <= stack.width + r - 1; dx++) {
                    for (let dy = -r; dy <= stack.height + r - 1; dy++) {
                        const isInner = dx >= 0 && dx < stack.width && dy >= 0 && dy < stack.height
                        if (isInner && r === 1) continue

                        const gx = Math.floor(stack.pos_x + dx)
                        const gy = Math.floor(stack.pos_y + dy)
                        const key = `${gx},${gy}`

                        if (gx >= 0 && gy >= 0 && !occupiedSet.has(key) && !takenCells.has(key)) {
                            bestX = gx + 0.5
                            bestY = gy + 0.5
                            takenCells.add(key)
                            found = true
                            break
                        }
                    }
                    if (found) break
                }
                if (found) break
            }

            // Fallback
            if (!found) {
                const angle = (i / employees.length) * Math.PI * 2
                const offset = 0.3
                bestX = (stack.pos_x + stack.width / 2) + Math.cos(angle) * offset
                bestY = (stack.pos_y + stack.height / 2) + Math.sin(angle) * offset
            }

            return { ...emp, x: bestX, y: bestY }
        })
    }, [employees, stacks, occupiedSet])

    return (
        <div className="absolute inset-0 pointer-events-none">
            {renderedEmployees.map(emp => {
                if (!emp) return null
                return (
                    <div
                        key={emp.id}
                        className="absolute flex flex-col items-center transition-all duration-500 z-[100]"
                        style={{
                            left: emp.x * GRID_SIZE,
                            top: emp.y * GRID_SIZE,
                            transform: 'translate(-50%, -100%)' // Center on grid and put above dot
                        }}
                    >
                        {/* Label Badge */}
                        <div className="bg-pink-600 text-white px-2 py-1 rounded-full shadow-lg flex items-center gap-1 mb-1 whitespace-nowrap border-2 border-white scale-75 xl:scale-100">
                            <Users size={12} className="shrink-0" />
                            <span className="font-bold text-[10px] xl:text-xs">
                                {emp.name}
                                <span className="opacity-70 ml-1 font-normal">({emp.locationCode})</span>
                            </span>
                        </div>
                        {/* Target Dot */}
                        <div className="w-4 h-4 bg-pink-500 rounded-full border-2 border-white animate-pulse" />
                    </div>
                )
            })}
        </div>
    )
}

export default EmployeeLayer
