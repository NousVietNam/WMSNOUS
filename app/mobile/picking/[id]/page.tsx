"use client"


import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { supabase } from "@/lib/supabase"
import { Package, Check, X, RefreshCw } from "lucide-react"

import { QRScanner } from "@/components/mobile/QRScanner"
import { toast } from "sonner"

// Types
type PickingTask = {
    id: string
    quantity: number
    status: 'PENDING' | 'COMPLETED'
    products: { sku: string; name: string; barcode: string; image_url?: string }
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
    const [userId, setUserId] = useState<string | null>(null)
    const [allTasks, setAllTasks] = useState<any[]>([])
    const [activeBoxId, setActiveBoxId] = useState<string | null>(null)
    const [unlockedBoxes, setUnlockedBoxes] = useState<Set<string>>(new Set())
    const [scanInput, setScanInput] = useState("")
    const [showScanner, setShowScanner] = useState(false)
    const [scannerMode, setScannerMode] = useState<'BOX_UNLOCK' | 'OUTBOX'>('BOX_UNLOCK')
    const [jobType, setJobType] = useState<string | null>(null)
    const [startedAt, setStartedAt] = useState<string | null>(null)
    const [completedAt, setCompletedAt] = useState<string | null>(null)
    const [elapsedSeconds, setElapsedSeconds] = useState(0)

    // Outbox State
    const [activeOutbox, setActiveOutbox] = useState<ActiveOutbox | null>(null)
    const [tempSelectedTaskIds, setTempSelectedTaskIds] = useState<Set<string>>(new Set())
    const [isConfirmingBox, setIsConfirmingBox] = useState(false)
    const [jobCode, setJobCode] = useState<string | null>(null)
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [transferType, setTransferType] = useState<'BOX' | 'ITEM'>('ITEM')

    // Derived State
    const jobStats = (() => {
        const totalItems = allTasks.reduce((sum: number, t: any) => sum + t.quantity, 0)
        const pickedItems = allTasks.filter((t: any) => t.status === 'COMPLETED').reduce((sum: number, t: any) => sum + t.quantity, 0)
        const uniqueSkus = new Set(allTasks.map((t: any) => t.products?.sku).filter(Boolean)).size
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

    // Get user session
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
    }, [])

    // Timer Effect
    useEffect(() => {
        if (!startedAt || completedAt) {
            setElapsedSeconds(0)
            return
        }

        const start = new Date(startedAt).getTime()
        const interval = setInterval(() => {
            const now = Date.now()
            setElapsedSeconds(Math.floor((now - start) / 1000))
        }, 1000)

        return () => clearInterval(interval)
    }, [startedAt, completedAt])

    const formatElapsed = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600)
        const m = Math.floor((totalSeconds % 3600) / 60)
        const s = totalSeconds % 60
        if (h > 0) return `${h}h ${m}m ${s}s`
        return `${m}m ${s}s`
    }

    const scanInputRef = useRef<HTMLInputElement>(null)

    const fetchTasks = async () => {
        setLoading(true)
        try {
            const { data: jobInfo, error: jobError } = await supabase
                .from('picking_jobs')
                .select(`
                    type, 
                    type, 
                    created_at,
                    started_at,
                    completed_at,
                    outbound_order:outbound_orders!outbound_order_id (
                        code,
                        transfer_type
                    )
                `)
                .eq('id', id)
                .single()

            if (jobInfo) {
                setJobType(jobInfo.type)
                setJobType(jobInfo.type)
                setStartedAt(jobInfo.started_at || jobInfo.created_at)
                setCompletedAt(jobInfo.completed_at)

                let type: string | undefined = undefined;
                if (jobInfo.type === 'BOX_PICK') type = 'BOX';
                else if (jobInfo.type === 'ITEM_PICK') type = 'ITEM';
                else {
                    const order = Array.isArray(jobInfo.outbound_order) ? jobInfo.outbound_order[0] : jobInfo.outbound_order as any;
                    type = order?.transfer_type;
                }

                if (type) setTransferType(type as 'BOX' | 'ITEM')

                const order = Array.isArray(jobInfo.outbound_order) ? jobInfo.outbound_order[0] : jobInfo.outbound_order as any;
                if (order?.code) setJobCode(`PICK-${order.code}`)
                else setJobCode(`JOB-${typeof id === 'string' ? id.slice(0, 8).toUpperCase() : id}`)
            }

            const { data: tasks, error } = await supabase
                .from('picking_tasks')
                .select(`
                    *,
                    products (id, sku, name, barcode, image_url),
                    boxes:box_id (id, code, location_id, locations (code)),
                    locations (id, code)
                `)
                .eq('job_id', id)
                .order('id', { ascending: true })

            if (error || !tasks) throw error || new Error("No tasks found")

            // Inventory lookup logic
            const boxIds = Array.from(new Set(tasks.map((t: any) => t.box_id).filter(Boolean)))
            let inventoryMap: Record<string, number> = {}
            if (boxIds.length > 0) {
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
        } catch (e: any) {
            toast.error("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleScan = (code: string) => {
        if (transferType === 'BOX') {
            validateBoxCode(code)
            return
        }
        if (scannerMode === 'BOX_UNLOCK') validateBoxCode(code)
        else handleScanOutbox(code)
    }

    const validateBoxCode = async (code: string) => {
        let activeGroup: BoxGroup | undefined
        for (const l of groups) {
            const found = l.boxes.find(b => b.boxId === activeBoxId)
            if (found) { activeGroup = found; break }
        }

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
            toast.error("Không tìm thấy thùng này trong danh sách!")
            return
        }

        const isItemPick = transferType === 'ITEM' || jobType === 'ITEM_PICK'
        if (isItemPick && !activeOutbox) {
            toast.error("Vui lòng quét chọn Outbox trước khi quét thùng hàng!")
            setScanInput("")
            return
        }

        if (code.trim().toUpperCase() === activeGroup.boxCode.toUpperCase()) {
            setUnlockedBoxes(prev => new Set(prev).add(activeGroup!.boxId))
            setScanInput("")
            setShowScanner(false)
            toast.success(`Đã chọn thùng ${activeGroup.boxCode}!`)
        } else {
            alert("Sai mã thùng!")
            setScanInput("")
        }
    }

    const handleScanOutbox = async (code: string) => {
        try {
            toast.loading("Đang kiểm tra...", { id: 'scan-check' })
            const res = await fetch('/api/picking/scan-outbox', {
                method: 'POST',
                body: JSON.stringify({ code, jobId: id })
            })
            const json = await res.json()
            if (json.success) {
                setActiveOutbox({ id: json.box.id, code: json.box.code, count: json.box.count })
                toast.success(`Active Outbox: ${json.box.code}`)
                setShowScanner(false)
            } else {
                toast.error(json.error || "Lỗi Outbox")
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            toast.dismiss('scan-check')
        }
    }

    const handleToggleTask = (taskId: string) => {
        setTempSelectedTaskIds(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) next.delete(taskId)
            else next.add(taskId)
            return next
        })
    }

    const handleResetSelection = () => setTempSelectedTaskIds(new Set())

    const handleConfirmBox = async (taskIds: string[]) => {
        const isBoxPick = transferType === 'BOX' || jobType === 'BOX_PICK'
        if (!isBoxPick && !activeOutbox) {
            toast.error("Vui lòng chọn Outbox trước!")
            return
        }
        if (taskIds.length === 0) return

        setIsConfirmingBox(true)
        try {
            const res = await fetch(isBoxPick ? '/api/picking/confirm-box' : '/api/picking/confirm-batch', {
                method: 'POST',
                body: JSON.stringify({
                    boxId: activeBoxId,
                    jobId: id,
                    userId,
                    taskIds,
                    outboxId: activeOutbox?.id
                })
            })

            const json = await res.json()
            if (!json.success) throw new Error(json.error || "Lỗi xác nhận")

            toast.success(isBoxPick ? `Đã chuyển thùng ra cửa xuất!` : `Đã xong thùng! (SL: ${json.processed})`)
            setAllTasks(prev => prev.map(t => taskIds.includes(t.id) ? { ...t, status: 'COMPLETED' } : t))
            setTempSelectedTaskIds(new Set())
            setActiveBoxId(null)
            fetchTasks()
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setIsConfirmingBox(false)
        }
    }

    const handleCompleteJob = async () => {
        const confirm = window.confirm("Xác nhận hoàn thành Job này? Thùng hàng sẽ được chuyển ra GATE-OUT và PXK sẽ được tạo tự động.")
        if (!confirm) return

        try {
            const res = await fetch('/api/picking/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId: id, userId })
            })

            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Lỗi hoàn thành job')

            toast.success(result.message || "Đã hoàn thành Job!")
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
                        <ChevronLeft className="h-6 w-6 text-slate-600" />
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-blue-700">
                                <Package className="h-6 w-6" />
                                {activeGroup.boxCode}
                            </h2>
                            {transferType === 'BOX' && (
                                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Lấy nguyên thùng</span>
                            )}
                        </div>
                    </div>
                </div>

                {!activeOutbox && transferType === 'ITEM' && (
                    <div className="bg-orange-50 p-3 rounded border border-orange-200 flex items-center justify-between">
                        <div className="text-xs text-orange-800 font-bold flex items-center gap-2">Chọn thùng đóng gói!</div>
                        <button className="h-8 px-3 rounded text-xs font-bold bg-white" onClick={() => { setScannerMode('OUTBOX'); setShowScanner(true) }}>Quét</button>
                    </div>
                )}

                {!isUnlocked && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center space-y-4 shadow-sm">
                        <h3 className="font-bold text-yellow-800 text-lg">Mở khóa Thùng {activeGroup.boxCode}</h3>
                        <form onSubmit={(e) => { e.preventDefault(); validateBoxCode(scanInput) }} className="flex gap-2">
                            <input ref={scanInputRef} placeholder="Nhập mã..." value={scanInput} onChange={e => setScanInput(e.target.value)} className="flex-1 h-10 px-3 rounded border" />
                            <button type="submit" className="h-10 px-4 bg-yellow-400 font-bold rounded">OK</button>
                        </form>
                    </div>
                )}

                <div className={`space-y-2 ${!isUnlocked ? 'opacity-50 pointer-events-none' : ''}`}>
                    {activeGroup.tasks.map(task => {
                        const isDone = task.status === 'COMPLETED'
                        const isSelected = tempSelectedTaskIds.has(task.id)
                        return (
                            <div key={task.id} className={`rounded-xl border flex p-3 ${isDone ? 'bg-slate-50' : isSelected ? 'bg-blue-50 border-blue-500' : 'bg-white'}`}>
                                <div className="flex-1" onClick={() => setSelectedProduct(task.products)}>
                                    <div className="font-bold text-sm text-indigo-700">{task.products.sku}</div>
                                    <div className="text-xs text-slate-500">{task.products.name}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl font-black">{task.quantity}</div>
                                    <div onClick={() => transferType !== 'BOX' && !isDone && handleToggleTask(task.id)} className={`h-9 w-9 rounded-full flex items-center justify-center border-2 ${isDone ? 'bg-green-100 text-green-600' : isSelected ? 'bg-blue-500 text-white' : 'bg-white text-transparent'}`}>
                                        <Check className="h-5 w-5" />
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="mt-6 pb-8">
                    {(() => {
                        const pendingTasks = activeGroup.tasks.filter(t => t.status !== 'COMPLETED')
                        const selectedTasks = pendingTasks.filter(t => tempSelectedTaskIds.has(t.id))
                        if (pendingTasks.length === 0) return <div className="text-center text-green-600 font-bold p-3 bg-green-50 rounded">✓ Đã xong</div>
                        return (
                            <button
                                onClick={() => handleConfirmBox(transferType === 'BOX' ? pendingTasks.map(t => t.id) : Array.from(tempSelectedTaskIds))}
                                disabled={isConfirmingBox || (transferType !== 'BOX' && selectedTasks.length === 0)}
                                className="w-full h-14 bg-blue-600 text-white font-bold rounded-xl"
                            >
                                {isConfirmingBox ? "Đang xử lý..." : transferType === 'BOX' ? "XÁC NHẬN LẤY CẢ THÙNG" : `XÁC NHẬN ${selectedTasks.length} DÒNG`}
                            </button>
                        )
                    })()}
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col pb-6">
            <MobileHeader title={jobCode || "..."} backLink="/mobile/picking" />

            {!activeBoxId && (
                <div className="bg-white p-4 border-b space-y-3">
                    <div className="flex justify-between items-center capitalize">
                        <div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Mã Job</div>
                            <div className="font-bold text-slate-800">{jobCode || '...'}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Thời gian</div>
                            <div className={`font-mono font-bold ${startedAt ? 'text-indigo-600' : 'text-slate-300 font-normal'}`}>
                                {startedAt ? (completedAt ? 'Hoàn thành' : formatElapsed(elapsedSeconds)) : 'Chưa bắt đầu'}
                            </div>
                        </div>
                    </div>
                    {startedAt && (
                        <div className="text-[10px] text-slate-400">Tạo: {new Date(startedAt).toLocaleString('vi-VN')}</div>
                    )}
                    <div className="flex justify-between items-center text-sm pt-2 border-t font-medium">
                        <div className="text-slate-600">Tiến độ: <b>{jobStats.pickedItems}/{jobStats.totalItems}</b></div>
                        <div className="text-slate-600">SKU: <b>{jobStats.totalSku}</b></div>
                    </div>
                </div>
            )}

            <main className="flex-1 p-4 overflow-y-auto">
                {loading ? <div className="text-center py-8">Đang tải...</div> : (
                    activeBoxId ? renderActiveBox() : (
                        <div className="space-y-6 pb-32">
                            {groups.map((loc, idx) => (
                                <div key={idx} className="space-y-2">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">📍 {loc.locationCode}</h3>
                                    <div className="space-y-2">
                                        {loc.boxes.map(box => (
                                            <div key={box.boxId} onClick={() => setActiveBoxId(box.boxId)} className={`rounded-xl border p-4 flex items-center justify-between ${box.status === 'COMPLETED' ? 'bg-green-50 opacity-60 border-green-200' : 'bg-white shadow-sm'}`}>
                                                <div>
                                                    <div className="font-bold text-slate-800">{box.boxCode}</div>
                                                    <div className="text-[10px] text-slate-500">{box.tasks.length} mã sản phẩm</div>
                                                </div>
                                                <div className={`font-bold ${box.status === 'COMPLETED' ? 'text-green-600' : 'text-blue-600'}`}>
                                                    {box.pickedItems}/{box.totalItems}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>

            {!activeBoxId && !loading && allTasks.length > 0 && allTasks.every(t => t.status === 'COMPLETED') && (
                <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-xl z-30">
                    <button onClick={handleCompleteJob} className="w-full h-14 bg-green-600 text-white font-black text-xl rounded-xl shadow-lg active:scale-95 transition-all">
                        HOÀN THÀNH JOB
                    </button>
                </div>
            )}

            {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    )
}

function ChevronLeft(props: any) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
    )
}
