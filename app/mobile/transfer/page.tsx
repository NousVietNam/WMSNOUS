"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth/AuthProvider"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { playErrorSound, playSuccessSound } from "@/utils/sound"

type TransferMode = 'SINGLE' | 'MANY'

export default function TransferPage() {
    const { session } = useAuth()
    const router = useRouter()

    // Mode Selection
    const [mode, setMode] = useState<TransferMode>('SINGLE')

    // SINGLE MODE STATES
    const [step, setStep] = useState<1 | 2>(1)
    const [sourceCode, setSourceCode] = useState("")
    const [currentLoc, setCurrentLoc] = useState("")
    const [currentLocId, setCurrentLocId] = useState<string | null>(null)
    const [destCode, setDestCode] = useState("")

    // MANY MODE STATES
    const [bulkStep, setBulkStep] = useState<1 | 2>(1) // 1: Dest, 2: Boxes
    const [bulkDestCode, setBulkDestCode] = useState("")
    const [bulkDestId, setBulkDestId] = useState<string | null>(null)
    const [bulkDestWarehouseId, setBulkDestWarehouseId] = useState<string | null>(null) // NEW: Store Warehouse ID
    const [bulkBoxInput, setBulkBoxInput] = useState("")
    const [bulkBoxes, setBulkBoxes] = useState<{ id: string, code: string, currentLoc: string, currentLocId: string | null }[]>([]) // NEW: Store Loc ID

    const [loading, setLoading] = useState(false)

    // ================= SINGLE MODE LOGIC =================
    const handleScanSource = async () => {
        if (!sourceCode) return
        setLoading(true)

        const { data: box, error } = await supabase
            .from('boxes')
            .select(`
                id, 
                code, 
                outbound_order_id,
                status,
                locations (id, code)
            `)
            .ilike('code', sourceCode.trim())
            .single()

        if (error || !box) {
            playErrorSound()
            alert("Không tìm thấy Thùng này!")
            setLoading(false)
            return
        }

        if (box.status === 'SHIPPED') {
            playErrorSound()
            alert("CẢNH BÁO: Thùng hàng này ĐÃ XUẤT KHO (SHIPPED)! Không thể di chuyển.")
            setLoading(false)
            return
        }

        if (box.outbound_order_id || box.status === 'LOCKED') {
            playErrorSound()
            alert("THÙNG ĐÃ BỊ KHÓA!\nThùng này đã được gán vào một đơn hàng. Không thể di chuyển thủ công.")
            setLoading(false)
            return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const locCode = (box.locations as any)?.code || "N/A"
        const locId = (box.locations as any)?.id || null

        setCurrentLoc(locCode)
        setCurrentLocId(locId)
        setStep(2)
        setLoading(false)
        playSuccessSound()
    }

    const handleTransfer = async () => {
        if (!destCode) return
        setLoading(true)

        try {
            // Fix: locations table does not have warehouse_id, so remove it from select.
            // Just select id and code.
            const { data: location, error: locError } = await supabase
                .from('locations')
                .select('id, code')
                .ilike('code', destCode.trim())
                .single()

            if (locError || !location) {
                console.error("Location scan error:", locError)
                playErrorSound()
                alert(`Vị trí đích "${destCode}" không tồn tại!`)
                setLoading(false)
                return
            }

            const { data: box } = await supabase.from('boxes').select('id').eq('code', sourceCode).single()
            if (!box) throw new Error("Box missing")

            // LOGIC: Block moving EMPTY box FROM RECEIVING
            // currentLoc holds the source location code
            if (currentLoc && currentLoc.toLowerCase().includes('receiving')) {
                const { count: standardCount } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('box_id', box.id)
                const { count: bulkCount } = await supabase.from('bulk_inventory').select('*', { count: 'exact', head: true }).eq('box_id', box.id).gt('quantity', 0)

                const totalItems = (standardCount || 0) + (bulkCount || 0)

                if (totalItems === 0) {
                    playErrorSound()
                    alert("CHẶN: Không được chuyển thùng rỗng ra khỏi khu vực Receiving!")
                    setLoading(false)
                    return
                }
            }

            const { error: moveError } = await supabase
                .from('boxes')
                .update({ location_id: location.id })
                .eq('id', box.id)

            if (moveError) throw moveError

            await supabase.from('transactions').insert({
                type: 'MOVE_BOX',
                entity_type: 'BOX',
                entity_id: box.id,
                from_location_id: currentLocId,
                to_location_id: location.id,
                from_box_id: box.id, // Record the moving box
                to_box_id: box.id,   // Record the moving box
                // warehouse_id: location.warehouse_id, // REMOVED: Column does not exist on locations table
                user_id: session?.user?.id,
                created_at: new Date().toISOString()
            })

            playSuccessSound()
            alert("Chuyển thành công!")
            // Reset state
            setStep(1)
            setSourceCode("")
            setDestCode("")
            setCurrentLoc("")
            setCurrentLocId(null)

        } catch (e: any) {
            playErrorSound()
            console.error(e)
            alert("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    // ================= MANY MODE LOGIC =================
    // Step 1: Scan Destination
    const handleScanBulkDest = async () => {
        if (!bulkDestCode) return
        setLoading(true)

        // Fix: locations table does not have warehouse_id
        const { data: location, error } = await supabase
            .from('locations')
            .select('id, code')
            .ilike('code', bulkDestCode.trim())
            .single()

        if (error || !location) {
            playErrorSound()
            console.error("Bulk loc scan error:", error)
            alert(`Vị trí đích "${bulkDestCode}" không tồn tại!`)
            setLoading(false)
            return
        }

        setBulkDestId(location.id)
        // setBulkDestWarehouseId((location as any).warehouse_id || null) // REMOVED
        setBulkDestWarehouseId(null)
        setBulkDestCode(location.code) // Normalize case
        setBulkStep(2)
        setLoading(false)
        playSuccessSound()
    }

    // Step 2: Add Box to List
    const handleAddBulkBox = async () => {
        if (!bulkBoxInput) return

        // Prevent dupes
        if (bulkBoxes.some(b => b.code.toUpperCase() === bulkBoxInput.toUpperCase().trim())) {
            playErrorSound()
            alert("Thùng này đã có trong danh sách!")
            setBulkBoxInput("")
            return
        }

        setLoading(true)
        const { data: box, error } = await supabase
            .from('boxes')
            .select(`
                id, 
                code, 
                outbound_order_id,
                status,
                locations (id, code)
            `)
            .ilike('code', bulkBoxInput.trim())
            .single()

        if (error || !box) {
            playErrorSound()
            alert("Không tìm thấy Thùng này!")
            setLoading(false)
            return
        }

        if (box.status === 'SHIPPED' || box.outbound_order_id || box.status === 'LOCKED') {
            playErrorSound()
            alert("Thùng đang bị KHÓA hoặc đã XUẤT! Không thể di chuyển.")
            setLoading(false)
            return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const locCode = (box.locations as any)?.code || "N/A"
        const locId = (box.locations as any)?.id || null

        // LOGIC: Check Empty if moving FROM Receiving
        if (locCode && locCode.toLowerCase().includes('receiving')) {
            const { count: standardCount } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('box_id', box.id)
            const { count: bulkCount } = await supabase.from('bulk_inventory').select('*', { count: 'exact', head: true }).eq('box_id', box.id).gt('quantity', 0)

            const totalItems = (standardCount || 0) + (bulkCount || 0)

            if (totalItems === 0) {
                playErrorSound()
                alert("CHẶN: Không được chuyển thùng rỗng ra khỏi khu vực Receiving!")
                setBulkBoxInput("")
                setLoading(false)
                return
            }
        }

        setBulkBoxes(prev => [{ id: box.id, code: box.code, currentLoc: locCode, currentLocId: locId }, ...prev])
        setBulkBoxInput("")
        setLoading(false)
        playSuccessSound()
    }

    const handleRemoveBulkBox = (id: string) => {
        setBulkBoxes(prev => prev.filter(b => b.id !== id))
    }

    // Step 3: Execute Batch Move
    const handleBulkConfirm = async () => {
        if (bulkBoxes.length === 0 || !bulkDestId) return
        if (!confirm(`Xác nhận chuyển ${bulkBoxes.length} thùng sang vị trí ${bulkDestCode}?`)) return

        setLoading(true)
        try {
            // Loop transactions (Simple & Robust)
            // Could optimize with RPC but simple loop is fine for < 50 items user scenario
            const errors: string[] = []

            for (const box of bulkBoxes) {
                const { error: moveError } = await supabase
                    .from('boxes')
                    .update({ location_id: bulkDestId })
                    .eq('id', box.id)

                if (moveError) {
                    errors.push(`Lỗi thùng ${box.code}: ${moveError.message}`)
                    continue
                }

                await supabase.from('transactions').insert({
                    type: 'MOVE_BOX',
                    entity_type: 'BOX',
                    entity_id: box.id,
                    from_location_id: box.currentLocId, // Use stored ID
                    to_location_id: bulkDestId,
                    from_box_id: box.id, // Record box
                    to_box_id: box.id,   // Record box
                    // warehouse_id: bulkDestWarehouseId, // REMOVED: Not available
                    user_id: session?.user?.id,
                    note: `Bulk move to ${bulkDestCode}`,
                    created_at: new Date().toISOString()
                })
            }

            if (errors.length > 0) {
                playErrorSound()
                alert(`Đã chuyển xong nhưng có ${errors.length} lỗi:\n` + errors.join('\n'))
            } else {
                playSuccessSound()
                alert(`Đã chuyển thành công ${bulkBoxes.length} thùng!`)
                // Reset
                setBulkBoxes([])
                setBulkBoxInput("")
                setBulkStep(1)
                setBulkDestCode("")
                setBulkDestId(null)
            }

        } catch (e: any) {
            console.error(e)
            playErrorSound()
            alert("Lỗi hệ thống: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Chuyển Kho (Transfer)" backLink="/mobile" />

            <div className="p-4 space-y-6">

                {/* Mode Toggle */}
                <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex">
                    <button
                        onClick={() => { setMode('SINGLE'); setStep(1); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'SINGLE' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        Chuyển 1 Thùng
                    </button>
                    <button
                        onClick={() => { setMode('MANY'); setBulkStep(1); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'MANY' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        Chuyển Nhiều Thùng
                    </button>
                </div>

                {/* Instruction Text */}
                <div className="text-sm text-slate-500 text-center italic px-2 -mt-2">
                    {mode === 'SINGLE'
                        ? "Quét mã thùng rồi quét mã vị trí đến để di chuyển 1 lần"
                        : "Quét vị trí trước rồi quét các mã thùng cần di chuyển"
                    }
                </div>

                {/* ================= SINGLE MODE ================= */}
                {mode === 'SINGLE' && (
                    <>
                        {step === 1 && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                                <div className="flex items-center gap-3 text-slate-800 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" /></svg>
                                    </div>
                                    <div className="font-bold text-lg">Quét Thùng Cần Chuyển</div>
                                </div>
                                <div className="space-y-4">
                                    <MobileScannerInput
                                        autoFocus
                                        placeholder="Quét mã Thùng (BOX-...)"
                                        value={sourceCode}
                                        onChange={setSourceCode}
                                        onEnter={handleScanSource}
                                        className="h-14 text-lg text-center font-bold"
                                    />
                                    <button
                                        className="w-full h-12 bg-indigo-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={handleScanSource}
                                        disabled={loading}
                                    >
                                        {loading ? 'Kiểm Tra...' : 'Tiếp Tục'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground">Thùng</div>
                                        <div className="font-bold text-lg">{sourceCode}</div>
                                    </div>
                                    <span className="text-slate-300 text-2xl">➡️</span>
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground">Hiện Tại</div>
                                        <div className="font-bold text-lg text-red-500">{currentLoc}</div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
                                    <div className="text-center font-bold text-lg text-slate-800">Bước 2: Quét Vị Trí Mới</div>
                                    <div className="space-y-4">
                                        <MobileScannerInput
                                            autoFocus
                                            placeholder="Quét Vị Trí Đích (LOC-...)"
                                            value={destCode}
                                            onChange={setDestCode}
                                            onEnter={handleTransfer}
                                            className="h-14 text-lg text-center font-bold text-blue-600 border-blue-200"
                                        />
                                        <button
                                            className="w-full h-12 bg-blue-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
                                            onClick={handleTransfer}
                                            disabled={loading}
                                        >
                                            {loading ? 'Đang Chuyển...' : 'Xác Nhận Chuyển'}
                                        </button>
                                        <button
                                            onClick={() => setStep(1)}
                                            className="w-full h-10 text-slate-500 font-medium"
                                        >
                                            Hủy / Chọn Thùng Khác
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ================= MANY MODE ================= */}
                {mode === 'MANY' && (
                    <>
                        {bulkStep === 1 && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                                <div className="flex items-center gap-3 text-slate-800 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                    </div>
                                    <div>
                                        <div className="font-bold text-lg">Bước 1: Quét Đích Đến</div>
                                        <div className="text-xs text-slate-500">Nơi bạn muốn chuyển hàng loạt thùng tới</div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <MobileScannerInput
                                        autoFocus
                                        placeholder="Quét Vị Trí Đích (LOC-...)"
                                        value={bulkDestCode}
                                        onChange={setBulkDestCode}
                                        onEnter={handleScanBulkDest}
                                        className="h-14 text-lg text-center font-bold text-blue-600 border-blue-200"
                                    />
                                    <button
                                        className="w-full h-12 bg-indigo-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50"
                                        onClick={handleScanBulkDest}
                                        disabled={loading}
                                    >
                                        {loading ? 'Kiểm Tra...' : 'Xác Nhận Vị Trí'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {bulkStep === 2 && (
                            <div className="space-y-4">
                                {/* Dest Info Header */}
                                <div className="bg-blue-600 text-white rounded-xl p-4 flex justify-between items-center shadow-lg shadow-blue-200">
                                    <div>
                                        <div className="text-blue-100 text-xs font-medium uppercase tracking-wider">Chuyển đến</div>
                                        <div className="text-2xl font-black">{bulkDestCode}</div>
                                    </div>
                                    <button
                                        onClick={() => setBulkStep(1)}
                                        className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-sm backdrop-blur-sm"
                                    >
                                        Đổi chỗ
                                    </button>
                                </div>

                                {/* Scan Box Input */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                                    <div className="font-bold text-slate-700">Thêm Thùng vào danh sách</div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <MobileScannerInput
                                                autoFocus
                                                placeholder="Quét mã Thùng..."
                                                value={bulkBoxInput}
                                                onChange={setBulkBoxInput}
                                                onEnter={handleAddBulkBox}
                                                className="h-12 border-slate-300"
                                            />
                                        </div>
                                        <button
                                            onClick={handleAddBulkBox}
                                            disabled={loading || !bulkBoxInput}
                                            className="bg-slate-800 text-white w-14 rounded-lg flex items-center justify-center disabled:opacity-50"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                        </button>
                                    </div>
                                </div>

                                {/* List */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-end px-1">
                                        <div className="text-sm font-medium text-slate-500">Danh sách ({bulkBoxes.length})</div>
                                    </div>

                                    {bulkBoxes.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 bg-slate-100 rounded-xl border border-dashed border-slate-300">
                                            Chưa quét thùng nào
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {bulkBoxes.map((b) => (
                                                <div key={b.id} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                                    <div>
                                                        <div className="font-bold text-slate-800">{b.code}</div>
                                                        <div className="text-xs text-slate-500">Đang ở: <span className="text-amber-600 font-medium">{b.currentLoc}</span></div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveBulkBox(b.id)}
                                                        className="w-8 h-8 flex items-center justify-center text-red-500 bg-red-50 rounded-full active:scale-95 transition-transform"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Floating Action Button for MANY MODE */}
            {mode === 'MANY' && bulkStep === 2 && bulkBoxes.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-50">
                    <button
                        className="w-full h-12 bg-indigo-600 text-white rounded-lg font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50"
                        onClick={handleBulkConfirm}
                        disabled={loading}
                    >
                        {loading ? 'Đang Xử Lý...' : `Chuyển Ngay (${bulkBoxes.length} Thùng)`}
                    </button>
                </div>
            )}
        </div>
    )
}
