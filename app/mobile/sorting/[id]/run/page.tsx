
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { QRScanner } from "@/components/mobile/QRScanner"
import { useAuth } from "@/components/auth/AuthProvider"
import { toast } from "sonner"
import { Package, ScanLine, X, CheckCircle2, Box } from "lucide-react"

export default function MobileSortingRun() {
    const { id: waveId } = useParams()
    const router = useRouter()
    const { session } = useAuth()

    const [lastResult, setLastResult] = useState<any>(null)
    const [showScanner, setShowScanner] = useState(false)
    const [stats, setStats] = useState({ done: 0, total_items: 0 })

    useEffect(() => {
        fetchStats()
    }, [])

    const fetchStats = async () => {
        const { data } = await supabase.rpc('get_wave_sorting_details', { p_wave_id: waveId })
        if (data) {
            const total = data.reduce((s: any, o: any) => s + (o.total_qty || 0), 0)
            const sorted = data.reduce((s: any, o: any) => s + (o.sorted_qty || 0), 0)
            setStats({ done: sorted, total_items: total })
        }
    }

    const handleScan = async (code: string) => {
        setShowScanner(false) // Close scanner first
        toast.loading("Đang xử lý...", { id: 'sorting' })

        try {
            const { data, error } = await supabase.rpc('sort_item_scan', {
                p_wave_id: waveId,
                p_barcode: code,
                p_sorter_id: session?.user?.id
            })

            toast.dismiss('sorting')

            if (error) throw error

            if (data.success) {
                setLastResult(data)
                // playSound('success') - Add sound logic later
                fetchStats()
            } else {
                setLastResult({ status: 'ERROR', message: data.error })
                // playSound('error')
                toast.error(data.error)
            }
        } catch (e: any) {
            toast.dismiss('sorting')
            toast.error(e.message)
            setLastResult({ status: 'ERROR', message: e.message })
        }
    }

    const renderResult = () => {
        if (!lastResult) return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                <ScanLine size={64} className="mb-4 opacity-50" />
                <h3 className="text-xl font-bold">Sẵn sàng</h3>
                <p>Nhấn nút Quét bên dưới để bắt đầu chia hàng.</p>
            </div>
        )

        if (lastResult.status === 'ERROR') return (
            <div className="flex-1 bg-red-50 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in">
                <X className="h-24 w-24 text-red-500 mb-4" />
                <h2 className="text-2xl font-black text-red-700">LỖI / SAI HÀNG</h2>
                <p className="mt-2 text-red-600 font-medium">{lastResult.message}</p>
                <button onClick={() => setLastResult(null)} className="mt-8 bg-white border border-red-200 text-red-700 px-6 py-2 rounded-full font-bold">
                    Quét Lại
                </button>
            </div>
        )

        if (lastResult.status === 'NEED_BOX') return (
            <div className="flex-1 bg-orange-50 flex flex-col items-center justify-center p-8 text-center">
                <h2 className="text-2xl font-black text-orange-700">CHƯA GÁN THÙNG!</h2>
                <p className="mt-2 font-bold">{lastResult.order?.customer?.name}</p>
                <div className="mt-8 text-sm text-orange-600">Vui lòng vào trang Setup để gán thùng trước.</div>
            </div>
        )

        const { product, target, progress } = lastResult
        const shortBoxCode = target.box_code.replace('BOX-', '').replace('CART-', '')

        return (
            <div className="flex-1 flex flex-col bg-slate-900 text-white relative overflow-hidden">
                {/* Result Display */}
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10">
                    <div className="text-sm font-bold uppercase tracking-widest text-indigo-400 mb-2">Bỏ vào thùng</div>
                    <div className="text-[120px] font-black leading-none bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                        {shortBoxCode}
                    </div>
                    <div className="mt-4 text-2xl font-medium text-indigo-200">
                        {target.customer_name}
                    </div>
                </div>

                {/* Product Info footer */}
                <div className="bg-white text-slate-900 p-4 rounded-t-3xl shadow-2xl z-20 space-y-3">
                    <div className="flex gap-4">
                        <div className="h-16 w-16 bg-slate-100 rounded-lg flex items-center justify-center">
                            {product.image ? <img src={product.image} className="max-h-full rounded" /> : <Package className="text-slate-300" />}
                        </div>
                        <div className="flex-1">
                            <div className="text-xs font-bold text-slate-500 uppercase">Đã quét</div>
                            <div className="font-bold text-lg leading-tight line-clamp-2">{product.name}</div>
                            <div className="text-sm font-mono text-slate-500 mt-1">{product.sku}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-slate-500 uppercase">Tiến độ</div>
                            <div className="text-2xl font-black text-indigo-600">{progress.current}/{progress.total}</div>
                        </div>
                    </div>

                    {/* Add Full Box Button */}
                    <div className="pt-2 border-t flex justify-end">
                        <button
                            onClick={async () => {
                                if (confirm("Thùng này đã đầy? Bạn muốn gán thùng tiếp theo cho đơn này?")) {
                                    router.push(`/mobile/sorting/${waveId}/setup`)
                                }
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 touch-manipulation"
                        >
                            <Box size={14} /> THÙNG ĐẦY / THÊM THÙNG
                        </button>
                    </div>
                </div>

                {/* Success Animation Background */}
                <div className="absolute inset-0 bg-indigo-600/20 animate-pulse z-0"></div>
            </div>
        )
    }

    return (
        <div className="h-screen bg-slate-100 flex flex-col">
            <MobileHeader title="Sorting Station" backLink={`/mobile/sorting/${waveId}/setup`} />

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {renderResult()}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-white border-t safe-area-bottom">
                <div className="flex justify-between items-center mb-4 px-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Tiến độ Wave</span>
                    <span className="font-mono font-bold text-slate-700">{stats.done}/{stats.total_items}</span>
                </div>
                <button
                    onClick={() => setShowScanner(true)}
                    className="w-full h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-200 active:scale-95 transition-all"
                >
                    <ScanLine className="mr-2" /> QUÉT TIẾP
                </button>
            </div>

            {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    )
}
