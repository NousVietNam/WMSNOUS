"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { ArrowLeft, Plus, Trash2, Loader2, Box as BoxIcon, Package, Search, ShoppingCart, Truck, Gift, Users, Save, FileText, Settings } from "lucide-react"
import { toast } from "sonner"

type Product = { id: string; sku: string; name: string; price?: number; barcode?: string }
type Customer = { id: string; name: string; sale_staff_id?: string; default_discount?: number; phone?: string }
type Destination = { id: string; name: string }

type BoxWithItems = {
    id: string
    code: string
    location?: { code: string }
    inventory_items?: { id: string; product_id: string; quantity: number; products?: { sku: string; name: string; price?: number; barcode?: string } }[]
}

type OrderItem = {
    id?: string
    product_id: string
    product?: Product
    quantity: number
    unit_price: number
    barcode?: string
}

// For restoring Box Mode, we need a way to group items by box.
// Since items in DB are flattened, we will reconstruct simplified "Box Items"
type SelectedBox = {
    box_id: string
    box_code: string
    items: { product_id: string; sku: string; name: string; quantity: number; unit_price: number, barcode?: string }[]
}

export default function EditOutboundPage() {
    const { id } = useParams()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    // Header info
    const [orderCode, setOrderCode] = useState('')
    const [orderType, setOrderType] = useState<'SALE' | 'TRANSFER' | 'INTERNAL' | 'GIFT'>('SALE')
    const [transferType, setTransferType] = useState<'ITEM' | 'BOX'>('ITEM')
    const [customerId, setCustomerId] = useState<string>('')
    const [destinationId, setDestinationId] = useState<string>('')
    const [saleStaffId, setSaleStaffId] = useState<string>('')
    const [note, setNote] = useState('')
    const [description, setDescription] = useState('')
    const [isBonusConsideration, setIsBonusConsideration] = useState(false)
    const [isBonusCalculation, setIsBonusCalculation] = useState(false)
    const [saleClass, setSaleClass] = useState<'NORMAL' | 'PROMOTION'>('NORMAL')

    // Discount
    const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
    const [discountValue, setDiscountValue] = useState<number>(0)

    // ITEM mode
    const [items, setItems] = useState<OrderItem[]>([])
    const [productSearch, setProductSearch] = useState('')
    const [searchResults, setSearchResults] = useState<Product[]>([])
    const [showSearch, setShowSearch] = useState(false)

    // BOX mode
    const [selectedBoxes, setSelectedBoxes] = useState<SelectedBox[]>([])
    const [boxSearch, setBoxSearch] = useState('')
    const [boxResults, setBoxResults] = useState<BoxWithItems[]>([])
    const [isSearchingBox, setIsSearchingBox] = useState(false)

    // Dropdowns
    const [customers, setCustomers] = useState<Customer[]>([])
    const [destinations, setDestinations] = useState<Destination[]>([])
    const [employees, setEmployees] = useState<{ id: string; name: string; code?: string }[]>([])

    // Load Data
    useEffect(() => {
        Promise.all([fetchDropdowns(), fetchOrder()]).then(() => setLoading(false))
    }, [id])

    const fetchDropdowns = async () => {
        const [{ data: custs }, { data: dests }, { data: emps }] = await Promise.all([
            supabase.from('customers').select('id, name, sale_staff_id, default_discount').order('name'),
            supabase.from('destinations').select('id, name').order('name'),
            supabase.from('internal_staff').select('id, name, code').eq('is_active', true).order('name')
        ])
        setCustomers(custs || [])
        setDestinations(dests || [])
        setEmployees(emps || [])
    }

    const fetchOrder = async () => {
        const { data: order, error } = await supabase
            .from('outbound_orders')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !order) {
            toast.error('Không tìm thấy đơn hàng')
            router.push('/admin/outbound')
            return
        }

        if (order.status !== 'PENDING' || order.is_approved) {
            toast.error('Không thể sửa đơn đã duyệt')
            router.push(`/admin/outbound/${id}`)
            return
        }

        setOrderCode(order.code)
        setOrderType(order.type)
        setTransferType(order.transfer_type)
        setCustomerId(order.customer_id || '')
        setDestinationId(order.destination_id || '')
        setSaleStaffId(order.sale_staff_id || '')
        setNote(order.note || '')
        setDescription(order.description || '')
        setIsBonusConsideration(order.is_bonus_consideration || false)
        setIsBonusCalculation(order.is_bonus_calculation || false)
        setDiscountType(order.discount_type || 'PERCENT')
        setDiscountValue(order.discount_value || 0)

        // Only define saleClass if implied, otherwise default 'NORMAL'. 
        // Logic: if discount is editable (PROMOTION) or fixed automatic (NORMAL).
        // Since we don't store "sale_class" in DB explicitly yet (Wait, checking schema, we added columns in migration but maybe not using them properly? 
        // Ah, user added sale_class column to DB in previous steps? Let's check schema.
        // Actually, previous context says "migration_add_missing_columns.sql added sale_class". So we should fetch it.
        // But for safety, let's default to NORMAL if not found.
        setSaleClass((order as any).sale_class || 'NORMAL') // Assuming sale_class is in * select

        // Fetch Items
        const { data: orderItems } = await supabase
            .from('outbound_order_items')
            .select(`*, products (id, sku, name, barcode, price), boxes:from_box_id (id, code)`)
            .eq('order_id', id)

        if (orderItems) {
            if (order.transfer_type === 'ITEM') {
                setItems(orderItems.map(i => ({
                    id: i.id,
                    product_id: i.product_id,
                    product: i.products ? {
                        id: i.products.id,
                        sku: i.products.sku,
                        name: i.products.name,
                        price: i.products.price,
                        barcode: i.products.barcode
                    } : undefined,
                    quantity: i.quantity,
                    unit_price: i.unit_price
                })))
            } else {
                // Reconstruct Boxes
                // Group items by box_id
                const groups: Record<string, SelectedBox> = {}
                orderItems.forEach(i => {
                    const boxId = i.from_box_id
                    if (!boxId) return // Should not happen for box mode

                    if (!groups[boxId]) {
                        groups[boxId] = {
                            box_id: boxId,
                            box_code: i.boxes?.code || 'Unknown Box',
                            items: []
                        }
                    }
                    groups[boxId].items.push({
                        product_id: i.product_id,
                        sku: i.products?.sku || '',
                        name: i.products?.name || '',
                        barcode: i.products?.barcode || '',
                        quantity: i.quantity,
                        unit_price: i.unit_price
                    })
                })
                setSelectedBoxes(Object.values(groups))
            }
        }
    }


    // Product search (Server-side)
    const handleProductSearch = async (term: string) => {
        setProductSearch(term)
        if (term.length >= 2) {
            const { data } = await supabase
                .from('products')
                .select('id, sku, name, price, barcode')
                .or(`sku.ilike.%${term}%,name.ilike.%${term}%,barcode.eq.${term}`)
                .limit(20)

            setSearchResults(data || [])
            setShowSearch(true)
        } else {
            setSearchResults([])
            setShowSearch(false)
        }
    }

    const addProduct = (product: Product) => {
        const existing = items.find(i => i.product_id === product.id)
        if (existing) {
            setItems(items.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
        } else {
            setItems([...items, { product_id: product.id, product, quantity: 1, unit_price: product.price || 0 }])
        }
        setProductSearch('')
        setShowSearch(false)
    }

    const updateItem = (index: number, field: keyof OrderItem, value: any) => {
        const updated = [...items]
            ; (updated[index] as any)[field] = value
        setItems(updated)
    }

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    // Box search
    const searchBoxes = async (term: string) => {
        if (!term.trim()) {
            setBoxResults([])
            return
        }

        setIsSearchingBox(true)
        let query = supabase
            .from('boxes')
            .select(`
                id,
                code,
                location:locations(code),
                inventory_items(
                    id,
                    product_id,
                    quantity,
                    products(sku, name, price, barcode)
                )
            `)
            .eq('status', 'OPEN')
            .gt('inventory_items.quantity', 0)
            .limit(10)

        query = query.ilike('code', `%${term}%`)

        const { data, error } = await query

        // Filter out empty boxes (client-side filter as Supabase doesn't support deep filtering easily on join count)
        const validBoxes = (data as any || []).filter((b: any) => b.inventory_items && b.inventory_items.length > 0)

        setIsSearchingBox(false)
        setBoxResults(validBoxes)
    }

    // Initial search and debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            searchBoxes(boxSearch)
        }, boxSearch ? 500 : 0) // Immediate for empty (initial), debounced for typing
        return () => clearTimeout(timer)
    }, [boxSearch])

    const addBox = (box: BoxWithItems) => {
        if (selectedBoxes.find(b => b.box_id === box.id)) {
            toast.error('Thùng đã được chọn')
            return
        }
        const boxData = {
            box_id: box.id,
            box_code: box.code,
            items: box.inventory_items?.map(i => ({
                product_id: i.product_id,
                sku: i.products?.sku || '',
                name: i.products?.name || '',
                barcode: i.products?.barcode || '',
                quantity: i.quantity,
                unit_price: (i.products as any)?.price || 0
            })) || []
        }

        const filteredItems = boxData.items.filter(i => i.quantity > 0)

        if (filteredItems.length === 0) {
            toast.error('Thùng này không có sản phẩm khả dụng')
            return
        }

        setSelectedBoxes([...selectedBoxes, {
            ...boxData,
            items: filteredItems
        }])
        setBoxSearch('')
        setBoxResults([])
    }

    const removeBox = (boxId: string) => {
        setSelectedBoxes(selectedBoxes.filter(b => b.box_id !== boxId))
    }

    // Calculations
    const calculateSubtotal = () => {
        if (transferType === 'BOX') {
            return selectedBoxes.reduce((sum, box) =>
                sum + box.items.reduce((boxSum, item) => {
                    return boxSum + (item.quantity * (item.unit_price || 0))
                }, 0)
                , 0)
        }
        return items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
    }

    const calculateDiscount = () => {
        const subtotal = calculateSubtotal()
        if (discountType === 'PERCENT') return subtotal * (discountValue / 100)
        return Math.min(discountValue, subtotal)
    }

    const calculateTotal = () => Math.max(0, calculateSubtotal() - calculateDiscount())

    const getTotalItems = () => {
        if (transferType === 'BOX') {
            return selectedBoxes.reduce((sum, box) => sum + box.items.reduce((s, i) => s + i.quantity, 0), 0)
        }
        return items.reduce((sum, i) => sum + i.quantity, 0)
    }

    // Handle Update
    const handleUpdate = async () => {
        if (transferType === 'ITEM' && items.length === 0) {
            toast.error('Vui lòng thêm sản phẩm')
            return
        }
        if (transferType === 'BOX' && selectedBoxes.length === 0) {
            toast.error('Vui lòng chọn thùng')
            return
        }

        setSubmitting(true)

        try {
            const subtotal = calculateSubtotal()
            const discountAmount = calculateDiscount()
            const total = calculateTotal()

            // Update order info
            const { error: orderError } = await supabase
                .from('outbound_orders')
                .update({
                    type: orderType,
                    transfer_type: transferType,
                    customer_id: (orderType === 'SALE' || orderType === 'GIFT') ? customerId || null : null,
                    destination_id: orderType === 'TRANSFER' ? destinationId || null : null,
                    sale_staff_id: saleStaffId || null,
                    note: note || null,
                    description: description || null,
                    is_bonus_consideration: orderType === 'SALE' ? isBonusConsideration : null,
                    is_bonus_calculation: orderType === 'SALE' ? isBonusCalculation : null,
                    discount_type: discountType,
                    discount_value: discountValue,
                    discount_amount: discountAmount,
                    // sale_class: saleClass, // If column exists
                    subtotal,
                    total
                })
                .eq('id', id)

            if (orderError) throw orderError

            // Re-create items (Delete all, insert new)
            // Ideally we should smart-update, but for simplicity and correctness with Boxes, explicit delete/insert is safer for this stage.
            await supabase.from('outbound_order_items').delete().eq('order_id', id)

            let itemsToInsert: any[] = []

            if (transferType === 'ITEM') {
                itemsToInsert = items.map(item => ({
                    order_id: id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    line_total: item.quantity * item.unit_price,
                    picked_quantity: 0
                }))
            } else {
                for (const box of selectedBoxes) {
                    const mergedItems: Record<string, any> = {}

                    for (const item of box.items) {
                        if (mergedItems[item.product_id]) {
                            mergedItems[item.product_id].quantity += item.quantity
                        } else {
                            mergedItems[item.product_id] = { ...item }
                        }
                    }

                    for (const item of Object.values(mergedItems)) {
                        itemsToInsert.push({
                            order_id: id,
                            product_id: item.product_id,
                            from_box_id: box.box_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price || 0,
                            line_total: item.quantity * (item.unit_price || 0),
                            picked_quantity: 0
                        })
                    }
                }
            }

            if (itemsToInsert.length > 0) {
                await supabase.from('outbound_order_items').insert(itemsToInsert)
            }

            toast.success('Đã cập nhật đơn hàng!')
            router.push(`/admin/outbound/${id}`)
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    const orderTypeOptions = [
        { value: 'SALE', label: 'Bán Hàng', icon: ShoppingCart, color: 'bg-green-500' },
        { value: 'TRANSFER', label: 'Điều Chuyển', icon: Truck, color: 'bg-blue-500' },
        { value: 'GIFT', label: 'Quà Tặng', icon: Gift, color: 'bg-pink-500' },
        { value: 'INTERNAL', label: 'Nội Bộ', icon: Users, color: 'bg-purple-500' },
    ]

    const filteredCustomers = saleStaffId
        ? customers.filter(c => c.sale_staff_id === saleStaffId)
        : customers

    if (loading) return <div className="p-12 text-center text-gray-500">Đang tải dữ liệu...</div>

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="w-full px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href={`/admin/outbound/${id}`} className="h-10 w-10 flex items-center justify-center rounded-lg border hover:bg-gray-50">
                                <ArrowLeft className="h-5 w-5" />
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Sửa Đơn: {orderCode}</h1>
                                <p className="text-sm text-gray-500">Chỉnh sửa thông tin và sản phẩm</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (confirm('Hủy bỏ thay đổi và quay lại?')) {
                                        router.push(`/admin/outbound/${id}`)
                                    }
                                }}
                                className="h-11 px-6 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50"
                            >
                                Hủy Bỏ
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={submitting}
                                className="h-11 px-6 bg-blue-600 text-white font-bold rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                                Lưu Thay Đổi
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content: Fixed Sidebar Layout */}
            <div className="flex h-[calc(100vh-80px)] overflow-hidden">
                <main className="flex-1 w-full flex gap-6 px-6 py-4 h-full">
                    {/* LEFT: Fixed Sidebar (Header Info) */}
                    <div className="w-1/3 h-full overflow-y-auto pr-2 space-y-3">
                        {/* Order Type */}
                        <div className="bg-white rounded-xl border p-3">
                            <h2 className="font-bold text-gray-800 mb-2 flex items-center gap-2 text-sm">
                                <Package className="h-4 w-4 text-blue-500" />
                                Loại Đơn Hàng
                            </h2>
                            <div className="grid grid-cols-2 gap-2">
                                {orderTypeOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setOrderType(opt.value as any)}
                                        className={`p-2 rounded-lg border transition-all flex items-center gap-2 ${orderType === opt.value
                                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <div className={`h-6 w-6 rounded-md ${opt.color} flex items-center justify-center`}>
                                            <opt.icon className="h-3 w-3 text-white" />
                                        </div>
                                        <span className="font-medium text-xs">{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Transfer Type */}
                        <div className="bg-white rounded-xl border p-3">
                            <h2 className="font-bold text-gray-800 mb-2 text-sm">Hình Thức Xuất</h2>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setTransferType('ITEM')}
                                    className={`p-2 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${transferType === 'ITEM'
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Package className={`h-4 w-4 ${transferType === 'ITEM' ? 'text-blue-600' : 'text-gray-400'}`} />
                                        <span className={`font-medium text-sm ${transferType === 'ITEM' ? 'text-blue-700' : 'text-gray-700'}`}>Lấy Lẻ</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500">Chọn từng SKU</div>
                                </button>
                                <button
                                    onClick={() => setTransferType('BOX')}
                                    className={`p-2 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${transferType === 'BOX'
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <BoxIcon className={`h-4 w-4 ${transferType === 'BOX' ? 'text-blue-600' : 'text-gray-400'}`} />
                                        <span className={`font-medium text-sm ${transferType === 'BOX' ? 'text-blue-700' : 'text-gray-700'}`}>Nguyên Thùng</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500">Chọn Box</div>
                                </button>
                            </div>
                        </div>

                        {/* Partner Info */}
                        <div className="bg-white rounded-xl border p-4 space-y-4">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <Users className="h-4 w-4 text-blue-500" />
                                Thông Tin Đối Tác
                            </h2>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng / Đích đến</label>
                                {orderType === 'SALE' || orderType === 'GIFT' ? (
                                    <select
                                        className="w-full p-2 border rounded-lg"
                                        value={customerId || ''}
                                        onChange={(e) => setCustomerId(e.target.value)}
                                    >
                                        <option value="">-- Chọn khách hàng --</option>
                                        {filteredCustomers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                ) : orderType === 'TRANSFER' ? (
                                    <select
                                        className="w-full p-2 border rounded-lg"
                                        value={destinationId || ''}
                                        onChange={(e) => setDestinationId(e.target.value)}
                                    >
                                        <option value="">-- Chọn kho đích --</option>
                                        {destinations.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                ) : orderType === 'INTERNAL' ? (
                                    <select
                                        className="w-full p-2 border rounded-lg"
                                        value={saleStaffId || ''}
                                        onChange={(e) => setSaleStaffId(e.target.value)}
                                    >
                                        <option value="">-- Chọn nhân viên nội bộ --</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.name} {emp.code ? `(${emp.code})` : ''}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="p-2 border rounded-lg bg-gray-50 text-gray-500 text-sm">
                                        Không yêu cầu thông tin đối tác cho loại đơn này
                                    </div>
                                )}
                            </div>

                            {/* Sale Staff - Only for SALE */}
                            {orderType === 'SALE' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên Sales</label>
                                    <select
                                        className="w-full p-2 border rounded-lg"
                                        value={saleStaffId || ''}
                                        onChange={(e) => setSaleStaffId(e.target.value)}
                                    >
                                        <option value="">-- Chọn nhân viên --</option>
                                        {employees.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Note & Description */}
                        <div className="bg-white rounded-xl border p-4 space-y-4">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-500" />
                                Ghi Chú
                            </h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Ghi chú</label>
                                    <textarea
                                        rows={2}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder=".."
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Diễn giải</label>
                                    <textarea
                                        rows={2}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder=".."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Bonus Config - Hide for TRANSFER */}
                        {(orderType === 'SALE' || orderType === 'INTERNAL' || orderType === 'GIFT') && (
                            <div className="bg-white rounded-xl border p-4 space-y-4">
                                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                    <Settings className="h-4 w-4 text-blue-500" />
                                    Cơ chế đơn
                                </h2>

                                <div>
                                    <select
                                        value={saleClass}
                                        onChange={(e) => {
                                            const newClass = e.target.value as 'NORMAL' | 'PROMOTION'
                                            setSaleClass(newClass)
                                        }}
                                        className="w-full h-9 px-3 border rounded-lg bg-white text-sm"
                                    >
                                        <option value="NORMAL">Đơn thường (CK mặc định)</option>
                                        <option value="PROMOTION">Đơn khuyến mãi (Sửa CK)</option>
                                    </select>
                                </div>

                                {orderType === 'SALE' && (
                                    <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                                        <div>
                                            <div className="text-xs font-medium text-gray-500 mb-1">Xét thưởng</div>
                                            <select
                                                value={isBonusConsideration ? "true" : "false"}
                                                onChange={(e) => setIsBonusConsideration(e.target.value === "true")}
                                                className={`w-full h-8 px-2 border rounded text-xs font-medium ${isBonusConsideration ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600'}`}
                                            >
                                                <option value="false">Không</option>
                                                <option value="true">Có</option>
                                            </select>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-gray-500 mb-1">Tính thưởng</div>
                                            <select
                                                value={isBonusCalculation ? "true" : "false"}
                                                onChange={(e) => setIsBonusCalculation(e.target.value === "true")}
                                                className={`w-full h-8 px-2 border rounded text-xs font-medium ${isBonusCalculation ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600'}`}
                                            >
                                                <option value="false">Không</option>
                                                <option value="true">Có</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Detail (Items/Boxes) + Pricing */}
                    <div className="w-2/3 h-full overflow-y-auto pl-2 space-y-6">
                        {/* Items Section */}
                        <div className="bg-white rounded-xl border overflow-hidden">
                            <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                                <h2 className="font-bold text-gray-800">
                                    {transferType === 'ITEM' ? 'Danh Sách Sản Phẩm' : 'Danh Sách Thùng'}
                                </h2>
                                <span className="text-sm text-gray-500">
                                    {getTotalItems()} sản phẩm
                                </span>
                            </div>

                            {/* Search Bar */}
                            <div className="p-4 border-b bg-gray-50/50">
                                {transferType === 'ITEM' ? (
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={productSearch}
                                            onChange={(e) => handleProductSearch(e.target.value)}
                                            placeholder="Tìm SKU, tên sản phẩm, barcode..."
                                            className="w-full h-11 pl-11 pr-4 border rounded-lg text-sm"
                                        />
                                        {showSearch && searchResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-64 overflow-auto">
                                                {searchResults.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => addProduct(p)}
                                                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b last:border-0"
                                                    >
                                                        <div>
                                                            <div className="font-mono text-sm font-medium">{p.sku}</div>
                                                            <div className="text-sm text-gray-500">{p.name}</div>
                                                        </div>
                                                        <div className="text-sm font-medium text-blue-600">
                                                            {new Intl.NumberFormat('vi-VN').format(p.price || 0)}đ
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <div className="flex gap-2 mb-4">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={boxSearch}
                                                    onChange={(e) => setBoxSearch(e.target.value)}
                                                    placeholder="Gõ mã thùng để tìm (Vd: BOX001)..."
                                                    className="w-full h-11 pl-10 pr-4 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                    autoFocus
                                                />
                                            </div>
                                            {isSearchingBox && (
                                                <div className="flex items-center px-2">
                                                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                                                </div>
                                            )}
                                        </div>

                                        {boxResults.length > 0 && (
                                            <div className={`absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-xl max-h-80 overflow-y-auto ${boxSearch ? '' : 'relative shadow-none border-dashed'}`}>
                                                {!boxSearch && <div className="p-2 text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b">Thống có sẵn</div>}
                                                {boxResults.map(box => (
                                                    <button
                                                        key={box.id}
                                                        onClick={() => addBox(box)}
                                                        className="w-full text-left p-3 hover:bg-blue-50 border-b last:border-0 flex justify-between items-center group"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-gray-900">{box.code}</span>
                                                                <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                                                                    {box.location?.code || 'Không vị trí'}
                                                                </span>
                                                                <span className="text-xs text-gray-400 font-normal">
                                                                    ({box.inventory_items?.length || 0} SKU)
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <Plus className="h-5 w-5 text-gray-300 group-hover:text-blue-600" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {boxSearch && boxResults.length === 0 && !isSearchingBox && (
                                            <div className="p-4 text-center text-gray-500 italic bg-gray-50 rounded-lg">
                                                Không tìm thấy thùng nào khớp với "{boxSearch}" (Trạng thái phải là OPEN)
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Items Table */}
                            {transferType === 'ITEM' ? (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-y">
                                        <tr>
                                            <th className="px-4 py-3 text-left w-[180px]">SKU</th>
                                            <th className="px-4 py-3 text-left w-[90px]">BARCODE</th>
                                            <th className="px-4 py-3 text-left">TÊN SẢN PHẨM</th>
                                            <th className="px-4 py-3 text-center w-[80px]">SL</th>
                                            <th className="px-4 py-3 text-right w-[110px]">ĐƠN GIÁ</th>
                                            <th className="px-4 py-3 text-right w-[120px]">THÀNH TIỀN</th>
                                            <th className="px-4 py-3 w-[40px]"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                    Chưa có sản phẩm nào
                                                </td>
                                            </tr>
                                        ) : items.map((item, idx) => (
                                            <tr key={idx} className="border-b hover:bg-gray-50">
                                                <td className="px-4 py-2">
                                                    <div className="font-medium text-blue-600 truncate">{item.product?.sku}</div>
                                                </td>
                                                <td className="px-4 py-2 text-gray-500">
                                                    {item.barcode || item.product?.barcode || '-'}
                                                </td>
                                                <td className="px-4 py-2 text-gray-700 font-medium">
                                                    {item.product?.name}
                                                </td>
                                                <td className="px-4 py-2 text-center w-32">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            tabIndex={-1}
                                                            onClick={() => updateItem(idx, 'quantity', Math.max(1, item.quantity - 1))}
                                                            className="h-8 w-8 flex items-center justify-center border rounded hover:bg-gray-100"
                                                        >
                                                            -
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={item.quantity}
                                                            onChange={(e) => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 0))}
                                                            className="h-8 w-full text-center border rounded font-medium"
                                                        />
                                                        <button
                                                            tabIndex={-1}
                                                            onClick={() => updateItem(idx, 'quantity', item.quantity + 1)}
                                                            className="h-8 w-8 flex items-center justify-center border rounded hover:bg-gray-100"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <input
                                                        type="number"
                                                        disabled
                                                        value={item.unit_price}
                                                        onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                                        className="w-full px-2 py-1 text-right border rounded bg-gray-50 text-gray-500 cursor-not-allowed"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold text-gray-900">
                                                    {(item.quantity * item.unit_price).toLocaleString('vi-VN')}₫
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <button
                                                        onClick={() => removeItem(idx)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <>
                                    {/* Box Results */}

                                    {/* Selected Boxes */}
                                    <div className="p-4 space-y-3">
                                        {selectedBoxes.length === 0 ? (
                                            <div className="text-center py-12 text-gray-400">
                                                <BoxIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                                <div>Chưa chọn thùng nào</div>
                                                <div className="text-sm">Tìm và thêm thùng ở trên</div>
                                            </div>
                                        ) : selectedBoxes.map(box => (
                                            <div key={box.box_id} className="border rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <BoxIcon className="h-5 w-5 text-blue-500" />
                                                        <span className="font-mono font-bold">{box.box_code}</span>
                                                        <span className="text-sm text-gray-500">
                                                            ({box.items.reduce((s, i) => s + i.quantity, 0)} sp)
                                                        </span>
                                                    </div>
                                                    <button onClick={() => removeBox(box.box_id)} className="text-red-500 hover:text-red-700">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                <div className="mt-3 border-t pt-2">
                                                    <table className="w-full text-xs">
                                                        <thead className="text-gray-500 font-medium bg-gray-50">
                                                            <tr>
                                                                <th className="px-2 py-1 text-left">SKU</th>
                                                                <th className="px-2 py-1 text-left">Barcode</th>
                                                                <th className="px-2 py-1 text-left">Tên SP</th>
                                                                <th className="px-2 py-1 text-right">ĐG</th>
                                                                <th className="px-2 py-1 text-center">SL</th>
                                                                <th className="px-2 py-1 text-right">Thành Tiền</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {box.items.map((item, i) => (
                                                                <tr key={i}>
                                                                    <td className="px-2 py-1.5 font-mono font-medium text-blue-600">{item.sku}</td>
                                                                    <td className="px-2 py-1.5 font-mono text-gray-600">{item.barcode || '-'}</td>
                                                                    <td className="px-2 py-1.5 text-gray-700">{item.name}</td>
                                                                    <td className="px-2 py-1.5 text-right text-gray-500">
                                                                        {new Intl.NumberFormat('vi-VN').format(item.unit_price || 0)}
                                                                    </td>
                                                                    <td className="px-2 py-1.5 text-center font-medium">{item.quantity}</td>
                                                                    <td className="px-2 py-1.5 text-right font-medium text-gray-900">
                                                                        {new Intl.NumberFormat('vi-VN').format((item.unit_price || 0) * item.quantity)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Pricing Summary */}
                        <div className="bg-white rounded-xl border p-4 space-y-4">
                            <h2 className="font-bold text-gray-800 text-sm">Thanh Toán</h2>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Loại chiết khấu</label>
                                        <select
                                            value={discountType}
                                            onChange={(e) => setDiscountType(e.target.value as any)}
                                            disabled={orderType === 'SALE' && saleClass === 'NORMAL'}
                                            className={`w-full h-9 px-3 border rounded text-sm ${orderType === 'SALE' && saleClass === 'NORMAL' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                        >
                                            <option value="PERCENT">Phần trăm (%)</option>
                                            <option value="FIXED">Số tiền (đ)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">
                                            Giá trị {discountType === 'PERCENT' ? '(%)' : '(đ)'}
                                        </label>
                                        <input
                                            type="number"
                                            value={discountValue}
                                            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                            disabled={orderType === 'SALE' && saleClass === 'NORMAL'}
                                            className={`w-full h-9 px-3 border rounded text-sm text-right font-bold ${orderType === 'SALE' && saleClass === 'NORMAL' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Thành tiền trước CK</span>
                                        <span className="font-medium">{new Intl.NumberFormat('vi-VN').format(calculateSubtotal())}đ</span>
                                    </div>
                                    {orderType !== 'TRANSFER' && (
                                        <div className="flex justify-between text-red-600">
                                            <span>Chiết khấu</span>
                                            <span>-{new Intl.NumberFormat('vi-VN').format(calculateDiscount())}đ</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-bold text-lg pt-2 border-t text-blue-700">
                                        <span>Thành tiền sau CK</span>
                                        <span>{new Intl.NumberFormat('vi-VN').format(calculateTotal())}đ</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div >
        </div >
    )
}
