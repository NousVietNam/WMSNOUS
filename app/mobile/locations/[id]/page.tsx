"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import Link from "next/link"

export default function LocationDetailPage() {
    const { id } = useParams()
    const [location, setLocation] = useState<any>(null)
    const [boxes, setBoxes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'BOXES' | 'HISTORY'>('BOXES')
    // Mock History for now since strict history query might be complex
    // Real app would query 'transactions' table
    const [history, setHistory] = useState<any[]>([])

    useEffect(() => {
        fetchDetails()
    }, [id])

    const fetchDetails = async () => {
        setLoading(true)
        // 1. Get Location Info
        const { data: loc } = await supabase.from('locations').select('*').eq('id', id).single()
        setLocation(loc)

        if (loc) {
            // 2. Get Boxes
            const { data: boxData } = await supabase
                .from('boxes')
                .select('*, inventory_items(count)')
                .eq('location_id', id)

            setBoxes(boxData?.map((b: any) => ({
                ...b,
                item_count: b.inventory_items?.[0]?.count || 0
            })) || [])

            // 3. Get History (Mocked/Simulated logic for demo, or real if transactions supported)
            // Just fetching recent transactions generally for now or use dummy
            // Ideally: .or(`details->>from.eq.${loc.code},details->>to.eq.${loc.code}`)
            // Checking if we can query jsonb easily. 
            // For safety, I'll fetch recent transactions and filter in client if volume low, 
            // OR just show placeholder if too complex.
            // Let's try simple filter by code if possible.
            const { data: trans } = await supabase
                .from('transactions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20)

            // Client side filter for safety
            if (trans) {
                const related = trans.filter((t: any) =>
                    JSON.stringify(t.details).includes(loc.code)
                )
                setHistory(related)
            }
        }
        setLoading(false)
    }

    if (!location && !loading) return <div className="p-10 text-center">Không tìm thấy</div>

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title={location ? location.code : "Đang tải..."} backLink="/mobile/locations" />

            {/* Info Card */}
            {location && (
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white text-center">
                    <div className="text-3xl font-bold mb-1">{location.code}</div>
                    <div className="opacity-80 text-sm mb-4">{location.description || 'Không có mô tả'}</div>

                    <div className="flex justify-center gap-8">
                        <div>
                            <div className="text-2xl font-bold">{boxes.length}</div>
                            <div className="text-xs opacity-70">Thùng</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{location.capacity}</div>
                            <div className="text-xs opacity-70">Sức Chứa</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{location.type}</div>
                            <div className="text-xs opacity-70">Loại</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex bg-white shadow-sm sticky top-14 z-10">
                <button
                    onClick={() => setActiveTab('BOXES')}
                    className={`flex-1 p-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'BOXES' ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-400'}`}
                >
                    Danh Sách Thùng ({boxes.length})
                </button>
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex-1 p-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'HISTORY' ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-400'}`}
                >
                    Lịch Sử
                </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
                {activeTab === 'BOXES' ? (
                    <div className="grid gap-3">
                        {boxes.map(box => (
                            <Link key={box.id} href={`/mobile/box/${box.code}`}>
                                <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between active:scale-95 transition-transform">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold">
                                            📦
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800">{box.code}</div>
                                            <div className="text-xs text-slate-500">{box.item_count} sản phẩm</div>
                                        </div>
                                    </div>
                                    <span className="text-slate-300">➡️</span>
                                </div>
                            </Link>
                        ))}
                        {boxes.length === 0 && <div className="text-center py-10 text-slate-400">Vị trí trống</div>}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map(h => (
                            <div key={h.id} className="bg-white p-4 rounded-xl border shadow-sm flex gap-3">
                                <div className="mt-1">
                                    <div className={`h-2 w-2 rounded-full ${h.type === 'IMPORT' ? 'bg-green-500' : 'bg-orange-500'}`} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between">
                                        <span className="font-bold text-sm text-slate-800">{h.type}</span>
                                        <span className="text-xs text-slate-400">{new Date(h.created_at).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1 lines-clamp-2">
                                        {JSON.stringify(h.details)}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {history.length === 0 && <div className="text-center py-10 text-slate-400">Chưa có lịch sử gần đây</div>}
                    </div>
                )}
            </div>
        </div>
    )
}
