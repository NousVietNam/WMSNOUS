"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useAuth } from "@/components/auth/AuthProvider"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"
import { playSuccessSound, playErrorSound } from "@/utils/sound"

function BulkPutAwayContent() {
    const { session } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [step, setStep] = useState<1 | 2>(1)
    const [boxCode, setBoxCode] = useState("")
    const [items, setItems] = useState<{ sku: string, qty: number, productId?: string, name: string, barcode?: string }[]>([])
    const [existingItems, setExistingItems] = useState<any[]>([])

    // Temp inputs
    const [sku, setSku] = useState("")
    const [qty, setQty] = useState("1")
    const [loading, setLoading] = useState(false)
    const [scannedProduct, setScannedProduct] = useState<{ id: string, name: string, sku: string, barcode?: string } | null>(null)
    const [recapData, setRecapData] = useState<{ boxCode: string, totalQty: number, itemsCount: number } | null>(null)

    // Step 1: Scan Box
    const handleScanBox = async () => {
        if (!boxCode) return

        // REGULAR EXPRESSION OR STARTSWITH CHECK
        if (!boxCode.toUpperCase().startsWith('INB-')) {
            playErrorSound()
            alert("Chỉ được nhập tồn vào thùng Inbound (Bắt đầu bằng 'INB-')")
            return
        }

        setLoading(true)
        // Verify box exists
        const { data, error } = await supabase
            .from('boxes')
            .select('id, code, location_id, inventory_type')
            .eq('code', boxCode)
            .single()

        if (error || !data) {
            playErrorSound()
            alert("Không tìm thấy thùng này!")
            setLoading(false)
            return
        }

        if (data.inventory_type !== 'BULK') {
            playErrorSound()
            alert("Thùng này không phải là loại Kho Sỉ (BULK)!")
            setLoading(false)
            return
        }

        // Fetch Existing Items in Bulk Inventory
        const { data: currentInv, error: invError } = await supabase
            .from('bulk_inventory')
            .select(`
                quantity, 
                product_id,
                products (sku, name, barcode)
            `)
            .eq('box_id', data.id)
            .gt('quantity', 0)

        setExistingItems(currentInv || [])
        playSuccessSound()
        setStep(2)
        setLoading(false)
    }

    // Checking product info for preview
    const checkProduct = async (code: string) => {
        const { data: product } = await supabase
            .from('products')
            .select('id, sku, barcode, name')
            .or(`sku.eq.${code},barcode.eq.${code}`)
            .single()

        if (product) {
            setScannedProduct({ id: product.id, name: product.name, sku: product.sku, barcode: product.barcode })
            return product
        }
        return null
    }

    // Step 2: Add Items locally
    const handleAddItem = async () => {
        if (!sku) return

        setLoading(true)
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
            playErrorSound()
            alert("Mã này không tồn tại trong hệ thống!")
            setLoading(false)
            return
        }

        // REVERSE RESTRICTED LOGIC: ONLY accept if it IS restricted
        const { data: restricted } = await supabase
            .from('restricted_inventory')
            .select('*')
            .eq('sku', product.sku)
            .single()

        if (!restricted) {
            playErrorSound()
            alert(`⚠️ LỖI: Sản phẩm ${product.sku} KHÔNG thuộc diện Kho Sỉ!\n\nChỉ những sản phẩm nằm trong danh sách Restricted mới được nhập vào Kho Sỉ theo luồng này.`)
            setSku('')
            setScannedProduct(null)
            setLoading(false)
            return
        }

        const quantity = parseInt(qty)
        if (quantity < 1) {
            setLoading(false)
            return
        }

        const newItems = (() => {
            const existing = items.find(i => i.sku === product.sku)
            if (existing) {
                return items.map(i => i.sku === product.sku ? { ...i, qty: i.qty + quantity } : i)
            }
            return [...items, { sku: product.sku, qty: quantity, productId: product.id, name: product.name, barcode: product.barcode }]
        })()

        setItems(newItems)
        playSuccessSound()
        setSku("")
        setQty("1")
        setScannedProduct(null)
        setLoading(false)
    }

    const handleRemoveItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx))
    }

    // Step 3: Save All via Unified RPC
    const handleSaveBox = async () => {
        if (items.length === 0) return
        if (!confirm("Xác nhận lưu các mặt hàng này (Tồn đầu kỳ) vào Kho Sỉ?")) return

        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('process_bulk_putaway', {
                p_box_code: boxCode,
                p_items: items.map(i => ({ productId: i.productId, qty: i.qty, sku: i.sku })),
                p_user_id: session?.user?.id,
                p_reference: 'Ton_dau_ky'
            })

            if (error || !data.success) {
                throw new Error(error?.message || data.error || "Unknown Error")
            }

            playSuccessSound()
            const totalQty = items.reduce((a, b) => a + b.qty, 0)
            setRecapData({ boxCode, totalQty, itemsCount: items.length })

            // Reset
            setStep(1)
            setItems([])
            setBoxCode("")
            setExistingItems([])

        } catch (e: any) {
            console.error(e)
            playErrorSound()
            alert("Lỗi khi lưu: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const totalInBox = existingItems.reduce((acc, curr) => acc + curr.quantity, 0)

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Nhập Tồn Đầu Kỳ (Sỉ)" backLink="/mobile" />

            <main className="p-4 space-y-4">
                {step === 1 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
                        <div className="text-center font-bold text-lg text-slate-800">Bước 1: Quét Thùng INB</div>
                        <MobileScannerInput
                            autoFocus
                            placeholder="Quét mã Thùng (INB-...)"
                            value={boxCode}
                            onChange={setBoxCode}
                            onEnter={handleScanBox}
                            className="h-14 text-lg text-center font-bold border-amber-300"
                        />
                        <button
                            className="w-full h-12 bg-amber-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50"
                            onClick={handleScanBox}
                            disabled={loading}
                        >
                            {loading ? 'Đang Kiểm Tra...' : 'Bắt Đầu Nhập Tồn'}
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <div className="text-xs text-amber-600 font-bold uppercase">Nhập Tồn Kho Sỉ vào</div>
                                    <div className="text-xl font-black text-amber-800">{boxCode}</div>
                                    <div className="text-xs text-slate-500 font-medium">Hiện có: {totalInBox} SP</div>
                                </div>
                                <button className="text-sm font-medium text-slate-500 bg-white px-3 py-1 rounded border shadow-sm" onClick={() => setStep(1)}>Đổi</button>
                            </div>
                            {existingItems.length > 0 && (
                                <div className="bg-white/50 rounded p-2 text-xs text-slate-700 max-h-32 overflow-y-auto">
                                    <div className="font-bold mb-1">Đã có trong thùng sỉ:</div>
                                    {existingItems.map((ex, i) => (
                                        <div key={i} className="flex justify-between border-b border-amber-100 last:border-0 py-1">
                                            <div className="flex-1 mr-2 font-bold">{ex.products?.name} <span className="text-[10px] text-slate-400 font-normal ml-1">({ex.products?.sku})</span></div>
                                            <span className="font-medium text-amber-700">x{ex.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <MobileScannerInput
                                        placeholder="Quét SKU Sỉ"
                                        value={sku}
                                        onChange={(val) => {
                                            setSku(val)
                                            if (val.length > 3) checkProduct(val)
                                            else setScannedProduct(null)
                                        }}
                                        onEnter={handleAddItem}
                                    />
                                </div>
                                <input
                                    type="number"
                                    value={qty}
                                    onChange={e => setQty(e.target.value)}
                                    className="w-20 h-12 text-center border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-400 focus:outline-none font-bold text-lg"
                                />
                            </div>
                            {scannedProduct && (
                                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                                    <div className="font-bold">{scannedProduct.name}</div>
                                    <div className="text-xs opacity-75">{scannedProduct.sku}</div>
                                </div>
                            )}
                            <button
                                className="w-full h-12 bg-slate-800 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform"
                                onClick={handleAddItem}
                                disabled={!sku || loading}
                            >Thêm Vào List</button>
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground ml-1">Chờ lưu ({items.length})</div>
                            {items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-white rounded border shadow-sm">
                                    <div className="flex-1 mr-2">
                                        <div className="font-bold text-slate-800">{item.name}</div>
                                        <div className="text-xs text-slate-500 font-mono mt-1">{item.sku}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-lg font-bold text-amber-600 whitespace-nowrap">x{item.qty}</div>
                                        <button className="h-8 w-8 text-red-500 bg-red-50 rounded-full flex items-center justify-center" onClick={() => handleRemoveItem(idx)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {step === 2 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-50">
                    <button
                        className="w-full h-12 bg-amber-600 text-white rounded-lg font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50"
                        onClick={handleSaveBox}
                        disabled={items.length === 0 || loading}
                    >
                        {loading ? 'Đang Lưu...' : `Xác Nhận Nhập Tồn (${items.reduce((a, b) => a + b.qty, 0)} SP)`}
                    </button>
                </div>
            )}

            {recapData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-1">Nhập Tồn Hoàn Tất!</h2>
                        <div className="bg-slate-50 rounded-xl p-4 my-6 border border-slate-100">
                            <div className="text-3xl font-black text-slate-800 mb-2">{recapData.boxCode}</div>
                            <div className="flex justify-around text-sm font-bold text-slate-600">
                                <div>Mã: {recapData.itemsCount}</div>
                                <div className="text-amber-600">Tổng: {recapData.totalQty}</div>
                            </div>
                        </div>
                        <button onClick={() => setRecapData(null)} className="w-full h-12 bg-slate-900 text-white rounded-xl font-bold text-lg">Xong</button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function BulkPutAwayPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Đang tải...</div>}>
            <BulkPutAwayContent />
        </Suspense>
    )
}
