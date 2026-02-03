"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { Card, CardContent } from "@/components/ui/card"
import { CircleAlert, Package, MapPin, Inbox, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function LaunchSoonMobilePage() {
    const [loading, setLoading] = useState(true)
    const [items, setItems] = useState<any[]>([])

    useEffect(() => {
        fetchAlertedItems()
    }, [])

    const fetchAlertedItems = async () => {
        setLoading(true)
        // Fetch items that are flagged for alerting
        const { data, error } = await supabase
            .from('view_launch_soon_bulk')
            .select('*')
            .eq('is_alerted', true)
            .order('alerted_at', { ascending: false })

        if (error) {
            toast.error("Lỗi khi tải danh sách: " + error.message)
        } else {
            setItems(data || [])
        }
        setLoading(false)
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader
                title="Chuẩn Bị Mở Bán"
                backLink="/mobile"
            />

            <main className="p-4 space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
                    <CircleAlert className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                    <div>
                        <h4 className="text-sm font-bold text-orange-900">Thông báo từ Admin</h4>
                        <p className="text-xs text-orange-800 opacity-80">
                            Danh sách các mã hàng mới cần ưu tiên di chuyển từ kho sỉ để chuẩn bị mở bán.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <p className="text-sm">Đang tải danh sách...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                        <Package className="h-12 w-12 opacity-20 mb-3" />
                        <p className="font-medium">Chưa có yêu cầu nào</p>
                        <p className="text-xs">Admin chưa phát lệnh cảnh báo di chuyển hàng mới.</p>
                        <button
                            onClick={fetchAlertedItems}
                            className="mt-4 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold"
                        >
                            Tải lại
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Cần di chuyển ({items.length})
                            </span>
                            <button
                                onClick={fetchAlertedItems}
                                className="text-xs text-indigo-600 font-bold"
                            >
                                Làm mới
                            </button>
                        </div>

                        {items.map((item, idx) => (
                            <Card key={idx} className="overflow-hidden border-none shadow-sm">
                                <CardContent className="p-0">
                                    <div className="p-4 flex items-start justify-between bg-white">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-black text-slate-900 font-mono tracking-tight">
                                                    {item.sku}
                                                </span>
                                            </div>
                                            <div className="flex items-center text-xs text-slate-500 font-medium">
                                                <Package className="w-3 h-3 mr-1" />
                                                Số lượng: <span className="ml-1 text-orange-600 font-bold">{item.quantity}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Cảnh báo lúc</div>
                                            <div className="text-xs font-bold text-slate-600">
                                                {new Date(item.alerted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-3 px-4 flex items-center gap-4 text-sm border-t border-slate-100">
                                        <div className="flex items-center gap-1.5 flex-1 p-2 bg-blue-50 rounded-lg">
                                            <Inbox className="w-4 h-4 text-blue-600" />
                                            <div>
                                                <div className="text-[10px] text-blue-400 font-bold leading-none uppercase">Thùng</div>
                                                <div className="font-bold text-blue-700 tracking-tight">{item.box_code}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-1 p-2 bg-emerald-50 rounded-lg">
                                            <MapPin className="w-4 h-4 text-emerald-600" />
                                            <div>
                                                <div className="text-[10px] text-emerald-400 font-bold leading-none uppercase">Vị trí</div>
                                                <div className="font-bold text-emerald-700 tracking-tight">{item.location_code}</div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}
