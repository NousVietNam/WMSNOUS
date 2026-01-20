"use client"


import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { supabase } from "@/lib/supabase"
import dynamic from "next/dynamic"
import { ChevronLeft, Package, MapPin, AlertTriangle, Lock, Camera, Check, ClipboardList, X, RefreshCw } from "lucide-react"

import { QRScanner } from "@/components/mobile/QRScanner"
import { toast } from "sonner"

// Types
type PickingTask = {
    id: string
    quantity: number
    status: 'PENDING' | 'COMPLETED'
    products: { sku: string; name: string; barcode: string }
    boxes: { id: string; code: string; locations?: { code: string } } | null
    locations: { id: string; code: string } | null
    available_qty?: number
}

type BoxGroup = {
    boxId: string
    boxCode: string
    locationCode: string
    tasks: PickingTask[]
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
    totalItems: number
    pickedItems: number
}

type LocationGroup = {
    locationCode: string
    boxes: BoxGroup[]
}

type ActiveOutbox = {
    id: string
    code: string
    count: number
}

export default function DoPickingPage() {
    const { id } = useParams()
    const router = useRouter()

    // Data State
    const [loading, setLoading] = useState(true)
    const [allTasks, setAllTasks] = useState<any[]>([])
    const [activeBoxId, setActiveBoxId] = useState<string | null>(null)
    const [unlockedBoxes, setUnlockedBoxes] = useState<Set<string>>(new Set())
    const [scanInput, setScanInput] = useState("")
    const [showScanner, setShowScanner] = useState(false)
    const [scannerMode, setScannerMode] = useState<'BOX_UNLOCK' | 'OUTBOX'>('BOX_UNLOCK')

    // Outbox State
    const [activeOutbox, setActiveOutbox] = useState<ActiveOutbox | null>(null)
    const [tempSelectedTaskIds, setTempSelectedTaskIds] = useState<Set<string>>(new Set())
    const [isConfirmingBox, setIsConfirmingBox] = useState(false)

    // Derived State
    const jobStats = (() => {
        const totalItems = allTasks.reduce((sum: number, t: any) => sum + t.quantity, 0)
        const pickedItems = allTasks.filter((t: any) => t.status === 'COMPLETED').reduce((sum: number, t: any) => sum + t.quantity, 0)
        const uniqueSkus = new Set(allTasks.map((t: any) => t.products.sku)).size
        return { totalSku: uniqueSkus, totalItems, pickedItems }
    })()

    const groups = (() => {
        const groupedMap = new Map<string, Map<string, PickingTask[]>>()

        allTasks.forEach((task: any) => {
            const locCode = task.boxes?.locations?.code || task.locations?.code || "Unknown"
            const boxCode = task.boxes?.code || "Loose Items"
            const boxId = task.boxes?.id || "loose"

            if (!groupedMap.has(locCode)) groupedMap.set(locCode, new Map())
            const locMap = groupedMap.get(locCode)!
            const key = `${boxCode}:::${boxId}`
            if (!locMap.has(key)) locMap.set(key, [])
            locMap.get(key)?.push(task)
        })

        const locationGroups: LocationGroup[] = []
        const sortedLocs = Array.from(groupedMap.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

        sortedLocs.forEach(locCode => {
            const boxMap = groupedMap.get(locCode)!
            const boxGroups: BoxGroup[] = []

            boxMap.forEach((tasks, compositeKey) => {
                const [boxCode, boxId] = compositeKey.split(':::')
                const allCompleted = tasks.every(t => t.status === 'COMPLETED')
                const someCompleted = tasks.some(t => t.status === 'COMPLETED')
                const boxTotal = tasks.reduce((sum, t) => sum + t.quantity, 0)
                const boxPicked = tasks.filter(t => t.status === 'COMPLETED').reduce((sum, t) => sum + t.quantity, 0)

                boxGroups.push({
                    boxId, boxCode, locationCode: locCode, tasks,
                    status: allCompleted ? 'COMPLETED' : someCompleted ? 'IN_PROGRESS' : 'PENDING',
                    totalItems: boxTotal, pickedItems: boxPicked
                })
            })
            boxGroups.sort((a, b) => a.boxCode.localeCompare(b.boxCode, undefined, { numeric: true }))
            locationGroups.push({ locationCode: locCode, boxes: boxGroups })
        })
        return locationGroups
    })()

    useEffect(() => {
        if (id) fetchTasks()
    }, [id])

    // Focus hook not strictly needed for this refactor, removing complex focus logic for simplicity if not critical
    // or keeping simple ref
    const scanInputRef = useRef<HTMLInputElement>(null)

    const [transferType, setTransferType] = useState<'BOX' | 'ITEM'>('ITEM')

    const fetchTasks = async () => {
        setLoading(true)

        // 1. Get Job Info to know Type
        const { data: jobInfo, error: jobError } = await supabase
            .from('picking_jobs')
            .select('orders(transfer_type)')
            .eq('id', id)
            .single()

        if (jobInfo?.orders) {
            // Supabase returns array for joined relation sometimes implies array if not strict
            // @ts-ignore
            const type = Array.isArray(jobInfo.orders) ? jobInfo.orders[0]?.transfer_type : jobInfo.orders?.transfer_type
            if (type) setTransferType(type)
        }

        const { data: tasks, error } = await supabase
            .from('picking_tasks')
            .select(`
                *,
                products (id, sku, name, barcode),
                boxes (id, code, location_id, locations (code)),
                locations (id, code)
            `)
            .eq('job_id', id)
            .order('id', { ascending: true })

        if (error || !tasks) {
            alert("Lỗi tải nhiệm vụ: " + (error?.message || "Unknown"))
            setLoading(false)
            return
        }

        // Inventory lookup logic
        const boxIds = Array.from(new Set(tasks.map((t: any) => t.box_id).filter(Boolean)))
        let inventoryMap: Record<string, number> = {}
        if (boxIds.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: invData } = await supabase.from('inventory_items').select('box_id, product_id, quantity').in('box_id', boxIds as any[])
            invData?.forEach((inv: any) => {
                const key = `${inv.box_id}-${inv.product_id}`
                inventoryMap[key] = (inventoryMap[key] || 0) + inv.quantity
            })
        }

        const enrichedTasks = tasks.map((t: any) => ({
            ...t,
            available_qty: inventoryMap[`${t.box_id}-${t.product_id}`] || 0
        }))

        setAllTasks(enrichedTasks)
        setLoading(false)
    }

    const getSkuProgress = (sku: string) => {
        const matching = allTasks.filter(t => t.products.sku === sku)
        const total = matching.reduce((sum, t) => sum + t.quantity, 0)
        const picked = matching.filter(t => t.status === 'COMPLETED').reduce((sum, t) => sum + t.quantity, 0)
        return { picked, total }
    }

    const handleScan = (code: string) => {
        if (scannerMode === 'BOX_UNLOCK') validateBoxCode(code)
        else handleScanOutbox(code)
    }

    const validateBoxCode = async (code: string) => {
        let activeGroup: BoxGroup | undefined
        for (const l of groups) {
            const found = l.boxes.find(b => b.boxId === activeBoxId)
            if (found) { activeGroup = found; break }
        }

        // If no box is selected, try to find one that matches the scanned code
        if (!activeGroup) {
            for (const l of groups) {
                const found = l.boxes.find(b => b.boxCode.toUpperCase() === code.trim().toUpperCase())
                if (found) {
                    activeGroup = found
                    setActiveBoxId(found.boxId)
                    break
                }
            }
        }

        if (!activeGroup) {
            alert("Không tìm thấy thùng này trong danh sách!")
            return
        }

        if (code.trim().toUpperCase() === activeGroup.boxCode.toUpperCase()) {
            setUnlockedBoxes(prev => new Set(prev).add(activeGroup!.boxId))
            setScanInput("")
            setShowScanner(false)

            // AUTO PICK LOGIC for BOX Type
            if (transferType === 'BOX') {
                if (!activeOutbox) {
                    alert("⚠️ Vui lòng quét Outbox trước khi xác nhận thùng!")
                    setScannerMode('OUTBOX')
                    setShowScanner(true)
                    return
                }

                // Confirm all pending tasks in this box
                const tasksToPick = activeGroup.tasks.filter(t => t.status !== 'COMPLETED')
                if (tasksToPick.length > 0) {
                    const confirm = window.confirm(`Bạn có muốn xác nhận lấy toàn bộ ${tasksToPick.length} mã trong thùng ${activeGroup.boxCode}?`)
                    if (confirm) {
                        handleConfirmBox(tasksToPick.map(t => t.id))
                        // for (const task of tasksToPick) {
                        //    await handleConfirmPick(task)
                        // }
                        toast.success(`Đã lấy xong thùng ${activeGroup.boxCode}`)
                        // Auto close box after short delay
                        setTimeout(() => setActiveBoxId(null), 1000)
                    }
                }
            }
        } else {
            alert("Sai mã thùng!")
            setScanInput("")
        }
    }

    const isScanningRef = useRef(false)

    const handleScanOutbox = async (code: string) => {
        if (isScanningRef.current) return
        isScanningRef.current = true

        try {
            const res = await fetch('/api/picking/scan-outbox', {
                method: 'POST',
                body: JSON.stringify({ code, jobId: id })
            })
            const json = await res.json()
            if (json.success) {
                if (activeOutbox?.code === json.box.code) {
                    setShowScanner(false)
                    isScanningRef.current = false
                    return
                }
                setActiveOutbox({ id: json.box.id, code: json.box.code, count: json.box.count })
                toast.success(`Active Outbox: ${json.box.code}`)
                setShowScanner(false)
            } else {
                toast.error(json.error || "Lỗi Outbox")
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setTimeout(() => {
                isScanningRef.current = false
            }, 300)
        }
    }

    // Ref to block double-clicks synchronously
    const submittingRef = useRef<Set<string>>(new Set())
    const [processingTasks, setProcessingTasks] = useState<Set<string>>(new Set()) // Keep tracking for spinner

    // Confirm Pick Logic (Replaced by Batch)
    // const handleConfirmPick = async (task: PickingTask) => { ... } 
    // This was removed.

    // Toggle Selection (Local Check)
    const handleToggleTask = (taskId: string) => {
        setTempSelectedTaskIds(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) next.delete(taskId)
            else next.add(taskId)
            return next
        })
    }

    // Reset Selection
    const handleResetSelection = () => {
        setTempSelectedTaskIds(new Set())
    }

    // Batch Confirm Box
    const handleConfirmBox = async (taskIds: string[]) => {
        if (!activeOutbox) {
            toast.error("Vui lòng chọn Outbox trước!")
            return
        }
        if (taskIds.length === 0) return

        setIsConfirmingBox(true)
        try {
            const res = await fetch('/api/picking/confirm-batch', {
                method: 'POST',
                body: JSON.stringify({ taskIds, outboxId: activeOutbox.id })
            })
            const json = await res.json()
            if (!json.success) {
                toast.error(json.error || "Lỗi xác nhận")
                return
            }

            toast.success(`Đã xong thùng! (SL: ${json.processed})`)

            // Sync local state
            setAllTasks(prev => prev.map(t => taskIds.includes(t.id) ? { ...t, status: 'COMPLETED' } : t))
            setTempSelectedTaskIds(new Set())
            setActiveBoxId(null) // Close box

            // Sync DB
            fetchTasks()
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setIsConfirmingBox(false)
        }
    }

    // Manual Complete Job
    const handleCompleteJob = async () => {
        const confirm = window.confirm("Xác nhận hoàn thành Job này?")
        if (!confirm) return

        try {
            const { error } = await supabase.from('picking_jobs').update({ status: 'COMPLETED' }).eq('id', id)
            if (error) throw error
            toast.success("Đã hoàn thành Job!")
            router.push('/mobile/picking')
        } catch (e: any) {
            toast.error("Lỗi: " + e.message)
        }
    }

    const renderActiveBox = () => {
        let activeGroup: BoxGroup | undefined
        for (const l of groups) {
            const found = l.boxes.find(b => b.boxId === activeBoxId)
            if (found) { activeGroup = found; break }
        }
        if (!activeGroup) return null

        const isCompleted = activeGroup.status === 'COMPLETED'
        const isUnlocked = unlockedBoxes.has(activeGroup.boxId) || isCompleted

        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center gap-2 mb-2 bg-white p-4 rounded-lg shadow-sm border">
                    <button className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-100" onClick={() => setActiveBoxId(null)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-slate-600"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-blue-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                            {activeGroup.boxCode}
                        </h2>
                        <div className="text-sm font-medium text-slate-500 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg> {activeGroup.locationCode}
                        </div>
                    </div>
                </div>

                {!activeOutbox && (
                    <div className="bg-orange-50 p-3 rounded border border-orange-200 flex items-center justify-between">
                        <div className="text-xs text-orange-800 font-bold flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg> Chọn thùng đóng gói!
                        </div>
                        <button className="h-8 px-3 rounded text-xs font-bold border border-orange-300 text-orange-700 bg-white" onClick={() => { setScannerMode('OUTBOX'); setShowScanner(true) }}>
                            Quét
                        </button>
                    </div>
                )}

                {!isUnlocked && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center space-y-4 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-yellow-500 mx-auto"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        <div>
                            <h3 className="font-bold text-yellow-800 text-lg">Xác Nhận Thùng</h3>
                            <p className="text-sm text-yellow-700">Quét mã <b>{activeGroup.boxCode}</b> để mở khóa.</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <form onSubmit={(e) => { e.preventDefault(); validateBoxCode(scanInput) }} className="flex gap-2">
                                <input ref={scanInputRef} placeholder="Nhập mã..." value={scanInput} onChange={e => setScanInput(e.target.value)} className="flex-1 h-10 px-3 rounded border border-yellow-300 focus:outline-none" />
                                <button type="submit" className="h-10 px-4 bg-yellow-400 text-yellow-900 font-bold rounded">OK</button>
                            </form>
                            <button onClick={() => { setScannerMode('BOX_UNLOCK'); setShowScanner(true) }} className="w-full h-10 border border-yellow-400 text-yellow-800 font-bold rounded flex items-center justify-center gap-2 bg-white hover:bg-yellow-100">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg> Camera
                            </button>
                        </div>
                    </div>
                )}

                <div className={`space-y-3 transition-opacity ${!isUnlocked ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                    {activeGroup.tasks.map(task => {
                        const isDone = task.status === 'COMPLETED'
                        const isSelected = tempSelectedTaskIds.has(task.id)
                        const sku = task.products.sku
                        // const { picked, total } = getSkuProgress(sku)

                        return (
                            <div
                                key={task.id}
                                onClick={() => !isDone && handleToggleTask(task.id)}
                                className={`rounded-xl border p-4 flex items-center justify-between gap-3 shadow-sm cursor-pointer transition-all
                                    ${isDone ? 'bg-slate-50 border-slate-200 opacity-60' :
                                        isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-slate-200'}
                                `}
                            >
                                <div className="flex-1">
                                    <div className={`font-bold text-lg leading-tight ${isDone ? 'text-slate-500' : 'text-slate-800'}`}>{sku}</div>
                                    <div className="text-sm text-slate-500 line-clamp-1">{task.products.name}</div>
                                </div>
                                <div className="text-right min-w-[80px]">
                                    <div className="flex flex-col items-end">
                                        <span className={`text-3xl font-black ${isDone ? 'text-slate-400' : isSelected ? 'text-blue-600' : 'text-slate-600'}`}>
                                            {task.quantity}
                                        </span>
                                        {/* <span className="text-[10px] bg-slate-100 px-1 rounded text-slate-500">
                                            Kho: {task.available_qty}
                                        </span> */}
                                    </div>
                                </div>

                                <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 
                                    ${isDone ? 'bg-slate-200 border-slate-300 text-slate-500' :
                                        isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-300 text-transparent'}
                                `}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="20 6 9 17 4 12" /></svg>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="mt-6 space-y-3 pb-8">
                    {(() => {
                        const pendingTasks = activeGroup.tasks.filter(t => t.status !== 'COMPLETED')
                        const selectedTasks = pendingTasks.filter(t => tempSelectedTaskIds.has(t.id))
                        // const isAllSelected = pendingTasks.length > 0 && selectedTasks.length === pendingTasks.length

                        if (pendingTasks.length === 0) return (
                            <div className="text-center text-green-600 font-bold bg-green-50 p-3 rounded">
                                ✓ Thùng này đã xong
                            </div>
                        )

                        return (
                            <div className="space-y-3">
                                {selectedTasks.length > 0 && (
                                    <button
                                        onClick={() => handleConfirmBox(activeGroup!.tasks.filter(t => tempSelectedTaskIds.has(t.id)).map(t => t.id))}
                                        disabled={isConfirmingBox}
                                        className="w-full h-14 bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {isConfirmingBox ? "Đang xử lý..." : `XÁC NHẬN ${selectedTasks.length} DÒNG`}
                                    </button>
                                )}

                                {selectedTasks.length > 0 && (
                                    <button
                                        onClick={handleResetSelection}
                                        className="w-full h-10 bg-slate-200 text-slate-700 font-bold rounded-lg"
                                    >
                                        Hủy Kiểm Tạm ({selectedTasks.length})
                                    </button>
                                )}
                            </div>
                        )
                    })()}
                </div>


            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col pb-6">
            <MobileHeader title={`JOB-${typeof id === 'string' ? id.slice(0, 8).toUpperCase() : id}`} backLink="/mobile/picking" />

            <div className={`p-3 px-4 flex items-center justify-between text-sm ${activeOutbox ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                    {activeOutbox ? (
                        <span>Outbox: <b>{activeOutbox.code}</b> <span className="opacity-80 ml-1">({Number(activeOutbox.count || 0)} items)</span></span>
                    ) : (
                        <span>Chưa chọn Outbox</span>
                    )}
                </div>
                <button className="h-7 px-3 rounded text-xs font-bold bg-white text-slate-800 shadow-sm" onClick={() => { setScannerMode('OUTBOX'); setShowScanner(true) }}>
                    {activeOutbox ? "Đổi" : "Quét"}
                </button>
            </div>

            {!activeBoxId && (
                <div className="bg-white p-4 border-b space-y-3 shadow-sm">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Mã Job</span>
                            <span className="font-mono font-bold text-slate-800">
                                JOB-{typeof id === 'string' ? id.slice(0, 8).toUpperCase() : ''}
                            </span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Tổng Số Lượng</span>
                            <span className="font-bold text-slate-800 text-lg">{jobStats.totalItems} <span className="text-xs font-normal text-slate-500">sp</span></span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-sm pt-3 border-t">
                        <div className="flex items-center gap-2 text-slate-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6" /><path d="M9 16h6" /><path d="M9 8h6" /></svg>
                            <span>SKU: <b>{jobStats.totalSku}</b></span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="text-right">
                                <span className="text-xs text-slate-500 mr-2">Đã lấy:</span>
                                <b className="text-blue-600 text-base">{jobStats.pickedItems}</b>
                                <span className="text-slate-400">/{jobStats.totalItems}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <main className="flex-1 p-4">
                {loading ? <div className="text-center py-8">Đang tải...</div> : (
                    activeBoxId ? renderActiveBox() : (
                        <div className="space-y-6">
                            {groups.map((loc, idx) => (
                                <div key={idx} className="space-y-2">
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider pl-1 border-b pb-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                        {loc.locationCode}
                                    </h3>
                                    <div className="space-y-2">
                                        {loc.boxes.map(box => (
                                            <div key={box.boxId} onClick={() => setActiveBoxId(box.boxId)} className={`cursor-pointer rounded-xl border shadow-sm p-4 flex items-center justify-between ${box.status === 'COMPLETED' ? 'bg-green-50 opacity-60 border-green-200' : 'bg-white border-slate-200'}`}>
                                                <div>
                                                    <div className="font-bold text-lg text-slate-800">{box.boxCode}</div>
                                                    <div className="text-xs text-slate-500">{box.tasks.length} mã hā̀ng</div>
                                                </div>
                                                <div className={`font-bold ${box.status === 'COMPLETED' ? 'text-green-600' : 'text-blue-600'}`}>
                                                    {box.pickedItems}/{box.totalItems}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {groups.length === 0 && <div className="text-center text-slate-500">Trống</div>}
                        </div>
                    )
                )}
                {!activeBoxId && !loading && (
                    (() => {
                        const totalTasks = allTasks.length
                        const completedTasks = allTasks.filter(t => t.status === 'COMPLETED').length
                        const isJobDone = totalTasks > 0 && completedTasks === totalTasks

                        if (isJobDone) {
                            return (
                                <div className="mt-8 px-4 pb-8">
                                    <button
                                        onClick={handleCompleteJob}
                                        className="w-full h-14 bg-green-600 text-white font-bold text-xl rounded-xl shadow-lg animate-pulse"
                                    >
                                        HOÀN THÀNH JOB
                                    </button>
                                </div>
                            )
                        }
                        return null
                    })()
                )}
            </main>

            {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    )
}
