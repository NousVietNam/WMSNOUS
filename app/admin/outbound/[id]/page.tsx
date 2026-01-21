"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { ArrowLeft, Package, Truck, CheckCircle, AlertCircle, Loader2, FileText, Download, Pencil, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from 'xlsx'

type OutboundOrder = {
    id: string
    code: string
    type: 'SALE' | 'TRANSFER' | 'INTERNAL' | 'GIFT'
    transfer_type: 'ITEM' | 'BOX'
    status: string
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

    // Export Excel
    const handleExportExcel = () => {
        if (!order) return

        const data = items.map(item => ({
            'SKU': item.products?.sku || '',
            'Tên Sản Phẩm': item.products?.name || '',
            'SL Đặt': item.quantity,
            'SL Đã Lấy': item.picked_quantity,
            'Đơn Giá': item.unit_price,
            'Thành Tiền': item.line_total,
            'Thùng': item.boxes?.code || ''
        }))

        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Chi Tiết Đơn')

        XLSX.writeFile(wb, `${order.code}_chitiet.xlsx`)
        toast.success('Đã xuất file Excel!')
    }

    // Export PDF (Simple printable HTML)
    const handleExportPDF = () => {
        if (!order) return

        const destName = order.type === 'SALE' ? order.customers?.name : order.destinations?.name
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Phiếu Xuất Kho - ${order.code}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                    h1 { text-align: center; margin-bottom: 10px; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 20px; background: #f5f5f5; border-radius: 8px; }
                    .info { margin-bottom: 20px; }
                    .info-row { display: flex; margin-bottom: 8px; }
                    .info-label { width: 120px; font-weight: bold; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; }
                    th { background: #f0f0f0; font-weight: bold; }
                    .right { text-align: right; }
                    .center { text-align: center; }
                    .total-row { font-weight: bold; background: #f9f9f9; }
                    .footer { margin-top: 40px; display: flex; justify-content: space-between; }
                    .signature { width: 200px; text-align: center; }
                    .signature-line { border-top: 1px solid #000; margin-top: 60px; padding-top: 8px; }
                    @media print { body { padding: 20px; } }
                </style>
            </head>
            <body>
                <h1>PHIẾU XUẤT KHO</h1>
                <p style="text-align: center; color: #666; margin-bottom: 30px;">Mã: <strong>${order.code}</strong></p>
                
                <div class="info">
                    <div class="info-row"><div class="info-label">Loại đơn:</div><div>${order.type}</div></div>
                    <div class="info-row"><div class="info-label">Đích đến:</div><div>${destName || 'N/A'}</div></div>
                    <div class="info-row"><div class="info-label">Ngày tạo:</div><div>${format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}</div></div>
                    ${order.shipped_at ? `<div class="info-row"><div class="info-label">Ngày xuất:</div><div>${format(new Date(order.shipped_at), 'dd/MM/yyyy HH:mm')}</div></div>` : ''}
                    ${order.note ? `<div class="info-row"><div class="info-label">Ghi chú:</div><div>${order.note}</div></div>` : ''}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>SKU</th>
                            <th>Tên Sản Phẩm</th>
                            <th class="center">SL</th>
                            <th class="right">Đơn Giá</th>
                            <th class="right">Thành Tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, idx) => `
                            <tr>
                                <td class="center">${idx + 1}</td>
                                <td>${item.products?.sku || ''}</td>
                                <td>${item.products?.name || ''}</td>
                                <td class="center">${item.quantity}</td>
                                <td class="right">${new Intl.NumberFormat('vi-VN').format(item.unit_price)}đ</td>
                                <td class="right">${new Intl.NumberFormat('vi-VN').format(item.line_total)}đ</td>
                            </tr>
                        `).join('')}
                        <tr class="total-row">
                            <td colspan="3" class="right">Tổng cộng:</td>
                            <td class="center">${items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                            <td></td>
                            <td class="right">${new Intl.NumberFormat('vi-VN').format(order.total)}đ</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer">
                    <div class="signature">
                        <div>Người giao</div>
                        <div class="signature-line">(Ký, ghi rõ họ tên)</div>
                    </div>
                    <div class="signature">
                        <div>Người nhận</div>
                        <div class="signature-line">(Ký, ghi rõ họ tên)</div>
                    </div>
                </div>
            </body>
            </html>
        `

        const printWindow = window.open('', '_blank')
        if (printWindow) {
            printWindow.document.write(printContent)
            printWindow.document.close()
            printWindow.focus()
            setTimeout(() => printWindow.print(), 250)
        }
        toast.success('Đã mở phiếu xuất kho!')
    }

    // Action Handlers
    const handleApprove = async () => {
        setActionLoading('approve')
        try {
            const res = await fetch('/api/outbound/approve', {
                method: 'POST',
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Đã duyệt đơn hàng!")
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

    // NEW: Deallocate
    const handleDeallocate = async () => {
        if (!confirm("Hủy phân bổ? Tồn kho sẽ được trả lại.")) return

        setActionLoading('deallocate')
        try {
            const res = await fetch('/api/outbound/deallocate', {
                method: 'POST',
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Đã hủy phân bổ!")
                fetchOrder()
            } else {
                toast.error(data.error || "Lỗi hủy phân bổ")
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
        const labels: Record<string, string> = {
            'PENDING': 'Chờ Xử Lý',
            'ALLOCATED': 'Đã Phân Bổ',
            'PICKING': 'Đang Soạn',
            'PACKED': 'Đã Đóng Gói',
            'SHIPPED': 'Đã Xuất',
        }
        return <span className={`px-3 py-1 text-sm font-medium rounded ${styles[status] || 'bg-gray-100'}`}>{labels[status] || status}</span>
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
    const canAllocate = isPending && order.is_approved
    const canDeallocate = order.status === 'ALLOCATED'
    const canCreateJob = order.status === 'ALLOCATED'
    const canShip = ['ALLOCATED', 'PICKING', 'PACKED'].includes(order.status)
    const isShipped = order.status === 'SHIPPED'
    const canEdit = isPending && !order.is_approved

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

                {/* Export Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={handleExportExcel}
                        className="h-9 px-3 border rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm"
                        title="Xuất Excel"
                    >
                        <Download className="h-4 w-4" />
                        Excel
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="h-9 px-3 border rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm"
                        title="In phiếu xuất kho"
                    >
                        <FileText className="h-4 w-4" />
                        PDF
                    </button>
                    {canEdit && (
                        <Link
                            href={`/admin/outbound/${id}/edit`}
                            className="h-9 px-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg flex items-center gap-2 hover:bg-blue-100 text-sm"
                        >
                            <Pencil className="h-4 w-4" />
                            Sửa
                        </Link>
                    )}
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

            {/* Note */}
            {order.note && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-xs text-yellow-700 uppercase mb-1 font-medium">Ghi chú</div>
                    <div className="text-sm text-yellow-800">{order.note}</div>
                </div>
            )}

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
                        {canDeallocate && (
                            <button
                                onClick={handleDeallocate}
                                disabled={actionLoading === 'deallocate'}
                                className="h-12 px-6 bg-white border border-orange-200 text-orange-600 font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-orange-50 disabled:opacity-50"
                            >
                                {actionLoading === 'deallocate' ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
                                Hủy Phân Bổ
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
