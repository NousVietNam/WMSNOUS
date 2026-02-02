
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { ArrowLeft, Ban, Box, Calendar, Loader2, User } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

export default function WaveDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const [wave, setWave] = useState<any>(null)
    const [orders, setOrders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [cancelling, setCancelling] = useState(false)
    const [releasing, setReleasing] = useState(false)

    useEffect(() => {
        fetchWaveDetail()
    }, [])

    const fetchWaveDetail = async () => {
        setLoading(true)
        // 1. Get Wave Info
        const { data: waveData, error: waveError } = await supabase
            .from('pick_waves')
            .select('*, user:users(name)')
            .eq('id', params.id)
            .single()

        if (waveError) {
            toast.error("Không tìm thấy Wave")
            router.push('/admin/waves')
            return
        }

        setWave(waveData)

        // 2. Get Orders in Wave
        const { data: orderData } = await supabase
            .from('outbound_orders')
            .select('*, customer:customers(name)')
            .eq('wave_id', params.id)

        setOrders(orderData || [])
        setLoading(false)
    }

    const handleCancelWave = async () => {
        if (!confirm("Bạn có chắc chắn muốn HỦY đợt soạn hàng này? Các đơn hàng sẽ được trả về trạng thái chưa gom nhóm.")) return

        setCancelling(true)
        try {
            const { data, error } = await supabase.rpc('cancel_wave', {
                p_wave_id: wave.id,
                p_reason: 'User cancelled from UI'
            })

            if (error) throw error
            if (!data.success) throw new Error(data.error)

            toast.success("Đã hủy Wave thành công!")
            fetchWaveDetail() // Refresh to show Cancelled status
        } catch (error: any) {
            toast.error("Lỗi: " + error.message)
        } finally {
            setCancelling(false)
        }

        const handleReleaseWave = async () => {
            if (!confirm("Xác nhận DUYỆT Wave này? Hệ thống sẽ tạo Job soạn hàng và trừ tồn kho các Box tương ứng.")) return

            setReleasing(true)
            try {
                const { data, error } = await supabase.rpc('release_wave', {
                    p_wave_id: wave.id,
                    p_user_id: (await supabase.auth.getUser()).data.user?.id
                })

                if (error) throw error
                if (!data.success) throw new Error(data.error)

                toast.success(`Duyệt thành công! Đã tạo ${data.orders_updated} jobs.`)
                fetchWaveDetail()
            } catch (error: any) {
                toast.error("Lỗi Duyệt Wave: " + error.message)
            } finally {
                setReleasing(false)
            }
        }
    }

    if (loading) return <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600" /></div>

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/admin/waves')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            {wave.code}
                            <Badge variant="outline" className={
                                wave.inventory_type === 'BULK' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                            }>{wave.inventory_type === 'BULK' ? 'KHO SỈ' : 'KHO LẺ'}</Badge>
                            <Badge className={
                                wave.status === 'CANCELLED' ? 'bg-red-100 text-red-800 hover:bg-red-200' :
                                    wave.status === 'RELEASED' ? 'bg-blue-600' : 'bg-yellow-500'
                            }>
                                {wave.status}
                            </Badge>
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">{wave.description || 'Không có mô tả'}</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {wave.status === 'PLANNING' && (
                        <>
                            <Button
                                className="bg-green-600 hover:bg-green-700 text-white font-bold"
                                onClick={handleReleaseWave}
                                disabled={releasing || cancelling}
                            >
                                {releasing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Box className="h-4 w-4 mr-2" />}
                                Duyệt Wave & Tạo Job
                            </Button>

                            <Button
                                variant="destructive"
                                onClick={handleCancelWave}
                                disabled={cancelling || releasing}
                            >
                                {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                                Hủy Wave
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="text-slate-500 text-xs uppercase font-bold mb-1 flex items-center gap-1"><User className="h-3 w-3" /> Người Tạo</div>
                    <div className="font-medium">{wave.user?.name || '---'}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="text-slate-500 text-xs uppercase font-bold mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" /> Ngày Tạo</div>
                    <div className="font-medium">{format(new Date(wave.created_at), 'dd/MM/yyyy HH:mm')}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="text-slate-500 text-xs uppercase font-bold mb-1 flex items-center gap-1"><Box className="h-3 w-3" /> Tổng Đơn</div>
                    <div className="font-medium text-2xl">{orders.length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="text-slate-500 text-xs uppercase font-bold mb-1">Tổng Sản Phẩm</div>
                    <div className="font-medium text-2xl">{wave.total_items}</div>
                </div>
            </div>

            {/* Orders Table */}
            <div className="space-y-4">
                <h2 className="font-bold text-lg text-slate-700">Danh Sách Đơn Hàng</h2>
                <div className="bg-white rounded-lg border overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead>Mã Đơn</TableHead>
                                <TableHead>Khách Hàng</TableHead>
                                <TableHead className="text-right">SL Sản Phẩm</TableHead>
                                <TableHead>Trạng Thái</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">Wave trống (Đã bị hủy hoặc chưa thêm đơn)</TableCell>
                                </TableRow>
                            ) : (
                                orders.map(order => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-medium">{order.code}</TableCell>
                                        <TableCell>{order.customer?.name || 'Khách Lẻ'}</TableCell>
                                        <TableCell className="text-right">{order.total_items}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{order.status}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
