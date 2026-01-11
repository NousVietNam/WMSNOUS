"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import Link from "next/link"

export default function MobileLocationsPage() {
    const [locations, setLocations] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        fetchLocations()
    }, [])

    const fetchLocations = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('locations')
            .select('*, boxes(count)')
            .order('code')

        if (data) {
            setLocations(data.map((l: any) => ({
                ...l,
                box_count: l.boxes?.[0]?.count || 0,
                // Simple logic for capacity percentage usage if capacity available
                usage: l.capacity ? Math.round(((l.boxes?.[0]?.count || 0) / l.capacity) * 100) : 0
            })))
        }
        setLoading(false)
    }

    const filtered = locations.filter(l =>
        l.code.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Danh Sách Vị Trí" backLink="/mobile" />

            <div className="p-4 space-y-4">
                {/* Search */}
                <div className="bg-white p-2 rounded-lg border shadow-sm flex items-center gap-2">
                    <span className="text-xl pl-2">🔍</span>
                    <input
                        className="flex-1 h-10 outline-none text-base"
                        placeholder="Tìm mã vị trí..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* List */}
                {loading ? (
                    <div className="text-center py-10 text-slate-400">Đang tải...</div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {filtered.map(loc => (
                            <Link key={loc.id} href={`/mobile/locations/${loc.id}`}>
                                <div className="bg-white p-3 rounded-xl border shadow-sm active:scale-95 transition-transform h-full flex flex-col justify-between">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-bold text-lg text-slate-800">{loc.code}</div>
                                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${loc.type === 'SHELF' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {loc.type}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>Sức chứa: {loc.capacity}</span>
                                            <span>Thùng: <b className="text-slate-800">{loc.box_count}</b></span>
                                        </div>
                                        {/* Progress Bar */}
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${loc.usage > 90 ? 'bg-red-500' : loc.usage > 50 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${Math.min(loc.usage, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                        {filtered.length === 0 && (
                            <div className="col-span-2 text-center py-10 text-slate-400">
                                Không tìm thấy vị trí nào
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
