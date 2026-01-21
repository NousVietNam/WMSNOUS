"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { ArrowLeft, Package, Truck, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

type OutboundOrder = {
    id: string
    code: string
    type: 'SALE' | 'TRANSFER' | 'INTERNAL' | 'GIFT'
    transfer_type: 'ITEM' | 'BOX'
    status: string

    // Approval
    is_approved: boolean
    source: string
    approved_at: string | null

    subtotal: number
    discount_type: string | null
    discount_value: number
    discount_amount: number
    total: number
    created_at: string
    shipped_at: string | null
    note: string | null
    customers?: { id: string; name: string } | null
    destinations?: { id: string; name: string } | null
}

type OrderItem = {
    id: string
    product_id: string
    quantity: number
    picked_quantity: number
    unit_price: number
    discount_percent: number
    line_total: number
    box_id: string | null
    products?: { id: string; sku: string; name: string }
    boxes?: { id: string; code: string }
}

export default function OutboundDetailPage() {
    const { id } = useParams()
    const router = useRouter()
    const [order, setOrder] = useState<OutboundOrder | null>(null)
    const [items, setItems] = useState<OrderItem[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    useEffect(() => {
        if (id) fetchOrder()
    }, [id])

    const fetchOrder = async () => {
        setLoading(true)

        const { data: orderData, error: orderError } = await supabase
            .from('outbound_orders')
            .select(`*, customers (id, name), destinations (id, name)`)
            .eq('id', id)
            .single()

        if (orderError || !orderData) {
            toast.error("Không tìm thấy đơn hàng")
            setLoading(false)
            return
        }

        const { data: itemsData } = await supabase
            .from('outbound_order_items')
            .select(`*, products (id, sku, name), boxes (id, code)`)
            .eq('order_id', id)

        setOrder(orderData)
        setItems(itemsData || [])
        setLoading(false)
    }

    const handleApprove = async () => {
        setActionLoading('approve')
        try {
            const res = await fetch('/api/outbound/approve', {
                method: 'POST',
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Đã duyệt đơn hàng! (Đã trừ tồn kho dự kiến)")
                fetchOrder()
            } else {
                if (data.missing) {
                    toast.error(`Thiếu hàng: ${data.missing.map((m: any) => `${m.sku} (Thiếu ${m.requested - m.available})`).join(', ')}`)
                } else {
                    toast.error(data.error || "Lỗi duyệt đơn")
                }
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setActionLoading(null)
        }
    }

    const handleUnapprove = async () => {
        if (!confirm("Hủy duyệt đơn này? Tồn kho dự kiến sẽ được hoàn lại.")) return

        setActionLoading('unapprove')
        try {
            const res = await fetch('/api/outbound/unapprove', {
                method: 'POST',
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Đã hủy duyệt đơn hàng!")
                fetchOrder()
            } else {
                toast.error(data.error || "Lỗi hủy duyệt")
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setActionLoading(null)
        }
    }

    const handleAllocate = async () => {
        setActionLoading('allocate')
        try {
            const res = await fetch('/api/outbound/allocate', {
                method: 'POST',
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Đã phân bổ tồn kho!")
                fetchOrder()
            } else {
                toast.error(data.error || "Lỗi phân bổ")
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setActionLoading(null)
        }
    }

    const handleCreateJob = async () => {
        setActionLoading('job')
        try {
            const res = await fetch('/api/outbound/create-job', {
                method: 'POST',
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Đã tạo Job soạn hàng!")
                fetchOrder()
            } else {
                toast.error(data.error || "Lỗi tạo Job")
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setActionLoading(null)
        }
    }

    const handleShip = async () => {
        if (!confirm("Xác nhận xuất kho đơn này?")) return

        setActionLoading('ship')
        try {
            const res = await fetch('/api/outbound/ship', {
                method: 'POST',
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message || "Xuất kho thành công!")
                fetchOrder()
            } else {
                toast.error(data.error || "Lỗi xuất kho")
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setActionLoading(null)
        }
    }

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            'PENDING': 'bg-gray-100 text-gray-600',
            'ALLOCATED': 'bg-yellow-100 text-yellow-700',
            'PICKING': 'bg-orange-100 text-orange-700',
            'PACKED': 'bg-blue-100 text-blue-700',
            'SHIPPED': 'bg-green-100 text-green-700',
        }
        return <span className={`px-3 py-1 text-sm font-medium rounded ${styles[status] || 'bg-gray-100'}`}>{status}</span>
    }

    if (loading) {
        return <div className="p-6 text-center">Đang tải...</div>
    }

    if (!order) {
        return <div className="p-6 text-center">Không tìm thấy đơn hàng</div>
    }

    // Permissions Logic
    const isPending = order.status === 'PENDING'
    const canApprove = isPending && !order.is_approved
    const canUnapprove = isPending && order.is_approved

    // Can Allocate only if Approved
    const canAllocate = isPending && order.is_approved

    const canCreateJob = order.status === 'ALLOCATED'
    const canShip = ['ALLOCATED', 'PICKING', 'PACKED'].includes(order.status)
    const isShipped = order.status === 'SHIPPED'

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/admin/outbound" className="h-10 w-10 flex items-center justify-center rounded-lg border hover:bg-gray-50">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold">{order.code}</h1>
                        {order.is_approved && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-bold border border-green-200 rounded-full">
                                <CheckCircle className="h-3 w-3" />
                                Đã duyệt
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(order.status)}
                        <span className="text-sm text-gray-500">
                            {order.type} • {order.transfer_type}
                        </span>
                    </div>
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-xs text-gray-500 uppercase mb-1">Đích đến</div>
                    <div className="font-medium">
                        {order.type === 'SALE' ? order.customers?.name : order.destinations?.name || 'N/A'}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-xs text-gray-500 uppercase mb-1">Ngày tạo</div>
                    <div className="font-medium">
                        {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-xs text-gray-500 uppercase mb-1">Tổng tiền</div>
                    <div className="font-bold text-lg text-blue-600">
                        {new Intl.NumberFormat('vi-VN').format(order.total)}đ
                    </div>
                </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-lg border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                    <h2 className="font-medium">Chi tiết đơn hàng ({items.length} dòng)</h2>
                </div>
                <table className="w-full">
                    <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="text-left px-4 py-2">SKU</th>
                            <th className="text-left px-4 py-2">Tên</th>
                            <th className="text-center px-4 py-2">SL Đặt</th>
                            <th className="text-center px-4 py-2">SL Lấy</th>
                            <th className="text-right px-4 py-2">Đơn Giá</th>
                            <th className="text-right px-4 py-2">Thành Tiền</th>
                            <th className="text-left px-4 py-2">Thùng</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map(item => (
                            <tr key={item.id}>
                                <td className="px-4 py-2 font-mono text-sm">{item.products?.sku}</td>
                                <td className="px-4 py-2 text-sm">{item.products?.name}</td>
                                <td className="px-4 py-2 text-center font-medium">{item.quantity}</td>
                                <td className="px-4 py-2 text-center">
                                    <span className={item.picked_quantity >= item.quantity ? 'text-green-600 font-medium' : ''}>
                                        {item.picked_quantity}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-right text-sm">
                                    {new Intl.NumberFormat('vi-VN').format(item.unit_price)}đ
                                </td>
                                <td className="px-4 py-2 text-right font-medium">
                                    {new Intl.NumberFormat('vi-VN').format(item.line_total)}đ
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">
                                    {item.boxes?.code || '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pricing Summary */}
            <div className="bg-white rounded-lg border p-4">
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Tạm tính</span>
                        <span>{new Intl.NumberFormat('vi-VN').format(order.subtotal)}đ</span>
                    </div>
                    {order.discount_amount > 0 && (
                        <div className="flex justify-between text-red-600">
                            <span>Chiết khấu ({order.discount_type === 'PERCENT' ? `${order.discount_value}%` : 'Cố định'})</span>
                            <span>-{new Intl.NumberFormat('vi-VN').format(order.discount_amount)}đ</span>
                        </div>
                    )}
                    <div className="flex justify-between pt-2 border-t font-bold text-lg">
                        <span>Tổng cộng</span>
                        <span className="text-blue-600">{new Intl.NumberFormat('vi-VN').format(order.total)}đ</span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            {!isShipped && (
                <div className="flex flex-col gap-3">
                    {/* Approval Zone */}
                    <div className="flex gap-3">
                        {canApprove && (
                            <button
                                onClick={handleApprove}
                                disabled={actionLoading === 'approve'}
                                className="flex-1 h-12 bg-blue-600 text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                            >
                                {actionLoading === 'approve' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                                Duyệt Đơn Hàng
                            </button>
                        )}
                        {canUnapprove && (
                            <button
                                onClick={handleUnapprove}
                                disabled={actionLoading === 'unapprove'}
                                className="h-12 px-6 bg-white border border-red-200 text-red-600 font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-red-50 disabled:opacity-50"
                            >
                                {actionLoading === 'unapprove' ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertCircle className="h-5 w-5" />}
                                Hủy Duyệt
                            </button>
                        )}
                    </div>

                    {/* Fulfillment Zone */}
                    <div className="flex gap-3">
                        {canAllocate && (
                            <button
                                onClick={handleAllocate}
                                disabled={actionLoading === 'allocate'}
                                className="flex-1 h-12 bg-yellow-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-yellow-600 disabled:opacity-50"
                            >
                                {actionLoading === 'allocate' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />}
                                Phân Bổ Tồn Kho
                            </button>
                        )}
                        {canCreateJob && (
                            <button
                                onClick={handleCreateJob}
                                disabled={actionLoading === 'job'}
                                className="flex-1 h-12 bg-orange-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-50"
                            >
                                {actionLoading === 'job' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />}
                                Tạo Job Soạn Hàng
                            </button>
                        )}
                        {canShip && (
                            <button
                                onClick={handleShip}
                                disabled={actionLoading === 'ship'}
                                className="flex-1 h-12 bg-green-600 text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
                            >
                                {actionLoading === 'ship' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
                                Xuất Kho
                            </button>
                        )}
                    </div>
                </div>
            )}


            {isShipped && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <div>
                        <div className="font-medium text-green-800">Đã xuất kho</div>
                        <div className="text-sm text-green-600">
                            {order.shipped_at && format(new Date(order.shipped_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
