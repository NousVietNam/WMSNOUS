
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth/AuthProvider"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { Layers, Package, UserCheck, ArrowRight } from "lucide-react"

export default function MobileSortingList() {
    const router = useRouter()
    const { session } = useAuth()
    const [waves, setWaves] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchWaves()
    }, [])

    const fetchWaves = async () => {
        setLoading(true)
        // Fetch waves needed sorting
        const { data, error } = await supabase
            .from('pick_waves')
            .select(`*, picking_jobs(status)`)
            .order('created_at', { ascending: false })
            .limit(20)

        if (!error && data) {
            setWaves(data)
        }
        setLoading(false)
    }

    const handleClaim = async (wave: any) => {
        if (!wave.sorter_id) {
            if (window.confirm("Nhận Wave này để chia hàng?")) {
                await supabase.rpc('assign_wave_sorter', {
                    p_wave_id: wave.id,
                    p_sorter_id: session?.user?.id
                })
                router.push(`/mobile/sorting/${wave.id}/setup`)
            }
        } else if (wave.sorter_id === session?.user?.id) {
            // Go to active step
            router.push(`/mobile/sorting/${wave.id}/run`)
        } else {
            alert("Wave này đã có người khác nhận!")
        }
    }

    const myWaves = waves.filter(w => w.sorter_id === session?.user?.id)
    const availableWaves = waves.filter(w => !w.sorter_id)

    return (
        <div className="min-h-screen bg-slate-100 pb-20">
            <MobileHeader title="Chia Chọn Hàng" backLink="/mobile" />

            <div className="p-4 space-y-6">
                {/* My Active Tasks */}
                {myWaves.length > 0 && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-500 uppercase">Đang thực hiện</h3>
                        {myWaves.map(wave => (
                            <div key={wave.id} onClick={() => handleClaim(wave)} className="bg-white p-4 rounded-xl border border-green-200 shadow-sm flex justify-between items-center active:bg-slate-50">
                                <div>
                                    <div className="font-black text-lg text-slate-800">{wave.code}</div>
                                    <div className="text-xs text-green-600 font-bold bg-green-100 px-2 py-0.5 rounded inline-block mt-1">ĐANG XỬ LÝ</div>
                                </div>
                                <ArrowRight className="text-slate-400" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Available Pool */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-500 uppercase">Wave Chờ Xử Lý</h3>
                    {loading ? <div>Đang tải...</div> : availableWaves.length === 0 ? <div className="text-slate-400 text-center py-8">Không có Wave nào</div> : (
                        availableWaves.map(wave => {
                            const total = wave.picking_jobs?.length || 0
                            const done = wave.picking_jobs?.filter((j: any) => j.status === 'COMPLETED').length || 0
                            const percent = total > 0 ? Math.round((done / total) * 100) : 0

                            return (
                                <div key={wave.id} className="bg-white p-4 rounded-xl shadow-sm border space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div className="font-bold text-lg">{wave.code}</div>
                                        <div className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">Picking {percent}%</div>
                                    </div>

                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                        <Package className="h-4 w-4" />
                                        <span>{total} Jobs</span>
                                    </div>

                                    <button
                                        onClick={() => handleClaim(wave)}
                                        className="w-full py-3 rounded-lg bg-indigo-600 text-white font-bold text-sm shadow active:scale-95 transition-transform"
                                    >
                                        NHẬN VIỆC NAY
                                    </button>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
