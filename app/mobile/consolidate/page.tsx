"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useAuth } from "@/components/auth/AuthProvider"

export default function ConsolidatePage() {
    const { session } = useAuth()
    const router = useRouter()
    const [step, setStep] = useState<1 | 2>(1)
    const [sourceCode, setSourceCode] = useState("")
    const [destCode, setDestCode] = useState("")
    const [loading, setLoading] = useState(false)
    const [itemCount, setItemCount] = useState(0)

    // Step 1: Scan Source Box
    const handleScanSource = async () => {
        if (!sourceCode) return
        setLoading(true)

        // Count items in source
        const { data: box } = await supabase.from('boxes').select('id, order_id').eq('code', sourceCode).single()
        if (!box) {
            alert("Không tìm thấy thùng này!")
            setLoading(false)
            return
        }

        if (box.order_id) {
            alert("BOX NGUỒN ĐÃ BỊ KHÓA!\nThùng này đã được chọn vào đơn hàng. Không thể lấy hàng từ thùng này.")
            setLoading(false)
            return
        }

        const { count } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('box_id', box.id)

        if (!count || count === 0) {
            alert("Thùng này đang rỗng!")
            // Allow continue? No point merging empty box.
            setLoading(false)
            return
        }

        setItemCount(count)
        setStep(2)
        setLoading(false)
    }

    // Step 2: Scan Dest + Merge
    const handleMerge = async () => {
        if (!destCode) return
        if (sourceCode === destCode) {
            alert("Không thể gộp vào chính nó!")
            return
        }
        setLoading(true)

        try {
            const { data: source } = await supabase.from('boxes').select('id, order_id').eq('code', sourceCode).single()
            const { data: dest } = await supabase.from('boxes').select('id, order_id').eq('code', destCode).single()

            if (!source || !dest) throw new Error("Box/Dest missing")

            if (dest.order_id) {
                alert("BOX ĐÍCH ĐÃ BỊ KHÓA!\nThùng nhận này đã được chọn vào đơn hàng. Không thể gộp thêm hàng vào.")
                setLoading(false)
                return
            }

            // Move Items
            const { error: moveError } = await supabase
                .from('inventory_items')
                .update({ box_id: dest.id })
                .eq('box_id', source.id)

            if (moveError) throw moveError

            // Log
            // Log
            await supabase.from('transactions').insert({
                type: 'CONSOLIDATE',
                entity_type: 'BOX',
                entity_id: source.id,
                from_box_id: source.id,
                to_box_id: dest.id,
                quantity: itemCount,
                // details: Removed
                user_id: session?.user?.id,
                created_at: new Date().toISOString()
            })

            alert(`Đã gộp ${itemCount} sản phẩm sang ${destCode}!`)
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
            <MobileHeader title="Gộp Thùng" backLink="/mobile" />

            <div className="p-4 space-y-6">
                {step === 1 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
                        <div className="text-center font-bold text-lg text-orange-600">1. Quét Thùng Cần Gộp (Nguồn)</div>
                        <div className="space-y-4">
                            <input
                                autoFocus
                                placeholder="Quét thùng nguồn..."
                                value={sourceCode}
                                onChange={(e) => setSourceCode(e.target.value)}
                                className="h-14 w-full text-lg text-center font-bold border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-400 focus:outline-none"
                            />
                            <button
                                className="w-full h-12 bg-orange-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:bg-orange-700"
                                onClick={handleScanSource}
                                disabled={loading}
                            >
                                {loading ? 'Checking...' : 'Tiếp Tục'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-orange-50 p-4 rounded-lg border border-orange-200">
                            <div className="text-center">
                                <div className="font-bold text-lg text-orange-800">{sourceCode}</div>
                                <div className="text-xs text-orange-600 font-medium">{itemCount} sản phẩm</div>
                            </div>
                            <span className="text-orange-400 text-2xl">➡️</span>
                            <div className="text-center text-slate-400 text-sm font-medium">Thùng Đích</div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
                            <div className="text-center font-bold text-lg text-blue-600">2. Quét Thùng Đích (Nhận)</div>
                            <div className="space-y-4">
                                <input
                                    autoFocus
                                    placeholder="Quét thùng nhận..."
                                    value={destCode}
                                    onChange={(e) => setDestCode(e.target.value)}
                                    className="h-14 w-full text-lg text-center font-bold border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                />
                                <button
                                    className="w-full h-12 bg-blue-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
                                    onClick={handleMerge}
                                    disabled={loading}
                                >
                                    {loading ? 'Đang Gộp...' : 'Xác Nhận Gộp'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
