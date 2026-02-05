
"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import {
    ArrowLeft,
    Ban,
    Box,
    Calendar,
    Loader2,
    User,
    LayoutDashboard,
    Package,
    ChevronRight,
    Search,
    TrendingUp,
    Users,
    Zap
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

export default function WaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [wave, setWave] = useState<any>(null)
    const [orders, setOrders] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
    const [matrixData, setMatrixData] = useState<{ orderHeaders: any[], rows: any[], orderIds: string[] } | null>(null)
    const [loading, setLoading] = useState(true)
    const [cancelling, setCancelling] = useState(false)
    const [releasing, setReleasing] = useState(false)

    // UI Interaction States
    const [hoverRow, setHoverRow] = useState<string | null>(null)
    const [hoverCol, setHoverCol] = useState<string | null>(null)

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
                })
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
        const msg = wave.status === 'RELEASED'
            ? "CẢNH BÁO: Wave đã được Duyệt. Việc Hủy sẽ XÓA TOÀN BỘ Picking Jobs chưa thực hiện và trả đơn về trạng thái chờ. Bạn có chắc chắn?"
            : "Bạn có chắc chắn muốn HỦY đợt soạn hàng này? Các đơn hàng sẽ được trả về trạng thái chưa gom nhóm."

        if (!confirm(msg)) return

        setCancelling(true)
        try {
            const { data, error } = await supabase.rpc('cancel_wave', {
                p_wave_id: wave.id,
                p_reason: 'User cancelled from UI'
            })

            if (error) throw error
            if (!data.success) throw new Error(data.error)

            toast.success("Đã hủy Wave thành công!")
            fetchWaveDetail()
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
            const { data, error } = await supabase.rpc('release_wave_v3', {
                p_wave_id: id,
                p_user_id: user.data.user?.id
            })

            if (error) throw error
            if (!data.success) throw new Error(data.error)

            toast.success(`Duyệt thành công! Đã tạo ${data.jobs_created} Picking Jobs cho các vùng: ${data.zones.join(', ')}`)
            fetchWaveDetail()
        } catch (error: any) {
            console.error("Release error:", error)
            toast.error("Lỗi Duyệt Wave: " + (error.message || "Unknown error"))
        } finally {
            setReleasing(false)
        }
    }

    if (loading) return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
            <div className="flex justify-between items-center">
                <Skeleton className="h-12 w-[300px] rounded-lg" />
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-32 rounded-lg" />
                    <Skeleton className="h-10 w-32 rounded-lg" />
                </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
    )

    if (!wave) return (
        <div className="p-8 text-center flex flex-col items-center justify-center min-h-[400px] gap-6 animate-fade-in">
            <div className="h-20 w-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center elevation-sm">
                <Ban className="h-10 w-10" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900 border-b border-red-100 pb-2">Không tìm thấy Wave!</h1>
                <p className="text-slate-500 mt-2">Đợt soạn hàng này không tồn tại hoặc đã bị xóa.</p>
            </div>
            <Button onClick={() => router.push('/admin/waves')} className="gradient-primary">
                Quay lại danh sách
            </Button>
        </div>
    )

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PLANNING': return 'bg-amber-100 text-amber-700 border-amber-200'
            case 'RELEASED': return 'bg-indigo-100 text-indigo-700 border-indigo-200 font-bold'
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
            case 'CANCELLED': return 'bg-rose-100 text-rose-700 border-rose-200'
            default: return 'bg-slate-100 text-slate-700'
        }
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-20 animate-fade-in">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-fade-in-up">
                <div className="flex items-center gap-5">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/admin/waves')}
                        className="h-12 w-12 rounded-full hover:bg-white hover:shadow-md transition-all active:scale-95"
                    >
                        <ArrowLeft className="h-6 w-6 text-slate-600" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-black gradient-text tracking-tighter">
                                {wave.code}
                            </h1>
                            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 rounded ${wave.inventory_type === 'BULK' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                                }`}>
                                {wave.inventory_type === 'BULK' ? 'KHO SỈ' : 'KHO LẺ'}
                            </Badge>
                            <Badge className={`uppercase text-[10px] tracking-widest px-2 py-0.5 shadow-sm border ${getStatusColor(wave.status)}`}>
                                {wave.status === 'PLANNING' ? 'ĐANG LÊN KH' : wave.status}
                            </Badge>
                        </div>
                        <p className="text-slate-500 font-medium text-sm mt-1.5 flex items-center gap-2">
                            <div className="h-1 w-1 bg-slate-300 rounded-full" />
                            {wave.description || 'Chưa có mô tả chi tiết cho đợt soạn này'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {(['RELEASED', 'COMPLETED', 'IN_PROGRESS'].includes(wave.status)) && (
                        <Button
                            className="bg-indigo-600 hover:bg-slate-900 text-white shadow-xl shadow-indigo-100 font-bold group"
                            onClick={() => window.open(`/admin/sorting/${wave.id}`, '_blank')}
                        >
                            <LayoutDashboard className="h-4 w-4 mr-2 group-hover:rotate-12 transition-transform" />
                            Visual Sorting
                        </Button>
                    )}

                    {(wave.status === 'PLANNING' || wave.status === 'RELEASED') && (
                        <div className="flex gap-2">
                            {wave.status === 'PLANNING' && (
                                <Button
                                    className="gradient-primary text-white font-bold elevation-md hover:scale-105 active:scale-95 transition-all w-full sm:w-auto"
                                    onClick={handleReleaseWave}
                                    disabled={releasing || cancelling}
                                >
                                    {releasing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2 text-yellow-300 fill-yellow-300" />}
                                    Duyệt Wave & Chạy Allocation
                                </Button>
                            )}

                            <Button
                                variant="outline"
                                className="bg-white border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold transition-all"
                                onClick={handleCancelWave}
                                disabled={cancelling || releasing}
                            >
                                {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                                Hủy {wave.status === 'RELEASED' ? 'Duyệt' : 'Wave'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <div className="glass-strong p-5 rounded-2xl border elevation-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform duration-500">
                        <Users className="h-10 w-10 text-indigo-600" />
                    </div>
                    <label className="text-slate-400 text-[10px] uppercase font-black tracking-widest block mb-2">Người Tạo</label>
                    <div className="text-slate-900 font-bold flex items-center gap-2">
                        <div className="h-6 w-6 bg-indigo-100 rounded-full flex items-center justify-center text-[10px] text-indigo-600 border border-indigo-200">
                            {wave.user?.name?.substring(0, 1) || 'W'}
                        </div>
                        {wave.user?.name || '---'}
                    </div>
                </div>

                <div className="glass-strong p-5 rounded-2xl border elevation-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform duration-500">
                        <Calendar className="h-10 w-10 text-emerald-600" />
                    </div>
                    <label className="text-slate-400 text-[10px] uppercase font-black tracking-widest block mb-1">Ngày Tạo</label>
                    <div className="font-mono text-slate-900 text-sm font-bold">
                        {format(new Date(wave.created_at), 'dd/MM/yyyy')}
                        <span className="text-slate-400 ml-1 font-normal text-xs">{format(new Date(wave.created_at), 'HH:mm')}</span>
                    </div>
                </div>

                <div className="glass-strong p-5 rounded-2xl border elevation-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform duration-500">
                        <Package className="h-10 w-10 text-orange-600" />
                    </div>
                    <label className="text-slate-400 text-[10px] uppercase font-black tracking-widest block mb-1">Tổng Quy Mô</label>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{orders.length}</span>
                        <span className="text-xs text-slate-500 font-medium">Đơn hàng</span>
                    </div>
                </div>

                <div className="glass-strong p-5 rounded-2xl border elevation-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform duration-500">
                        <TrendingUp className="h-10 w-10 text-rose-600" />
                    </div>
                    <label className="text-slate-400 text-[10px] uppercase font-black tracking-widest block mb-1">Tổng Sản Phẩm</label>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{wave.total_items}</span>
                        <span className="text-xs text-slate-500 font-medium font-mono">pcs</span>
                    </div>
                </div>
            </div>

            {/* Picking Jobs Feed */}
            {jobs.length > 0 && (
                <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-black text-slate-900 tracking-tight"> Picking Jobs</h2>
                        <Badge variant="outline" className="bg-white px-2 rounded-full font-mono text-[10px] text-slate-500 border-slate-200">
                            {jobs.length} TASKS
                        </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {jobs.map((job) => (
                            <div key={job.id}
                                onClick={() => router.push(`/admin/picking-jobs?search=${job.code}`)}
                                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer group hover:-translate-y-1"
                            >
                                <div className="p-4 bg-slate-50/50 flex justify-between items-center border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <div className="h-7 w-7 bg-white rounded-lg border shadow-sm flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                            <Zap className="h-3.5 w-3.5" />
                                        </div>
                                        <span className="font-mono font-black text-sm">{job.code}</span>
                                    </div>
                                    <Badge className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${job.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            job.status === 'OPEN' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                        }`}>
                                        {job.status}
                                    </Badge>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Phân vùng</span>
                                            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                                <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                                {job.zone || 'DEFAULT'}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tiến độ</span>
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 w-[45%]" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-2 flex items-center justify-between border-t border-slate-50">
                                        <div className="flex items-center gap-1.5 grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                                            <Users className="h-3 w-3" />
                                            <span className="text-[10px] font-medium text-slate-600">{job.assigned_to_name || 'Chưa điều phối'}</span>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Matrix View */}
            {matrixData && matrixData.rows.length > 0 && (
                <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <h2 className="font-black text-2xl text-slate-900 tracking-tight flex items-center gap-2">
                                <Box className="h-7 w-7 text-indigo-600" />
                                Wave Item Matrix
                            </h2>
                            <span className="h-6 w-[1.5px] bg-slate-200 mx-1 hidden sm:block" />
                            <div className="bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 flex items-center gap-2">
                                <span className="text-indigo-700 font-bold text-xs">{matrixData.rows.length} SKUs</span>
                                <span className="text-indigo-300">×</span>
                                <span className="text-indigo-700 font-bold text-xs">{matrixData.orderHeaders.length} Orders</span>
                            </div>
                        </div>
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                placeholder="Search SKU in matrix..."
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-full text-xs font-medium w-full sm:w-[260px] focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-indigo-500/5 overflow-hidden group/matrix">
                        <div className="overflow-x-auto relative scrollbar-thin scrollbar-thumb-slate-200">
                            <Table className="border-collapse table-fixed w-full">
                                <TableHeader className="bg-slate-50/80 sticky top-0 z-30 backdrop-blur-md">
                                    <TableRow>
                                        <TableHead className="w-[280px] bg-white font-black sticky left-0 z-40 border-r border-b text-slate-900 px-6 h-16 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                            Sản phẩm (SKU)
                                        </TableHead>
                                        {matrixData.orderHeaders.map((header) => (
                                            <TableHead
                                                key={header.id}
                                                onMouseEnter={() => setHoverCol(header.id)}
                                                onMouseLeave={() => setHoverCol(null)}
                                                className={`text-center px-2 min-w-[140px] border-l border-b border-slate-100 text-slate-700 transition-colors
                                                   ${hoverCol === header.id ? 'bg-indigo-50/50' : 'bg-slate-50/30'}
                                                `}
                                            >
                                                <div className="font-mono text-[11px] font-black text-indigo-600 mb-0.5">{header.code}</div>
                                                <div className="text-[9px] text-slate-400 font-bold truncate max-w-[110px] mx-auto uppercase tracking-tighter">
                                                    {header.customerName}
                                                </div>
                                            </TableHead>
                                        ))}
                                        <TableHead className="text-center font-black px-6 min-w-[110px] bg-slate-900 text-white sticky right-0 z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.1)]">
                                            TỔNG
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {matrixData.rows.map((row, idx) => {
                                        const rowTotal = matrixData.orderIds.reduce((sum, orderId) => sum + (row.orders[orderId] || 0), 0)

                                        return (
                                            <TableRow
                                                key={row.sku}
                                                onMouseEnter={() => setHoverRow(row.sku)}
                                                onMouseLeave={() => setHoverRow(null)}
                                                className={`group/row transition-colors
                                                ${hoverRow === row.sku ? 'bg-indigo-50/30' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}
                                            `}>
                                                <TableCell className="bg-inherit sticky left-0 z-20 border-r border-b border-slate-50 px-6 py-4 shadow-[2px_0_5px_rgba(0,0,0,0.01)] min-w-[280px]">
                                                    <div className="font-black text-slate-900 font-mono text-sm group-hover/row:text-indigo-600 transition-colors flex items-center gap-2">
                                                        {row.sku}
                                                        {hoverRow === row.sku && <TrendingUp className="h-3 w-3 text-indigo-400 animate-bounce" />}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-medium truncate max-w-[240px] mt-0.5 italic">{row.name}</div>
                                                </TableCell>

                                                {matrixData.orderIds.map((orderId) => {
                                                    const qty = row.orders[orderId] || 0
                                                    const isActive = qty > 0
                                                    return (
                                                        <TableCell
                                                            key={orderId}
                                                            onMouseEnter={() => setHoverCol(orderId)}
                                                            className={`text-center p-3 border-l border-b border-slate-50 transition-all duration-300
                                                                ${hoverCol === orderId ? 'bg-indigo-50/50 scale-[1.02] shadow-inner' : ''}
                                                                ${!isActive && 'text-slate-100'}
                                                            `}
                                                        >
                                                            <div className={`
                                                                inline-flex items-center justify-center min-w-[32px] h-8 rounded-lg text-sm transition-all
                                                                ${qty === 0 ? 'opacity-20' :
                                                                    qty < 10 ? 'bg-indigo-50 text-indigo-600 font-bold border border-indigo-100' :
                                                                        qty < 50 ? 'bg-indigo-500 text-white font-black shadow-lg shadow-indigo-500/20 scale-110 ring-2 ring-white' :
                                                                            'bg-slate-900 text-white font-black shadow-xl shadow-slate-900/40 scale-125 ring-2 ring-white z-10'
                                                                }
                                                            `}>
                                                                {qty > 0 ? (
                                                                    <span className="relative">
                                                                        {qty}
                                                                        {qty >= 50 && <Zap className="absolute -top-2 -right-2 h-3 w-3 text-yellow-300 fill-yellow-300 animate-pulse" />}
                                                                    </span>
                                                                ) : '·'}
                                                            </div>
                                                        </TableCell>
                                                    )
                                                })}

                                                <TableCell className={`text-center p-3 font-black bg-slate-800 text-white sticky right-0 z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] transition-colors
                                                    ${hoverRow === row.sku ? 'bg-indigo-600' : ''}
                                                `}>
                                                    {rowTotal}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}

                                    {/* Summary Footer */}
                                    <TableRow className="bg-slate-900 text-white font-black h-16 sticky bottom-0 z-40">
                                        <TableCell className="sticky left-0 z-50 bg-slate-900 border-r border-slate-800 px-6">
                                            GRAND TOTAL
                                        </TableCell>
                                        {matrixData.orderIds.map((orderId) => {
                                            const colTotal = matrixData.rows.reduce((sum, row) => sum + (row.orders[orderId] || 0), 0)
                                            return (
                                                <TableCell key={orderId} className={`text-center p-3 border-l border-slate-800 transition-colors
                                                   ${hoverCol === orderId ? 'bg-indigo-600' : ''}
                                                `}>
                                                    {colTotal}
                                                </TableCell>
                                            )
                                        })}
                                        <TableCell className="text-center p-3 bg-indigo-500 text-white sticky right-0 z-50 shadow-[-2px_0_10px_rgba(79,70,229,0.5)]">
                                            {matrixData.rows.reduce((sum, row) => {
                                                const rowTotal = matrixData.orderIds.reduce((s, oId) => s + (row.orders[oId] || 0), 0)
                                                return sum + rowTotal
                                            }, 0)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Matrix Legend */}
                    <div className="flex flex-wrap gap-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest justify-center sm:justify-end items-center px-4 bg-slate-50 py-3 rounded-full border border-slate-100 shadow-inner">
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded bg-white border border-slate-100"></span> Empty
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded bg-indigo-50 border border-indigo-200 shadow-sm"></span> Low (&lt;10)
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded bg-indigo-500 shadow-md shadow-indigo-500/20"></span> Mod (10-50)
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded bg-slate-900 shadow-lg shadow-slate-900/40"></span> High (&gt;50)
                        </span>
                        <span className="text-slate-300 px-2 italic font-normal">| Tip: Hover cells to highlight track</span>
                    </div>
                </div>
            )}
        </div>
    )
}
