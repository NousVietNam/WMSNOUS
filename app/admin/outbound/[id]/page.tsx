"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format, formatDistanceStrict } from "date-fns"
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
    inventory_type?: 'PIECE' | 'BULK'
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

    // Allocation Dialog State
    const [allocationJob, setAllocationJob] = useState<any>(null)
    const [isAllocationDialogOpen, setIsAllocationDialogOpen] = useState(false)

    // State for job info
    const [pickingTime, setPickingTime] = useState<string | null>(null)
    const [packedTime, setPackedTime] = useState<string | null>(null)

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

        // Fetch Picking Job info for Timestamps AND Allocation Details
        const { data: jobs } = await supabase
            .from('picking_jobs')
            .select(`
                created_at, 
                completed_at, 
                status,
                picking_tasks (
                    id,
                    quantity,
                    box_id,
                    location_id,
                    products (sku, name),
                    boxes (code),
                    locations (code)
                )
            `)
            .or(`order_id.eq.${id},outbound_order_id.eq.${id}`)
            .order('created_at', { ascending: false })
            .limit(1)

        if (jobs && jobs.length > 0) {
            setPickingTime(jobs[0].created_at)
            if (jobs[0].status === 'COMPLETED') {
                setPackedTime(jobs[0].completed_at)
            }
            // Store full job data for detailed view
            setAllocationJob(jobs[0])
        }

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
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Chi tiết đơn hàng")
        XLSX.writeFile(wb, `Don_Hang_${order.code}.xlsx`)
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
                body: JSON.stringify({
                    orderId: id,
                    strategy: 'MATCH_ORDER_CONTENT' // Brain Rule: Prioritize boxes with matching items
                })
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
            console.log("Deallocating order:", id)
            const res = await fetch('/api/outbound/deallocate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: id })
            })

            const data = await res.json()
            console.log("Deallocate response:", data)

            if (data.success) {
                toast.success("Đã hủy phân bổ!")
                fetchOrder()
            } else {
                toast.error("Lỗi: " + (data.error || "Không thể hủy phân bổ"))
            }
        } catch (e: any) {
            console.error("Deallocate error:", e)
            toast.error("Lỗi kết nối: " + e.message)
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
            'READY': 'bg-indigo-100 text-indigo-700 font-bold',
            'PICKING': 'bg-orange-100 text-orange-700',
            'PACKED': 'bg-blue-100 text-blue-700',
            'SHIPPED': 'bg-green-100 text-green-700',
        }
        const labels: Record<string, string> = {
            'PENDING': 'Chờ Xử Lý',
            'ALLOCATED': 'Đã Phân Bổ',
            'READY': 'Đã Tạo Job',
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
    const isAllocated = order.status === 'ALLOCATED'
    const canApprove = isPending && !order.is_approved
    const canUnapprove = isPending && order.is_approved
    const canAllocate = isPending && order.is_approved
    const canDeallocate = order.status === 'ALLOCATED'
    const canCreateJob = order.status === 'ALLOCATED'
    const canShip = ['PACKED'].includes(order.status)
    const isShipped = order.status === 'SHIPPED'
    const canEdit = (isPending || isAllocated) && !order.is_approved

    // Timeline Data Logic
    const timelineSteps = [
        {
            id: 'created',
            label: 'Đơn Hàng Mới',
            status: 'PENDING',
            isCompleted: true, // Always created
            time: order.created_at
        },
        {
            id: 'approved',
            label: 'Đã Duyệt',
            status: 'APPROVED',
            isCompleted: order.is_approved || ['ALLOCATED', 'READY', 'PICKING', 'PACKED', 'SHIPPED'].includes(order.status),
            time: order.approved_at
        },
        {
            id: 'allocated',
            label: 'Phân Bổ Tồn Kho',
            status: 'ALLOCATED',
            isCompleted: ['ALLOCATED', 'READY', 'PICKING', 'PACKED', 'SHIPPED'].includes(order.status),
            time: ['ALLOCATED', 'READY', 'PICKING', 'PACKED', 'SHIPPED'].includes(order.status) ? order.approved_at : null
        },
        {
            id: 'picking',
            label: 'Đang Soạn Hàng',
            status: 'PICKING',
            isCompleted: ['PICKING', 'PACKED', 'SHIPPED'].includes(order.status),
            time: pickingTime
        },
        {
            id: 'packed',
            label: 'Đã Đóng Gói',
            status: 'PACKED',
            isCompleted: ['PACKED', 'SHIPPED'].includes(order.status),
            time: packedTime
        },
        {
            id: 'shipped',
            label: 'Đã Xuất Kho',
            status: 'SHIPPED',
            isCompleted: order.status === 'SHIPPED',
            time: order.shipped_at
        }
    ]

    // Helper to determine active step index
    const activeStepIndex = timelineSteps.reduce((acc, step, index) => {
        if (step.isCompleted) return index
        return acc
    }, 0)

    return (
        <div className="p-6 max-w-[1400px] mx-auto min-h-screen">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/outbound" className="h-10 w-10 flex items-center justify-center rounded-lg border hover:bg-gray-50 bg-white">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        {order.code}
                        {order.is_approved && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-bold border border-green-200 rounded-full flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Đã duyệt
                            </span>
                        )}
                    </h1>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{order.type}</span>
                        <span>•</span>
                        <span>{order.transfer_type}</span>
                        <span>•</span>
                        <span className={`font-bold ${order.inventory_type === 'BULK' ? 'text-purple-600' : 'text-blue-600'}`}>
                            {order.inventory_type === 'BULK' ? 'SỈ' : 'LẺ'}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportExcel}
                        className="h-10 px-4 bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700 text-sm font-medium"
                    >
                        <FileText className="h-4 w-4" />
                        Xuất Excel
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="h-10 px-4 bg-slate-700 text-white rounded-lg flex items-center gap-2 hover:bg-slate-800 text-sm font-medium"
                    >
                        <Download className="h-4 w-4" />
                        In Phiếu
                    </button>
                    {canEdit && (
                        <Link href={`/admin/outbound/${order.id}/edit`}>
                            <button className="h-10 px-4 bg-white border rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm font-medium">
                                <Pencil className="h-4 w-4" />
                                Sửa
                            </button>
                        </Link>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* COL 1: TIMELINE */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Tiến trình đơn hàng</h3>

                    <div className="relative pl-4 space-y-8">
                        {/* Connecting Line */}
                        <div className="absolute top-2 left-[23px] bottom-2 w-0.5 bg-slate-100" />

                        {timelineSteps.map((step, index) => {
                            const isCompleted = step.isCompleted
                            const prevStep = index > 0 ? timelineSteps[index - 1] : null

                            // Calculate Duration
                            let duration = null
                            if (step.time && prevStep?.time) {
                                const start = new Date(prevStep.time)
                                const end = new Date(step.time)
                                if (end > start) {
                                    duration = formatDistanceStrict(end, start, { locale: vi })
                                }
                            }

                            return (
                                <div key={step.id} className="relative flex gap-4 min-h-[48px]">
                                    <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 ${isCompleted
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'bg-white border-slate-300 text-slate-300'
                                        }`}>
                                        {isCompleted && <CheckCircle className="w-3.5 h-3.5" />}
                                    </div>
                                    <div className="pb-2">
                                        <p className={`text-sm font-bold ${isCompleted ? 'text-slate-900' : 'text-slate-500'}`}>
                                            {step.label}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {step.time && (
                                                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                    {format(new Date(step.time), 'HH:mm dd/MM')}
                                                </span>
                                            )}
                                            {duration && (
                                                <span className="text-xs text-slate-400 italic font-mono">
                                                    (+ {duration})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* COL 2: MAIN CONTENT */}
                <div className="lg:col-span-3 space-y-6">
                    {/* INFO CARDS */}
                    {/* GENERAL INFO PANEL */}
                    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-500" />
                                Thông tin chung
                            </h3>
                            <div className="flex gap-2">
                                {(order as any).is_bonus_consideration && (
                                    <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase rounded border border-yellow-200">
                                        Xét thưởng
                                    </span>
                                )}
                                {(order as any).is_bonus_calculation && (
                                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold uppercase rounded border border-purple-200">
                                        Tính thưởng
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {/* Left Column */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Khách Hàng / Điểm Đến</label>
                                    <div className="font-medium text-slate-900 text-sm">
                                        {order.type === 'SALE' ? order.customers?.name : order.destinations?.name || '-'}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Nhân Viên Kinh Doanh</label>
                                    <div className="font-medium text-slate-900 text-sm">
                                        {order.sale_staff?.name || '-'}
                                        {order.sale_staff?.code && <span className="text-slate-400 font-normal ml-1">({order.sale_staff.code})</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Diễn Giải</label>
                                    <div className="text-slate-700 text-sm whitespace-pre-wrap">
                                        {(order as any).description || '-'}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Loại Đơn</label>
                                        <div className="text-sm font-medium">
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs border border-slate-200">
                                                {order.type}
                                            </span>
                                            {order.transfer_type && (
                                                <span className="ml-2 px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-xs border border-slate-100">
                                                    {order.transfer_type}
                                                </span>
                                            )}
                                            {order.inventory_type && (
                                                <span className={`ml-2 px-2 py-0.5 rounded text-xs border ${order.inventory_type === 'BULK'
                                                    ? 'bg-purple-50 text-purple-700 border-purple-100'
                                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                                    }`}>
                                                    {order.inventory_type === 'BULK' ? 'KHO SỈ' : 'KHO LẺ'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Trạng Thái</label>
                                        <div>{getStatusBadge(order.status)}</div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Ghi Chú</label>
                                    <div className="text-slate-700 text-sm italic bg-amber-50/50 p-2 rounded border border-amber-50/50">
                                        {order.note || 'Không có ghi chú'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Financial Footer */}
                        <div className="pt-4 border-t border-slate-50 mt-2 flex justify-end items-center gap-6">
                            <div className="text-right">
                                <span className="text-xs text-slate-500 block">Tổng số lượng</span>
                                <span className="font-medium text-slate-900">{items.reduce((s, i) => s + i.quantity, 0)}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-slate-500 block">Tổng giá trị</span>
                                <span className="text-2xl font-bold text-indigo-600">
                                    {new Intl.NumberFormat('vi-VN').format(order.total)}₫
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ACTION BAR */}
                    <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap gap-3 items-center justify-between">
                        <div className="text-sm font-medium text-slate-500">
                            Thao tác xử lý:
                        </div>
                        <div className="flex gap-2">
                            {canApprove && (
                                <button onClick={handleApprove} disabled={!!actionLoading} className="h-9 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex items-center gap-2">
                                    {actionLoading === 'approve' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Duyệt Đơn
                                </button>
                            )}
                            {canUnapprove && (
                                <button onClick={handleUnapprove} disabled={!!actionLoading} className="h-9 px-4 bg-white border text-red-600 border-red-200 rounded-lg hover:bg-red-50 font-medium text-sm flex items-center gap-2">
                                    {actionLoading === 'unapprove' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Hủy Duyệt
                                </button>
                            )}
                            {canAllocate && (
                                <button onClick={handleAllocate} disabled={!!actionLoading} className="h-9 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2">
                                    {actionLoading === 'allocate' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Phân Bổ Tồn Kho
                                </button>
                            )}
                            {canDeallocate && (
                                <button onClick={handleDeallocate} disabled={!!actionLoading} className="h-9 px-4 bg-white border text-orange-600 border-orange-200 rounded-lg hover:bg-orange-50 font-medium text-sm flex items-center gap-2">
                                    {actionLoading === 'deallocate' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Hủy Phân Bổ
                                </button>
                            )}
                            {(isAllocated || ['READY', 'PICKING', 'PACKED', 'SHIPPED'].includes(order.status)) && allocationJob && (
                                <button onClick={() => setIsAllocationDialogOpen(true)} className="h-9 px-4 bg-white border text-blue-600 border-blue-200 rounded-lg hover:bg-blue-50 font-medium text-sm flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    Xem Phân Bổ
                                </button>
                            )}
                            {canCreateJob && (
                                <button onClick={handleCreateJob} disabled={!!actionLoading} className="h-9 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm flex items-center gap-2">
                                    {actionLoading === 'job' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Tạo Job Soạn Hàng
                                </button>
                            )}
                            {canShip && (
                                <button onClick={handleShip} disabled={!!actionLoading} className="h-9 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex items-center gap-2">
                                    {actionLoading === 'ship' && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Xác Nhận Xuất Kho ({order.code})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ITEMS TABLE */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left w-12">#</th>
                                    <th className="px-4 py-3 text-left w-[120px]">Mã Thùng</th>
                                    <th className="px-4 py-3 text-left">Sản Phẩm</th>
                                    <th className="px-4 py-3 text-center w-24">SL Đặt</th>
                                    <th className="px-4 py-3 text-center w-24">Đã Soạn</th>
                                    <th className="px-4 py-3 text-right">Đơn Giá</th>
                                    <th className="px-4 py-3 text-right">Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item, idx) => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                                        <td className="px-4 py-3">
                                            {item.boxes ? (
                                                <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 border">{item.boxes.code}</span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-900">{item.products?.name}</span>
                                                <span className="text-xs text-slate-500 font-mono">{item.products?.sku}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center font-medium">{item.quantity}</td>
                                        <td className={`px-4 py-3 text-center font-bold ${item.picked_quantity >= item.quantity
                                            ? 'text-green-600'
                                            : item.picked_quantity > 0 ? 'text-orange-500' : 'text-slate-300'
                                            }`}>
                                            {item.picked_quantity}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600">
                                            {new Intl.NumberFormat('vi-VN').format(item.unit_price)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                                            {new Intl.NumberFormat('vi-VN').format(item.line_total)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50/50">
                                <tr>
                                    <td colSpan={6} className="px-4 py-3 text-right font-medium text-slate-500">Tạm tính:</td>
                                    <td className="px-4 py-3 text-right font-medium text-slate-900">{new Intl.NumberFormat('vi-VN').format(order.subtotal)}</td>
                                </tr>
                                <tr>
                                    <td colSpan={6} className="px-4 py-3 text-right font-medium text-slate-500">Chiết khấu:</td>
                                    <td className="px-4 py-3 text-right text-rose-500">
                                        {order.discount_amount > 0 ? `-${new Intl.NumberFormat('vi-VN').format(order.discount_amount)}` : '-'}
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={6} className="px-4 py-3 text-right font-bold text-slate-900 uppercase">Tổng cộng:</td>
                                    <td className="px-4 py-3 text-right font-bold text-indigo-600 text-lg">
                                        {new Intl.NumberFormat('vi-VN').format(order.total)}₫
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>

            {/* Allocation Details Dialog */}
            <Dialog open={isAllocationDialogOpen} onOpenChange={setIsAllocationDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Chi Tiết Phân Bổ Tồn Kho</DialogTitle>
                        <DialogDescription>
                            Danh sách các vị trí và thùng hàng được hệ thống chỉ định lấy hàng.
                        </DialogDescription>
                    </DialogHeader>

                    {allocationJob?.picking_tasks?.length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium text-slate-500">Sản Phẩm</th>
                                        <th className="px-4 py-3 text-center font-medium text-slate-500">SL Cần Lấy</th>
                                        <th className="px-4 py-3 text-left font-medium text-slate-500">Từ Thùng</th>
                                        <th className="px-4 py-3 text-left font-medium text-slate-500">Tại Vị Trí</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {allocationJob.picking_tasks.map((task: any) => (
                                        <tr key={task.id} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-900">{task.products?.sku}</div>
                                                <div className="text-xs text-slate-500 truncate max-w-[200px]">{task.products?.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold text-indigo-600">
                                                {task.quantity}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">
                                                <div className="flex items-center gap-2">
                                                    <Package className="w-4 h-4 text-slate-400" />
                                                    {task.boxes?.code || 'Hàng lẻ'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 font-mono text-xs">
                                                {task.locations?.code || 'N/A'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">Chưa có dữ liệu phân bổ.</div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Missing Items Dialog */}
            <Dialog open={isMissingItemsDialogOpen} onOpenChange={setIsMissingItemsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="w-5 h-5" />
                            Thiếu Tồn Kho Khả Dụng
                        </DialogTitle>
                        <DialogDescription>
                            Các sản phẩm sau không đủ tồn kho để duyệt đơn hàng này:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto">
                        {missingItems.map((item, idx) => (
                            <div key={idx} className="bg-red-50 p-3 rounded-lg border border-red-100 text-sm">
                                <div className="font-medium text-red-900">{item.product_name}</div>
                                <div className="text-xs text-red-600 font-mono mb-2">{item.sku}</div>
                                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                    <div className="bg-white p-2 rounded border border-red-100">
                                        <div className="text-gray-500">Đặt</div>
                                        <div className="font-bold text-gray-900">{item.requested}</div>
                                    </div>
                                    <div className="bg-white p-2 rounded border border-red-100">
                                        <div className="text-gray-500">Khả dụng</div>
                                        <div className="font-bold text-blue-600">{item.available}</div>
                                    </div>
                                    <div className="bg-white p-2 rounded border border-red-100">
                                        <div className="text-gray-500">Thiếu</div>
                                        <div className="font-bold text-red-600">{item.missing}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
