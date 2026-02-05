
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
import { ArrowRight, Box, BrainCircuit, Check, Layers, Loader2, Sparkles, Calendar, User, RefreshCw, Filter } from "lucide-react"
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
            // 1. Get unique SKUs
            const uniqueSKUs = Array.from(new Set(data.map((item: any) => item.product?.sku))).sort()

            // 2. Build Rows (Order -> { SKU: Qty })
            const rows: any[] = selectedOrders.map(orderId => {
                const orderItems = data.filter((item: any) => item.order_id === orderId)
                const rowData: any = { id: orderId } // Temp id for linking

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
        <div className="p-8 max-w-7xl mx-auto min-h-screen pb-20">
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" onClick={() => router.back()}>&larr; Quay lại</Button>
                <h1 className="text-3xl font-bold gradient-text">Tạo Mẻ Soạn Hàng (Wave Picking)</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Panel: Tabs */}
                <div className="lg:col-span-2 space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="mb-4 grid w-full grid-cols-2">
                            <TabsTrigger value="suggestions" className="flex items-center gap-2">
                                <BrainCircuit className="h-4 w-4" /> Gợi Ý Thông Minh
                            </TabsTrigger>
                            <TabsTrigger value="manual" className="flex items-center gap-2">
                                <Filter className="h-4 w-4" /> Chọn Thủ Công
                            </TabsTrigger>
                        </TabsList>

                        {/* TAB 1: SUGGESTIONS */}
                        <TabsContent value="suggestions" className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h2 className="text-lg font-bold text-slate-800">Cụm Đơn Hàng Đề Xuất</h2>
                                    <p className="text-sm text-slate-500">Tự động gom nhóm dựa trên độ trùng lặp sản phẩm (Jaccard Index).</p>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loadingSuggestions}>
                                    {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-2" /> Quét Lại</>}
                                </Button>
                            </div>

                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900 shadow-sm flex gap-4 items-start animate-in fade-in slide-in-from-top-2 duration-500">
                                <div className="bg-white p-2 rounded-lg shadow-sm border border-indigo-100">
                                    <BrainCircuit className="h-6 w-6 text-indigo-600" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="font-bold text-indigo-950 flex items-center gap-2">
                                        Cơ chế Gợi Ý Logic (Wave Analytics)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <p className="font-bold text-xs uppercase tracking-wider text-indigo-500">1. Size Bucketing</p>
                                            <p className="text-xs leading-relaxed opacity-80">Phân nhóm đơn theo quy mô (XS, S, M, L) dựa trên tổng số lượng để đảm bảo các wave có độ nặng tương đồng.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-bold text-xs uppercase tracking-wider text-indigo-500">2. SKU Overlap</p>
                                            <p className="text-xs leading-relaxed opacity-80">Sử dụng chỉ số <b>Jaccard Index</b> để đo độ trùng mã hàng. Càng trùng nhiều SKU, càng nhặt nhanh vì giảm di chuyển kệ.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-bold text-xs uppercase tracking-wider text-indigo-500">3. Seed Filtering</p>
                                            <p className="text-xs leading-relaxed opacity-80">Hệ thống chọn đơn hàng lớn nhất làm "gốc" (Seed) và tìm các đơn "vệ tinh" có độ tương quan &gt; 20% xung quanh.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {loadingSuggestions ? (
                                <div className="p-12 text-center bg-white rounded-xl border border-dashed">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-400 mb-4" />
                                    <p className="text-slate-500">Hệ thống đang phân tích SKU Overlap & Size Bucketing...</p>
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div className="p-12 text-center bg-white rounded-xl border border-dashed">
                                    <Sparkles className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                                    <p className="text-slate-500 text-lg font-medium">Không tìm thấy đơn hàng Sỉ nào đủ điều kiện.</p>
                                    <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
                                        Lưu ý: Hệ thống chỉ gợi ý các đơn hàng có trạng thái <b>CHỜ XỬ LÝ & ĐÃ DUYỆT</b> (Pending & Approved) và chưa được Gom nhóm.
                                    </p>
                                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab('manual')}>
                                        Thử Chọn Thủ Công
                                    </Button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {suggestions.map((cluster, idx) => (
                                        <Card
                                            key={idx}
                                            className={`cursor-pointer hover:border-indigo-400 transition-all ${selectedCluster === cluster ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'bg-white'}`}
                                            onClick={() => handleSelectCluster(cluster)}
                                        >
                                            <CardHeader className="pb-2">
                                                <div className="flex justify-between items-start">
                                                    <Badge className="bg-indigo-600">
                                                        {cluster.count} Đơn
                                                    </Badge>
                                                    {selectedCluster === cluster && (
                                                        <div className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                                                            <Check className="h-4 w-4" /> Đang Chọn
                                                        </div>
                                                    )}
                                                </div>
                                                <CardTitle className="text-lg pt-2 flex items-center gap-2">
                                                    <Layers className="h-5 w-5 text-slate-500" />
                                                    Nhóm Gợi Ý #{idx + 1}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-3 mt-2">
                                                    <div className="flex justify-between text-sm border-b pb-2 border-dashed">
                                                        <span className="text-slate-500">Tổng sản phẩm:</span>
                                                        <span className="font-bold text-slate-700">{cluster.total_items?.toLocaleString() || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm border-b pb-2 border-dashed">
                                                        <span className="text-slate-500">Số loại (SKU):</span>
                                                        <span className="font-bold text-slate-700">{cluster.unique_skus?.toLocaleString() || '-'}</span>
                                                    </div>
                                                    <div className="text-sm">
                                                        <span className="text-slate-500 block mb-1">Top sản phẩm chính:</span>
                                                        <p className="font-medium text-slate-800 text-xs line-clamp-2" title={cluster.top_skus}>
                                                            {cluster.top_skus || "N/A"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        {/* TAB 2: MANUAL */}
                        <TabsContent value="manual" className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <h2 className="text-lg font-bold text-slate-800">Danh Sách Đơn Chờ (KHO SỈ)</h2>
                                    <p className="text-sm text-slate-500">
                                        Chọn thủ công các đơn hàng để tạo Wave. Chỉ hiện đơn <b>Chờ xử lý</b> và <b>Đã duyệt</b>.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchAvailableOrders} disabled={loadingAvailable}>
                                    {loadingAvailable ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-2" /> Làm Mới</>}
                                </Button>
                            </div>

                            {loadingAvailable ? (
                                <div className="p-12 text-center bg-white rounded-xl border border-dashed">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-400 mb-4" />
                                    <p className="text-slate-500">Đang tải danh sách đơn...</p>
                                </div>
                            ) : availableOrders.length === 0 ? (
                                <div className="p-12 text-center bg-white rounded-xl border border-dashed">
                                    <Box className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                                    <p className="text-slate-500">Không có đơn hàng nào khả dụng.</p>
                                </div>
                            ) : (
                                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead className="w-12 text-center">
                                                    <Checkbox
                                                        checked={selectedOrders.length === availableOrders.length && availableOrders.length > 0}
                                                        onCheckedChange={handleSelectAll}
                                                    />
                                                </TableHead>
                                                <TableHead>Mã Đơn</TableHead>
                                                <TableHead>Khách Hàng</TableHead>
                                                <TableHead>Ngày Tạo</TableHead>
                                                <TableHead className="text-center">Số Loại</TableHead>
                                                <TableHead className="text-right">Tổng SL</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {availableOrders.map(order => {
                                                const isSelected = selectedOrders.includes(order.id)
                                                // Calculate total qty from items if available, or fetch
                                                // Assuming items are fetched with select outbound_order_items(id, quantity)
                                                const totalQty = order.outbound_order_items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0
                                                const itemCount = order.outbound_order_items?.length || 0

                                                return (
                                                    <TableRow key={order.id} className={isSelected ? 'bg-indigo-50/50' : ''}>
                                                        <TableCell className="text-center">
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={() => handleToggleOrder(order.id)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-medium text-indigo-700">
                                                            {order.code}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <User className="h-3 w-3 text-slate-400" />
                                                                {order.customers?.name || "Khách lẻ"}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-slate-500 text-sm">
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="h-3 w-3" />
                                                                {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant="secondary">{itemCount}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-bold text-slate-700">
                                                            {totalQty.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>

                    {/* Matrix View (Shared) */}
                    {(selectedOrders.length > 0) && matrixData && (
                        <div className="animate-fade-in-up pt-4 border-t">
                            <h3 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <Box className="h-5 w-5 text-indigo-600" />
                                Ma Trận Đơn Hàng (Wave Matrix)
                            </h3>
                            <div className="bg-white rounded-xl border shadow-sm overflow-hidden overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="w-[120px] bg-slate-100 sticky left-0 z-10 font-bold">Mã Đơn</TableHead>
                                            {matrixData.headers.map(sku => (
                                                <TableHead key={sku} className="text-center font-mono text-xs px-2 min-w-[80px]">{sku}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {matrixData.rows.map(row => (
                                            <TableRow key={row.id}>
                                                <TableCell className="font-medium bg-slate-50 sticky left-0 z-10 border-r">{row.code}</TableCell>
                                                {matrixData.headers.map(sku => (
                                                    <TableCell key={sku} className={`text-center p-2 border-l border-slate-50 ${getCellColor(row.items[sku])}`}>
                                                        {row.items[sku] > 0 ? row.items[sku] : '-'}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 text-right">* Các cột sáng màu là những sản phẩm trùng lặp.</p>
                        </div>
                    )}
                </div>

                {/* Right Panel: Preview & Action */}
                <div className="lg:col-span-1">
                    <div className="sticky top-8 space-y-4">
                        <Card className="glass-strong border-indigo-100 shadow-xl">
                            <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
                                <CardTitle className="text-indigo-900 flex items-center gap-2">
                                    <Box className="h-5 w-5" />
                                    Wave Preview
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-6">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Số lượng đơn:</span>
                                        <span className="font-bold text-lg">{selectedOrders.length}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Phân loại:</span>
                                        <span className="font-bold text-purple-600">KHO SỈ (BULK)</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Chế độ:</span>
                                        <Badge variant="secondary" className="text-[10px]">
                                            {selectedCluster ? 'SMART SUGGEST' : 'MANUAL PICK'}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100">
                                    <Button
                                        className="w-full gradient-primary text-white font-bold h-12 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                                        disabled={selectedOrders.length === 0 || creating}
                                        onClick={handleCreateWave}
                                    >
                                        {creating ? (
                                            <>
                                                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang Tạo...
                                            </>
                                        ) : (
                                            <>
                                                Tạo Wave Ngay <ArrowRight className="ml-2 h-5 w-5" />
                                            </>
                                        )}
                                    </Button>
                                    <p className="text-xs text-center text-slate-400 mt-2">
                                        Hệ thống sẽ gom {selectedOrders.length} đơn này vào một mẻ xử lý chung.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}
