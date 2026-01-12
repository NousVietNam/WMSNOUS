"use client"


import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth/AuthProvider"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"

export default function ImportPage() {
    const { session } = useAuth()
    const router = useRouter()
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [sku, setSku] = useState("")
    const [locationCode, setLocationCode] = useState("")
    const [quantity, setQuantity] = useState("1")
    const [loading, setLoading] = useState(false)

    // Step 1: Scan Product
    // Step 2: Scan Location/Box
    // Step 3: Confirm

    const handleImport = async () => {
        setLoading(true)
        try {
            // 1. Get Product ID from SKU (Assuming simple query for demo)
            // In real app, we might need to fetch this earlier to validate
            // For this demo, let's assume we have a way to find product or just insert if we are loose
            // But schema requires UUID.
            // Let's first search for the product
            // 1. Get Product ID from SKU
            const { data: product, error: prodError } = await supabase
                .from('products')
                .select('id, name') // Fetch name too
                .eq('sku', sku)
                .single()

            // If product doesn't exist, for this demo we might fail or allow creating (too complex for now)
            // Let's assume user scans a valid SKU. If not found, we might need a fallback or alert.
            let productId = product?.id

            if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
                // Mock for untethered demo if env is missing
                console.warn("No Supabase connection, skipping transaction")
                alert("Demo Mode: Transaction Simulated (No DB Connection)")
                router.push('/mobile')
                return
            }

            if (!productId) {
                // Fail safe for demo if they input random SKU not in DB
                alert("Không tìm thấy sản phẩm! (Đảm bảo SKU đúng)")
                setLoading(false)
                return
            }

            // 2. Get Box ID
            const { data: box, error: boxError } = await supabase
                .from('boxes')
                .select('id, location_id, code')
                .eq('code', locationCode)
                .single()

            if (!box) {
                alert("Không tìm thấy Thùng này! (Vui lòng quét mã Thùng, không quét Vị trí)")
                setLoading(false)
                return
            }

            // Check if Box is in RECEIVING
            const { data: receivingLoc } = await supabase.from('locations').select('id, code').ilike('code', '%receiving%').maybeSingle()

            if (receivingLoc && box.location_id !== receivingLoc.id) {
                alert(`Lỗi: Thùng ${box.code} không ở khu vực Nhận Hàng (RECEIVING)!\nVui lòng chuyển thùng về Receiving trước khi nhập hàng.`)
                setLoading(false)
                return
            }

            // 3. Insert Inventory Item
            const { data: newInv, error: insertError } = await supabase
                .from('inventory_items')
                .insert({
                    product_id: productId,
                    box_id: box.id, // Strict: Must be in box
                    quantity: parseInt(quantity),
                    // location_id is implicitly defined by box.location_id, avoiding redundancy/anomaly
                })
                .select()
                .single()

            if (insertError) throw insertError

            // 4. Log Transaction
            // receivingLoc is already fetched above for validation

            await supabase.from('transactions').insert({
                type: 'IMPORT',
                entity_type: 'ITEM', // Changed to ITEM per user request
                entity_id: newInv.id, // Link to specific inventory item
                to_box_id: box.id,
                to_location_id: receivingLoc?.id, // Default to Receiving
                quantity: parseInt(quantity),
                sku: sku, // Fix: Populate top-level SKU
                // details: Removed as requested
                user_id: session?.user?.id,
                created_at: new Date().toISOString()
            })

            alert("Nhập kho thành công!")
            router.push('/mobile')

        } catch (error) {
            console.error(error)
            alert("Có lỗi xảy ra.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Nhập Kho (Import)" backLink="/mobile" />

            <div className="p-4 space-y-6">
                {/* Progress Stepper */}
                <div className="flex gap-2">
                    {[1, 2, 3].map((s) => (
                        <div key={s} className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                    ))}
                </div>

                {step === 1 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                        <div className="flex items-center gap-3 text-slate-800 mb-2">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                            </div>
                            <div className="font-bold text-lg">Quét Sản Phẩm</div>
                        </div>
                        <div className="space-y-4">
                            <MobileScannerInput
                                autoFocus
                                placeholder="Quét mã SKU / Barcode"
                                value={sku}
                                onChange={setSku}
                                onEnter={() => { if (sku) setStep(2) }}
                                className="h-12 text-lg text-center"
                            />
                            <button
                                className="w-full h-12 bg-indigo-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform"
                                onClick={() => { if (sku) setStep(2) }}
                            >
                                Tiếp Tục
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                        <div className="flex items-center gap-3 text-slate-800 mb-2">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                            </div>
                            <div className="font-bold text-lg">Quét Thùng Đích</div>
                        </div>
                        <div className="space-y-4">
                            <div className="text-center p-2 bg-slate-100 rounded text-sm mb-4">
                                Đang nhập: <strong>{sku}</strong>
                            </div>
                            <MobileScannerInput
                                autoFocus
                                placeholder="Quét mã Thùng (BOX-...)"
                                value={locationCode}
                                onChange={setLocationCode}
                                onEnter={() => { if (locationCode) setStep(3) }}
                                className="h-12 text-lg text-center"
                            />
                            <button
                                className="w-full h-12 bg-white text-slate-700 border border-slate-300 rounded-lg font-bold shadow-sm active:bg-slate-50"
                                onClick={() => { if (locationCode) setStep(3) }}
                            >
                                Tiếp Tục
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
                        <div className="text-center flex flex-col items-center gap-2">
                            <span className="text-5xl">✅</span>
                            <h2 className="text-lg font-bold text-green-700">Xác Nhận Số Lượng</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between p-2 bg-slate-50 rounded">
                                    <span>Sản phẩm:</span>
                                    <span className="font-bold">{sku}</span>
                                </div>
                                <div className="flex justify-between p-2 bg-slate-50 rounded">
                                    <span>Đến:</span>
                                    <span className="font-bold">{locationCode}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button className="h-10 w-10 flex items-center justify-center border rounded-lg bg-slate-50 font-bold" onClick={() => setQuantity(q => Math.max(1, parseInt(q) - 1).toString())}>-</button>
                                <input
                                    type="number"
                                    className="flex-1 text-center h-12 text-xl font-bold border rounded-lg"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                />
                                <button className="h-10 w-10 flex items-center justify-center border rounded-lg bg-slate-50 font-bold" onClick={() => setQuantity(q => (parseInt(q) + 1).toString())}>+</button>
                            </div>

                            <button
                                className="w-full h-12 bg-green-600 text-white rounded-lg font-bold shadow-lg hover:bg-green-700 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleImport}
                                disabled={loading}
                            >
                                {loading ? 'Đang Xử Lý...' : 'Xác Nhận Nhập Kho'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
