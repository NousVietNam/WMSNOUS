"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Package, Truck, User, ArrowRightLeft, CheckCircle2, AlertCircle } from "lucide-react"

export default function ShipPage() {
    const router = useRouter()
    const [code, setCode] = useState("")
    const [loading, setLoading] = useState(false)

    // Modes: 'INPUT' | 'SINGLE_BOX' | 'ORDER_VERIFY'
    const [mode, setMode] = useState<'INPUT' | 'SINGLE_BOX' | 'ORDER_VERIFY'>('INPUT')

    // Single Box Data
    const [boxInfo, setBoxInfo] = useState<any>(null)

    // Order Data
    const [orderInfo, setOrderInfo] = useState<any>(null)
    const [linkedBoxes, setLinkedBoxes] = useState<any[]>([])
    const [verifiedBoxIds, setVerifiedBoxIds] = useState<Set<string>>(new Set())

    const [verifying, setVerifying] = useState(false)

    const handleScan = async (scannedCode: string) => {
        if (!scannedCode) return
        const cleanCode = scannedCode.toUpperCase().trim()

        // If in Verify Mode, only handle Box Scans
        if (mode === 'ORDER_VERIFY') {
            const box = linkedBoxes.find(b => b.code === cleanCode)
            if (box) {
                setVerifiedBoxIds(prev => {
                    const next = new Set(prev)
                    next.add(box.id)
                    return next
                })
                toast.success("Đã kiểm tra thùng: " + cleanCode)
                setCode("") // Clear input for next scan
            } else {
                toast.error(`Thùng ${cleanCode} không thuộc đơn hàng này!`)
            }
            return
        }

        setVerifying(true)
        setBoxInfo(null)
        setOrderInfo(null)

        try {
            // 1. Try Find Order (Unified)
            const { data: order } = await supabase
                .from('outbound_orders')
                .select(`
                    id, code, status, type,
                    customer:customers(name),
                    destination:destinations(name)
                `)
                .eq('code', cleanCode)
                .single()

            if (order) {
                // Found Order -> Switch to Verify Mode
                // Also get customer/dest name for display
                // @ts-ignore
                const orderName = order.customer?.name || order.destination?.name || '---'
                const displayOrder = { ...order, customer_name: orderName }

                const { data: boxes } = await supabase
                    .from('boxes')
                    .select('id, code, type, status, location_id')
                    .eq('outbound_order_id', order.id) // Use outbound_order_id

                if (!boxes || boxes.length === 0) {
                    toast.error("Đơn hàng này chưa có thùng nào được đóng gói!")
                    return
                }

                setOrderInfo(displayOrder)
                setLinkedBoxes(boxes)
                setVerifiedBoxIds(new Set())
                setMode('ORDER_VERIFY')
                setCode("") // Clear for box scanning
                toast.success(`Đã quét Đơn hàng ${order.code}. Hãy quét các thùng để kiểm tra.`)
                return
            }

            // 2. Try Find Box (Unified)
            const { data: box, error } = await supabase
                .from('boxes')
                .select(`
                    id, code, type, status,
                    outbound_orders (
                        id, code, status, type,
                        customer:customers(name),
                        destination:destinations(name)
                    ),
                    inventory_items!inventory_items_box_id_fkey (count)
                `)
                .eq('code', cleanCode)
                .single()

            if (error || !box) {
                toast.error("Không tìm thấy mã (Đơn hàng hoặc Thùng)")
                return
            }

            // @ts-ignore
            const itemCount = box.inventory_items?.[0]?.count || 0
            if (itemCount === 0) {
                toast.error("Thùng này không có hàng bên trong!")
                return
            }

            setBoxInfo({ ...box, itemCount })
            setMode('SINGLE_BOX')
            setCode(cleanCode)

        } catch (e) {
            console.error(e)
            toast.error("Lỗi kiểm tra mã")
        } finally {
            setVerifying(false)
        }
    }

    const handleConfirmShip = async () => {
        setLoading(true)
        try {
            if (mode === 'ORDER_VERIFY') {
                if (verifiedBoxIds.size < linkedBoxes.length) {
                    if (!window.confirm(`Mới kiểm tra ${verifiedBoxIds.size}/${linkedBoxes.length} thùng. Bạn có chắc chắn muốn xuất không?`)) {
                        setLoading(false)
                        return
                    }
                }

                const res = await fetch('/api/orders/ship', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: orderInfo.id })
                })
                const json = await res.json()
                if (json.success) {
                    toast.success(json.message)
                    reset()
                } else {
                    toast.error(json.error)
                }

            } else if (mode === 'SINGLE_BOX') {
                const res = await fetch('/api/ship', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: boxInfo.code })
                })
                const json = await res.json()
                if (json.success) {
                    toast.success(`Đã xuất kho thành công thùng ${boxInfo.code}!`)
                    reset()
                } else {
                    toast.error("Lỗi: " + json.error)
                }
            }
        } catch (e) {
            toast.error("Lỗi kết nối máy chủ")
        } finally {
            setLoading(false)
        }
    }

    const reset = () => {
        setMode('INPUT')
        setBoxInfo(null)
        setOrderInfo(null)
        setLinkedBoxes([])
        setVerifiedBoxIds(new Set())
        setCode("")
    }

    const linkedDoc = boxInfo?.outbound_orders
    const isSale = linkedDoc?.type === 'SALE' || linkedDoc?.type === 'GIFT'
    // @ts-ignore
    const docName = isSale ? linkedDoc?.customer?.name : linkedDoc?.destination?.name

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Xuất Kho (Outbound)" backLink="/mobile" />

            <div className="p-4 space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
                    <div className="flex items-center gap-3 text-slate-800 mb-2">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                            {mode === 'ORDER_VERIFY' ? <CheckCircle2 className="h-6 w-6" /> : <Package className="h-6 w-6" />}
                        </div>
                        <div className="font-bold text-lg">
                            {mode === 'ORDER_VERIFY' ? 'Kiểm Tra Thùng' : 'Quét Mã (Đơn/Thùng)'}
                        </div>
                    </div>

                    <MobileScannerInput
                        autoFocus
                        placeholder={mode === 'ORDER_VERIFY' ? "Quét thùng..." : "Quét mã Đơn hoặc Mã Thùng"}
                        value={code}
                        onChange={(val) => {
                            setCode(val)
                            // Auto submit rules
                            if (mode === 'ORDER_VERIFY') {
                                // Box codes usually long? Or standard?
                                // Let's rely on Enter or sufficient length
                                if (val.length >= 8) handleScan(val)
                            } else {
                                if (val.length >= 6) handleScan(val)
                            }
                        }}
                        onEnter={() => handleScan(code)}
                        className={`h-16 text-xl text-center font-black uppercase tracking-widest border-2 rounded-xl focus:border-indigo-500 ${mode === 'ORDER_VERIFY' ? 'border-green-200 bg-green-50 text-green-800' : 'border-indigo-100'}`}
                    />

                    {verifying && <div className="text-center text-sm text-slate-400 animate-pulse font-bold italic">Đang kiểm tra...</div>}
                </div>

                {/* ORDER VERIFY VIEW */}
                {mode === 'ORDER_VERIFY' && orderInfo && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-100">
                            <div className="text-xs font-bold text-slate-400 uppercase">Đơn hàng</div>
                            <div className="text-2xl font-black text-indigo-700">{orderInfo.code}</div>
                            <div className="text-sm font-bold text-slate-600 truncate">{orderInfo.customer_name}</div>

                            <div className="mt-4 flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                                <span className="text-sm font-bold text-slate-500">Tiến độ</span>
                                <span className={`text-lg font-black ${verifiedBoxIds.size === linkedBoxes.length ? 'text-green-600' : 'text-orange-500'}`}>
                                    {verifiedBoxIds.size} / {linkedBoxes.length} thùng
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {linkedBoxes.map(box => {
                                const isVerified = verifiedBoxIds.has(box.id)
                                return (
                                    <div key={box.id} className={`p-4 rounded-xl border-2 flex justify-between items-center transition-all ${isVerified ? 'bg-green-50 border-green-500' : 'bg-white border-slate-100'}`}>
                                        <div>
                                            <div className={`font-black text-lg ${isVerified ? 'text-green-700' : 'text-slate-700'}`}>{box.code}</div>
                                            <div className="text-[10px] uppercase font-bold text-slate-400">{box.type}</div>
                                        </div>
                                        {isVerified ? <CheckCircle2 className="h-6 w-6 text-green-600" /> : <div className="h-6 w-6 rounded-full border-2 border-slate-200" />}
                                    </div>
                                )
                            })}
                        </div>

                        <button
                            onClick={handleConfirmShip}
                            disabled={loading}
                            className={`w-full h-16 text-white font-black text-xl rounded-xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 border-b-4 mt-4
                                ${verifiedBoxIds.size === linkedBoxes.length ? 'bg-indigo-600 border-indigo-800' : 'bg-slate-600 border-slate-800 opacity-90'}`}
                        >
                            <Truck className="h-6 w-6" />
                            {loading ? 'ĐANG XỬ LÝ...' : verifiedBoxIds.size < linkedBoxes.length ? 'XUẤT (THIẾU KIỂM TRA)' : 'XÁC NHẬN XUẤT KHO'}
                        </button>

                        <button onClick={reset} className="w-full py-3 text-slate-400 font-bold text-sm">Hủy bỏ / Quét lại</button>
                    </div>
                )}


                {/* SINGLE BOX VIEW (Legacy) */}
                {mode === 'SINGLE_BOX' && boxInfo && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-white rounded-2xl shadow-lg border-2 border-green-500 overflow-hidden">
                            <div className="bg-green-500 p-4 text-white flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <span className="font-bold text-lg">{boxInfo.code}</span>
                                </div>
                                <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-black uppercase">Sẵn sàng xuất</span>
                            </div>

                            <div className="p-5 space-y-4">
                                <div className="flex items-start gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                                        {isSale ? <User className="h-6 w-6" /> : <ArrowRightLeft className="h-6 w-6" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[10px] font-black uppercase text-slate-400">Khách hàng / Đối tác</div>
                                        <div className="font-bold text-slate-800 truncate text-lg">{docName || '---'}</div>
                                        <div className="text-sm font-mono text-slate-500 font-bold">{linkedDoc?.code}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50 text-center">
                                    <div>
                                        <div className="text-[10px] font-black uppercase text-slate-400">Số lượng SKU</div>
                                        <div className="text-2xl font-black text-indigo-600">{boxInfo.itemCount}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase text-slate-400">Trạng thái phiếu</div>
                                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 uppercase">{linkedDoc?.status}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleConfirmShip}
                                    disabled={loading}
                                    className="w-full h-16 bg-green-600 text-white font-black text-xl rounded-xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 border-b-4 border-green-800 mt-2"
                                >
                                    {loading ? 'ĐANG XỬ LÝ...' : <>BỐC LÊN XE & XUẤT KHO</>}
                                </button>
                                <button onClick={reset} className="w-full py-3 text-slate-400 font-bold text-sm">Quét mã khác</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

