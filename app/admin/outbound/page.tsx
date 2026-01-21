"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { Package, Truck, ArrowRight, Plus, Filter, RefreshCw, Upload, Download, Trash2, X, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from 'xlsx'

type OutboundOrder = {
    id: string
    code: string
    type: 'SALE' | 'TRANSFER' | 'INTERNAL' | 'GIFT'
    transfer_type: 'ITEM' | 'BOX'
    status: string
    total: number
    created_at: string
    is_approved: boolean
    customers?: { id: string; name: string } | null
    destinations?: { id: string; name: string } | null
    outbound_order_items?: any[]
}

export default function OutboundListPage() {
    const [orders, setOrders] = useState<OutboundOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState<string>('ALL')
    const [filterStatus, setFilterStatus] = useState<string>('ALL')

    // Import Excel states
    const [showImportModal, setShowImportModal] = useState(false)
    const [importData, setImportData] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

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

    // Download Excel Template
    const handleDownloadTemplate = () => {
        const template = [
            {
                'Loại': 'SALE',
                'Khách Hàng (ID hoặc Tên)': '',
                'Kho Đích (ID hoặc Tên)': '',
                'SKU': 'NL2W25-OP1-U13-SY-3M',
                'Số Lượng': 10,
                'Giá Đơn Vị': 250000,
                'Ghi Chú': ''
            },
            {
                'Loại': 'TRANSFER',
                'Khách Hàng (ID hoặc Tên)': '',
                'Kho Đích (ID hoặc Tên)': 'Cửa Hàng Hà Nội',
                'SKU': 'NB2S25-TB2-M04-OW-9M',
                'Số Lượng': 5,
                'Giá Đơn Vị': 0,
                'Ghi Chú': 'Điều chuyển nội bộ'
            }
        ]

        const ws = XLSX.utils.json_to_sheet(template)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Template')

        // Set column widths
        ws['!cols'] = [
            { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 30 }
        ]

        XLSX.writeFile(wb, 'outbound_import_template.xlsx')
        toast.success('Đã tải file mẫu!')
    }

    // Handle file upload for Import
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(worksheet)

            setImportData(jsonData)
            setShowImportModal(true)
        }
        reader.readAsArrayBuffer(file)

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // Process Import
    const handleImport = async () => {
        if (importData.length === 0) {
            toast.error('Không có dữ liệu để import')
            return
        }

        setImporting(true)

        try {
            // Group by order (same type + customer/destination = 1 order)
            const grouped: Record<string, any[]> = {}
            for (const row of importData) {
                const key = `${row['Loại']}_${row['Khách Hàng (ID hoặc Tên)'] || ''}_${row['Kho Đích (ID hoặc Tên)'] || ''}`
                if (!grouped[key]) grouped[key] = []
                grouped[key].push(row)
            }

            let successCount = 0

            for (const [key, items] of Object.entries(grouped)) {
                const firstRow = items[0]
                const orderType = firstRow['Loại'] || 'SALE'

                // Find customer/destination
                let customerId = null
                let destinationId = null

                if (orderType === 'SALE' || orderType === 'GIFT') {
                    const customerName = firstRow['Khách Hàng (ID hoặc Tên)']
                    if (customerName) {
                        const { data: customer } = await supabase
                            .from('customers')
                            .select('id')
                            .or(`id.eq.${customerName},name.ilike.%${customerName}%`)
                            .limit(1)
                            .single()
                        customerId = customer?.id
                    }
                } else {
                    const destName = firstRow['Kho Đích (ID hoặc Tên)']
                    if (destName) {
                        const { data: dest } = await supabase
                            .from('destinations')
                            .select('id')
                            .or(`id.eq.${destName},name.ilike.%${destName}%`)
                            .limit(1)
                            .single()
                        destinationId = dest?.id
                    }
                }

                // Generate code
                const { data: codeData } = await supabase.rpc('generate_outbound_code', { p_type: orderType })
                const orderCode = codeData || `ORD-${Date.now()}`

                // Build order items
                const orderItems = []
                let subtotal = 0

                for (const item of items) {
                    const sku = item['SKU']
                    const qty = Number(item['Số Lượng']) || 1
                    const price = Number(item['Giá Đơn Vị']) || 0

                    // Find product
                    const { data: product } = await supabase
                        .from('products')
                        .select('id, price')
                        .eq('sku', sku)
                        .single()

                    if (product) {
                        const unitPrice = price || product.price || 0
                        orderItems.push({
                            product_id: product.id,
                            quantity: qty,
                            unit_price: unitPrice,
                            line_total: qty * unitPrice
                        })
                        subtotal += qty * unitPrice
                    }
                }

                if (orderItems.length === 0) continue

                // Create order
                const { data: newOrder, error: orderError } = await supabase
                    .from('outbound_orders')
                    .insert({
                        code: orderCode,
                        type: orderType,
                        transfer_type: 'ITEM',
                        source: 'EXCEL',
                        customer_id: customerId,
                        destination_id: destinationId,
                        subtotal,
                        total: subtotal,
                        note: firstRow['Ghi Chú'] || null
                    })
                    .select('id')
                    .single()

                if (orderError) throw orderError

                // Create order items
                const itemsToInsert = orderItems.map(item => ({
                    order_id: newOrder.id,
                    ...item,
                    picked_quantity: 0
                }))

                await supabase.from('outbound_order_items').insert(itemsToInsert)
                successCount++
            }

            toast.success(`Import thành công ${successCount} đơn hàng!`)
            setShowImportModal(false)
            setImportData([])
            fetchOrders()
        } catch (error: any) {
            toast.error('Lỗi import: ' + error.message)
        } finally {
            setImporting(false)
        }
    }

    // Delete Order
    const handleDelete = async (order: OutboundOrder) => {
        if (!['PENDING', 'CANCELLED'].includes(order.status)) {
            toast.error('Chỉ có thể xóa đơn Chờ Xử Lý hoặc Đã Hủy')
            return
        }

        if (!confirm(`Xóa đơn ${order.code}?`)) return

        try {
            // Delete order items first
            await supabase.from('outbound_order_items').delete().eq('order_id', order.id)
            // Delete order
            const { error } = await supabase.from('outbound_orders').delete().eq('id', order.id)
            if (error) throw error

            toast.success('Đã xóa đơn!')
            fetchOrders()
        } catch (error: any) {
            toast.error('Lỗi xóa: ' + error.message)
        }
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
                        onClick={handleDownloadTemplate}
                        className="h-10 px-4 border rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm"
                        title="Tải mẫu Excel"
                    >
                        <Download className="h-4 w-4" />
                        Tải Mẫu
                    </button>
                    <label className="h-10 px-4 border rounded-lg flex items-center gap-2 hover:bg-gray-50 cursor-pointer text-sm">
                        <Upload className="h-4 w-4" />
                        Import Excel
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                    </label>
                    <button
                        onClick={fetchOrders}
                        className="h-10 px-4 border rounded-lg flex items-center gap-2 hover:bg-gray-50"
                    >
                        <RefreshCw className="h-4 w-4" />
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
                            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase w-24">Thao Tác</th>
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
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-2">
                                            <Link
                                                href={`/admin/outbound/${order.id}`}
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                <ArrowRight className="h-4 w-4" />
                                            </Link>
                                            {['PENDING', 'CANCELLED'].includes(order.status) && (
                                                <button
                                                    onClick={() => handleDelete(order)}
                                                    className="text-red-500 hover:text-red-700"
                                                    title="Xóa đơn"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                                Import Excel - Xem trước {importData.length} dòng
                            </h3>
                            <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-4 overflow-auto max-h-[50vh]">
                            <table className="w-full text-sm border">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {importData[0] && Object.keys(importData[0]).map(key => (
                                            <th key={key} className="px-3 py-2 text-left border-b font-medium">{key}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {importData.slice(0, 20).map((row, idx) => (
                                        <tr key={idx} className="border-b">
                                            {Object.values(row).map((val: any, i) => (
                                                <td key={i} className="px-3 py-2">{String(val)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {importData.length > 20 && (
                                <p className="text-sm text-gray-500 mt-2">...và {importData.length - 20} dòng nữa</p>
                            )}
                        </div>

                        <div className="p-4 border-t flex justify-end gap-3">
                            <button
                                onClick={() => setShowImportModal(false)}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={importing}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {importing ? 'Đang import...' : `Import ${importData.length} dòng`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
