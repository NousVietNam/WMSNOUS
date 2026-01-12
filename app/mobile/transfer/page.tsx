"use client"


import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth/AuthProvider"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"
import { MobileHeader } from "@/components/mobile/MobileHeader"

export default function TransferPage() {
    const { session } = useAuth()
    const router = useRouter()
    const [step, setStep] = useState<1 | 2>(1)
    const [sourceCode, setSourceCode] = useState("")
    const [currentLoc, setCurrentLoc] = useState("")
    const [currentLocId, setCurrentLocId] = useState<string | null>(null)
    const [destCode, setDestCode] = useState("")
    const [loading, setLoading] = useState(false)

    // Step 1: Scan Box -> Show Current Location
    const handleScanSource = async () => {
        if (!sourceCode) return
        setLoading(true)

        const { data: box, error } = await supabase
            .from('boxes')
            .select(`
                id, 
                code, 
                locations (id, code)
            `)
            .eq('code', sourceCode)
            .single()

        if (error || !box) {
            alert("Không tìm thấy Thùng này!")
            setLoading(false)
            return
        }

        // Fix: Save ID for transaction log
        // Suppress TS error for now or fix types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const locCode = (box.locations as any)?.code || "N/A"
        const locId = (box.locations as any)?.id || null

        setCurrentLoc(locCode)
        setCurrentLocId(locId)
        setStep(2)
        setLoading(false)
    }

    // Step 2: Scan Destination -> Move
    const handleTransfer = async () => {
        if (!destCode) return
        setLoading(true)

        try {
            // Find Dest Location
            const { data: location } = await supabase.from('locations').select('id').eq('code', destCode).single()
            if (!location) {
                alert("Vị trí đích không tồn tại!")
                setLoading(false)
                return
            }

            // Find Source Box ID again (or persist)
            const { data: box } = await supabase.from('boxes').select('id').eq('code', sourceCode).single()
            if (!box) throw new Error("Box missing")

            // Execute Move
            const { error: moveError } = await supabase
                .from('boxes')
                .update({ location_id: location.id })
                .eq('id', box.id)

            if (moveError) throw moveError

            // Log - Unified details format
            await supabase.from('transactions').insert({
                type: 'MOVE_BOX',
                entity_type: 'BOX',
                entity_id: box.id,
                from_location_id: currentLocId,
                to_location_id: location.id,
                // details: Removed
                user_id: session?.user?.id,
                created_at: new Date().toISOString()
            })

            alert("Chuyển thành công!")
            router.push('/mobile')

        } catch (e: any) {
            console.error(e)
            alert("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Chuyển Kho (Transfer)" backLink="/mobile" />

            <div className="p-4 space-y-6">
                {step === 1 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                        <div className="flex items-center gap-3 text-slate-800 mb-2">
                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" /></svg>
                            </div>
                            <div className="font-bold text-lg">Bước 1: Quét Thùng</div>
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
                        {/* Summary Card */}
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
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
