"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format, subDays } from "date-fns"
import { vi } from "date-fns/locale"
import { Package, Truck, Plus, Filter, RefreshCw, Upload, Download, Trash2, X, FileSpreadsheet, Search, Calendar } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from 'xlsx'

type OutboundOrder = {
    id: string
    code: string
    type: 'SALE' | 'TRANSFER' | 'INTERNAL' | 'GIFT'
    transfer_type: 'ITEM' | 'BOX'
    status: string
    subtotal: number
    discount_type: string | null
    discount_value: number
    discount_amount: number
    total: number
    description: string | null
    note: string | null
    created_at: string
    is_approved: boolean
    customers?: { id: string; name: string; code?: string } | null
    destinations?: { id: string; name: string; code?: string } | null
    sale_staff?: { id: string; name: string; code?: string } | null
    outbound_order_items?: any[]
}

type Customer = { id: string; name: string; code?: string }
type Destination = { id: string; name: string; code?: string }
type Staff = { id: string; name: string; code?: string }

export default function OutboundListPage() {
    const [orders, setOrders] = useState<OutboundOrder[]>([])
    const [loading, setLoading] = useState(true)

    // Filters
    const [filterType, setFilterType] = useState<string>('ALL')
    const [filterStatus, setFilterStatus] = useState<string>('ALL')
    const [filterCode, setFilterCode] = useState<string>('')
    const [filterDestinationId, setFilterDestinationId] = useState<string>('ALL')
    const [filterDateFrom, setFilterDateFrom] = useState<string>(format(subDays(new Date(), 10), 'yyyy-MM-dd'))
    const [filterDateTo, setFilterDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))

    // Dropdown data
    const [customers, setCustomers] = useState<Customer[]>([])
    const [destinations, setDestinations] = useState<Destination[]>([])
    const [staffList, setStaffList] = useState<Staff[]>([])

    // Import Excel states
    const [showImportModal, setShowImportModal] = useState(false)
    const [importData, setImportData] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetchDropdowns()
    }, [])

    useEffect(() => {
        fetchOrders()
    }, [filterType, filterStatus, filterCode, filterDestinationId, filterDateFrom, filterDateTo])

    // Reset destination filter when type changes
    useEffect(() => {
        setFilterDestinationId('ALL')
    }, [filterType])

    const fetchDropdowns = async () => {
        const [cusRes, destRes, staffRes] = await Promise.all([
            supabase.from('customers').select('id, name, code').order('name').limit(500),
            supabase.from('destinations').select('id, name, code').order('name').limit(500),
            supabase.from('internal_staff').select('id, name, code').order('name').limit(500)
        ])
        setCustomers(cusRes.data || [])
        setDestinations(destRes.data || [])
        setStaffList(staffRes.data || [])
    }

    const fetchOrders = async () => {
        setLoading(true)

        let query = supabase
            .from('outbound_orders')
            .select(`
                *,
                customers (id, name, code),
                destinations (id, name, code),
                sale_staff:internal_staff (id, name, code),
                outbound_order_items (id, quantity)
            `)
            .order('created_at', { ascending: false })
            .limit(200)

        // Apply filters
        if (filterType !== 'ALL') query = query.eq('type', filterType)
        if (filterStatus !== 'ALL') query = query.eq('status', filterStatus)
        if (filterCode.trim()) query = query.ilike('code', `%${filterCode.trim()}%`)

        // Destination filter (customer or destination based on type)
        if (filterDestinationId !== 'ALL') {
            if (filterType === 'SALE' || filterType === 'GIFT') {
                query = query.eq('customer_id', filterDestinationId)
            } else if (filterType === 'TRANSFER' || filterType === 'INTERNAL') {
                query = query.eq('destination_id', filterDestinationId)
            }
        }

        // Date range filters
        if (filterDateFrom) {
            query = query.gte('created_at', `${filterDateFrom}T00:00:00`)
        }
        if (filterDateTo) {
            query = query.lte('created_at', `${filterDateTo}T23:59:59`)
        }

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

                const { data: codeData } = await supabase.rpc('generate_outbound_code', { p_type: orderType })
                const orderCode = codeData || `ORD-${Date.now()}`

                const orderItems = []
                let subtotal = 0

                for (const item of items) {
                    const sku = item['SKU']
                    const qty = Number(item['Số Lượng']) || 1
                    const price = Number(item['Giá Đơn Vị']) || 0

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
            await supabase.from('outbound_order_items').delete().eq('order_id', order.id)
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

    const getItemCount = (order: OutboundOrder) => {
        return order.outbound_order_items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
    }

    // Get destination options based on order type filter
    const getDestinationOptions = () => {
        if (filterType === 'SALE' || filterType === 'GIFT') {
            return customers.map(c => ({ id: c.id, name: c.name, code: c.code }))
        } else if (filterType === 'TRANSFER' || filterType === 'INTERNAL') {
            return destinations.map(d => ({ id: d.id, name: d.name, code: d.code }))
        }
        // For ALL type, combine customers and destinations
        return [
            ...customers.map(c => ({ id: c.id, name: `[KH] ${c.name}`, code: c.code })),
            ...destinations.map(d => ({ id: d.id, name: `[CH] ${d.name}`, code: d.code }))
        ]
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

            {/* Filters - Single Horizontal Row */}
            <div className="bg-white p-4 rounded-lg border">
                <div className="flex gap-3 items-center flex-wrap">
                    <Filter className="h-4 w-4 text-gray-400 shrink-0" />

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

                    <select
                        value={filterDestinationId}
                        onChange={(e) => setFilterDestinationId(e.target.value)}
                        className="h-9 px-3 border rounded-lg text-sm min-w-[160px]"
                    >
                        <option value="ALL">Tất cả đích đến</option>
                        {getDestinationOptions().map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                    </select>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm mã đơn..."
                            value={filterCode}
                            onChange={(e) => setFilterCode(e.target.value)}
                            className="h-9 pl-9 pr-3 border rounded-lg text-sm w-[140px]"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <input
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                            className="h-9 px-2 border rounded-lg text-sm w-[130px]"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                            type="date"
                            value={filterDateTo}
                            onChange={(e) => setFilterDateTo(e.target.value)}
                            className="h-9 px-2 border rounded-lg text-sm w-[130px]"
                        />
                    </div>

                    <span className="text-sm text-gray-500 ml-auto">
                        {orders.length} đơn
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Mã Đơn</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Loại</th>
                            <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Trạng Thái</th>
                            <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Duyệt</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Mã KH/Đích</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Đích</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Sale</th>
                            <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">SL</th>
                            <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Trước CK</th>
                            <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Chiết khấu</th>
                            <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Sau CK</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase max-w-[120px]">Diễn giải</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase max-w-[120px]">Ghi chú</th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Ngày Tạo</th>
                            <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase w-16"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr>
                                <td colSpan={15} className="text-center py-8 text-gray-500">Đang tải...</td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={15} className="text-center py-8 text-gray-500">Không có dữ liệu</td>
                            </tr>
                        ) : (
                            orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                        <Link href={`/admin/outbound/${order.id}`} className="font-mono font-bold text-blue-600 hover:underline">
                                            {order.code}
                                        </Link>
                                        <div className="text-xs text-gray-400">{order.transfer_type}</div>
                                    </td>
                                    <td className="px-3 py-2">{getTypeBadge(order.type)}</td>
                                    <td className="px-3 py-2 text-center">{getStatusBadge(order.status)}</td>
                                    <td className="px-3 py-2 text-center">
                                        {order.is_approved ? (
                                            <span className="px-2 py-0.5 text-xs font-bold rounded bg-green-100 text-green-700 border border-green-200">Đã duyệt</span>
                                        ) : (
                                            <span className="px-2 py-0.5 text-xs font-bold rounded bg-gray-100 text-gray-500 border border-gray-200">Chưa duyệt</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500">
                                        {order.type === 'SALE' || order.type === 'GIFT'
                                            ? order.customers?.code || '-'
                                            : order.destinations?.code || '-'}
                                    </td>
                                    <td className="px-3 py-2 text-sm truncate max-w-[150px]" title={order.type === 'SALE' ? order.customers?.name : order.destinations?.name}>
                                        {order.type === 'SALE' || order.type === 'GIFT'
                                            ? order.customers?.name
                                            : order.destinations?.name || '-'}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-gray-500">
                                        {order.sale_staff ? order.sale_staff.name : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-center font-medium">{getItemCount(order)}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">
                                        {order.subtotal > 0 ? new Intl.NumberFormat('vi-VN').format(order.subtotal) : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right text-red-500">
                                        {order.discount_amount > 0 ? `-${new Intl.NumberFormat('vi-VN').format(order.discount_amount)}` : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-blue-600">
                                        {order.total > 0 ? new Intl.NumberFormat('vi-VN').format(order.total) + 'đ' : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[120px]" title={order.description || ''}>
                                        {order.description || '-'}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[120px]" title={order.note || ''}>
                                        {order.note || '-'}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500">
                                        {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-center">
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
