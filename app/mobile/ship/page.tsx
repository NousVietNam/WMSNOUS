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
    const [boxInfo, setBoxInfo] = useState<any>(null)
    const [verifying, setVerifying] = useState(false)

    const handleScan = async (scannedCode: string) => {
        if (!scannedCode) return
        setVerifying(true)
        setBoxInfo(null)
        try {
            // Find box and its linked order/transfer
            const { data: box, error } = await supabase
                .from('boxes')
                .select(`
                    id, code, type, status,
                    orders (id, code, customer_name, status),
                    transfer_orders (id, code, destinations (name), status),
                    inventory_items!inventory_items_box_id_fkey (count)
                `)
                .eq('code', scannedCode.toUpperCase())
                .single()

            if (error || !box) {
                toast.error("Không tìm thấy mã thùng này")
                return
            }

            // @ts-ignore
            const itemCount = box.inventory_items?.[0]?.count || 0
            if (itemCount === 0) {
                toast.error("Thùng này không có hàng bên trong!")
                return
            }

            setBoxInfo({
                ...box,
                itemCount
            })
            setCode(scannedCode.toUpperCase())
        } catch (e) {
            toast.error("Lỗi kiểm tra mã")
        } finally {
            setVerifying(false)
        }
    }

    const handleConfirmShip = async () => {
        if (!boxInfo) return

        setLoading(true)
        try {
            const res = await fetch('/api/ship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: boxInfo.code })
            })
            const json = await res.json()

            if (json.success) {
                toast.success(`Đã xuất kho thành công thùng ${boxInfo.code}!`)
                setCode("")
                setBoxInfo(null)
            } else {
                toast.error("Lỗi: " + json.error)
            }
        } catch (e) {
            toast.error("Lỗi kết nối máy chủ")
        } finally {
            setLoading(false)
        }
    }

    const linkedDoc = boxInfo?.orders || boxInfo?.transfer_orders
    const isOrder = !!boxInfo?.orders
    const docName = isOrder ? boxInfo?.orders?.customer_name : boxInfo?.transfer_orders?.destinations?.name

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Xuất Kho (Outbound)" backLink="/mobile" />

            <div className="p-4 space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
                    <div className="flex items-center gap-3 text-slate-800 mb-2">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <Package className="h-6 w-6" />
                        </div>
                        <div className="font-bold text-lg">Quét Thùng Xuất Hàng</div>
                    </div>

                    <MobileScannerInput
                        autoFocus
                        placeholder="Quét mã Thùng (BOX hoặc OUT)"
                        value={code}
                        onChange={(val) => {
                            setCode(val)
                            if (val.length >= 8) handleScan(val)
                        }}
                        onEnter={() => handleScan(code)}
                        className="h-16 text-xl text-center font-black uppercase tracking-widest border-2 border-indigo-100 focus:border-indigo-500 rounded-xl"
                    />

                    {verifying && <div className="text-center text-sm text-slate-400 animate-pulse font-bold italic">Đang kiểm tra mã...</div>}
                </div>

                {boxInfo && (
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
                                        {isOrder ? <User className="h-6 w-6" /> : <ArrowRightLeft className="h-6 w-6" />}
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
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-amber-50 p-4 rounded-xl text-xs text-amber-800 border border-amber-100 flex gap-3 shadow-sm">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                        <b>Lưu ý dành cho nhân viên:</b> Chỉ xuất hàng khi đã chuẩn bị đầy đủ chứng từ và xe tải đã sẵn sàng bốc dỡ. Hành động này sẽ trừ tồn kho của hệ thống.
                    </div>
                </div>
            </div>
        </div>
    )
}

