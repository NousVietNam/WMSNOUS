
"use client"

import { useEffect, useState, use } from "react"
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

export default function WaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [wave, setWave] = useState<any>(null)
    const [orders, setOrders] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
    const [matrixData, setMatrixData] = useState<{ headers: string[], rows: any[], orderHeaders: any[], orderIds: string[] } | null>(null)
    const [loading, setLoading] = useState(true)
    const [cancelling, setCancelling] = useState(false)
    const [releasing, setReleasing] = useState(false)

    useEffect(() => {
        fetchWaveDetail()
    }, [])

    const fetchWaveDetail = async () => {
        setLoading(true)
        try {
            // 1. Get Wave Info
            const { data: waveData, error: waveError } = await supabase
                .from('pick_waves')
                .select('*')
                .eq('id', id)
                .single()

            if (waveError) throw waveError
            setWave(waveData)

            // 2. Get Orders in Wave
            const { data: orderData, error: orderError } = await supabase
                .from('outbound_orders')
                .select('*, customer:customers(name)')
                .eq('wave_id', id)

            if (orderError) throw orderError
            setOrders(orderData || [])

            if (orderData && orderData.length > 0) {
                // 3. Get Items for Matrix
                const orderIds = orderData.map(o => o.id)
                const { data: itemData, error: itemError } = await supabase
                    .from('outbound_order_items')
                    .select(`
                        order_id,
                        quantity,
                        product:products(sku, name)
                    `)
                    .in('order_id', orderIds)

                if (itemError) throw itemError

                // Transform to Transposed Matrix
                // Headers (Columns) are Orders
                const columnOrders = orderData.map(o => {
                    const cName = Array.isArray(o.customer)
                        ? (o.customer[0]?.name || 'Khách Lẻ')
                        : (o.customer?.name || 'Khách Lẻ')
                    return {
                        id: o.id,
                        code: o.code,
                        customerName: cName
                    }
                })

                // Unique SKUs (Rows)
                const uniqueSKUs = Array.from(new Set(itemData.map(item => {
                    const p = Array.isArray(item.product) ? item.product[0] : item.product
                    return p?.sku
                }))).filter(Boolean).sort() as string[]

                const rows = uniqueSKUs.map(sku => {
                    const orderMap: any = {}
                    const productRaw = itemData.find(i => {
                        const p = Array.isArray(i.product) ? i.product[0] : i.product
                        return p?.sku === sku
                    })?.product
                    const productObj = Array.isArray(productRaw) ? productRaw[0] : productRaw
                    const pName = productObj?.name || sku

                    columnOrders.forEach(order => {
                        const match = itemData.find(i => {
                            const p = Array.isArray(i.product) ? i.product[0] : i.product
                            return p?.sku === sku && i.order_id === order.id
                        })
                        orderMap[order.id] = match ? match.quantity : 0
                    })
                    return {
                        sku,
                        name: pName || sku,
                        orders: orderMap
                    }
                })
                setMatrixData({
                    orderHeaders: columnOrders,
                    rows,
                    orderIds: columnOrders.map(o => o.id)
                } as any)
            }

            // 4. Get Jobs in Wave
            const { data: jobData, error: jobError } = await supabase
                .from('picking_jobs')
                .select('*')
                .eq('wave_id', id)
                .order('created_at', { ascending: false })

            if (jobError) throw jobError
            setJobs(jobData || [])
        } catch (error: any) {
            toast.error("Lỗi tải thông tin Wave: " + error.message)
            router.push('/admin/waves')
        } finally {
            setLoading(false)
        }
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
    }

    const handleReleaseWave = async () => {
        if (!confirm("Xác nhận DUYỆT Wave này? Hệ thống sẽ chạy thuật toán phân bổ thông minh (Tầng 1 -> LIFO) và tạo Picking Jobs theo Zone.")) return

        setReleasing(true)
        try {
            const user = await supabase.auth.getUser()
            const { data, error } = await supabase.functions.invoke('release-wave', {
                body: {
                    wave_id: id,
                    user_id: user.data.user?.id
                }
            })

            if (error) throw error
            if (!data.success) throw new Error(data.error)

            toast.success(`Duyệt thành công! Đã tạo ${data.jobs_created} Picking Jobs cho các vùng: ${data.zones.join(', ')}`)
            fetchWaveDetail()
        } catch (error: any) {
            console.error("Release error:", error)
            const detail = error.context?.error || error.message
            toast.error("Lỗi Duyệt Wave: " + detail, {
                duration: 5000
            })
        } finally {
            setReleasing(false)
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

            {/* Picking Jobs Section (New) */}
            {jobs.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            Lệnh Nhặt Hàng (Picking Jobs)
                            <Badge variant="secondary">{jobs.length}</Badge>
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {jobs.map((job) => (
                            <div key={job.id} className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                                <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
                                    <div className="font-mono text-sm font-bold text-indigo-900">{job.code}</div>
                                    <Badge className={
                                        job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                            job.status === 'OPEN' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                                    }>
                                        {job.status}
                                    </Badge>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Phân vùng:</span>
                                        <span className="font-bold text-slate-900">{job.zone || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Loại Job:</span>
                                        <Badge variant="outline" className="text-[10px]">{job.type}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Người phụ trách:</span>
                                        <span className="text-slate-600">{job.assigned_to ? 'Đã giao' : 'Chưa giao'}</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full text-xs mt-2"
                                        onClick={() => router.push(`/admin/picking/${job.id}`)}
                                    >
                                        Chi tiết lệnh nhặt
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Matrix View */}
            {matrixData && (matrixData as any).rows.length > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                            <Box className="h-6 w-6 text-indigo-600" />
                            Ma Trận Phân Bổ Sản Phẩm (Wave Matrix)
                        </h2>
                        <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">
                            {(matrixData as any).rows.length} SKUs x {(matrixData as any).orderHeaders.length} Orders
                        </Badge>
                    </div>

                    <div className="bg-white rounded-xl border shadow-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table className="border-collapse">
                                <TableHeader className="bg-slate-100/80">
                                    <TableRow>
                                        <TableHead className="w-[200px] bg-slate-100 font-bold sticky left-0 z-20 border-r shadow-sm text-slate-900 px-4">
                                            Sản phẩm (SKU)
                                        </TableHead>
                                        {(matrixData as any).orderHeaders.map((header: any) => (
                                            <TableHead key={header.id} className="text-center px-2 min-w-[120px] border-l border-slate-200 text-slate-700 bg-slate-50/50">
                                                <div className="font-mono text-xs font-bold">{header.code}</div>
                                                <div className="text-[10px] text-slate-500 font-normal truncate max-w-[100px] mx-auto">
                                                    {header.customerName}
                                                </div>
                                            </TableHead>
                                        ))}
                                        <TableHead className="text-center font-bold px-4 min-w-[100px] bg-slate-900 text-white sticky right-0 z-10">
                                            TỔNG (Ngang)
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(matrixData as any).rows.map((row: any, idx: number) => {
                                        const rowTotal = (matrixData as any).orderIds.reduce((sum: number, orderId: string) => sum + (row.orders[orderId] || 0), 0)

                                        return (
                                            <TableRow key={row.sku} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                                                <TableCell className="bg-inherit sticky left-0 z-10 border-r shadow-sm px-4 border-b border-slate-100 min-w-[200px]">
                                                    <div className="font-bold text-indigo-900 font-mono text-sm">{row.sku}</div>
                                                    <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{row.name}</div>
                                                </TableCell>
                                                {(matrixData as any).orderIds.map((orderId: string) => {
                                                    const qty = row.orders[orderId] || 0
                                                    return (
                                                        <TableCell
                                                            key={orderId}
                                                            className={`text-center p-3 border-l border-b border-slate-100 transition-colors
                                                                ${qty === 0 ? 'text-slate-200' :
                                                                    qty < 10 ? 'bg-blue-50/60 text-blue-700 font-medium' :
                                                                        qty < 50 ? 'bg-indigo-100/60 text-indigo-800 font-bold' :
                                                                            'bg-purple-100 text-purple-900 font-black ring-1 ring-inset ring-purple-200'
                                                                }
                                                            `}
                                                        >
                                                            {qty > 0 ? qty : '·'}
                                                        </TableCell>
                                                    )
                                                })}
                                                <TableCell className="text-center p-3 font-bold bg-slate-800 text-white sticky right-0 z-10">
                                                    {rowTotal}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                    {/* Vertical Totals (Bottom Row) */}
                                    <TableRow className="bg-slate-900 text-white font-bold h-12">
                                        <TableCell className="sticky left-0 z-20 bg-slate-900 border-r shadow-sm px-4">
                                            TỔNG (Dọc)
                                        </TableCell>
                                        {(matrixData as any).orderIds.map((orderId: string) => {
                                            const colTotal = (matrixData as any).rows.reduce((sum: number, row: any) => sum + (row.orders[orderId] || 0), 0)
                                            return (
                                                <TableCell key={orderId} className="text-center p-3 border-l border-slate-700">
                                                    {colTotal}
                                                </TableCell>
                                            )
                                        })}
                                        <TableCell className="text-center p-3 bg-red-600 text-white sticky right-0 z-10">
                                            {(matrixData as any).rows.reduce((sum: number, row: any) => {
                                                const rowTotal = (matrixData as any).orderIds.reduce((s: number, oId: string) => s + (row.orders[oId] || 0), 0)
                                                return sum + rowTotal
                                            }, 0)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    <div className="flex gap-4 text-[10px] text-slate-500 justify-end items-center px-2">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-50 border border-blue-200"></span> Ít (&lt;10)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-100 border border-indigo-300"></span> Vừa (10-50)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-200 border border-purple-400"></span> Nhiều (&gt;50)</span>
                    </div>
                </div>
            )}
        </div>
    )
}

