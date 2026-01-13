"use client"


import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useAuth } from "@/components/auth/AuthProvider"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"

function PutAwayContent() {
    const { session } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [step, setStep] = useState<1 | 2>(1)
    const [boxCode, setBoxCode] = useState("")
    const [items, setItems] = useState<{ sku: string, qty: number, productId?: string, name: string, barcode?: string }[]>([])
    const [existingItems, setExistingItems] = useState<any[]>([])

    const [selectedHistory, setSelectedHistory] = useState<any>(null)

    // Fix: Use local date for default to avoid UTC issues
    const getLocalDate = () => {
        const d = new Date()
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
        return d.toISOString().split('T')[0]
    }

    const [historyDate, setHistoryDate] = useState(getLocalDate())

    // Temp inputs
    const [sku, setSku] = useState("")
    const [qty, setQty] = useState("1")
    const [loading, setLoading] = useState(false)
    const [scannedProduct, setScannedProduct] = useState<{ id: string, name: string, sku: string, barcode?: string } | null>(null)
    const [recapData, setRecapData] = useState<{ boxCode: string, totalQty: number, itemsCount: number } | null>(null)
    const [dailyHistory, setDailyHistory] = useState<any[]>([])

    // Auto-fill box from URL
    useEffect(() => {
        const fullBox = searchParams.get('box')
        if (fullBox) {
            setBoxCode(fullBox)
            // Optional: Auto-trigger scan? For now just prefill
        }
    }, [searchParams])

    useEffect(() => {
        if (session?.user?.id) fetchHistory()
    }, [session, historyDate])

    const fetchHistory = async () => {
        const start = historyDate + 'T00:00:00'
        const end = historyDate + 'T23:59:59'

        // Check if user is admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session?.user?.id)
            .single()

        let query = supabase
            .from('transactions')
            .select('created_at, sku, quantity, to_box:to_box_id(code), user_id, profiles!user_id(name)')
            .eq('type', 'IMPORT')
            .eq('entity_type', 'ITEM')
            .gte('created_at', start)
            .lte('created_at', end)
            .order('created_at', { ascending: false })

        // If not admin, filter by user_id
        if (profile?.role !== 'admin') {
            query = query.eq('user_id', session?.user?.id)
        }

        const { data } = await query

        if (data) {
            // Group by Box and Time (roughly same batch defined by time)
            const history = data.reduce((acc: any[], curr: any) => {
                const time = new Date(curr.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                const boxCode = curr.to_box?.code || 'Unknown'
                const qty = curr.quantity || 0
                const sku = curr.sku || 'Unknown'
                const name = 'Sản phẩm'
                const userName = (curr.profiles as any)?.name || 'Unknown User' // For admin view

                const existing = acc.find(h => h.boxCode === boxCode && h.time === time)
                if (existing) {
                    existing.totalQty += qty

                    // Aggregate items by SKU
                    const existingItem = existing.items.find((i: any) => i.sku === sku)
                    if (existingItem) {
                        existingItem.qty += qty
                    } else {
                        existing.items.push({ sku, name, qty })
                    }

                    existing.skuCount = existing.items.length
                } else {
                    acc.push({
                        time,
                        boxCode,
                        totalQty: qty,
                        skuCount: 1,
                        items: [{ sku, name, qty }],
                        userName // Store user name for admin view
                    })
                }
                return acc
            }, [])
            setDailyHistory(history)
        }
    }

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
        // Verify box exists and is at RECEIVING location
        const { data, error } = await supabase
            .from('boxes')
            .select('id, code, location_id, locations(code)')
            .eq('code', boxCode)
            .single()

        if (error || !data) {
            alert("Không tìm thấy thùng này!")
            setLoading(false)
            return
        }

        // Check if box is at RECEIVING location
        const location = (data as any).locations
        if (location?.code !== 'RECEIVING') {
            alert(`Thùng này đang ở vị trí ${location?.code || 'Unknown'}.\nChỉ được đóng hàng vào thùng ở vị trí RECEIVING!`)
            setLoading(false)
            return
        }

        // Check for draft in LocalStorage
        const draftKey = `putaway_draft_${boxCode}`
        const savedDraft = localStorage.getItem(draftKey)
        if (savedDraft) {
            try {
                const draft = JSON.parse(savedDraft)
                if (draft && draft.length > 0) {
                    if (confirm(`Phát hiện ${draft.length} mã hàng chưa lưu từ lần trước.\nTiếp tục đóng hàng?`)) {
                        setItems(draft)
                    } else {
                        localStorage.removeItem(draftKey)
                    }
                }
            } catch (e) {
                console.error('Failed to parse draft:', e)
                localStorage.removeItem(draftKey)
            }
        }

        // Fetch Existing Items
        const { data: currentInv, error: invError } = await supabase
            .from('inventory_items')
            .select(`
                quantity, 
                product_id,
                products (
                    sku, 
                    name, 
                    barcode
                )
            `)
            .eq('box_id', data.id)
            .gt('quantity', 0)

        console.log('📦 Existing items raw data:', JSON.stringify(currentInv, null, 2))
        if (invError) {
            console.error('❌ Error fetching existing items:', invError)
            alert(`Lỗi khi tải hàng có sẵn: ${invError.message}`)
        }

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
            setScannedProduct({ id: product.id, name: product.name, sku: product.sku, barcode: product.barcode })
            return product
        }
        return null
    }

    // Step 2: Add Items locally
    const handleAddItem = async () => {
        if (!sku) return

        // Use preview if available (scannedProduct has id now), otherwise fetch
        let product = scannedProduct as any
        // Re-fetch if no preview OR if the SKU/barcode doesn't match
        if (!product || (product.sku !== sku && product.barcode !== sku)) {
            const { data: fetched } = await supabase
                .from('products')
                .select('id, sku, barcode, name')
                .or(`sku.eq.${sku},barcode.eq.${sku}`)
                .single()
            product = fetched
        }

        console.log('🔍 Product being added:', product)

        if (!product) {
            alert("Mã (SKU/Barcode) không tồn tại!")
            return
        }

        // CRITICAL: Check if product.id exists
        if (!product.id) {
            console.error('❌ CRITICAL: product.id is missing!', product)
            alert(`Lỗi: Sản phẩm không có ID. SKU: ${product.sku}`)
            return
        }

        console.log('✅ Adding product to list:', { id: product.id, sku: product.sku, name: product.name })

        // Update preview just in case
        setScannedProduct({ id: product.id, name: product.name, sku: product.sku, barcode: product.barcode })

        const quantity = parseInt(qty)
        if (quantity < 1) return

        const newItems = (() => {
            const existing = items.find(i => i.sku === product.sku)
            if (existing) {
                return items.map(i => i.sku === product.sku ? { ...i, qty: i.qty + quantity } : i)
            }
            return [...items, { sku: product.sku, qty: quantity, productId: product.id, name: product.name, barcode: product.barcode }]
        })()

        setItems(newItems)
        // Auto-save to localStorage
        localStorage.setItem(`putaway_draft_${boxCode}`, JSON.stringify(newItems))

        // Reset inputs
        setSku("")
        setQty("1")
        setScannedProduct(null)
    }

    const handleRemoveItem = (idx: number) => {
        const newItems = items.filter((_, i) => i !== idx)
        setItems(newItems)
        // Update localStorage
        if (newItems.length > 0) {
            localStorage.setItem(`putaway_draft_${boxCode}`, JSON.stringify(newItems))
        } else {
            localStorage.removeItem(`putaway_draft_${boxCode}`)
        }
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

            const { data: newInvs, error } = await supabase.from('inventory_items').insert(inventoryInserts).select()
            if (error) throw error

            // Log Transaction (Detailed per Item)
            const transactions = items.map((item, index) => ({
                type: 'IMPORT',
                entity_type: 'ITEM', // Changed to ITEM per user request
                entity_id: newInvs && newInvs[index] ? newInvs[index].id : null,
                to_box_id: box.id, // Fix: Populate distinct column
                quantity: item.qty, // Fix: Populate distinct column
                sku: item.sku, // Fix: Populate top-level SKU
                user_id: session?.user?.id,
                details: {
                    box_code: boxCode,
                    sku: item.sku,
                    product_name: item.name,
                    quantity: item.qty,
                    to: boxCode
                },
                created_at: new Date().toISOString()
            }))

            await supabase.from('transactions').insert(transactions)

            // Show Recap
            const totalQty = items.reduce((a, b) => a + b.qty, 0)
            setRecapData({
                boxCode,
                totalQty,
                itemsCount: items.length
            })

            // Refresh History
            fetchHistory()

            // Clear draft from localStorage
            localStorage.removeItem(`putaway_draft_${boxCode}`)

            // Reset Internal State
            setStep(1)
            setItems([])
            setBoxCode("")
            setExistingItems([])

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
                    <>
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

                        {/* Daily History */}
                        <div className="mt-8">
                            <div className="flex justify-between items-end mb-2 px-1">
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Lịch sử</h3>
                                <input
                                    type="date"
                                    value={historyDate}
                                    onChange={(e) => setHistoryDate(e.target.value)}
                                    className="text-xs bg-white border border-slate-200 rounded px-2 py-1 font-medium text-slate-600 focus:outline-none focus:border-blue-400"
                                />
                            </div>
                            {dailyHistory.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-sm bg-white rounded-xl border border-dashed">
                                    Chưa có hoạt động nào
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    {dailyHistory.map((h, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between p-3 border-b border-slate-100 last:border-0 active:bg-slate-50 transition-colors cursor-pointer"
                                            onClick={() => setSelectedHistory(h)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="text-xs font-mono text-slate-400">{h.time}</div>
                                                <div>
                                                    <div className="font-bold text-slate-700">{h.boxCode}</div>
                                                    <div className="text-[10px] text-slate-500 font-medium">{h.skuCount || 1} mã hàng</div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-semibold text-blue-600">+{h.totalQty} SP</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
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
                                            <div className="flex-1 mr-2">
                                                <div className="font-bold text-xs">{ex.products?.name || ex.products?.sku}</div>
                                                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                                                    <span>{ex.products?.sku}</span>
                                                    {ex.products?.barcode && <span className="text-muted-foreground">{ex.products.barcode}</span>}
                                                </div>
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
                                            // Auto-check product when scanned (length > 3)
                                            if (val.length > 3) {
                                                checkProduct(val)
                                            } else {
                                                setScannedProduct(null)
                                            }
                                        }}
                                        onEnter={() => {
                                            // Enter = Add item directly
                                            handleAddItem()
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

            {/* Recap Modal */}
            {recapData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl scale-100 animate-in zoom-in-95">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 mb-1">Đã Lưu Thành Công!</h2>
                            <p className="text-slate-500 mb-6">Đã thêm hàng vào thùng</p>

                            <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Thùng</div>
                                <div className="text-3xl font-black text-slate-800 mb-4">{recapData.boxCode}</div>

                                <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                                    <div>
                                        <div className="text-xs text-slate-400 font-medium">Số Mã (SKU)</div>
                                        <div className="text-lg font-bold text-slate-700">{recapData.itemsCount}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400 font-medium">Tổng Số Lượng</div>
                                        <div className="text-lg font-bold text-blue-600">+{recapData.totalQty}</div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setRecapData(null)}
                                className="w-full h-12 bg-slate-900 text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
                            >
                                Đóng & Tiếp Tục
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Detail History Modal */}
            {selectedHistory && (
                <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 animate-in fade-in">
                    <div className="bg-white w-full rounded-t-2xl p-4 shadow-2xl animate-in slide-in-from-bottom h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4 border-b pb-4">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase">Chi Tiết Đóng Hàng</div>
                                <div className="text-2xl font-black text-slate-800">{selectedHistory.boxCode}</div>
                                <div className="text-xs text-slate-500">{selectedHistory.time}</div>
                            </div>
                            <button
                                onClick={() => setSelectedHistory(null)}
                                className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3">
                            {selectedHistory.items?.map((item: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="flex-1 mr-4">
                                        <div className="font-bold text-slate-800 text-sm line-clamp-2">{item.name}</div>
                                        <div className="text-xs font-mono text-slate-500 mt-1 bg-white inline-block px-1 rounded border border-slate-200">{item.sku}</div>
                                    </div>
                                    <div className="font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg text-lg min-w-[3rem] text-center">
                                        x{item.qty}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl">
                                <div className="text-sm font-medium opacity-80">Tổng cộng</div>
                                <div className="text-xl font-bold">{selectedHistory.totalQty} sản phẩm</div>
                            </div>
                        </div>
                    </div>
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
