
"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Loader2, Package, MapPin, CircleAlert, X, ChevronRight, User as UserIcon, Filter } from "lucide-react"

interface ReceivingReminderProps {
    inventoryType?: 'BULK' | 'PIECE' | 'ALL'
    userId?: string // If provided, strictly filters by this user (Mobile mode)
    title?: string
}

export function ReceivingReminder({ inventoryType = 'ALL', userId: fixedUserId, title = "Thùng Đợi Cất" }: ReceivingReminderProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [boxes, setBoxes] = useState<any[]>([])

    // Admin Filter States
    const [staffList, setStaffList] = useState<any[]>([])
    const [staffFilter, setStaffFilter] = useState<string>("ALL")

    const isAdmin = !fixedUserId

    const fetchStaff = async () => {
        if (!isAdmin) return
        const { data } = await supabase
            .from('users')
            .select('id, name')
            .order('name')
        if (data) setStaffList(data)
    }

    const fetchReceivingBoxes = async () => {
        setLoading(true)
        try {
            // 1. Get Receiving Location ID
            const { data: locs } = await supabase
                .from('locations')
                .select('id')
                .ilike('code', '%receiving%')
                .limit(1)

            if (!locs || locs.length === 0) return
            const locId = locs[0].id

            // 2. Fetch Boxes at receiving
            let query = supabase
                .from('boxes')
                .select(`
                    id, 
                    code, 
                    inventory_type,
                    updated_at,
                    bulk_inventory(quantity),
                    inventory_items(quantity)
                `)
                .eq('location_id', locId)
                .order('updated_at', { ascending: false })

            if (inventoryType !== 'ALL') {
                query = query.eq('inventory_type', inventoryType)
            }

            const { data: boxData, error: boxError } = await query
            if (boxError) throw boxError

            // 3. Filter boxes that actually have quantity > 0
            let nonEmptyBoxes: any[] = (boxData || []).map(box => {
                const bulkQty = (box.bulk_inventory as any[])?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0
                const pieceQty = (box.inventory_items as any[])?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0
                return {
                    ...box,
                    totalQty: bulkQty + pieceQty
                }
            }).filter(box => box.totalQty > 0)

            if (nonEmptyBoxes.length === 0) {
                setBoxes([])
                setLoading(false)
                return
            }

            // 4. Enrich with latest Transaction User
            const boxIds = nonEmptyBoxes.map(b => b.id)

            // Get latest IMPORT transaction for each box
            const { data: transData } = await supabase
                .from('transactions')
                .select('to_box_id, user_id, created_at, users!user_id(name)')
                .in('to_box_id', boxIds)
                .eq('type', 'IMPORT')
                .order('created_at', { ascending: false })

            // Map the latest user to each box
            const boxToUserMap = new Map()
            if (transData) {
                transData.forEach((t: any) => {
                    if (!boxToUserMap.has(t.to_box_id)) {
                        boxToUserMap.set(t.to_box_id, {
                            id: t.user_id,
                            name: t.users?.name || "N/A"
                        })
                    }
                })
            }

            nonEmptyBoxes = nonEmptyBoxes.map(box => ({
                ...box,
                lastUser: boxToUserMap.get(box.id) || { id: null, name: "Chưa rõ" }
            }))

            // 5. Apply Filtering
            if (fixedUserId) {
                // Mobile Mode: Strictly show current user's boxes
                nonEmptyBoxes = nonEmptyBoxes.filter(b => b.lastUser.id === fixedUserId)
            } else if (staffFilter !== "ALL") {
                // Admin Mode: Filter by selected staff
                nonEmptyBoxes = nonEmptyBoxes.filter(b => b.lastUser.id === staffFilter)
            }

            setBoxes(nonEmptyBoxes)
        } catch (err) {
            console.error("Error fetching receiving boxes:", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (isOpen) {
            fetchReceivingBoxes()
            if (isAdmin) fetchStaff()
        }
    }, [isOpen, staffFilter])

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-bold shadow-sm active:scale-95 transition-all w-full justify-center"
            >
                <CircleAlert className="w-4 h-4" />
                <span>{isAdmin ? "Giám Sát Receiving" : "Cần Bạn Cất"}</span>
                {boxes.length > 0 && <span className="bg-amber-600 text-white px-1.5 py-0.5 rounded-full text-[10px]">{boxes.length}</span>}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full rounded-t-3xl shadow-2xl h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300 max-w-2xl mx-auto">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                                    <Package className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-800">{title}</h2>
                                    <p className="text-sm text-slate-500 font-medium">
                                        {isAdmin ? "Quản lý & nhắc nhở nhân viên cất hàng" : "Thùng hàng bạn đã nhập chưa cất vào kệ"}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-200 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Admin Filter Bar */}
                        {isAdmin && (
                            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                                <Filter className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 uppercase">Lọc Nhân Viên:</span>
                                <select
                                    className="bg-white border rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    value={staffFilter}
                                    onChange={(e) => setStaffFilter(e.target.value)}
                                >
                                    <option value="ALL">Tất cả nhân sự</option>
                                    {staffList.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* List Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <p className="text-sm font-medium italic">Đang cập nhật danh sách...</p>
                                </div>
                            ) : boxes.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                    </div>
                                    <p className="font-bold text-slate-900">Sạch Sẽ!</p>
                                    <p className="text-xs text-slate-500 px-10">
                                        Chưa có thùng nào cần cất {isAdmin && staffFilter !== 'ALL' ? `của nhân viên này` : ''}.
                                    </p>
                                </div>
                            ) : (
                                boxes.map((box) => (
                                    <div
                                        key={box.id}
                                        className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between active:scale-[0.98] transition-all"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold ${box.inventory_type === 'BULK' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {box.inventory_type === 'BULK' ? 'SỈ' : 'LẺ'}
                                            </div>
                                            <div>
                                                <div className="text-lg font-black text-slate-800">{box.code}</div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                                                        <CircleAlert className="w-3 h-3" />
                                                        <span>{box.totalQty} SP</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-1.5 rounded">
                                                        <UserIcon className="w-3 h-3" />
                                                        <span className="font-bold">{box.lastUser.name}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-slate-300">
                                            <ChevronRight />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer Tips */}
                        <div className="p-4 bg-amber-50 border-t border-amber-100 text-amber-700 text-xs font-medium text-center">
                            {isAdmin ? "💡 Click vào nhân viên để nhắc nhở họ cất hàng vào kệ chính thức." : "⚠️ Vui lòng hoàn thành Putaway cho các thùng trên để giải phóng Receiving."}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
