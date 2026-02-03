
"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Box, Check, Printer, ScanLine } from "lucide-react"

export default function SortingSetupPage() {
    const { id } = useParams()
    const router = useRouter()

    const [orders, setOrders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [scanInput, setScanInput] = useState("")
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null)

    // Refs
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetchWaveData()
    }, [])

    // Focus input on load and interaction
    useEffect(() => {
        if (!loading) inputRef.current?.focus()
    }, [loading, activeOrderId])

    const fetchWaveData = async () => {
        setLoading(true)
        const { data, error } = await supabase.rpc('get_wave_sorting_details', { p_wave_id: id })
        if (error) {
            toast.error("Lỗi: " + error.message)
        } else {
            setOrders(data || [])
        }
        setLoading(false)
    }

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault()
        const code = scanInput.trim().toUpperCase()
        setScanInput("")

        if (!code) return

        // Logic:
        // 1. If no active order selected: Check if code matches an Order Code
        // 2. If active order selected: Check if code matches a Box Code (Outbox) - or CREATE logic

        if (!activeOrderId) {
            // Find order
            const order = orders.find(o => o.order_code === code || o.order_code.endsWith(code))
            if (order) {
                setActiveOrderId(order.order_id)
                toast.info(`Đã chọn đơn: ${order.customer_name}. Vui lòng quét thùng!`)
            } else {
                toast.error("Không tìm thấy đơn hàng này trong Wave!")
            }
        } else {
            // Assign Box
            // Check if box exists and is valid
            // Call API to link box
            linkBoxToOrder(code)
        }
    }

    const linkBoxToOrder = async (boxCode: string) => {
        try {
            const res = await fetch('/api/picking/scan-outbox', { // Re-use picking scan logic or create new
                method: 'POST',
                // We need to cheat a bit here or make a new specific API.
                // Or: Direct Supabase call (since we are creating a specific tool)
                // Let's use direct DB for speed in this prototype
            })

            // 1. Validate Box
            const { data: box, error: boxError } = await supabase.from('boxes').select('*').eq('code', boxCode).single()
            if (!box) return toast.error("Mã thùng không tồn tại!")
            if (box.type !== 'OUTBOX') return toast.error("Đây không phải thùng OUTBOX!")

            // 2. Link
            if (box.outbound_order_id && box.outbound_order_id !== activeOrderId) {
                return toast.error("Thùng đang dùng cho đơn khác!")
            }

            const { error: updateError } = await supabase
                .from('boxes')
                .update({ outbound_order_id: activeOrderId })
                .eq('id', box.id)

            if (updateError) throw updateError

            toast.success(`Đã gán thùng ${boxCode} cho đơn hàng!`)
            setActiveOrderId(null) // Reset
            fetchWaveData() // Refresh

        } catch (e: any) {
            toast.error("Lỗi: " + e.message)
        }
    }

    const readyCount = orders.filter(o => o.outbox_id).length
    const allReady = readyCount === orders.length // Or at least 1?

    // Auto-select order if clicked
    const selectOrder = (order: any) => {
        setActiveOrderId(order.order_id)
        inputRef.current?.focus()
    }

    return (
        <div className="h-screen flex flex-col bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}><ArrowLeft /></Button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Chuẩn Bị Gán Thùng (Setup)</h1>
                        <p className="text-sm text-slate-500">Wave đang xử lý</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right mr-4">
                        <div className="text-sm text-slate-500">Tiến độ gán</div>
                        <div className="font-bold text-lg text-indigo-700">{readyCount} / {orders.length} Đơn</div>
                    </div>
                    <Button
                        size="lg"
                        className={`font-bold ${readyCount > 0 ? 'gradient-primary' : 'bg-slate-300'}`}
                        disabled={readyCount === 0}
                        onClick={() => router.push(`/admin/sorting/${id}/run`)}
                    >
                        BẮT ĐẦU SORTING <ArrowRight className="ml-2" />
                    </Button>
                </div>
            </div>

            {/* Input Bar */}
            <div className="bg-indigo-900 p-4 shadow-inner">
                <div className="max-w-3xl mx-auto flex gap-4">
                    <div className={`flex-1 h-14 rounded-xl flex items-center px-4 gap-2 transition-colors ${activeOrderId ? 'bg-orange-500 text-white' : 'bg-white text-slate-800'}`}>
                        <ScanLine className="h-6 w-6 opacity-70" />
                        <form onSubmit={handleScan} className="flex-1">
                            <input
                                ref={inputRef}
                                className="w-full bg-transparent border-none outline-none text-xl font-bold placeholder:text-black/30"
                                placeholder={activeOrderId ? "QUÉT MÃ THÙNG (OUTBOX)..." : "QUÉT MÃ ĐƠN HÀNG..."}
                                value={scanInput}
                                onChange={e => setScanInput(e.target.value)}
                                autoFocus
                                onBlur={(e) => setTimeout(() => e.target.focus(), 100)} // Keep focus
                            />
                        </form>
                    </div>
                </div>
                <p className="text-center text-indigo-200 text-sm mt-2">
                    {activeOrderId
                        ? `Đang chọn đơn của: ${orders.find(o => o.order_id === activeOrderId)?.customer_name}. Hãy quét tem Thùng!`
                        : "Bước 1: Quét mã Đơn hàng hoặc click chọn bên dưới"}
                </p>
            </div>

            {/* Grid Content */}
            <div className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {orders.map((order) => {
                        const hasBox = !!order.outbox_id
                        const isActive = activeOrderId === order.order_id

                        return (
                            <Card
                                key={order.order_id}
                                onClick={() => selectOrder(order)}
                                className={`cursor-pointer transition-all border-2 relative overflow-hidden group 
                                    ${isActive ? 'border-orange-500 shadow-xl scale-105 ring-4 ring-orange-200' :
                                        hasBox ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-indigo-300'}`}
                            >
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div className="font-mono text-xs text-slate-500 font-bold">{order.order_code}</div>
                                        {hasBox && <Check className="h-4 w-4 text-green-600" />}
                                    </div>
                                    <div className="font-bold text-slate-800 line-clamp-2 h-10 leading-tight">
                                        {order.customer_name}
                                    </div>
                                    <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                                        <div className="text-xs text-slate-400">{order.total_qty} SP</div>
                                        {hasBox ? (
                                            <div className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded flex items-center gap-1">
                                                <Box className="h-3 w-3" /> {order.outbox_code}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-400 italic">Chưa gán</div>
                                        )}
                                    </div>
                                </div>
                                {isActive && (
                                    <div className="absolute inset-0 bg-orange-500/10 z-0 animate-pulse" />
                                )}
                            </Card>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
