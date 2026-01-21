"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { Package, Truck, ArrowRight, Plus, Filter, RefreshCw } from "lucide-react"

type OutboundOrder = {
    id: string
    code: string
    type: 'SALE' | 'TRANSFER' | 'INTERNAL' | 'GIFT'
    transfer_type: 'ITEM' | 'BOX'
    status: string
    total: number
    created_at: string
    customers?: { id: string; name: string } | null
    destinations?: { id: string; name: string } | null
    outbound_order_items?: any[]
}

export default function OutboundListPage() {
    const [orders, setOrders] = useState<OutboundOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState<string>('ALL')
    const [filterStatus, setFilterStatus] = useState<string>('ALL')

    useEffect(() => {
        fetchOrders()
    }, [filterType, filterStatus])

    const fetchOrders = async () => {
        setLoading(true)

        let query = supabase
            .from('outbound_orders')
            .select(`
                *,
                customers (id, name),
                destinations (id, name),
                outbound_order_items (id, quantity)
            `)
            .order('created_at', { ascending: false })
            .limit(100)

        if (filterType !== 'ALL') query = query.eq('type', filterType)
        if (filterStatus !== 'ALL') query = query.eq('status', filterStatus)

        const { data, error } = await query

        if (!error && data) setOrders(data)
        setLoading(false)
    }

    const getTypeBadge = (type: string) => {
        const styles: Record<string, string> = {
            'SALE': 'bg-green-100 text-green-700 border-green-200',
            'TRANSFER': 'bg-blue-100 text-blue-700 border-blue-200',
            'INTERNAL': 'bg-purple-100 text-purple-700 border-purple-200',
            'GIFT': 'bg-pink-100 text-pink-700 border-pink-200'
        }
        const labels: Record<string, string> = {
            'SALE': 'Bán Hàng',
            'TRANSFER': 'Điều Chuyển',
            'INTERNAL': 'Nội Bộ',
            'GIFT': 'Quà Tặng'
        }
        return (
            <span className={`px-2 py-0.5 text-xs font-bold rounded border ${styles[type] || 'bg-gray-100'}`}>
                {labels[type] || type}
            </span>
        )
    }

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            'PENDING': 'bg-gray-100 text-gray-600',
            'ALLOCATED': 'bg-yellow-100 text-yellow-700',
            'PICKING': 'bg-orange-100 text-orange-700',
            'PACKED': 'bg-blue-100 text-blue-700',
            'SHIPPED': 'bg-green-100 text-green-700',
            'COMPLETED': 'bg-green-200 text-green-800',
            'CANCELLED': 'bg-red-100 text-red-700'
        }
        const labels: Record<string, string> = {
            'PENDING': 'Chờ Xử Lý',
            'ALLOCATED': 'Đã Phân Bổ',
            'PICKING': 'Đang Soạn',
            'PACKED': 'Đã Đóng Gói',
            'SHIPPED': 'Đã Xuất',
            'COMPLETED': 'Hoàn Thành',
            'CANCELLED': 'Đã Hủy'
        }
        return (
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[status] || 'bg-gray-100'}`}>
                {labels[status] || status}
            </span>
        )
    }

    const getDestinationName = (order: OutboundOrder) => {
        if (order.type === 'SALE' || order.type === 'GIFT') {
            return order.customers?.name || 'Khách lẻ'
        }
        return order.destinations?.name || 'N/A'
    }

    const getItemCount = (order: OutboundOrder) => {
        return order.outbound_order_items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản Lý Xuất Kho</h1>
                    <p className="text-sm text-gray-500">Đơn hàng, điều chuyển, xuất nội bộ</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchOrders}
                        className="h-10 px-4 border rounded-lg flex items-center gap-2 hover:bg-gray-50"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Làm mới
                    </button>
                    <Link
                        href="/admin/outbound/new"
                        className="h-10 px-4 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        Tạo Mới
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center bg-white p-4 rounded-lg border">
                <Filter className="h-4 w-4 text-gray-400" />

                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="h-9 px-3 border rounded-lg text-sm"
                >
                    <option value="ALL">Tất cả loại</option>
                    <option value="SALE">Bán Hàng</option>
                    <option value="TRANSFER">Điều Chuyển</option>
                    <option value="INTERNAL">Nội Bộ</option>
                    <option value="GIFT">Quà Tặng</option>
                </select>

                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="h-9 px-3 border rounded-lg text-sm"
                >
                    <option value="ALL">Tất cả trạng thái</option>
                    <option value="PENDING">Chờ Xử Lý</option>
                    <option value="ALLOCATED">Đã Phân Bổ</option>
                    <option value="PICKING">Đang Soạn</option>
                    <option value="PACKED">Đã Đóng Gói</option>
                    <option value="SHIPPED">Đã Xuất</option>
                </select>

                <span className="text-sm text-gray-500 ml-auto">
                    {orders.length} đơn
                </span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Mã Đơn</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Loại</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Đích</th>
                            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">SL</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tổng Tiền</th>
                            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Trạng Thái</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ngày Tạo</th>
                            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="text-center py-8 text-gray-500">Đang tải...</td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center py-8 text-gray-500">Không có dữ liệu</td>
                            </tr>
                        ) : (
                            orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="font-mono font-bold text-blue-600">{order.code}</div>
                                        <div className="text-xs text-gray-400">{order.transfer_type}</div>
                                    </td>
                                    <td className="px-4 py-3">{getTypeBadge(order.type)}</td>
                                    <td className="px-4 py-3 text-sm">{getDestinationName(order)}</td>
                                    <td className="px-4 py-3 text-center font-medium">{getItemCount(order)}</td>
                                    <td className="px-4 py-3 text-right font-medium">
                                        {order.total > 0 ? new Intl.NumberFormat('vi-VN').format(order.total) + 'đ' : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">{getStatusBadge(order.status)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Link
                                            href={`/admin/outbound/${order.id}`}
                                            className="text-blue-600 hover:text-blue-800"
                                        >
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
