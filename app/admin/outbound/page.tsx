"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { format, subDays } from "date-fns"
import { vi } from "date-fns/locale"
import { Package, Truck, Plus, Filter, RefreshCw, Upload, Download, Trash2, X, FileSpreadsheet, Search, Calendar, Layers, Box } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from 'xlsx'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
    inventory_type?: 'PIECE' | 'BULK'
}

type Customer = { id: string; name: string; code?: string }
type Destination = { id: string; name: string; code?: string }
type Staff = { id: string; name: string; code?: string }

export default function OutboundListPage() {
    const [orders, setOrders] = useState<OutboundOrder[]>([])
    const [loading, setLoading] = useState(true)

    // Filters
    const [filterInventoryType, setFilterInventoryType] = useState<string>('PIECE')
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

    // Selection states
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())

    // Pagination
    const [page, setPage] = useState(1)
    const PAGE_SIZE = 50
    const [totalCount, setTotalCount] = useState(0)

    // Debounce Search
    const [debouncedCode, setDebouncedCode] = useState('')

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedCode(filterCode)
        }, 500)
        return () => clearTimeout(timer)
    }, [filterCode])

    useEffect(() => {
        fetchDropdowns()
    }, [])

    useEffect(() => {
        setPage(1) // Reset to page 1 when filters change
        fetchOrders()
    }, [filterInventoryType, filterType, filterStatus, debouncedCode, filterDestinationId, filterDateFrom, filterDateTo])

    useEffect(() => {
        fetchOrders()
    }, [page])

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

        // Base Query
        let query = supabase
            .from('outbound_orders')
            .select(`
                *,
                customers (id, name, code),
                destinations (id, name, code),
                sale_staff:internal_staff (id, name, code),
                outbound_order_items (id, quantity),
                pick_waves (id, code, status)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })

        // Apply filters
        query = query.eq('inventory_type', filterInventoryType)
        if (filterType !== 'ALL') query = query.eq('type', filterType)
        if (filterStatus !== 'ALL') query = query.eq('status', filterStatus)
        if (debouncedCode.trim()) query = query.ilike('code', `%${debouncedCode.trim()}%`)

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

        // Pagination
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        query = query.range(from, to)

        const { data, error, count } = await query

        if (!error && data) {
            setOrders(data as any)
            setTotalCount(count || 0)
        }
        setLoading(false)
    }

    // Download Excel Template
    const handleDownloadTemplate = () => {
        const template = [

            {
                'Kho (Lẻ/Sỉ)': 'Lẻ',
                'Mã Đơn Hàng': '',
                'Loại': 'SALE',
                'Khách Hàng (Tên/Mã)': 'Khách lẻ',
                'Kho Đích (Tên/Mã)': '',
                'Nhân Viên (Tên/Mã)': 'NV001',
                'Loại Giảm Giá': 'PERCENT',
                'Giá trị GG': 10,
                'SKU': 'NL2W25-OP1-U13-SY-3M',
                'Số Lượng': 10,
                'Giá Đơn Vị': 250000,
                'Diễn Giải': 'Đơn hàng mẫu 1',
                'Ghi Chú': 'Giao trong ngày',
                'Xét Thưởng (Y/N)': 'Y',
                'Tính Thưởng (Y/N)': 'Y',
                'Hạng Sale (Normal/Promo)': 'NORMAL'
            },
            {
                'Kho (Lẻ/Sỉ)': 'Sỉ',
                'Mã Đơn Hàng': '',
                'Loại': 'TRANSFER',
                'Khách Hàng (Tên/Mã)': '',
                'Kho Đích (Tên/Mã)': 'CH-HANOI',
                'Nhân Viên (Tên/Mã)': '',
                'Loại Giảm Giá': '',
                'Giá trị GG': 0,
                'SKU': 'NB2S25-TB2-M04-OW-9M',
                'Số Lượng': 5,
                'Giá Đơn Vị': 0,
                'Diễn Giải': '',
                'Ghi Chú': 'Điều chuyển nội bộ',
                'Xét Thưởng (Y/N)': '',
                'Tính Thưởng (Y/N)': '',
                'Hạng Sale (Normal/Promo)': ''
            }
        ]


        const ws = XLSX.utils.json_to_sheet(template)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Template')

        ws['!cols'] = [
            { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
            { wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 10 },
            { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 15 }
        ]

        XLSX.writeFile(wb, 'outbound_import_template_v2.xlsx')
        toast.success('Đã tải file mẫu mới!')
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
                // Determine Key: Use 'Mã Đơn Hàng' if provided, else group by details
                let key = ''
                if (row['Mã Đơn Hàng']) {
                    key = row['Mã Đơn Hàng'].toString().trim()
                } else {
                    key = `${row['Loại']}_${row['Khách Hàng (ID hoặc Tên)'] || row['Khách Hàng (Tên/Mã)'] || ''}_${row['Kho Đích (ID hoặc Tên)'] || row['Kho Đích (Tên/Mã)'] || ''}`
                }

                if (!grouped[key]) grouped[key] = []
                grouped[key].push(row)
            }

            let successCount = 0
            const importWarnings: string[] = []

            for (const [key, items] of Object.entries(grouped)) {
                const firstRow = items[0]
                const orderType = firstRow['Loại'] || 'SALE'
                const forcedOrderCode = firstRow['Mã Đơn Hàng'] ? firstRow['Mã Đơn Hàng'].toString().trim() : null

                // Inventory Type Logic
                let inventoryType = 'PIECE'
                const rawInvType = (firstRow['Kho (Lẻ/Sỉ)'] || '').toString().trim().toUpperCase()
                if (rawInvType === 'SỈ' || rawInvType === 'BULK' || rawInvType === 'WHOLESALE') {
                    inventoryType = 'BULK'
                }

                // Map new fields
                const staffName = firstRow['Nhân Viên (Tên/Mã)']
                const discountType = firstRow['Loại Giảm Giá'] === 'FIXED' ? 'FIXED' : 'PERCENT'
                const discountValue = Number(firstRow['Giá trị GG']) || 0
                const description = firstRow['Diễn Giải']
                const isbonus = (firstRow['Xét Thưởng (Y/N)'] || '').toUpperCase() === 'Y'
                const isCalc = (firstRow['Tính Thưởng (Y/N)'] || '').toUpperCase() === 'Y'

                // Check for Discount Consistency in the whole group
                let mixedDiscount = false
                for (const item of items) {
                    const itemDiscType = item['Loại Giảm Giá'] === 'FIXED' ? 'FIXED' : 'PERCENT'
                    const itemDiscVal = Number(item['Giá trị GG']) || 0
                    if (itemDiscType !== discountType || itemDiscVal !== discountValue) {
                        mixedDiscount = true
                        break;
                    }
                }

                if (mixedDiscount) {
                    importWarnings.push(`Cảnh báo Đơn ${forcedOrderCode || key}: Các dòng hàng có mức chiết khấu khác nhau. Hệ thống sẽ lấy mức chiết khấu của dòng đầu tiên (${discountValue}${discountType === 'PERCENT' ? '%' : ''}).`)
                }

                let customerId = null
                let destinationId = null
                let saleStaffId = null

                // 4. Validate Code Exist
                if (forcedOrderCode) {
                    const { data: exist } = await supabase.from('outbound_orders').select('id').eq('code', forcedOrderCode).maybeSingle()
                    if (exist) {
                        throw new Error(`Mã đơn hàng "${forcedOrderCode}" đã tồn tại trên hệ thống!`)
                    }
                }

                // Lookup Staff
                if (staffName) {
                    const cleanStaff = staffName.toString().trim()
                    const { data: staff } = await supabase
                        .from('internal_staff')
                        .select('id')
                        .or(`id.eq.${cleanStaff},code.eq.${cleanStaff},name.ilike.%${cleanStaff}%`)
                        .limit(1)
                        .maybeSingle()
                    saleStaffId = staff?.id

                    if (!saleStaffId) {
                        importWarnings.push(`Cảnh báo nhân viên: Không tìm thấy nhân viên "${cleanStaff}" của đơn ${forcedOrderCode || key}.`)
                    }
                }

                if (orderType === 'SALE' || orderType === 'GIFT') {
                    let customerName = firstRow['Khách Hàng (Tên/Mã)'] || firstRow['Khách Hàng (ID hoặc Tên)']
                    if (customerName) {
                        const cleanName = customerName.toString().trim()

                        // Check if input is UUID
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanName)

                        let customer = null

                        if (isUUID) {
                            // If is UUID, strict check by ID
                            const { data } = await supabase
                                .from('customers')
                                .select('id, default_discount, sale_staff_id')
                                .eq('id', cleanName)
                                .maybeSingle()
                            customer = data
                        } else {
                            // If NOT UUID, check by Code or Name
                            const { data } = await supabase
                                .from('customers')
                                .select('id, default_discount, sale_staff_id')
                                .or(`code.eq.${cleanName},name.ilike.${cleanName}`)
                                .limit(1)
                                .maybeSingle()
                            customer = data
                        }

                        if (!customer) {
                            throw new Error(`Không tìm thấy khách hàng: "${customerName}"`)
                        }
                        customerId = customer.id

                        // Check Staff Mismatch Warning (Only if staff was found in file)
                        if (saleStaffId && customer.sale_staff_id && saleStaffId !== customer.sale_staff_id) {
                            // Fetch names for clearer warning? Or just warn about mismatch.
                            // We already have 'cleanStaff' from earlier block, let's use it.
                            // Need to fetch customer's staff name? Maybe too expensive. Just warn.
                            importWarnings.push(`Cảnh báo NVKD: Nhân viên trong file ("${staffName}") KHÔNG KHỚP với nhân viên phụ trách của khách hàng này.`)
                        } else if (!saleStaffId && customer.sale_staff_id) {
                            // Optionally auto-fill staff if missing in file? 
                            // User request didn't ask for auto-fill, just check mismatch.
                            // But usually if missing in file, we might want to use customer's staff.
                            // Let's just stick to "Check mismatch" for now.
                        }

                        // Check Discount Mismatch Warning

                        // Check Discount Mismatch Warning
                        if (discountType === 'PERCENT' && customer.default_discount !== undefined && customer.default_discount !== null) {
                            if (discountValue !== customer.default_discount) {
                                importWarnings.push(`Cảnh báo chiết khấu: Đơn ${forcedOrderCode || 'Mới'} của ${customerName}. Excel: ${discountValue}%, Mặc định: ${customer.default_discount}%`)
                            }
                        }
                    }
                } else {
                    let destName = firstRow['Kho Đích (Tên/Mã)'] || firstRow['Kho Đích (ID hoặc Tên)']
                    if (destName) {
                        destName = destName.toString().trim()
                        const { data: dest } = await supabase
                            .from('destinations')
                            .select('id')
                            .or(`id.eq.${destName},code.eq.${destName},name.ilike.%${destName}%`)
                            .limit(1)
                            .maybeSingle()

                        if (!dest) {
                            throw new Error(`Không tìm thấy kho đích: "${destName}"`)
                        }
                        destinationId = dest.id
                    }
                }

                // Collect Items & Check Prices
                const orderItems = []
                let subtotal = 0

                for (const item of items) {
                    const sku = item['SKU']
                    const qty = Number(item['Số Lượng']) || 1
                    const csvPrice = item['Giá Đơn Vị'] ? Number(item['Giá Đơn Vị']) : null

                    const { data: product } = await supabase
                        .from('products')
                        .select('id, price, name')
                        .eq('sku', sku)
                        .limit(1)
                        .maybeSingle()

                    if (product) {
                        // Critical Price Check
                        const masterPrice = product.price || 0
                        // If csvPrice is provided and differs from masterPrice
                        if (csvPrice !== null && csvPrice !== masterPrice) {
                            priceWarnings.push(`- SKU: ${sku} (${product.name}). Giá file: ${new Intl.NumberFormat('vi-VN').format(csvPrice)}, Giá gốc: ${new Intl.NumberFormat('vi-VN').format(masterPrice)}`)
                        }

                        // Priority: CSV Price > Master Price
                        const unitPrice = csvPrice !== null ? csvPrice : masterPrice

                        orderItems.push({
                            product_id: product.id,
                            quantity: qty,
                            unit_price: unitPrice,
                            line_total: qty * unitPrice
                        })
                        subtotal += qty * unitPrice
                    } else {
                        // Optional: Warning if product not found?
                        // For now, silently skip or we could throw error.
                    }
                }

                // If items gathered, we hold them in memory to insert later
                // BUT we need to confirm price warnings first. 
                // Since this loop processes order-by-order, we can't easily wait for confirmation mid-loop for all orders.
                // Strategy: We will check warnings for ALL orders first. If any warnings, abort and ask confirmation?
                // OR: Ask confirmation per batch.

                // Let's attach the ready-to-insert data to the grouped items to avoid re-fetching
                (items as any)._readyData = {
                    customerId, destinationId, saleStaffId,
                    discountType, discountValue, description, isBonus, isCalc,
                    orderItems, subtotal, orderCodePrefix: orderType,
                    inventoryType, forcedOrderCode // Pass forced code
                }
            }

            // CHECK WARNINGS
            if (importWarnings.length > 0) {
                const msg = `CẢNH BÁO SAI GIÁ:\n${importWarnings.join('\n')}\n\nBạn có muốn tiếp tục import với giá sai lệch này không?`
                if (!window.confirm(msg)) {
                    setImporting(false)
                    return
                }
            }

            // PROCEED TO INSERT
            for (const [key, items] of Object.entries(grouped)) {
                try {
                    const data = (items as any)._readyData
                    if (!data || data.orderItems.length === 0) continue // Skip if failed validation or no items

                    // Generate Code OR Use Forced Code
                    let orderCode = data.forcedOrderCode
                    if (!orderCode) {
                        let prefix = 'SO'
                        if (data.orderCodePrefix === 'TRANSFER') prefix = 'TO'
                        if (data.orderCodePrefix === 'INTERNAL') prefix = 'IO'
                        if (data.orderCodePrefix === 'GIFT') prefix = 'GO'

                        const { data: genCode, error: genError } = await supabase.rpc('generate_outbound_order_code', { prefix })
                        if (genError) throw genError
                        orderCode = genCode
                    }

                    // Calc Discount
                    let discountAmount = 0
                    if (data.discountType === 'PERCENT') {
                        discountAmount = data.subtotal * (data.discountValue / 100)
                    } else {
                        discountAmount = data.discountValue
                    }
                    const total = Math.max(0, data.subtotal - discountAmount)

                    const { data: newOrder, error: orderError } = await supabase
                        .from('outbound_orders')
                        .insert({
                            code: orderCode,
                            type: items[0]['Loại'] || 'SALE',
                            transfer_type: 'ITEM',
                            source: 'EXCEL',
                            customer_id: data.customerId,
                            destination_id: data.destinationId,
                            sale_staff_id: data.saleStaffId,
                            discount_type: data.discountType,
                            discount_value: data.discountValue,
                            discount_amount: discountAmount,
                            subtotal: data.subtotal,
                            total,
                            description: data.description || null,
                            note: items[0]['Ghi Chú'] || null,
                            is_bonus_consideration: data.isBonus,
                            is_bonus_calculation: data.isCalc,
                            inventory_type: data.inventoryType
                        })
                        .select('id')
                        .single()

                    if (orderError) throw orderError

                    const itemsToInsert = data.orderItems.map((item: any) => ({
                        order_id: newOrder.id,
                        ...item,
                        picked_quantity: 0
                    }))

                    await supabase.from('outbound_order_items').insert(itemsToInsert)
                    successCount++
                } catch (batchError: any) {
                    toast.error(`Lỗi xử lý đơn hàng "${key}": ${batchError.message}`)
                    // Optionally, you might want to continue processing other batches or stop.
                    // For now, we'll just log the error and continue.
                }
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

    // Selection handlers
    const toggleSelectAll = () => {
        if (selectedOrderIds.size === orders.length) {
            setSelectedOrderIds(new Set())
        } else {
            setSelectedOrderIds(new Set(orders.map(o => o.id)))
        }
    }

    const toggleSelectOrder = (id: string) => {
        const next = new Set(selectedOrderIds)
        if (next.has(id)) {
            next.delete(id)
        } else {
            next.add(id)
        }
        setSelectedOrderIds(next)
    }

    // Export Detailed Excel
    const handleExportDetails = async () => {
        if (selectedOrderIds.size === 0) {
            toast.error('Vui lòng chọn ít nhất 1 đơn hàng để xuất')
            return
        }

        setLoading(true)
        try {
            // Fetch detailed items for all selected orders
            const { data: details, error } = await supabase
                .from('outbound_order_items')
                .select(`
                    id,
                    order_id,
                    product_id,
                    quantity,
                    unit_price,
                    line_total,
                    picked_quantity,
                    products (sku, name),
                    outbound_orders!inner (
                        code,
                        type,
                        transfer_type,
                        status,
                        created_at,
                        customers (name),
                        destinations (name),
                        boxes (code),
                        pick_waves (code)
                    )
                `)
                .in('order_id', Array.from(selectedOrderIds))

            if (error) throw error
            if (!details || details.length === 0) {
                toast.error('Không tìm thấy chi tiết đơn hàng')
                return
            }

            // Group by order to create a nice structure or just a flat list
            const exportData = details.map(item => {
                const order = item.outbound_orders as any
                const product = Array.isArray(item.products) ? item.products[0] : item.products as any
                const boxes = order.boxes || []
                const boxCodes = Array.isArray(boxes) ? boxes.map((b: any) => b.code).join(', ') : ''

                return {
                    'Mã Đơn': order.code,
                    'Wave': order.pick_waves?.code || '',
                    'Loại': order.type,
                    'HT Xuất': order.transfer_type === 'BOX' ? 'Theo Thùng' : 'Sản phẩm',
                    'Mã Thùng': boxCodes,
                    'Trạng Thái': order.status,
                    'Ngày Tạo': format(new Date(order.created_at), 'dd/MM/yyyy HH:mm'),
                    'Khách Hàng/Đích': order.type === 'SALE' ? order.customers?.name : order.destinations?.name,
                    'SKU': product?.sku,
                    'Sản Phẩm': product?.name,
                    'Số Lượng': item.quantity,
                    'Đã Soạn': item.picked_quantity,
                    'Đơn Giá': item.unit_price,
                    'Thành Tiền': item.line_total
                }
            })

            const ws = XLSX.utils.json_to_sheet(exportData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Chi Tiết Đơn Hàng')

            // Set column widths
            ws['!cols'] = [
                { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 25 },
                { wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 15 }
            ]

            XLSX.writeFile(wb, `chi_tiet_xuat_kho_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
            toast.success('Đã xuất file excel chi tiết!')
        } catch (error: any) {
            toast.error('Lỗi khi xuất file: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    // Delete Order
    const handleDelete = async (order: OutboundOrder) => {
        if (order.is_approved) {
            toast.error('Không thể xóa đơn đã duyệt')
            return
        }
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
            'READY': 'bg-indigo-100 text-indigo-700 font-bold',
            'PICKING': 'bg-orange-100 text-orange-700',
            'PACKED': 'bg-blue-600 text-white font-bold',
            'SHIPPED': 'bg-green-600 text-white font-bold',
            'COMPLETED': 'bg-green-200 text-green-800',
            'CANCELLED': 'bg-red-100 text-red-700'
        }
        const labels: Record<string, string> = {
            'PENDING': 'Chờ Xử Lý',
            'ALLOCATED': 'Đã Phân Bổ',
            'READY': 'Đã Tạo Job',
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
                    {selectedOrderIds.size > 0 && (
                        <button
                            onClick={handleExportDetails}
                            className="h-10 px-4 bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700 animate-in fade-in zoom-in duration-200"
                        >
                            <FileSpreadsheet className="h-4 w-4" />
                            Xuất Chi Tiết ({selectedOrderIds.size})
                        </button>
                    )}
                </div>
            </div>

            {/* Inventory Type Tabs */}
            <Tabs value={filterInventoryType} onValueChange={(val) => setFilterInventoryType(val)} className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="PIECE" className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Đơn Lẻ (Retail)
                    </TabsTrigger>
                    <TabsTrigger value="BULK" className="flex items-center gap-2">
                        <Box className="h-4 w-4" />
                        Đơn Sỉ (Bulk)
                    </TabsTrigger>
                </TabsList>
            </Tabs>

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
                        <option value="READY">Đã Tạo Job</option>
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

                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-gray-200">
                            <th colSpan={filterInventoryType === 'BULK' ? 9 : 8} className="px-3 py-2 text-right text-gray-400 font-bold uppercase text-[10px]">Tổng cộng bộ lọc:</th>
                            <th className="px-3 py-2 text-center font-black text-indigo-600 bg-indigo-50/30">
                                {orders.reduce((sum, o) => sum + getItemCount(o), 0).toLocaleString()}
                            </th>
                            <th className="px-3 py-2 text-right font-black text-slate-700 bg-slate-50/50">
                                {orders.reduce((sum, o) => sum + (o.subtotal || 0), 0).toLocaleString()}
                            </th>
                            <th className="px-3 py-2 text-right font-black text-rose-600 bg-rose-50/30">
                                -{orders.reduce((sum, o) => sum + (o.discount_amount || 0), 0).toLocaleString()}
                            </th>
                            <th className="px-3 py-2 text-right font-black text-blue-700 bg-blue-50/30">
                                {orders.reduce((sum, o) => sum + (o.total || 0), 0).toLocaleString()}đ
                            </th>
                            <th colSpan={4}></th>
                        </tr>
                    </thead>
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="px-3 py-3 w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300"
                                    checked={orders.length > 0 && selectedOrderIds.size === orders.length}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Mã Đơn</th>
                            {filterInventoryType === 'BULK' && <th className="text-left px-3 py-3 text-xs font-bold text-indigo-600 uppercase">Wave</th>}
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
                                <td colSpan={16} className="text-center py-8 text-gray-500">Đang tải...</td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={16} className="text-center py-8 text-gray-500">Không có dữ liệu</td>
                            </tr>
                        ) : (
                            orders.map(order => (
                                <tr key={order.id} className={`hover:bg-gray-50 ${selectedOrderIds.has(order.id) ? 'bg-blue-50/50' : ''}`}>
                                    <td className="px-3 py-2 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300"
                                            checked={selectedOrderIds.has(order.id)}
                                            onChange={() => toggleSelectOrder(order.id)}
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <Link href={`/admin/outbound/${order.id}`} className="font-mono font-bold text-blue-600 hover:underline">
                                            {order.code}
                                        </Link>
                                        <div className="text-xs text-gray-400">{order.transfer_type}</div>
                                    </td>
                                    {filterInventoryType === 'BULK' && (
                                        <td className="px-3 py-2">
                                            {(order as any).pick_waves ? (
                                                <Link href={`/admin/waves/${(order as any).pick_waves.id}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700 hover:bg-purple-200">
                                                    {(order as any).pick_waves.code}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-300 text-xs italic">Chưa gom</span>
                                            )}
                                        </td>
                                    )}
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
                                            {!order.is_approved && ['PENDING', 'CANCELLED'].includes(order.status) && (
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

            {/* Pagination */}
            <div className="flex items-center justify-between bg-white p-4 border rounded-lg shadow-sm">
                <div className="text-sm text-gray-500 font-medium">
                    Hiển thị <span className="text-gray-900 font-bold">{Math.min((page - 1) * PAGE_SIZE + 1, totalCount)}</span> đến <span className="text-gray-900 font-bold">{Math.min(page * PAGE_SIZE, totalCount)}</span> của <span className="text-indigo-600 font-bold">{totalCount}</span> đơn hàng
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="h-9 px-3 border rounded-lg flex items-center gap-1 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                    >
                        ← Trước
                    </button>
                    <div className="h-9 px-3 border rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm min-w-[3rem]">
                        {page}
                    </div>
                    <button
                        onClick={() => setPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))}
                        disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                        className="h-9 px-3 border rounded-lg flex items-center gap-1 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                    >
                        Sau →
                    </button>
                </div>
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
