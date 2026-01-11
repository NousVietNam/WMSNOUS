"use client"


import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useAuth } from "@/components/auth/AuthProvider"
import dynamic from "next/dynamic"
// import { MobileScannerInput } from "@/components/mobile/MobileScannerInput"
// import { Save, Plus, Trash2 } from "lucide-react"

import MobileScannerInput from "@/components/mobile/MobileScannerInput"

// const MobileScannerInput = dynamic(() => import("@/components/mobile/MobileScannerInput"), { ssr: false })

function PutAwayContent() {
    const { session } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [step, setStep] = useState<1 | 2>(1)
    const [boxCode, setBoxCode] = useState("")
    const [items, setItems] = useState<{ sku: string, qty: number, productId?: string, name: string, barcode?: string }[]>([])
    const [existingItems, setExistingItems] = useState<any[]>([])

    // Auto-fill box from URL
    useEffect(() => {
        const fullBox = searchParams.get('box')
        if (fullBox) {
            setBoxCode(fullBox)
            // Optional: Auto-trigger scan? For now just prefill
        }
    }, [searchParams])

    // Temp inputs
    const [sku, setSku] = useState("")
    const [qty, setQty] = useState("1")
    const [loading, setLoading] = useState(false)
    const [scannedProduct, setScannedProduct] = useState<{ name: string, sku: string, barcode?: string } | null>(null)

    // Ensure we clear preview when SKU is cleared
    useEffect(() => {
        if (!sku) setScannedProduct(null)
    }, [sku])


    // Step 1: Scan Box
    const handleScanBox = async () => {
        if (!boxCode) return

        if (!boxCode.toUpperCase().startsWith('BOX')) {
            alert("Chỉ được đóng hàng vào thùng Storage (Bắt đầu bằng 'BOX')")
            return
        }

        setLoading(true)
        // Verify box exists
        const { data, error } = await supabase.from('boxes').select('id, code').eq('code', boxCode).single()
        if (error || !data) {
            alert("Không tìm thấy thùng này!")
            setLoading(false)
            return
        }

        // Fetch Existing Items
        const { data: currentInv } = await supabase
            .from('inventory_items')
            .select('quantity, products(sku, name, barcode)')
            .eq('box_id', data.id)
            .gt('quantity', 0)

        setExistingItems(currentInv || [])
        setStep(2)
        setLoading(false)
    }

    // Checking product info for preview (optional optimization: debounce this?)
    const checkProduct = async (code: string) => {
        const { data: product } = await supabase
            .from('products')
            .select('id, sku, barcode, name')
            .or(`sku.eq.${code},barcode.eq.${code}`)
            .single()

        if (product) {
            setScannedProduct({ name: product.name, sku: product.sku, barcode: product.barcode })
            return product
        }
        return null
    }

    // Step 2: Add Items locally
    const handleAddItem = async () => {
        if (!sku) return

        // Use preview if available, otherwise fetch
        let product = scannedProduct as any
        if (!product || (product.sku !== sku && product.barcode !== sku)) {
            const { data: fetched } = await supabase
                .from('products')
                .select('id, sku, barcode, name')
                .or(`sku.eq.${sku},barcode.eq.${sku}`)
                .single()
            product = fetched
        }

        if (!product) {
            alert("Mã (SKU/Barcode) không tồn tại!")
            return
        }

        // Update preview just in case
        setScannedProduct({ name: product.name, sku: product.sku, barcode: product.barcode })

        const quantity = parseInt(qty)
        if (quantity < 1) return

        setItems(prev => {
            const existing = prev.find(i => i.sku === product.sku) // Use resolved product SKU
            if (existing) {
                return prev.map(i => i.sku === product.sku ? { ...i, qty: i.qty + quantity } : i)
            }
            return [...prev, { sku: product.sku, qty: quantity, productId: product.id, name: product.name, barcode: product.barcode }]
        })

        // Reset inputs
        setSku("")
        setQty("1")
        setScannedProduct(null)
    }

    const handleRemoveItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx))
    }

    // Step 3: Save All
    const handleSaveBox = async () => {
        if (items.length === 0) return
        if (!confirm("Xác nhận lưu các mặt hàng này vào thùng?")) return
        setLoading(true)

        try {
            const { data: box } = await supabase.from('boxes').select('id').eq('code', boxCode).single()
            if (!box) throw new Error("Box not found")

            // Prepare Inserts
            const inventoryInserts = items.map(i => ({
                product_id: i.productId,
                box_id: box.id,
                quantity: i.qty
            }))

            const { error } = await supabase.from('inventory_items').insert(inventoryInserts)
            if (error) throw error

            // Log Transaction (Detailed per Item)
            const transactions = items.map(item => ({
                type: 'IMPORT',
                entity_type: 'BOX',
                entity_id: box.id,
                user_id: session?.user?.id,
                details: {
                    box_code: boxCode,
                    sku: item.sku,
                    quantity: item.qty,
                    to: boxCode
                }
            }))

            await supabase.from('transactions').insert(transactions)

            alert("Đã lưu thành công!")
            router.push('/mobile')

        } catch (e: any) {
            console.error(e)
            alert("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    // Calculate total in box
    const totalInBox = existingItems.reduce((acc, curr) => acc + curr.quantity, 0)

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Đóng Hàng (Put-away)" backLink="/mobile" />

            <main className="p-4 space-y-4">
                {step === 1 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
                        <div className="text-center font-bold text-lg text-slate-800">Bước 1: Quét Thùng</div>
                        <div className="space-y-4">
                            <MobileScannerInput
                                autoFocus
                                placeholder="Quét mã Thùng (BOX-...)"
                                value={boxCode}
                                onChange={setBoxCode}
                                onEnter={handleScanBox}
                                className="h-14 text-lg text-center font-bold"
                            />
                            <button
                                className="w-full h-12 bg-indigo-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleScanBox}
                                disabled={loading}
                            >
                                {loading ? 'Đang Kiểm Tra...' : 'Bắt Đầu Đóng Hàng'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <div className="text-xs text-blue-600 font-bold uppercase">Đang đóng vào</div>
                                    <div className="text-xl font-black text-blue-800">{boxCode}</div>
                                    <div className="text-xs text-slate-500 font-medium">Hiện có: {totalInBox} SP</div>
                                </div>
                                <button className="text-sm font-medium text-slate-500 bg-white px-3 py-1 rounded border shadow-sm" onClick={() => setStep(1)}>
                                    Đổi
                                </button>
                            </div>
                            {existingItems.length > 0 && (
                                <div className="bg-white/50 rounded p-2 text-xs text-slate-700 max-h-32 overflow-y-auto">
                                    <div className="font-bold mb-1">Đã có trong thùng:</div>
                                    {existingItems.map((ex, i) => (
                                        <div key={i} className="flex justify-between border-b border-blue-100 last:border-0 py-1">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-xs">{ex.products?.sku}</span>
                                                {ex.products?.barcode && <span className="text-[10px] text-muted-foreground">{ex.products.barcode}</span>}
                                            </div>
                                            <span className="font-medium">x{ex.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <MobileScannerInput
                                        placeholder="SKU Sản Phẩm"
                                        value={sku}
                                        onChange={(val) => {
                                            setSku(val)
                                            // Optional: debounced check could go here
                                        }}
                                        onEnter={() => {
                                            // Handle enter logic: checks or adds
                                            checkProduct(sku)
                                        }}
                                    />
                                </div>
                                <input
                                    type="number"
                                    value={qty}
                                    onChange={e => setQty(e.target.value)}
                                    className="w-20 h-12 text-center border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-400 focus:outline-none font-bold text-lg"
                                />
                            </div>

                            {/* Product Preview */}
                            {scannedProduct && (
                                <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                                    <div className="font-bold">{scannedProduct.name}</div>
                                    <div className="text-xs opacity-75">{scannedProduct.sku}</div>
                                </div>
                            )}

                            <button
                                className="w-full h-12 bg-slate-800 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                onClick={handleAddItem}
                                disabled={!sku}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M5 12h14" /><path d="M12 5v14" /></svg> Thêm Vào List
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground ml-1">Danh sách chờ lưu ({items.length})</div>
                            {items.length === 0 ? (
                                <div className="text-center py-8 bg-white rounded border border-dashed text-slate-400">
                                    Chưa có hàng nào
                                </div>
                            ) : (
                                items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded border shadow-sm">
                                        <div className="flex-1 mr-2">
                                            <div className="font-bold text-slate-800">{item.name}</div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                <span className="font-mono bg-slate-100 px-1 rounded">{item.sku}</span>
                                                {item.barcode && <span>{item.barcode}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-lg font-bold text-blue-600 whitespace-nowrap">x{item.qty}</div>
                                            <button
                                                className="h-8 w-8 flex-none flex items-center justify-center text-red-500 bg-red-50 rounded-full active:bg-red-100"
                                                onClick={() => handleRemoveItem(idx)}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </main>

            {step === 2 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 pb-safe">
                    <button
                        className="w-full h-12 bg-indigo-600 text-white rounded-lg font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        onClick={handleSaveBox}
                        disabled={items.length === 0 || loading}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                        {loading ? 'Đang Lưu...' : `Lưu Thùng (${items.reduce((a, b) => a + b.qty, 0)} SP)`}
                    </button>
                </div>
            )}
        </div>
    )
}

export default function PutAwayPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Đang tải...</div>}>
            <PutAwayContent />
        </Suspense>
    )
}
