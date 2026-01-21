"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Truck, FileText, ArrowRightLeft, Search, Calendar, Package, Upload, Filter, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"
import Link from "next/link"
import { format, subDays, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns"
import { cn } from "@/lib/utils"

interface ShippingRequest {
    id: string
    code: string
    type: 'ORDER' | 'TRANSFER' | 'MANUAL_JOB'
    status: string
    customer_name?: string
    destination_name?: string
    created_at: string
    item_count: number
}

export default function ShippingPage() {
    const [requests, setRequests] = useState<ShippingRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    // Filters
    // Filters
    const [filterStatus, setFilterStatus] = useState("ALL") // ALL, PACKED, SHIPPED
    const [filterType, setFilterType] = useState("ALL") // ALL, ORDER, TRANSFER, MANUAL_JOB
    const [dateRange, setDateRange] = useState<{ from: string, to: string }>({
        from: subDays(new Date(), 30).toISOString().split('T')[0], // Default 30 days
        to: new Date().toISOString().split('T')[0]
    })

    useEffect(() => {
        fetchShippingRequests()
    }, [])

    const fetchShippingRequests = async () => {
        setLoading(true)
        try {
            const allRequests: ShippingRequest[] = []

            // 1. FETCH SHIPPED ITEMS (From outbound_shipments)
            const { data: shipments, error: shipError } = await supabase
                .from('outbound_shipments')
                .select('*')
                .order('created_at', { ascending: false })

            if (shipError) throw shipError

            const mappedShipments: ShippingRequest[] = shipments.map(s => ({
                id: s.source_id, // Link to source ID for detail view
                code: s.code,    // Use PXK Code
                type: s.source_type,
                status: 'SHIPPED',
                customer_name: s.metadata?.customer_name || s.metadata?.destination_name || 'Khách lẻ',
                destination_name: s.metadata?.original_code, // Show original code (ORD-...) as secondary info
                created_at: s.created_at,
                item_count: s.metadata?.item_count || 0
            }))

            allRequests.push(...mappedShipments)

            // 2. FETCH PENDING ITEMS (From Source Tables)
            // Only fetch if we are interested in PENDING or ALL status
            if (filterStatus !== 'SHIPPED') {
                // A. Pending Orders
                const { data: orders } = await supabase
                    .from('orders')
                    .select('id, code, status, customer_name, created_at, order_items(count)')
                    .eq('status', 'PACKED') // Only Packed, not Shipped

                if (orders) {
                    allRequests.push(...orders.map(o => ({
                        id: o.id,
                        code: o.code,
                        type: 'ORDER' as const,
                        status: 'PACKED',
                        customer_name: o.customer_name,
                        created_at: o.created_at,
                        // @ts-ignore
                        item_count: o.order_items?.[0]?.count || 0
                    })))
                }

                // B. Pending Transfers
                const { data: transfers } = await supabase
                    .from('transfer_orders')
                    .select('id, code, status, destinations(name), created_at, transfer_order_items(count)')
                    .eq('status', 'packed')

                if (transfers) {
                    allRequests.push(...transfers.map(t => ({
                        id: t.id,
                        code: t.code,
                        type: 'TRANSFER' as const,
                        status: 'PACKED',
                        // @ts-ignore
                        destination_name: t.destinations?.name || 'Chi nhánh',
                        customer_name: t.code, // Swap for consistency implies Destination is main info
                        created_at: t.created_at,
                        // @ts-ignore
                        item_count: t.transfer_order_items?.[0]?.count || 0
                    })))
                }

                // C. Pending Manual Jobs
                const { data: jobs } = await supabase
                    .from('picking_jobs')
                    .select('id, status, created_at, type, picking_tasks(count)')
                    .eq('type', 'MANUAL_PICK')
                    .eq('status', 'COMPLETED') // Picked but not Shipped

                if (jobs) {
                    allRequests.push(...jobs.map(j => ({
                        id: j.id,
                        code: `JOB-${j.id.slice(0, 8).toUpperCase()}`,
                        type: 'MANUAL_JOB' as const,
                        status: 'PACKED', // COMPLETED job = PACKED/Ready status for shipping
                        customer_name: 'Xuất Thủ Công',
                        created_at: j.created_at,
                        // @ts-ignore
                        item_count: j.picking_tasks?.[0]?.count || 0
                    })))
                }
            }

            setRequests(allRequests.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ))

        } catch (e) {
            console.error(e)
            toast.error("Lỗi tải dữ liệu")
        } finally {
            setLoading(false)
        }
    }

    const filtered = requests.filter(r => {
        // 1. Text Search
        const search = searchTerm.toLowerCase()
        const matchSearch = r.code.toLowerCase().includes(search) ||
            (r.customer_name || r.destination_name || '').toLowerCase().includes(search)

        // 2. Type Filter
        const matchType = filterType === 'ALL' || r.type === filterType

        // 3. Status Filter
        const matchStatus = filterStatus === 'ALL' || r.status === filterStatus

        // 4. Date Range
        const itemDate = parseISO(r.created_at)
        const fromDate = startOfDay(parseISO(dateRange.from))
        const toDate = endOfDay(parseISO(dateRange.to))
        const matchDate = isWithinInterval(itemDate, { start: fromDate, end: toDate })

        return matchSearch && matchType && matchStatus && matchDate
    })

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            {/* Header and Title */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3 text-slate-800">
                        <Truck className="h-10 w-10 text-indigo-600" />
                        Quản Lý Xuất Kho
                    </h1>
                    <p className="text-slate-500 mt-1">Quản lý Phiếu Xuất Kho và các đơn hàng chờ xuất.</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Tìm mã phiếu PXK, mã đơn..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Date Range */}
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-400">Từ</span>
                        <Input
                            type="date"
                            className="pl-8 w-40"
                            value={dateRange.from}
                            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                        />
                    </div>
                    <span className="text-slate-400">-</span>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-400">Đến</span>
                        <Input
                            type="date"
                            className="pl-8 w-40"
                            value={dateRange.to}
                            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                        />
                    </div>
                </div>

                {/* Type Filter */}
                <div className="w-40">
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger>
                            <SelectValue placeholder="Loại phiếu" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tất cả Loại</SelectItem>
                            <SelectItem value="ORDER">Đơn Bán Hàng</SelectItem>
                            <SelectItem value="TRANSFER">Điều Chuyển</SelectItem>
                            <SelectItem value="MANUAL_JOB">Xuất Thủ Công</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Status Filter */}
                <div className="w-40">
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger>
                            <SelectValue placeholder="Trạng thái" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tất cả Trạng thái</SelectItem>
                            <SelectItem value="PACKED">Chờ Xuất (Packed)</SelectItem>
                            <SelectItem value="SHIPPED">Đã Xuất (PXK)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button variant="outline" size="icon" onClick={fetchShippingRequests} title="Làm mới">
                    <Filter className="h-4 w-4" />
                </Button>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-slate-500">Đang tải danh sách...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-4">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                            <Truck className="h-8 w-8" />
                        </div>
                        <p className="text-slate-500">Không tìm thấy phiếu nào phù hợp bộ lọc</p>
                    </div>
                ) : (
                    filtered.map((req) => {
                        // Display Logic
                        const isShipped = req.status === 'SHIPPED' || req.status === 'COMPLETED'
                        const isManualReady = req.type === 'MANUAL_JOB' && req.status === 'COMPLETED' // Picked, ready to ship

                        // Badge Logic
                        let badgeVariant: "default" | "secondary" | "outline" | "destructive" | null | undefined = 'secondary'
                        let badgeClass = 'bg-blue-100 text-blue-700'
                        let badgeText = req.status

                        if (isShipped) {
                            badgeVariant = 'default'
                            badgeClass = 'bg-green-600 hover:bg-green-700'
                            badgeText = 'Đã Xuất Kho'
                        } else if (isManualReady) {
                            badgeClass = 'bg-orange-100 text-orange-700'
                            badgeText = 'Chờ Xuất (Đã Lấy)'
                        } else if (req.status === 'PACKED') {
                            badgeClass = 'bg-blue-100 text-blue-700'
                            badgeText = 'Đã Đóng Gói (Chờ Xuất)'
                        }

                        return (
                            <div key={req.id} className="relative group">
                                <Link href={`/admin/shipping/${req.id}?type=${req.type}`}>
                                    <Card className={`hover:border-indigo-300 transition-all cursor-pointer shadow-sm ${isShipped ? 'opacity-80 bg-slate-50' : 'bg-white'}`}>
                                        <CardContent className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${req.type === 'ORDER' ? 'bg-blue-50 text-blue-600' :
                                                    req.type === 'TRANSFER' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'
                                                    }`}>
                                                    {req.type === 'ORDER' ? <FileText className="h-6 w-6" /> :
                                                        req.type === 'TRANSFER' ? <ArrowRightLeft className="h-6 w-6" /> : <Package className="h-6 w-6" />}
                                                </div>
                                                <div>
                                                    <div className="font-black text-lg text-slate-900 flex items-center gap-2">
                                                        {req.code}
                                                        <Badge variant={badgeVariant} className={badgeClass}>
                                                            {badgeText}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-sm text-slate-500 flex items-center gap-3">
                                                        <span>{req.customer_name || req.destination_name}</span>
                                                        <span>•</span>
                                                        <span>{req.item_count} sản phẩm</span>
                                                        <span>•</span>
                                                        <span>{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>

                                {/* QUICK SHIP BUTTON OVERLAY (Only for PACKED orders) */}
                                {req.type === 'ORDER' && req.status === 'PACKED' && !isShipped && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            className="shadow-lg bg-indigo-600 hover:bg-indigo-700"
                                            onClick={async (e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                if (!confirm(`Xác nhận Xuất Nhanh đơn ${req.code}?`)) return

                                                try {
                                                    const res = await fetch('/api/orders/ship', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ orderId: req.id })
                                                    })
                                                    const json = await res.json()
                                                    if (json.success) {
                                                        toast.success("Xuất hàng thành công!")
                                                        fetchShippingRequests()
                                                    } else {
                                                        toast.error(json.error)
                                                    }
                                                } catch (err: any) {
                                                    toast.error(err.message)
                                                }
                                            }}
                                        >
                                            <Upload className="h-4 w-4 mr-2" /> Xuất Nhanh
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
