"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
// import { Package, MapPin, Tag, Info, Calendar } from "lucide-react"

// Types (inferred from requirements)
type ProductDetail = {
    id: string
    sku: string
    barcode: string
    name: string
    image_url?: string
    launch_month?: string
    brand?: string
    product_group?: string
    color?: string
    color_code?: string
    target_audience?: string
    sales_channel?: string
    size?: string
    season?: string
}

type InventoryDetail = {
    box_code: string
    location_code: string
    quantity: number
}

type SizeInventory = {
    size: string
    total_qty: number
    details: InventoryDetail[]
}

export default function ProductLookupPage() {
    const { barcode } = useParams()
    const router = useRouter()

    const [product, setProduct] = useState<ProductDetail | null>(null)
    const [sizes, setSizes] = useState<SizeInventory[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Logic for Detail Popup
    const [selectedSize, setSelectedSize] = useState<SizeInventory | null>(null)

    useEffect(() => {
        if (barcode) fetchProduct()
    }, [barcode])

    const fetchProduct = async () => {
        setLoading(true)
        try {
            // 1. Find the specific product scanned
            const { data: matched, error: matchError } = await supabase
                .from('products')
                .select('*, image_url, brand, product_group, target_audience, launch_month, season, sales_channel, color_code')
                .or(`barcode.eq."${barcode}",sku.eq."${barcode}"`)
                .maybeSingle()

            if (matchError) throw matchError

            if (!matched) {
                setError("Không tìm thấy sản phẩm này!")
                setLoading(false)
                return
            }

            setProduct(matched)

            // 2. Find siblings (Same Color Code) to show size run
            let query = supabase.from('products').select('id, size, sku')

            if (matched.color_code) {
                query = query.eq('color_code', matched.color_code)
            } else if (matched.sku) {
                query = query.eq('id', matched.id)
            } else {
                query = query.eq('id', matched.id)
            }

            const { data: siblings } = await query

            if (siblings && siblings.length > 0) {
                const siblingIds = siblings.map(s => s.id)

                // 3. Calc Inventory for these products with DETAILS
                const { data: inventory } = await supabase
                    .from('inventory_items')
                    .select(`
                        product_id, quantity,
                        boxes (code, locations (code)),
                        locations (code)
                    `)
                    .in('product_id', siblingIds)

                // Map inventory to sizes
                const sizeMap: Record<string, SizeInventory> = {}

                // Init sizes from siblings list
                siblings.forEach(s => {
                    const sName = s.size || 'Free';
                    if (!sizeMap[sName]) {
                        sizeMap[sName] = { size: sName, total_qty: 0, details: [] }
                    }
                })

                inventory?.forEach((inv: any) => {
                    const foundProd = siblings.find(s => s.id === inv.product_id)
                    if (foundProd) {
                        const sName = foundProd.size || 'Free'

                        // Add to Total
                        sizeMap[sName].total_qty += inv.quantity

                        // Add to Details
                        const boxCode = inv.boxes?.code || '---'
                        // Logic: Box Location takes precedence, else Item Location (if exists)
                        const locCode = inv.boxes?.locations?.code || inv.locations?.code || '---'

                        sizeMap[sName].details.push({
                            box_code: boxCode,
                            location_code: locCode,
                            quantity: inv.quantity
                        })
                    }
                })

                // Sort sizes logically
                const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "Free"]

                const sizeList = Object.values(sizeMap).sort((a, b) => {
                    const idxA = sizeOrder.indexOf(a.size)
                    const idxB = sizeOrder.indexOf(b.size)
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB
                    if (idxA !== -1) return -1
                    if (idxB !== -1) return 1
                    return a.size.localeCompare(b.size)
                })

                setSizes(sizeList)
            }

        } catch (err: any) {
            console.error(err)
            setError("Lỗi tải thông tin: " + err.message)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 pb-20">
                <MobileHeader title="Chi Tiết Sản Phẩm" backLink="/mobile/lookup" />
                <div className="p-10 text-center text-slate-500">Đang tải...</div>
            </div>
        )
    }

    if (error || !product) {
        return (
            <div className="min-h-screen bg-slate-50 pb-20">
                <MobileHeader title="Không Tìm Thấy" backLink="/mobile/lookup" />
                <div className="p-10 text-center text-slate-500">
                    <p className="mb-4 text-red-500">{error}</p>
                    <button onClick={() => router.back()} className="px-4 py-2 bg-slate-800 text-white rounded">Quay Lại</button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20 relative">
            <MobileHeader title="Chi Tiết Sản Phẩm" backLink="/mobile/lookup" />

            <div className="p-4 space-y-4">
                {/* Image Section - Square */}
                <div className="bg-white rounded-xl shadow-sm border p-2 flex justify-center bg-slate-100 aspect-square overflow-hidden">
                    {product.image_url ? (
                        <div className="relative w-full h-full">
                            <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover rounded-lg"
                            />
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded text-slate-400">
                            <span className="text-4xl text-slate-300">🖼️</span>
                        </div>
                    )}
                </div>

                {/* Main Info */}
                <div className="bg-white rounded-xl shadow-sm border p-5 space-y-3">
                    <div>
                        <div className="text-xl font-black text-slate-800 break-all">{product.sku}</div>
                        <div className="text-sm font-medium text-slate-600">{product.name}</div>
                        {product.barcode && product.barcode !== product.sku && (
                            <div className="text-xs text-slate-400 mt-1">{product.barcode}</div>
                        )}
                    </div>

                    <div className="pt-3 border-t grid grid-cols-2 gap-y-4 gap-x-2">
                        <div>
                            <span className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                                <span className="w-3 h-3 rounded-full bg-slate-200 block"></span> Thương Hiệu
                            </span>
                            <div className="font-semibold text-slate-800">{product.brand || '---'}</div>
                        </div>
                        <div>
                            <span className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                                <span className="w-3 h-3 rounded-full bg-slate-200 block"></span> Nhóm Hàng
                            </span>
                            <div className="font-semibold text-slate-800">{product.product_group || '---'}</div>
                        </div>
                        <div>
                            <span className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                                <span className="w-3 h-3 rounded-full bg-slate-200 block"></span> Mùa
                            </span>
                            <div className="font-semibold text-slate-800">{product.season || '---'}</div>
                        </div>
                        <div>
                            <span className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                                <span className="w-3 h-3 rounded-full bg-slate-200 block"></span> Tháng MB
                            </span>
                            <div className="font-semibold text-slate-800">{product.launch_month || '---'}</div>
                        </div>
                        <div>
                            <span className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                                <span className="w-3 h-3 rounded-full bg-slate-200 block"></span> Kênh Bán
                            </span>
                            <div className="font-semibold text-slate-800">{product.sales_channel || '---'}</div>
                        </div>
                        <div>
                            <span className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                                <span className="w-3 h-3 rounded-full bg-slate-200 block"></span> Đối Tượng
                            </span>
                            <div className="font-semibold text-slate-800">{product.target_audience || '---'}</div>
                        </div>
                    </div>
                </div>

                {/* Size Run / Inventory TABLE */}
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-blue-600"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                        Tồn Kho (Nhấn xem chi tiết)
                    </h3>

                    {sizes.length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="p-3 text-left font-semibold text-slate-600">Size</th>
                                        <th className="p-3 text-right font-semibold text-slate-600">Số Lượng</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {sizes.map(s => (
                                        <tr
                                            key={s.size}
                                            onClick={() => setSelectedSize(s)}
                                            className={`active:bg-blue-50 transition-colors cursor-pointer ${s.size === product.size ? 'bg-blue-50/50' : ''}`}
                                        >
                                            <td className="p-3 font-bold text-slate-800 flex items-center gap-2">
                                                {s.size}
                                                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </td>
                                            <td className={`p-3 text-right font-black text-lg ${s.total_qty > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                                {s.total_qty}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center text-slate-400 py-4">Chưa có thông tin tồn kho</div>
                    )}
                </div>
            </div>

            {/* Inventory Detail Popup */}
            {selectedSize && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setSelectedSize(null)}>
                    <div className="bg-white w-full max-w-sm rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
                        <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                            <h3 className="font-bold text-lg">Chi Tiết Size: {selectedSize.size}</h3>
                            <button onClick={() => setSelectedSize(null)} className="p-2 hover:bg-white/10 rounded-full">✕</button>
                        </div>
                        <div className="p-0 max-h-[60vh] overflow-auto">
                            {selectedSize.details.length > 0 ? (
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="p-3 text-left font-semibold text-slate-500">Thùng</th>
                                            <th className="p-3 text-left font-semibold text-slate-500">Vị Trí</th>
                                            <th className="p-3 text-right font-semibold text-slate-500">SL</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {selectedSize.details.map((d, i) => (
                                            <tr key={i}>
                                                <td className="p-3 font-mono text-slate-700">{d.box_code}</td>
                                                <td className="p-3 font-mono text-blue-600 font-bold">{d.location_code}</td>
                                                <td className="p-3 text-right font-bold text-slate-900">{d.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-8 text-center text-slate-400">Không có hàng trong kho</div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-slate-600">Tổng cộng:</span>
                                <span className="font-black text-xl text-blue-600">{selectedSize.total_qty}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
