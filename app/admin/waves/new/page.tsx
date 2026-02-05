
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
    ArrowRight,
    Box,
    BrainCircuit,
    Check,
    Layers,
    Loader2,
    Sparkles,
    Calendar,
    User,
    RefreshCw,
    Filter,
    ShoppingBag,
    TrendingUp,
    Zap,
    ChevronDown,
    LayoutGrid,
    Info,
    ArrowLeft
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/AuthProvider"
import { format } from "date-fns"

export default function NewWavePage() {
    const router = useRouter()
    const { session } = useAuth()

    // Suggestion State
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)
    const [selectedCluster, setSelectedCluster] = useState<any>(null)

    // Manual State
    const [availableOrders, setAvailableOrders] = useState<any[]>([])
    const [loadingAvailable, setLoadingAvailable] = useState(false)

    // Shared State
    const [selectedOrders, setSelectedOrders] = useState<string[]>([])
    const [creating, setCreating] = useState(false)
    const [activeTab, setActiveTab] = useState("suggestions")

    useEffect(() => {
        fetchSuggestions()
    }, [])

    useEffect(() => {
        if (activeTab === "manual") {
            fetchAvailableOrders()
            // Reset selection when switching to manual to avoid mixing contexts
            if (selectedCluster) {
                setSelectedCluster(null)
                setSelectedOrders([])
            }
        }
    }, [activeTab])

    const fetchSuggestions = async () => {
        setLoadingSuggestions(true)
        try {
            // Call Smart Suggestion RPC
            const { data, error } = await supabase.rpc('suggest_bulk_waves_v4', {
                p_min_similarity: 0.2, // 20% overlap minimum
                p_max_orders: 20       // Max 20 orders per wave
            })

            if (error) throw error
            setSuggestions(data || [])
        } catch (error: any) {
            toast.error("Lỗi Suggestions: " + error.message)
        } finally {
            setLoadingSuggestions(false)
        }
    }

    const fetchAvailableOrders = async () => {
        setLoadingAvailable(true)
        try {
            const { data, error } = await supabase
                .from('outbound_orders')
                .select(`
                    id, 
                    code, 
                    created_at, 
                    inventory_type,
                    customer_id,
                    customers (name),
                    outbound_order_items (id, quantity)
                `)
                .eq('is_approved', true) // Only approved
                .is('wave_id', null)     // Not in wave
                .eq('inventory_type', 'BULK') // Bulk context
                .eq('status', 'PENDING')      // Only Pending (Wait for processing)
                .order('created_at', { ascending: false })
                .limit(100)

            if (error) throw error
            setAvailableOrders(data || [])
        } catch (e: any) {
            console.error(e)
            toast.error("Lỗi tải đơn hàng: " + e.message)
        } finally {
            setLoadingAvailable(false)
        }
    }

    const handleSelectCluster = (cluster: any) => {
        setSelectedCluster(cluster)
        setSelectedOrders(cluster.orders || [])
    }

    const handleToggleOrder = (orderId: string) => {
        setSelectedCluster(null) // Use manual mode if toggling individually
        setSelectedOrders(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        )
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedOrders(availableOrders.map(o => o.id))
        } else {
            setSelectedOrders([])
        }
    }

    const handleCreateWave = async () => {
        if (selectedOrders.length === 0) return
        setCreating(true)

        try {
            // 1. Create Wave (Transactional - Includes Linking)
            const { data: wave, error: waveError } = await supabase.rpc('create_wave', {
                p_inventory_type: 'BULK', // Force BULK as this page is for Bulk Waves
                p_user_id: session?.user?.id,
                p_description: selectedCluster
                    ? `Gom ${selectedOrders.length} đơn (Size ${selectedCluster.bucket})`
                    : `Gom thủ công ${selectedOrders.length} đơn`,
                p_order_ids: selectedOrders
            })

            if (waveError) throw waveError

            toast.success(`Đã tạo Wave ${wave.code} thành công!`)
            router.push('/admin/waves')
        } catch (error: any) {
            toast.error("Lỗi tạo Wave: " + error.message)
        } finally {
            setCreating(false)
        }
    }

    const [matrixOpen, setMatrixOpen] = useState(false)
    const [matrixData, setMatrixData] = useState<{ headers: string[], rows: any[] } | null>(null)
    const [loadingMatrix, setLoadingMatrix] = useState(false)

    useEffect(() => {
        if (selectedOrders.length > 0) {
            fetchMatrixData()
        } else {
            setMatrixData(null)
        }
    }, [selectedOrders])

    const fetchMatrixData = async () => {
        setLoadingMatrix(true)
        try {
            // Get Items for all selected orders
            const { data, error } = await supabase
                .from('outbound_order_items')
                .select(`
                    order_id,
                    quantity,
                    product:products(sku)
                `)
                .in('order_id', selectedOrders)

            if (error) throw error

            // Transform to Matrix
            const uniqueSKUs = Array.from(new Set(data.map((item: any) => item.product?.sku))).sort()

            const rows: any[] = selectedOrders.map(orderId => {
                const orderItems = data.filter((item: any) => item.order_id === orderId)
                const rowData: any = { id: orderId }

                rowData.items = uniqueSKUs.reduce((acc: any, sku: any) => {
                    const match = orderItems.find((i: any) => i.product?.sku === sku)
                    acc[sku] = match ? match.quantity : 0
                    return acc
                }, {})

                return rowData
            })

            // Fetch Codes
            const { data: orderCodes } = await supabase.from('outbound_orders').select('id, code').in('id', selectedOrders)
            rows.forEach(r => {
                r.code = orderCodes?.find(o => o.id === r.id)?.code || r.id.slice(0, 8)
            })

            setMatrixData({ headers: uniqueSKUs as string[], rows })
        } catch (error) {
            console.error("Matrix Error", error)
        } finally {
            setLoadingMatrix(false)
        }
    }

    const getCellColor = (qty: number) => {
        if (qty === 0) return 'text-slate-200'
        if (qty < 10) return 'bg-blue-50 text-blue-700 font-medium'
        if (qty < 100) return 'bg-indigo-50 text-indigo-700 font-bold'
        return 'bg-purple-50 text-purple-700 font-extrabold'
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-10 min-h-screen pb-40">
            {/* Header / Wizard Progress */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-fade-in">
                <div className="space-y-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/admin/waves')}
                        className="text-slate-500 hover:text-slate-900 group pl-0"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                        Quay lại Quản lý Wave
                    </Button>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tighter gradient-text">Thiết Kế Đợt Soạn Mới</h1>
                        <p className="text-slate-500 font-medium">Lựa chọn chiến lược gom đơn tối ưu theo SKU overlap (Jaccard Index).</p>
                    </div>
                </div>

                <div className="flex items-center bg-white p-1 rounded-2xl border shadow-sm">
                    {[
                        { label: 'Chọn Đơn', status: selectedOrders.length > 0 ? 'done' : 'active' },
                        { label: 'Kiểm Tra', status: selectedOrders.length > 0 ? 'active' : 'pending' },
                        { label: 'Khởi Tạo', status: 'pending' }
                    ].map((step, idx) => (
                        <div key={idx} className="flex items-center">
                            <div className={`
                               flex items-center gap-2 px-4 py-2 rounded-xl transition-all
                               ${step.status === 'active' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' :
                                    step.status === 'done' ? 'text-indigo-600' : 'text-slate-300'}
                           `}>
                                <div className={`
                                   h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border
                                   ${step.status === 'active' ? 'bg-white text-indigo-600 border-white' :
                                        step.status === 'done' ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}
                               `}>
                                    {step.status === 'done' ? <Check className="h-3 w-3" /> : idx + 1}
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest leading-none">{step.label}</span>
                            </div>
                            {idx < 2 && <div className="w-4 h-[1px] bg-slate-100 mx-1" />}
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8 space-y-10">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200/50 mb-8 w-fit gap-1">
                            <TabsTrigger
                                value="suggestions"
                                className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600 font-bold transition-all"
                            >
                                <Sparkles className="h-4 w-4 mr-2 text-indigo-500" />
                                Gợi Ý Thông Minh
                            </TabsTrigger>
                            <TabsTrigger
                                value="manual"
                                className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600 font-bold transition-all"
                            >
                                <LayoutGrid className="h-4 w-4 mr-2" />
                                Chọn Thủ Công
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="suggestions" className="space-y-6 animate-fade-in-up mt-0">
                            <div className="flex items-center justify-between pb-2">
                                <div className="space-y-1">
                                    <h3 className="font-black text-slate-800 tracking-tight flex items-center gap-2">
                                        <BrainCircuit className="h-5 w-5 text-indigo-500" />
                                        Best Strategy Clusters
                                    </h3>
                                    <p className="text-xs text-slate-400 font-medium">Hệ thống AI đã tính toán phân nhóm dựa trên độ tương đồng SKUs.</p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchSuggestions}
                                    className="rounded-full bg-white border-indigo-100 text-indigo-600 font-bold hover:bg-indigo-50"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loadingSuggestions ? 'animate-spin' : ''}`} />
                                    Tính toán lại
                                </Button>
                            </div>

                            {loadingSuggestions ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 rounded-3xl" />)}
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-4">
                                    <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                                        <Filter className="h-8 w-8 text-slate-300" />
                                    </div>
                                    <p className="text-slate-500 font-medium">Không tìm thấy tổ hợp đơn hàng phù hợp hiện tại.</p>
                                    <Button variant="ghost" className="text-indigo-600 font-bold" onClick={() => setActiveTab('manual')}>Chuyển sang chọn thủ công</Button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {suggestions.map((cluster, idx) => (
                                        <Card
                                            key={idx}
                                            onClick={() => handleSelectCluster(cluster)}
                                            className={`
                                                cursor-pointer rounded-3xl border transition-all duration-300 relative overflow-hidden group
                                                ${selectedCluster === cluster
                                                    ? 'border-indigo-500 ring-4 ring-indigo-50 bg-indigo-50/20'
                                                    : 'bg-white hover:border-indigo-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/5'}
                                            `}
                                        >
                                            <div className="p-6 space-y-4">
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-1">
                                                        <Badge variant="outline" className={`font-mono text-[9px] font-black ${cluster.bucket === 'XS' ? 'bg-sky-50 text-sky-600' :
                                                            cluster.bucket === 'S' ? 'bg-emerald-50 text-emerald-600' :
                                                                cluster.bucket === 'M' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'
                                                            }`}>
                                                            SIZE {cluster.bucket}
                                                        </Badge>
                                                        <h4 className="text-lg font-black text-slate-900 leading-tight">Gom Nhóm #{idx + 1}</h4>
                                                    </div>
                                                    <div className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-all ${selectedCluster === cluster ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                                                        }`}>
                                                        {selectedCluster === cluster ? <Check className="h-5 w-5" /> : <ChevronDown className="h-5 w-5 group-hover:rotate-180 transition-transform" />}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 pt-2">
                                                    <div className="bg-white/50 p-2 rounded-xl border border-slate-100">
                                                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest block">Đơn Hàng</span>
                                                        <span className="text-xl font-black text-slate-900">{cluster.count}</span>
                                                    </div>
                                                    <div className="bg-white/50 p-2 rounded-xl border border-slate-100">
                                                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest block">Sản Phẩm</span>
                                                        <span className="text-xl font-black text-slate-900">{cluster.total_items}</span>
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">SKUs Tiêu Biểu</span>
                                                    <p className="text-[11px] font-mono text-slate-600 font-bold truncate">
                                                        {cluster.top_skus}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`h-1.5 w-full mt-auto ${selectedCluster === cluster ? 'bg-indigo-500' : 'bg-slate-50'}`} />
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="manual" className="animate-fade-in-up mt-0 space-y-6">
                            <div className="flex items-center justify-between pb-2">
                                <div className="space-y-1">
                                    <h3 className="font-black text-slate-800 tracking-tight flex items-center gap-2">
                                        <LayoutGrid className="h-5 w-5 text-indigo-500" />
                                        Manual Order Selection
                                    </h3>
                                    <p className="text-xs text-slate-400 font-medium">Danh sách các đơn hàng PENDING & ĐÃ DUYỆT (KHO SỈ).</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 px-3 py-1 font-bold rounded-full">
                                        {availableOrders.length} Sẵn sàng
                                    </Badge>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl border shadow-xl shadow-slate-200/50 overflow-hidden relative">
                                <div className="max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                                    <Table>
                                        <TableHeader className="bg-slate-50/50 sticky top-0 z-20 backdrop-blur-md">
                                            <TableRow className="hover:bg-transparent border-b">
                                                <TableHead className="w-12 text-center px-4">
                                                    <Checkbox
                                                        checked={selectedOrders.length === availableOrders.length && availableOrders.length > 0}
                                                        onCheckedChange={handleSelectAll}
                                                        className="data-[state=checked]:bg-indigo-600"
                                                    />
                                                </TableHead>
                                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Order Code</TableHead>
                                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Customer</TableHead>
                                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 text-center">Items</TableHead>
                                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Created</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {loadingAvailable ? (
                                                [1, 2, 3, 4, 5].map(i => (
                                                    <TableRow key={i}><TableCell colSpan={5} className="p-8"><Skeleton className="h-8 w-full rounded-lg" /></TableCell></TableRow>
                                                ))
                                            ) : availableOrders.length === 0 ? (
                                                <TableRow><TableCell colSpan={5} className="p-20 text-center text-slate-400 italic">Không tìm thấy đơn hàng khả dụng.</TableCell></TableRow>
                                            ) : (
                                                availableOrders.map((order) => {
                                                    const isChecked = selectedOrders.includes(order.id)
                                                    return (
                                                        <TableRow
                                                            key={order.id}
                                                            onClick={() => handleToggleOrder(order.id)}
                                                            className={`
                                                                cursor-pointer transition-colors group
                                                                ${isChecked ? 'bg-indigo-50/50 hover:bg-indigo-100/50' : 'hover:bg-slate-50/50'}
                                                            `}
                                                        >
                                                            <TableCell className="text-center px-4" onClick={(e) => e.stopPropagation()}>
                                                                <Checkbox
                                                                    checked={isChecked}
                                                                    onCheckedChange={() => handleToggleOrder(order.id)}
                                                                    className="data-[state=checked]:bg-indigo-600"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="font-mono font-black text-slate-900 text-sm">{order.code}</TableCell>
                                                            <TableCell className="max-w-[150px] truncate font-bold text-slate-600 text-xs">
                                                                {order.customers?.name || '---'}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <div className="inline-flex items-center justify-center h-7 w-12 rounded-lg bg-white border border-slate-100 font-mono text-sm font-black text-slate-800 shadow-sm group-hover:border-indigo-200">
                                                                    {order.outbound_order_items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-xs font-medium text-slate-400">
                                                                {format(new Date(order.created_at), 'dd/MM HH:mm')}
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="lg:col-span-4 sticky top-8 space-y-6">
                    {/* Insights Card */}
                    <Card className="rounded-[2.5rem] border-slate-200/60 shadow-xl overflow-hidden glass-strong group">
                        <CardHeader className="bg-indigo-600 overflow-hidden relative p-8">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-all duration-700">
                                <Zap className="h-24 w-24 text-white rotate-12" />
                            </div>
                            <CardTitle className="text-white flex items-center gap-3 font-black text-2xl tracking-tighter">
                                <Sparkles className="h-6 w-6 text-yellow-300 fill-yellow-300" />
                                Wave Insights
                            </CardTitle>
                            <p className="text-indigo-100/80 text-xs font-medium mt-2">Lựa chọn của bạn ảnh hưởng trực tiếp đến hiệu quả di chuyển của xe nâng.</p>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8 bg-white/20">
                            <div className="space-y-2">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Selected Orders</span>
                                    <span className="text-3xl font-black text-indigo-600">{selectedOrders.length}</span>
                                </div>
                                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5">
                                    <div
                                        className="h-full gradient-primary rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min((selectedOrders.length / 40) * 100, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center text-[9px] text-slate-400 font-black uppercase">
                                    <span>Single Pick</span>
                                    <span>Wave Max (40)</span>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <div className="flex gap-4">
                                    <div className="h-10 w-10 shrink-0 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                        <Layers className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <h5 className="text-xs font-black text-slate-800">Bucketing Strategy</h5>
                                        <p className="text-[10px] text-slate-500 leading-relaxed">Đơn hàng được nhóm theo kích thước (XS, S, M, L) để đồng bộ phương tiện vận tải.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="h-10 w-10 shrink-0 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                                        <TrendingUp className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <h5 className="text-xs font-black text-slate-800">SKU Overlap (Jaccard)</h5>
                                        <p className="text-[10px] text-slate-500 leading-relaxed">Tối ưu hiệu quả nhặt hàng bằng cách gom các đơn có chung danh mục sản phẩm.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Matrix Preview if selection exists */}
                            {selectedOrders.length > 0 && matrixData && (
                                <div className="pt-6 space-y-4">
                                    <button
                                        onClick={() => setMatrixOpen(!matrixOpen)}
                                        className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/50 hover:bg-white hover:shadow-md transition-all group/btn"
                                    >
                                        <div className="flex items-center gap-3">
                                            <LayoutGrid className="h-4 w-4 text-slate-400 group-hover/btn:text-indigo-500" />
                                            <span className="text-xs font-black text-slate-700 tracking-tight">Overlap Matrix Preview</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${matrixOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {matrixOpen && (
                                        <div className="bg-white rounded-2xl border border-slate-100 p-2 max-h-[300px] overflow-auto animate-fade-in scrollbar-thin scrollbar-thumb-slate-100">
                                            <Table className="text-[10px]">
                                                <TableHeader>
                                                    <TableRow className="bg-slate-50/50">
                                                        <TableHead className="w-20 font-black text-slate-400 uppercase tracking-tighter">Order</TableHead>
                                                        {matrixData.headers.map((h, i) => (
                                                            <TableHead key={i} className="text-center font-black p-1 truncate max-w-[50px]">{h}</TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {matrixData.rows.map((row, i) => (
                                                        <TableRow key={i} className="hover:bg-slate-50/50">
                                                            <TableCell className="font-mono font-bold text-slate-600 p-1">{row.code}</TableCell>
                                                            {matrixData.headers.map((h, j) => {
                                                                const qty = row.items[h] || 0
                                                                return (
                                                                    <TableCell key={j} className={`text-center p-1 border-l ${qty > 0 ? 'bg-indigo-50/50 text-indigo-600 font-bold' : 'text-slate-100'}`}>
                                                                        {qty > 0 ? qty : '·'}
                                                                    </TableCell>
                                                                )
                                                            })}
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pt-4">
                                <Button
                                    className="w-full rounded-2xl h-14 font-black uppercase tracking-widest text-sm gradient-primary shadow-xl shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 transition-all group"
                                    onClick={handleCreateWave}
                                    disabled={creating || selectedOrders.length === 0}
                                >
                                    {creating ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <>
                                            Khởi tạo {selectedOrders.length} Đơn
                                            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </Button>
                                <p className="text-[9px] text-center text-slate-400 mt-4 font-bold uppercase tracking-widest">Hệ thống sẽ tự động chỉ định phương tiện</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
