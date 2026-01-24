"use client"


import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"
import { MobileHeader } from "@/components/mobile/MobileHeader"
// import { Camera, Save } from "lucide-react"

interface AuditItem {
    id: string
    product_id: string
    products: { sku: string; name: string } | null
    expected_qty: number
    actual_qty: number
}

import { useAuth } from "@/components/auth/AuthProvider"

// ...

export default function AuditPage() {
    const { session } = useAuth()
    const router = useRouter()
    const [boxId, setBoxId] = useState("")
    const [boxCode, setBoxCode] = useState("")
    const [loading, setLoading] = useState(false)
    const [isScanning, setIsScanning] = useState(true)
    const [items, setItems] = useState<AuditItem[]>([])
    const [reason, setReason] = useState("")

    const handleScanBox = async () => {
        if (!boxCode) return
        setLoading(true)
        try {
            const { data: box, error: boxError } = await supabase
                .from('boxes')
                .select('id, outbound_order_id, status')
                .ilike('code', boxCode.trim())
                .single()

            if (boxError) {
                console.error("Box fetch error:", boxError)
                // Ignore "Row not found" error (PGRST116) as we handle !box below
                if (boxError.code !== 'PGRST116') {
                    alert(`Lỗi hệ thống: ${boxError.message}`)
                    setLoading(false)
                    return
                }
            }

            if (!box) {
                alert(`Không tìm thấy Box mã "${boxCode}"!`)
                setLoading(false)
                return
            }

            if (box.status !== 'OPEN') {
                if (box.status === 'SHIPPED') alert("CẢNH BÁO: Thùng hàng này ĐÃ XUẤT KHO (SHIPPED)! Không thể kiểm kê.")
                else if (box.status === 'LOCKED' || box.outbound_order_id) alert("CẢNH BÁO: Thùng hàng đang bị KHÓA (LOCKED) theo đơn hàng! Vui lòng hoàn thành đơn hoặc hủy trước khi kiểm kê.")
                else alert(`CẢNH BÁO: Trạng thái thùng không hợp lệ (${box.status}). Chỉ có thể kiểm kê thùng OPEN.`)

                setLoading(false)
                return
            }
            setBoxId(box.id)

            const { data: inventory, error: invError } = await supabase
                .from('inventory_items')
                .select(`
                id,
                quantity,
                product_id,
                products (sku, name)
            `)
                .eq('box_id', box.id)

            if (invError) throw invError

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped = (inventory || []).map((i: any) => ({
                id: i.id,
                product_id: i.product_id,
                products: i.products,
                expected_qty: i.quantity,
                actual_qty: i.quantity // Default to expected
            }))

            setItems(mapped)
            setIsScanning(false)

        } catch (err) {
            console.error(err)
            alert("Lỗi tải dữ liệu thùng.")
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateQty = (id: string, newQty: number) => {
        setItems(items.map(i => i.id === id ? { ...i, actual_qty: newQty } : i))
    }

    const handleSaveAudit = async () => {
        if (!reason.trim()) {
            alert("Vui lòng nhập lý do kiểm kê!")
            return
        }
        if (!confirm("Xác nhận cập nhật tồn kho theo số liệu thực tế?")) return
        setLoading(true)
        try {
            // Update each item
            for (const item of items) {
                if (item.actual_qty !== item.expected_qty) {
                    await supabase
                        .from('inventory_items')
                        .update({ quantity: item.actual_qty })
                        .eq('id', item.id)

                    // Log discrepancy
                    // Log discrepancy
                    const delta = item.actual_qty - item.expected_qty
                    const { error } = await supabase.from('transactions').insert({
                        type: 'AUDIT',
                        entity_type: 'ITEM',
                        entity_id: item.id, // Inventory Item ID
                        from_box_id: boxId,
                        quantity: delta,
                        sku: item.products?.sku, // Fix: Populate top-level SKU
                        // details: Removed
                        user_id: session?.user?.id
                    })
                    if (error) {
                        console.error('Transaction error', error)
                    }
                }
            }
            alert("Đã cập nhật kiểm kê!")
            router.push('/mobile')
        } catch (err) {
            console.error(err)
            alert("Lỗi cập nhật.")
        } finally {
            setLoading(false)
        }
    }

    if (isScanning) {
        return (
            <div className="min-h-screen bg-slate-50">
                <MobileHeader title="Kiểm Kê Thùng" backLink="/mobile" />
                <div className="p-4 space-y-4">
                    <div className="bg-white p-6 rounded-xl shadow-sm border text-center space-y-4">
                        <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">Quét mã thùng</h2>
                        <p className="text-sm text-slate-500">Quét mã thùng để bắt đầu kiểm kê sản phẩm bên trong</p>
                    </div>

                    <MobileScannerInput
                        value={boxCode}
                        onChange={setBoxCode}
                        onEnter={handleScanBox}
                        placeholder="Quét mã thùng (Ví dụ: BOX-001)"
                    />

                    <button
                        onClick={handleScanBox}
                        disabled={loading || !boxCode}
                        className="w-full h-12 bg-blue-600 text-white font-bold rounded-xl shadow active:scale-95 transition-transform disabled:opacity-50"
                    >
                        {loading ? "Đang tải..." : "Bắt Đầu Kiểm Kê"}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title={boxCode} backLink="#" />
            <div className="p-4 space-y-4">
                <div className="space-y-4">
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-muted-foreground">Đang kiểm kê thùng</p>
                        <p className="text-xl font-bold font-mono text-orange-800">{boxCode}</p>
                    </div>

                    <div className="space-y-3">
                        {items.map(item => (
                            <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-slate-800">{item.products?.sku}</p>
                                    <p className="text-xs text-muted-foreground">{item.products?.name}</p>
                                    <p className="text-xs mt-1">Hệ thống: <span className="font-medium">{item.expected_qty}</span></p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="h-10 w-10 flex items-center justify-center border rounded-lg bg-slate-50 active:bg-slate-200 font-bold"
                                        onClick={() => handleUpdateQty(item.id, Math.max(0, item.actual_qty - 1))}
                                    >
                                        -
                                    </button>
                                    <div className="w-12 text-center font-bold text-lg border-b-2 border-slate-200 py-1">
                                        {item.actual_qty}
                                    </div>
                                    <button
                                        className="h-10 w-10 flex items-center justify-center border rounded-lg bg-slate-50 active:bg-slate-200 font-bold"
                                        onClick={() => handleUpdateQty(item.id, item.actual_qty + 1)}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Lý do điều chỉnh / Ghi chú <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none"
                            placeholder="Nhập lý do chênh lệch hoặc ghi chú..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <button
                        className="w-full h-14 text-lg bg-orange-600 text-white rounded-lg font-bold shadow-lg sticky bottom-4 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleSaveAudit}
                        disabled={loading}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                        Hoàn Tất & Lưu
                    </button>
                </div>
            </div>
        </div>
    )
}
