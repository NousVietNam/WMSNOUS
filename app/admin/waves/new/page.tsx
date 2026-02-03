
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
import { ArrowRight, Box, BrainCircuit, Check, Layers, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth/AuthProvider"

export default function NewWavePage() {
    const router = useRouter()
    const { session } = useAuth()
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)
    const [selectedCluster, setSelectedCluster] = useState<any>(null)
    const [selectedOrders, setSelectedOrders] = useState<string[]>([])
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        fetchSuggestions()
    }, [])

    const fetchSuggestions = async () => {
        setLoadingSuggestions(true)
        try {
            // Call Smart Suggestion RPC
            const { data, error } = await supabase.rpc('suggest_bulk_waves', {
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

    const handleSelectCluster = (cluster: any) => {
        setSelectedCluster(cluster)
        setSelectedOrders(cluster.orders || [])
    }

    const handleCreateWave = async () => {
        if (selectedOrders.length === 0) return
        setCreating(true)

        try {
            // 1. Create Wave (Transactional - Includes Linking)
            const { data: wave, error: waveError } = await supabase.rpc('create_wave', {
                p_inventory_type: 'BULK',
                p_user_id: session?.user?.id,
                p_description: `Gom ${selectedOrders.length} đơn (Size ${selectedCluster?.bucket || 'Custom'})`,
                p_order_ids: selectedOrders
            })

            if (waveError) throw waveError

            // No need for Step 2 (Linking) as it's done in RPC


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
            const uniqueSKUs = Array.from(new Set(data.map(item => item.product?.sku))).sort()

            // 2. Build Rows (Order -> { SKU: Qty })
            const rows: any[] = selectedOrders.map(orderId => {
                const orderItems = data.filter(item => item.order_id === orderId)
                const rowData: any = { order_id: orderId }

                // Get Order Code (Need to fetch or lookup from earlier suggestions? 
                // Currently suggestions RPC only returns IDs. 
                // Let's optimize: We assume we might need to fetch Order Codes separate or just use ID for now.
                // Or better, fetch order codes in thi query too? No, outbound_order_items links to order.
                // Let's do a join or separate fetch.
                // For speed, let's fetch orders too.
                return {
                    id: orderId,
                    items: uniqueSKUs.reduce((acc, sku) => {
                        const match = orderItems.find(i => i.product?.sku === sku)
                        acc[sku] = match ? match.quantity : 0
                        return acc
                    }, {} as any)
                }
            })

            // Fetch Codes
            const { data: orderCodes } = await supabase.from('outbound_orders').select('id, code').in('id', selectedOrders)
            rows.forEach(r => {
                r.code = orderCodes?.find(o => o.id === r.id)?.code || r.id.slice(0, 8)
            })

            setMatrixData({ headers: uniqueSKUs, rows })
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
                {/* Left Panel: Suggestions */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BrainCircuit className="h-6 w-6 text-indigo-600" />
                            <h2 className="text-xl font-bold text-slate-800">Gợi Ý Thông Minh</h2>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loadingSuggestions}>
                            {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Quét Lại'}
                        </Button>
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
                                Lưu ý: Hệ thống chỉ gợi ý các đơn hàng có trạng thái <b>ĐÃ DUYỆT (Approved)</b> và chưa được Gom nhóm.
                                Vui lòng kiểm tra lại danh sách đơn hàng.
                            </p>
                            <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/outbound')}>
                                Xem Danh Sách Đơn
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {suggestions.map((cluster, idx) => (
                                    <Card
                                        key={idx}
                                        className={`cursor-pointer hover:border-indigo-400 transition-all ${selectedCluster === cluster ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'bg-white'}`}
                                        onClick={() => handleSelectCluster(cluster)}
                                    >
                                        <CardHeader className="pb-2">
                                            <div className="flex justify-between items-start">
                                                <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">
                                                    SIZE {cluster.bucket}
                                                </Badge>
                                                <Badge className="bg-indigo-600">
                                                    {cluster.count} Đơn
                                                </Badge>
                                            </div>
                                            <CardTitle className="text-lg pt-2 flex items-center gap-2">
                                                <Layers className="h-5 w-5 text-slate-500" />
                                                Nhóm Gợi Ý #{idx + 1}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-slate-600">
                                                Đã gom nhóm dựa trên độ tương đồng sản phẩm và quy mô đơn hàng.
                                            </p>
                                            {selectedCluster === cluster && (
                                                <div className="mt-4 flex justify-between items-center">
                                                    <div className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                                                        <Check className="h-4 w-4" /> Đang Chọn
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* Matrix View for Selected Cluster */}
                            {selectedCluster && matrixData && (
                                <div className="animate-fade-in-up">
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
                                    <p className="text-xs text-slate-500 mt-2 text-right">* Các cột sáng màu là những sản phẩm trùng lặp giữa các đơn hàng (Cơ sở gom nhóm).</p>
                                </div>
                            )}
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
                                        <span className="text-slate-500">Thuật toán:</span>
                                        <Badge variant="secondary" className="text-[10px]">JACCARD CLUSTER</Badge>
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
