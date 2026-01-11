"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
// import { ChevronLeft, MapPin, Package, Plus } from "lucide-react"

interface BoxDetail {
    id: string
    code: string
    status: string
    locations: { code: string; type: string } | null
}

interface AssetItem {
    id: string
    quantity: number
    product_id: string
    products: { name: string; sku: string } | null
}

export default function BoxDetailPage() {
    const params = useParams()
    const router = useRouter()
    // Unescape in case the code has special chars (unlikely for IDs but good practice)
    const code = typeof params.code === 'string' ? params.code : ''

    const [box, setBox] = useState<BoxDetail | null>(null)
    const [items, setItems] = useState<AssetItem[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchBoxDetails() {
            if (!code) return

            // 1. Fetch Box Info
            const { data: boxData, error: boxError } = await supabase
                .from('boxes')
                .select(`
          id,
          code,
          status,
          locations (code, type)
        `)
                .eq('code', code)
                .single()

            if (boxError) {
                console.error("Error fetching box:", boxError)
                setLoading(false)
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setBox(boxData as any)

            // 2. Fetch Inventory in Box
            if (boxData) {
                const { data: itemData, error: itemError } = await supabase
                    .from('inventory_items')
                    .select(`
                id,
                quantity,
                product_id,
                products (name, sku)
            `)
                    .eq('box_id', boxData.id)

                if (!itemError) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setItems(itemData as any)
                }
            }

            setLoading(false)
        }

        fetchBoxDetails()
    }, [code])

    if (loading) return <div className="p-8 text-center text-slate-500">Đang tải thông tin...</div>

    if (!box) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-red-500 font-bold">Không tìm thấy thùng: {code}</p>
                <button onClick={() => router.back()} className="px-4 py-2 bg-slate-100 rounded text-slate-700 font-medium">Quay lại</button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 pb-24 font-sans">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 sticky top-0 bg-slate-50 py-3 z-10 border-b border-slate-100/50 backdrop-blur-sm -mx-4 px-4 shadow-sm">
                <button
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-white shadow-sm border active:scale-95 transition-transform"
                    onClick={() => router.back()}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-slate-700"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold font-mono tracking-tight text-slate-900">{box.code}</h1>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${box.status === 'OPEN' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-200 text-slate-700'
                        }`}>
                        {box.status}
                    </span>
                </div>
            </div>

            <div className="space-y-4">
                {/* Location Info */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4">
                    <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-blue-600"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vị Trí Hiện Tại</h3>
                        <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-black text-slate-800">{box.locations?.code || '---'}</p>
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono border">
                                {box.locations?.type || 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Packing List */}
                <div>
                    <h2 className="text-sm font-bold mb-3 text-slate-500 uppercase flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                        Danh Sách Hàng ({items.length})
                    </h2>
                    <div className="space-y-3">
                        {items.length === 0 && (
                            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-slate-300 mx-auto mb-2"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                                <p className="text-slate-400 font-medium">Thùng đang rỗng</p>
                            </div>
                        )}
                        {items.map((item) => (
                            <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4 overflow-hidden">
                                    <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 truncate font-mono text-sm">{item.products?.sku || 'Unknown SKU'}</p>
                                        <p className="text-xs text-slate-500 truncate">{item.products?.name}</p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0 pl-2">
                                    <span className="text-lg font-bold block text-slate-900">x{item.quantity}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action Buttons for Box */}
                {box.status === 'OPEN' && (
                    <button
                        onClick={() => router.push(`/mobile/putaway?box=${encodeURIComponent(box.code)}`)}
                        className="w-full h-14 text-base font-bold bg-indigo-600 text-white rounded-xl sticky bottom-6 shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                        Thêm Sản Phẩm
                    </button>
                )}
            </div>
        </div>
    )
}
