"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format, subDays, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns"
import { vi } from "date-fns/locale"
import { Package, Truck, Filter, RefreshCw, Eye, Search, Calendar, User, FileText, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

type ShippingRequest = {
    id: string
    code: string
    type: 'ORDER' | 'TRANSFER' | 'MANUAL_JOB'
    status: string
    customer_name?: string
    customer_id?: string
    destination_name?: string
    destination_id?: string
    sale_staff_name?: string
    created_at: string
    shipped_at?: string
    item_count: number
    box_count: number
    subtotal: number
    discount_amount: number
    total: number
}

// Helper types for fetching
type DbOrder = {
    id: string
    code: string
    type: string
    status: string
    created_at: string
    shipped_at?: string
    subtotal: number
    discount_amount: number
    total: number
    customer_id?: string
    destination_id?: string
    sale_staff_id?: string
    destinations?: { name: string } | null
    internal_staff?: { name: string } | null
    outbound_order_items?: { count: number }[]
    boxes?: { id: string }[]
    picking_jobs?: { picking_tasks: { box_id: string }[] }[]
    outbound_shipments?: { box_count: number }[]
}

export default function ShippingPage() {
    const [requests, setRequests] = useState<ShippingRequest[]>([])
    const [loading, setLoading] = useState(true)

    // Filters
    const [filterType, setFilterType] = useState("ALL")
    const [filterStatus, setFilterStatus] = useState("ALL")
    const [filterDateFrom, setFilterDateFrom] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    const [filterDateTo, setFilterDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        fetchShippingRequests()
    }, [])

    const fetchShippingRequests = async () => {
        setLoading(true)
        try {
            const allRequests: ShippingRequest[] = []

            // 1. FETCH ORDERS (PACKED or SHIPPED)
            // We fetch from outbound_orders directly as it is the source of truth
            const { data: orders, error } = await supabase
                .from('outbound_orders')
                .select(`
                    *,
                    destinations (name),
                    internal_staff (name),
                    outbound_order_items (id),
                    boxes (id),
                    picking_jobs (
                        picking_tasks (
                            box_id
                        )
                    )
                `)
                .in('status', ['PACKED', 'SHIPPED'])
                .order('created_at', { ascending: false })

            if (error) throw error

            if (orders) {
                const mappedOrders: ShippingRequest[] = orders.map((o: any) => ({
                    id: o.id,
                    code: o.code,
                    type: (o.type === 'SALE' || o.type === 'GIFT') ? 'ORDER' : 'TRANSFER',
                    status: o.status,
                    customer_name: o.customers?.name,
                    destination_name: o.destinations?.name,
                    sale_staff_name: o.internal_staff?.name,
                    created_at: o.created_at,
                    shipped_at: o.shipped_at,
                    item_count: o.outbound_order_items?.length || 0,
                    box_count: (() => {
                        const uniqueBoxes = new Set<string>()
                        o.boxes?.forEach((b: any) => uniqueBoxes.add(b.id))
                        o.picking_jobs?.forEach((j: any) => {
                            j.picking_tasks?.forEach((t: any) => {
                                if (t.box_id) uniqueBoxes.add(t.box_id)
                            })
                        })
                        return uniqueBoxes.size
                    })(),
                    subtotal: o.subtotal || 0,
                    discount_amount: o.discount_amount || 0,
                    total: o.total || 0
                }))
                allRequests.push(...mappedOrders)
            }

            // 2. FETCH MANUAL JOBS (If needed, those without order, but ideally all should have orders now)
            // Skipping purely manual jobs for now as the goal is to unify around outbound_orders.
            // If there's a manual job without an order, it's an edge case we might want to fix upstream.
            // For now, let's focus on the Order table as the single source for Shipping.

            setRequests(allRequests.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ))

        } catch (e: any) {
            console.error(e)
            toast.error("Lỗi tải dữ liệu: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const filtered = requests.filter(r => {
        // 1. Text Search
        const search = searchTerm.toLowerCase()
        const matchSearch = r.code.toLowerCase().includes(search) ||
            (r.customer_name || '').toLowerCase().includes(search) ||
            (r.destination_name || '').toLowerCase().includes(search)

        // 2. Type Filter
        const matchType = filterType === 'ALL' ||
            (filterType === 'ORDER' && r.type === 'ORDER') ||
            (filterType === 'TRANSFER' && r.type === 'TRANSFER')

        // 3. Status Filter
        const matchStatus = filterStatus === 'ALL' || r.status === filterStatus

        // 4. Date Range (Compare string YYYY-MM-DD)
        const itemDate = format(parseISO(r.created_at), 'yyyy-MM-dd')
        const matchDate = itemDate >= filterDateFrom && itemDate <= filterDateTo

        return matchSearch && matchType && matchStatus && matchDate
    })

    const totals = filtered.reduce((acc, r) => ({
        item_count: acc.item_count + (Number(r.item_count) || 0),
        box_count: acc.box_count + (Number(r.box_count) || 0),
        subtotal: acc.subtotal + (Number(r.subtotal) || 0),
        discount: acc.discount + (Number(r.discount_amount) || 0),
        total: acc.total + (Number(r.total) || 0),
    }), { item_count: 0, box_count: 0, subtotal: 0, discount: 0, total: 0 })

    const getTypeBadge = (type: string) => {
        if (type === 'ORDER') return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Đơn Hàng</Badge>
        if (type === 'TRANSFER') return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Điều Chuyển</Badge>
        return <Badge variant="outline">{type}</Badge>
    }

    const getStatusBadge = (status: string) => {
        if (status === 'SHIPPED') return <Badge className="bg-green-600 hover:bg-green-700"><Truck className="w-3 h-3 mr-1" /> Đã Xuất Kho</Badge>
        if (status === 'PACKED') return <Badge className="bg-blue-600 hover:bg-blue-700"><Package className="w-3 h-3 mr-1" /> Đã Đóng Hàng</Badge>
        return <Badge variant="secondary">{status}</Badge>
    }

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Truck className="h-8 w-8 text-indigo-600" />
                        Quản Lý Giao Hàng
                    </h1>
                    <p className="text-slate-500">Quản lý và xác nhận xuất kho cho các đơn hàng đã đóng gói.</p>
                </div>
                <button
                    onClick={fetchShippingRequests}
                    className="h-10 px-4 bg-white border rounded-lg flex items-center gap-2 hover:bg-gray-50 shadow-sm"
                >
                    <RefreshCw className="h-4 w-4" />
                    Làm mới
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Tìm kiếm</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Mã đơn, KH..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-10 pl-9 pr-4 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </div>

                <div className="min-w-[300px] flex-1">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Khoảng thời gian</label>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <input
                                type="date"
                                value={filterDateFrom}
                                onChange={(e) => setFilterDateFrom(e.target.value)}
                                className="w-full h-10 px-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <span className="text-slate-300">-</span>
                        <div className="relative flex-1">
                            <input
                                type="date"
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                                className="w-full h-10 px-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="w-[150px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Loại phiếu</label>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full h-10 px-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">Tất cả</option>
                        <option value="ORDER">Bán Hàng</option>
                        <option value="TRANSFER">Điều Chuyển</option>
                    </select>
                </div>

                <div className="w-[150px]">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Trạng thái</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full h-10 px-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">Tất cả</option>
                        <option value="PACKED">Đã Đóng Gói</option>
                        <option value="SHIPPED">Đã Xuất Kho</option>
                    </select>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                            {/* Summary Row */}
                            <tr className="bg-indigo-50/30 border-b border-indigo-100">
                                <th colSpan={6} className="px-4 py-3 text-right uppercase text-[11px] tracking-wider font-bold text-indigo-900">
                                    Tổng cộng ({filtered.length} đơn):
                                </th>
                                <th className="px-4 py-3 text-center font-bold text-indigo-700">{totals.box_count.toLocaleString()}</th>
                                <th className="px-4 py-3 text-center font-bold text-indigo-700">{totals.item_count.toLocaleString()}</th>
                                <th className="px-4 py-3 text-right font-bold text-slate-700">{totals.subtotal.toLocaleString()}</th>
                                <th className="px-4 py-3 text-right font-bold text-rose-600">-{totals.discount.toLocaleString()}</th>
                                <th className="px-4 py-3 text-right font-bold text-blue-700">{totals.total.toLocaleString()}</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                            <tr>
                                <th className="px-4 py-3 w-[140px]">Mã Đơn</th>
                                <th className="px-4 py-3 w-[100px] text-center">Loại</th>
                                <th className="px-4 py-3 text-center">Trạng Thái</th>
                                <th className="px-4 py-3">Khách Hàng / Điểm Đích</th>
                                <th className="px-4 py-3">NV Sale</th>
                                <th className="px-4 py-3">Ngày Tạo</th>
                                <th className="px-4 py-3 text-center">SL Thùng</th>
                                <th className="px-4 py-3 text-center">SL Item</th>
                                <th className="px-4 py-3 text-right">Trước CK</th>
                                <th className="px-4 py-3 text-right">Chiết Khấu</th>
                                <th className="px-4 py-3 text-right">Tổng Cộng</th>
                                <th className="px-4 py-3 w-[80px]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                                        <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                                        Đang tải dữ liệu...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                                        Không tìm thấy đơn hàng nào phù hợp bộ lọc.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-4 py-3 font-medium font-mono text-indigo-600">
                                            {req.code}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {getTypeBadge(req.type)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {getStatusBadge(req.status)}
                                        </td>
                                        <td className="px-4 py-3 max-w-[200px] truncate" title={req.customer_name || req.destination_name}>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-800">{req.customer_name || req.destination_name || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {req.sale_staff_name || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 space-y-1">
                                            <div className="flex items-center gap-1 text-[11px]">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(req.created_at), 'dd/MM HH:mm')}
                                            </div>
                                            {req.shipped_at && (
                                                <div className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                                                    <Truck className="w-3 h-3" />
                                                    {format(new Date(req.shipped_at), 'dd/MM HH:mm')}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-indigo-600">
                                            {req.box_count}
                                        </td>
                                        <td className="px-4 py-3 text-center font-medium">
                                            {req.item_count}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600">
                                            {req.subtotal.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right text-rose-500">
                                            {req.discount_amount > 0 ? `-${req.discount_amount.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                                            {req.total.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link href={`/admin/shipping/${req.id}?type=${req.type}`}>
                                                <button className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 hover:shadow-sm text-slate-400 hover:text-indigo-600 transition-all">
                                                    <ArrowRight className="h-4 w-4" />
                                                </button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
