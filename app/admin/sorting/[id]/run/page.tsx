
"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ArrowLeft, Box, CheckCircle2, AlertTriangle, Printer, Play } from "lucide-react" // Import Play
import { useAuth } from "@/components/auth/AuthProvider"
import useSound from "use-sound" // Optional: Need to install or use Audio API

export default function SortingRunPage() {
    const { id: waveId } = useParams()
    const router = useRouter()
    const { session } = useAuth()

    // Data State
    const [orders, setOrders] = useState<any[]>([])
    const [lastResult, setLastResult] = useState<any>(null) // { status, product, target, ... }
    const [scanInput, setScanInput] = useState("")
    const [loading, setLoading] = useState(false)

    // Stats
    const totalItems = orders.reduce((sum, o) => sum + (o.total_qty || 0), 0)
    const sortedItems = orders.reduce((sum, o) => sum + (o.sorted_qty || 0), 0)

    // Refs
    const inputRef = useRef<HTMLInputElement>(null)

    // Audio (Simple Web API implementation for now)
    const playSound = (type: 'success' | 'error' | 'bell') => {
        const audio = new Audio(
            type === 'success' ? '/sounds/beep-success.mp3' :
                type === 'error' ? '/sounds/beep-error.mp3' : '/sounds/bell.mp3'
        )
        // Check if file exists or just ignore error for now
        audio.play().catch(() => { })
    }

    useEffect(() => {
        fetchData()
        // Focus loop
        const interval = setInterval(() => {
            if (!document.activeElement || document.activeElement.tagName !== 'INPUT') {
                inputRef.current?.focus()
            }
        }, 2000)
        return () => clearInterval(interval)
    }, [])

    const fetchData = async () => {
        const { data, error } = await supabase.rpc('get_wave_sorting_details', { p_wave_id: waveId })
        if (data) setOrders(data)
    }

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault()
        const code = scanInput.trim()
        setScanInput("")
        if (!code) return

        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('sort_item_scan', {
                p_wave_id: waveId,
                p_barcode: code,
                p_sorter_id: session?.user?.id
            })

            if (error) throw error

            if (data.success) {
                setLastResult(data)
                playSound('success')
                // Update local stats optimistically
                fetchData() // Simple referesh
            } else {
                setLastResult({ status: 'ERROR', message: data.error })
                playSound('error')
                toast.error(data.error)
            }

        } catch (e: any) {
            setLastResult({ status: 'ERROR', message: e.message })
            playSound('error')
        } finally {
            setLoading(false)
        }
    }

    // Render Big Instruction Panel
    const renderInstruction = () => {
        if (!lastResult) return (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <ScanIcon className="w-32 h-32 mb-4 opacity-20" />
                <h2 className="text-3xl font-bold">SẴN SÀNG QUÉT</h2>
                <p className="text-xl mt-2">Đang chờ tín hiệu từ máy quét...</p>
            </div>
        )

        if (lastResult.status === 'ERROR') return (
            <div className="h-full flex flex-col items-center justify-center bg-red-50 text-red-600 animate-pulse">
                <AlertTriangle className="w-32 h-32 mb-4" />
                <h2 className="text-4xl font-black">LỖI / KHÔNG TÌM THẤY</h2>
                <p className="text-2xl mt-4 max-w-lg text-center">{lastResult.message}</p>
            </div>
        )

        if (lastResult.status === 'NEED_BOX') return (
            <div className="h-full flex flex-col items-center justify-center bg-orange-50 text-orange-700">
                <Box className="w-32 h-32 mb-4" />
                <h2 className="text-4xl font-black">CHƯA CÓ THÙNG!</h2>
                <p className="text-2xl mt-4 font-bold">{lastResult.order?.customer?.name || lastResult.order?.code}</p>
                <Button className="mt-8" size="lg" onClick={() => router.push(`/admin/sorting/${waveId}/setup`)}>
                    Gán Thùng Ngay
                </Button>
            </div>
        )

        const { product, target, progress } = lastResult

        return (
            <div className="h-full flex flex-col p-12 animate-in zoom-in-95 duration-200">
                {/* Product Info */}
                <div className="flex gap-8 mb-8">
                    <div className="w-32 h-32 bg-white rounded-xl shadow-md flex items-center justify-center border p-2">
                        {product.image ? <img src={product.image} className="max-h-full" /> : <Box className="text-slate-200 h-12 w-12" />}
                    </div>
                    <div>
                        <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">Sản phẩm vừa quét</div>
                        <h3 className="text-2xl font-bold text-slate-800">{product.name}</h3>
                        <div className="text-lg font-mono text-slate-600 bg-slate-100 inline-block px-2 rounded mt-1">{product.sku}</div>
                    </div>
                </div>

                {/* BIG INSTRUCTION */}
                <div className="flex-1 bg-indigo-600 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 bg-indigo-700/50 p-4 text-center text-indigo-200 uppercase font-bold tracking-[0.2em]">
                        Bỏ vào thùng
                    </div>

                    <h1 className="text-[120px] font-black leading-none tracking-tighter shadow-black drop-shadow-lg">
                        {target.box_code.replace('BOX-', '').replace('CART-', '')}
                    </h1>

                    <div className="text-3xl font-medium mt-4 opacity-90">
                        {target.customer_name || target.order_code}
                    </div>

                    <div className="absolute bottom-8 right-8 flex items-center gap-4 bg-black/20 px-6 py-3 rounded-full backdrop-blur-md">
                        <span className="text-sm uppercase opacity-70">Tiến độ đơn:</span>
                        <span className="text-2xl font-bold font-mono">{progress.current} / {progress.total}</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-slate-100">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center z-10 shadow-md">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" className="text-slate-300 hover:text-white" onClick={() => router.push('/admin/sorting')}>
                        <ArrowLeft /> Thoát
                    </Button>
                    <div className="h-8 w-px bg-slate-700 mx-2"></div>
                    <div>
                        <h1 className="font-bold text-lg">Sorting Station</h1>
                        <div className="text-xs text-slate-400 font-mono">Wave ID: {waveId?.slice(0, 8)}</div>
                    </div>
                </div>

                {/* Global Progress */}
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Tổng tiến độ Wave</div>
                        <div className="font-mono font-bold text-xl text-green-400">
                            {sortedItems} / <span className="text-green-800">{totalItems}</span> SP
                        </div>
                    </div>
                    {/* Input Hidden but focussed */}
                    <input
                        ref={inputRef}
                        className="w-48 bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 px-3 py-1 rounded"
                        placeholder="Quét bất kỳ..."
                        value={scanInput}
                        onChange={e => setScanInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleScan(e)}
                        autoFocus
                    />
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* LEFT: INSTRUCTION (Mobile: Top, Desktop: Left) */}
                <div className="h-[60%] md:h-full w-full md:w-[65%] bg-slate-200 border-r border-slate-300 relative order-1 md:order-1">
                    {renderInstruction()}
                </div>

                {/* RIGHT: ORDER LIST (Mobile: Bottom, Desktop: Right) */}
                <div className="h-[40%] md:h-full w-full md:w-[35%] bg-white flex flex-col shadow-xl z-10 order-2 md:order-2 border-t md:border-t-0">
                    <div className="p-4 bg-slate-50 border-b font-bold text-slate-700 flex justify-between items-center">
                        <span>Danh Sách Đơn ({orders.length})</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {orders.sort((a, b) => {
                            // Sort: Finished first? No, Unfinished first.
                            const aDone = a.sorted_qty >= a.total_qty
                            const bDone = b.sorted_qty >= b.total_qty
                            if (aDone === bDone) return 0
                            return aDone ? 1 : -1
                        }).map(order => {
                            const percent = order.total_qty > 0 ? (order.sorted_qty / order.total_qty) * 100 : 0
                            const isDone = percent >= 100
                            const isTarget = lastResult?.target?.order_code === order.order_code

                            return (
                                <div key={order.order_id} className={`p-3 rounded-lg border transition-all ${isTarget ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200' : isDone ? 'bg-green-50 border-green-100 opacity-60' : 'bg-white border-slate-100 shadow-sm'}`}>
                                    <div className="flex justify-between mb-2">
                                        <span className={`font-bold text-sm ${isTarget ? 'text-indigo-700' : 'text-slate-700'}`}>{order.customer_name}</span>
                                        <span className="font-mono text-xs text-slate-500">{order.outbox_code || '?'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${isDone ? 'bg-green-500' : 'bg-indigo-500'}`}
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-bold w-12 text-right">{order.sorted_qty}/{order.total_qty}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

function ScanIcon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></svg>
}
