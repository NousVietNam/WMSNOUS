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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"

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
    sale_staff?: { id: string; name: string; code?: string } | null
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
    const [missingItems, setMissingItems] = useState<any[]>([])
    const [isMissingItemsDialogOpen, setIsMissingItemsDialogOpen] = useState(false)

    useEffect(() => {
        if (id) fetchOrder()
    }, [id])

    const fetchOrder = async () => {
        setLoading(true)

        const { data: orderData, error: orderError } = await supabase
            .from('outbound_orders')
            .select(`*, customers (id, name), destinations (id, name), sale_staff:internal_staff (id, name, code)`)
            .eq('id', id)
            .single()

        if (orderError || !orderData) {
            toast.error("Không tìm thấy đơn hàng")
            setLoading(false)
            return
        }

        const { data: itemsData } = await supabase
            .from('outbound_order_items')
            .select(`*, products (id, sku, name, barcode), boxes:from_box_id (id, code)`)
            .eq('order_id', id)

        setOrder(orderData)
        setItems(itemsData || [])
        setLoading(false)
    }

    // Export Excel
    const handleExportExcel = () => {
        if (!order) return

        let typeName = 'Đơn'
        switch (order.type) {
            case 'SALE': typeName = 'Đơn bán hàng'; break;
            case 'TRANSFER': typeName = 'Đơn điều chuyển'; break;
            case 'INTERNAL': typeName = 'Đơn xuất hàng nội bộ'; break;
            case 'GIFT': typeName = 'Đơn tặng'; break;
            default: typeName = 'Đơn xuất kho';
        }

        // 1. Prepare Header Info
        const headerInfo = [
            [typeName.toUpperCase()],
            [''],
            ['Mã phiếu:', order.code],
            ['Ngày tạo:', format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')],
            ['Loại đơn:', order.type],
            ['Khách hàng/Đích:', order.type === 'SALE' ? order.customers?.name : order.destinations?.name],
            ['Nhân viên Sale:', order.sale_staff?.name || '-'],
            ['Diễn giải:', (order as any).description || '-'],
            ['Ghi chú:', order.note || '-'],
            ['Xét thưởng:', (order as any).is_bonus_consideration ? 'Có' : 'Không'],
            ['Tính thưởng:', (order as any).is_bonus_calculation ? 'Có' : 'Không'],
            [''],
        ]

        // 2. Prepare Items Data
        const tableHeaders = ['STT', 'Mã Thùng', 'SKU', 'Barcode', 'Tên Sản Phẩm', 'Đơn Vị', 'SL Đặt', 'SL Thực Xuất', 'Đơn Giá', 'Thành Tiền']
        const tableData = items.map((item, index) => [
            index + 1,
            item.boxes?.code || '-',
            item.products?.sku || '',
            (item.products as any)?.barcode || '',
            item.products?.name || '',
            'Cái',
            item.quantity,
            item.picked_quantity,
            item.unit_price,
            item.line_total
        ])

        // 3. Prepare Footer
        const subtotalRow = ['', '', '', '', '', '', '', 'Tạm tính:', order.subtotal]
        const discountRow = ['', '', '', '', '', '', '', `Chiết khấu (${order.discount_type === 'PERCENT' ? order.discount_value + '%' : 'Tiền'}):`, order.discount_amount]
        const totalRow = ['', '', '', '', '', '', '', 'TỔNG CỘNG:', order.total]

        // Combine
        const wsData = [
            ...headerInfo,
            tableHeaders,
            ...tableData,
            ['', '', '', '', '', '', '', '', ''], // Spacer
            subtotalRow,
            discountRow,
            totalRow
        ]

        const ws = XLSX.utils.aoa_to_sheet(wsData)

        // Improved Column Widths for readability
        ws['!cols'] = [
            { wch: 6 },  // STT
            { wch: 18 }, // Mã Thùng
            { wch: 25 }, // SKU
            { wch: 18 }, // Barcode
            { wch: 50 }, // Tên Sản Phẩm (wider)
            { wch: 10 }, // Đơn Vị
            { wch: 12 }, // SL Đặt
            { wch: 14 }, // SL Thực Xuất
            { wch: 18 }, // Đơn Giá
            { wch: 20 }  // Thành Tiền
        ]

        // Styling helpers (using basic XLSX styling via cell properties if supported or standard format)
        // Since community xlsx doesn't support styles well, we rely on clean data layout.

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Chi Tiết Đơn')

        XLSX.writeFile(wb, `${typeName}_${order.code}.xlsx`)
        toast.success(`Đã xuất file Excel ${typeName}!`)
    }

    // Export PDF (Simple printable HTML)
    const handleExportPDF = () => {
        if (!order) return

        let typeName = 'ĐƠN XUẤT KHO'
        switch (order.type) {
            case 'SALE': typeName = 'ĐƠN BÁN HÀNG'; break;
            case 'TRANSFER': typeName = 'ĐƠN ĐIỀU CHUYỂN'; break;
            case 'INTERNAL': typeName = 'ĐƠN XUẤT HÀNG NỘI BỘ'; break;
            case 'GIFT': typeName = 'ĐƠN TẶNG'; break;
        }

        const destName = order.type === 'SALE' ? order.customers?.name : order.destinations?.name
        const description = (order as any).description || '-'
        const isBonusConsideration = (order as any).is_bonus_consideration ? 'Có' : 'Không'
        const isBonusCalculation = (order as any).is_bonus_calculation ? 'Có' : 'Không'

        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${typeName} - ${order.code}</title>
                <style>
                    body { font-family: 'Times New Roman', serif; padding: 0; max-width: 210mm; margin: 0 auto; font-size: 13px; color: #000; }
                    @page { size: A4 portrait; margin: 15mm 15mm 15mm 20mm; }
                    
                    h1 { text-align: center; margin-bottom: 5px; font-size: 18px; text-transform: uppercase; font-weight: bold; }
                    .sub-header { text-align: center; margin-bottom: 25px; font-style: italic; }
                    
                    .info-section { margin-bottom: 20px; }
                    .info-row { display: flex; margin-bottom: 5px; }
                    .info-label { font-weight: bold; width: 140px; }
                    .info-val { flex: 1; }

                    .three-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; border: 1px solid #000; }
                    th, td { border: 1px solid #000; padding: 6px; text-align: left; vertical-align: middle; font-size: 12px; }
                    th { font-weight: bold; text-align: center; background-color: #f5f5f5; }
                    .center { text-align: center; }
                    .right { text-align: right; }
                    
                    .total-box { margin-top: 15px; display: flex; justify-content: flex-end; }
                    .total-table { width: 300px; border: none; }
                    .total-table td { border: none; padding: 4px; }
                    .total-label { text-align: right; font-weight: bold; }
                    .total-val { text-align: right; }

                    .signatures { margin-top: 50px; display: flex; justify-content: space-between; padding: 0 20px; }
                    .sig-block { text-align: center; width: 20%; }
                    .sig-title { font-weight: bold; margin-bottom: 60px; text-transform: uppercase; font-size: 12px; }
                    
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <h1>${typeName}</h1>
                <div class="sub-header">Mã phiếu: <strong>${order.code}</strong> | Ngày: ${format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}</div>
                
                <div class="info-section">
                    <div class="three-col">
                        <div>
                            <div class="info-row"><span class="info-label">Khách hàng/Đích:</span><span class="info-val">${destName || '-'}</span></div>
                            ${order.type !== 'TRANSFER' ? `<div class="info-row"><span class="info-label">Nhân viên Sale:</span><span class="info-val">${order.sale_staff?.name || '-'}</span></div>` : ''}
                            <div class="info-row"><span class="info-label">Ghi chú:</span><span class="info-val">${order.note || '-'}</span></div>
                        </div>
                        <div>
                            <div class="info-row"><span class="info-label">Diễn giải:</span><span class="info-val">${description}</span></div>
                            ${order.type !== 'TRANSFER' ? `
                            <div class="info-row"><span class="info-label">Xét thưởng:</span><span class="info-val">${isBonusConsideration}</span></div>
                            <div class="info-row"><span class="info-label">Tính thưởng:</span><span class="info-val">${isBonusCalculation}</span></div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 30px">STT</th>
                            <th style="width: 80px">Mã Thùng</th>
                            <th style="width: 100px">SKU</th>
                            <th style="width: 90px">Barcode</th>
                            <th>Tên Sản Phẩm</th>
                            <th style="width: 40px">ĐVT</th>
                            <th style="width: 40px">SL</th>
                            <th style="width: 70px">Đơn Giá</th>
                            <th style="width: 90px">Thành Tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, idx) => `
                            <tr>
                                <td class="center">${idx + 1}</td>
                                <td class="center">${item.boxes?.code || '-'}</td>
                                <td class="center">${item.products?.sku || ''}</td>
                                <td class="center">${(item.products as any)?.barcode || ''}</td>
                                <td>${item.products?.name || ''}</td>
                                <td class="center">Cái</td>
                                <td class="center font-bold">${item.quantity}</td>
                                <td class="right">${new Intl.NumberFormat('vi-VN').format(item.unit_price)}</td>
                                <td class="right font-bold">${new Intl.NumberFormat('vi-VN').format(item.line_total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="total-box">
                    <table class="total-table">
                        <tr>
                            <td class="total-label">Tổng số lượng:</td>
                            <td class="total-val">${items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                        </tr>
                        <tr>
                            <td class="total-label">Thành tiền:</td>
                            <td class="total-val">${new Intl.NumberFormat('vi-VN').format(order.subtotal)}</td>
                        </tr>
                        ${order.type !== 'TRANSFER' ? `
                        <tr>
                            <td class="total-label">Chiết khấu (${order.discount_type === 'PERCENT' ? order.discount_value + '%' : 'Tiền'}):</td>
                            <td class="total-val">-${new Intl.NumberFormat('vi-VN').format(order.discount_amount)}</td>
                        </tr>
                        ` : ''}
                        <tr>
                            <td class="total-label" style="font-size: 14px">${order.type === 'TRANSFER' ? 'TỔNG GIÁ TRỊ' : 'TỔNG THANH TOÁN'}:</td>
                            <td class="total-val" style="font-size: 14px; font-weight: bold;">${new Intl.NumberFormat('vi-VN').format(order.total)}₫</td>
                        </tr>
                    </table>
                </div>

                <div class="signatures">
                    <div class="sig-block">
                        <div class="sig-title">Người Lập Phiếu</div>
                    </div>
                    <div class="sig-block">
                        <div class="sig-title">Thủ Kho</div>
                    </div>
                    <div class="sig-block">
                        <div class="sig-title">Người Giao Hàng</div>
                    </div>
                    <div class="sig-block">
                        <div class="sig-title">Người Nhận</div>
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
        }
        toast.success(`Đã mở ${typeName}!`)
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
                    setMissingItems(data.missing)
                    setIsMissingItemsDialogOpen(true)
                    toast.error("Không đủ tồn kho khả dụng để duyệt đơn")
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-xs text-gray-500 uppercase mb-1">Đích đến</div>
                    <div className="font-medium text-sm truncate" title={order.type === 'SALE' ? order.customers?.name : order.destinations?.name}>
                        {order.type === 'SALE' ? order.customers?.name : order.destinations?.name || 'N/A'}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{order.type}</div>
                </div>
                {order.type !== 'TRANSFER' && (
                    <div className="bg-white p-4 rounded-lg border">
                        <div className="text-xs text-gray-500 uppercase mb-1">Nhân viên Sale</div>
                        <div className="font-medium text-blue-600 text-sm">
                            {order.sale_staff ? `${order.sale_staff.name}` : '-'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{order.sale_staff?.code || ''}</div>
                    </div>
                )}
                {order.type !== 'TRANSFER' && (
                    <div className="bg-white p-4 rounded-lg border">
                        <div className="text-xs text-gray-500 uppercase mb-1">Thông tin khác</div>
                        <div className="flex flex-col gap-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Xét thưởng:</span>
                                <span className="font-medium">{(order as any).is_bonus_consideration ? 'Có' : 'Không'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Tính thưởng:</span>
                                <span className="font-medium">{(order as any).is_bonus_calculation ? 'Có' : 'Không'}</span>
                            </div>
                        </div>
                    </div>
                )}
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-xs text-gray-500 uppercase mb-1">Tổng tiền</div>
                    <div className="font-bold text-lg text-blue-600">
                        {new Intl.NumberFormat('vi-VN').format(order.total)}đ
                    </div>
                    <div className="text-xs text-gray-400 mt-1 flex justify-between">
                        <span>{format(new Date(order.created_at), 'dd/MM HH:mm', { locale: vi })}</span>
                        <span>{(order as any).created_by ? 'User' : 'System'}</span>
                    </div>
                </div>
            </div>

            {/* Description & Note */}
            <div className="grid grid-cols-2 gap-4">
                {(order as any).description && (
                    <div className="bg-white border rounded-lg p-4">
                        <div className="text-xs text-gray-500 uppercase mb-1 font-medium">Diễn giải</div>
                        <div className="text-sm text-gray-800">{(order as any).description}</div>
                    </div>
                )}
                {order.note && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="text-xs text-yellow-700 uppercase mb-1 font-medium">Ghi chú</div>
                        <div className="text-sm text-yellow-800">{order.note}</div>
                    </div>
                )}
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

            {/* Missing Items Dialog */}
            <Dialog open={isMissingItemsDialogOpen} onOpenChange={setIsMissingItemsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Không đủ tồn kho khả dụng
                        </DialogTitle>
                        <DialogDescription>
                            Đơn hàng không thể duyệt vì các mặt hàng sau không đủ số lượng trong kho.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="border rounded-lg overflow-hidden mt-4">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left">SKU</th>
                                    <th className="px-4 py-2 text-center text-blue-600">Yêu cầu</th>
                                    <th className="px-4 py-2 text-center text-green-600">Khả dụng</th>
                                    <th className="px-4 py-2 text-center text-red-600">Thiếu</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {missingItems.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2 font-mono">{item.sku}</td>
                                        <td className="px-4 py-2 text-center font-bold">{item.requested}</td>
                                        <td className="px-4 py-2 text-center">{item.available}</td>
                                        <td className="px-4 py-2 text-center text-red-600 font-bold">
                                            {item.requested - item.available}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end mt-4">
                        <button
                            onClick={() => setIsMissingItemsDialogOpen(false)}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                        >
                            Đóng
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
