"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { ArrowLeft, Plus, Trash2, Loader2, Box as BoxIcon, Package, Search, ShoppingCart, Truck, Gift, Users, Save } from "lucide-react"
import { toast } from "sonner"

type Product = { id: string; sku: string; name: string; price?: number; barcode?: string }
type Customer = { id: string; name: string }
type Destination = { id: string; name: string }

type BoxWithItems = {
    id: string
    code: string
    location?: { code: string }
    inventory_items?: { id: string; product_id: string; quantity: number; products?: { sku: string; name: string } }[]
}

type OrderItem = {
    product_id: string
    product?: Product
    quantity: number
    unit_price: number
}

type SelectedBox = {
    box_id: string
    box_code: string
    items: { product_id: string; sku: string; name: string; quantity: number }[]
}

export default function NewOutboundPage() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Header info
    const [orderType, setOrderType] = useState<'SALE' | 'TRANSFER' | 'INTERNAL' | 'GIFT'>('SALE')
    const [transferType, setTransferType] = useState<'ITEM' | 'BOX'>('ITEM')
    const [customerId, setCustomerId] = useState<string>('')
    const [destinationId, setDestinationId] = useState<string>('')
    const [saleStaffId, setSaleStaffId] = useState<string>('')
    const [note, setNote] = useState('')

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

    // Dropdowns
    const [customers, setCustomers] = useState<Customer[]>([])
    const [destinations, setDestinations] = useState<Destination[]>([])
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
    const [allProducts, setAllProducts] = useState<Product[]>([])

    useEffect(() => {
        fetchDropdowns()

        // Check for pre-selected boxes from URL
        const boxIds = searchParams.get('boxes')
        if (boxIds) {
            setTransferType('BOX')
            loadBoxesFromUrl(boxIds.split(','))
        }
    }, [])

    const fetchDropdowns = async () => {
        const [{ data: custs }, { data: dests }, { data: prods }, { data: emps }] = await Promise.all([
            supabase.from('customers').select('id, name').order('name'),
            supabase.from('destinations').select('id, name').order('name'),
            supabase.from('products').select('id, sku, name, price, barcode').limit(1000),
            supabase.from('users').select('id, name').eq('role', 'employee').order('name')
        ])
        setCustomers(custs || [])
        setDestinations(dests || [])
        setAllProducts(prods || [])
        setEmployees(emps || [])
    }

    const loadBoxesFromUrl = async (boxIds: string[]) => {
        const { data } = await supabase
            .from('boxes')
            .select('id, code, location:locations(code), inventory_items(id, product_id, quantity, products(sku, name))')
            .in('id', boxIds)

        if (data) {
            setSelectedBoxes(data.map(box => ({
                box_id: box.id,
                box_code: box.code,
                items: box.inventory_items?.map(i => ({
                    product_id: i.product_id,
                    sku: i.products?.sku || '',
                    name: i.products?.name || '',
                    quantity: i.quantity
                })) || []
            })))
        }
    }

    // Product search
    const handleProductSearch = (term: string) => {
        setProductSearch(term)
        if (term.length >= 2) {
            const results = allProducts.filter(p =>
                p.sku.toLowerCase().includes(term.toLowerCase()) ||
                p.name.toLowerCase().includes(term.toLowerCase()) ||
                p.barcode?.includes(term)
            ).slice(0, 10)
            setSearchResults(results)
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
    const searchBoxes = async () => {
        if (boxSearch.length < 2) return
        const { data } = await supabase
            .from('boxes')
            .select('id, code, location:locations(code), inventory_items(id, product_id, quantity, products(sku, name))')
            .ilike('code', `%${boxSearch}%`)
            .eq('status', 'STORAGE')
            .limit(10)
        setBoxResults(data || [])
    }

    const addBox = (box: BoxWithItems) => {
        if (selectedBoxes.find(b => b.box_id === box.id)) {
            toast.error('Thùng đã được chọn')
            return
        }
        setSelectedBoxes([...selectedBoxes, {
            box_id: box.id,
            box_code: box.code,
            items: box.inventory_items?.map(i => ({
                product_id: i.product_id,
                sku: i.products?.sku || '',
                name: i.products?.name || '',
                quantity: i.quantity
            })) || []
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
            // For box mode, calculate from box items with product prices
            return selectedBoxes.reduce((sum, box) =>
                sum + box.items.reduce((boxSum, item) => {
                    const product = allProducts.find(p => p.id === item.product_id)
                    return boxSum + (item.quantity * (product?.price || 0))
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

    // Submit
    const handleSubmit = async () => {
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
            // Generate code
            const { data: codeData } = await supabase.rpc('generate_outbound_code', { p_type: orderType })
            const orderCode = codeData || `OUT-${Date.now()}`

            const subtotal = calculateSubtotal()
            const discountAmount = calculateDiscount()
            const total = calculateTotal()

            // Create order
            const { data: newOrder, error: orderError } = await supabase
                .from('outbound_orders')
                .insert({
                    code: orderCode,
                    type: orderType,
                    transfer_type: transferType,
                    source: 'MANUAL',
                    customer_id: (orderType === 'SALE' || orderType === 'GIFT') ? customerId || null : null,
                    destination_id: orderType === 'TRANSFER' ? destinationId || null : null,
                    sale_staff_id: saleStaffId || null,
                    note: note || null,
                    discount_type: discountType,
                    discount_value: discountValue,
                    discount_amount: discountAmount,
                    subtotal,
                    total
                })
                .select('id')
                .single()

            if (orderError) throw orderError

            // Create order items
            let itemsToInsert: any[] = []

            if (transferType === 'ITEM') {
                itemsToInsert = items.map(item => ({
                    order_id: newOrder.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    line_total: item.quantity * item.unit_price,
                    picked_quantity: 0
                }))
            } else {
                // Box mode - expand box items
                for (const box of selectedBoxes) {
                    for (const item of box.items) {
                        const product = allProducts.find(p => p.id === item.product_id)
                        itemsToInsert.push({
                            order_id: newOrder.id,
                            product_id: item.product_id,
                            box_id: box.box_id,
                            quantity: item.quantity,
                            unit_price: product?.price || 0,
                            line_total: item.quantity * (product?.price || 0),
                            picked_quantity: 0
                        })
                    }
                }
            }

            if (itemsToInsert.length > 0) {
                await supabase.from('outbound_order_items').insert(itemsToInsert)
            }

            toast.success(`Tạo đơn ${orderCode} thành công!`)
            router.push(`/admin/outbound/${newOrder.id}`)
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

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/admin/outbound" className="h-10 w-10 flex items-center justify-center rounded-lg border hover:bg-gray-50">
                                <ArrowLeft className="h-5 w-5" />
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Tạo Đơn Xuất Kho Mới</h1>
                                <p className="text-sm text-gray-500">Nhập thông tin đơn hàng và danh sách sản phẩm</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="h-11 px-6 bg-blue-600 text-white font-bold rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                        >
                            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                            Tạo Đơn Hàng
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6">
                <div className="grid grid-cols-3 gap-6">
                    {/* LEFT: Header Info */}
                    <div className="space-y-6">
                        {/* Order Type */}
                        <div className="bg-white rounded-xl border p-5">
                            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Package className="h-5 w-5 text-blue-500" />
                                Loại Đơn Hàng
                            </h2>
                            <div className="grid grid-cols-2 gap-2">
                                {orderTypeOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setOrderType(opt.value as any)}
                                        className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${orderType === opt.value
                                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <div className={`h-8 w-8 rounded-lg ${opt.color} flex items-center justify-center`}>
                                            <opt.icon className="h-4 w-4 text-white" />
                                        </div>
                                        <span className="font-medium text-sm">{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Transfer Type */}
                        <div className="bg-white rounded-xl border p-5">
                            <h2 className="font-bold text-gray-800 mb-4">Hình Thức Xuất</h2>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setTransferType('ITEM')}
                                    className={`p-4 rounded-lg border-2 transition-all text-center ${transferType === 'ITEM'
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <Package className={`h-8 w-8 mx-auto mb-2 ${transferType === 'ITEM' ? 'text-blue-600' : 'text-gray-400'}`} />
                                    <div className="font-medium">Lấy Lẻ</div>
                                    <div className="text-xs text-gray-500">Chọn từng SKU</div>
                                </button>
                                <button
                                    onClick={() => setTransferType('BOX')}
                                    className={`p-4 rounded-lg border-2 transition-all text-center ${transferType === 'BOX'
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <BoxIcon className={`h-8 w-8 mx-auto mb-2 ${transferType === 'BOX' ? 'text-blue-600' : 'text-gray-400'}`} />
                                    <div className="font-medium">Nguyên Thùng</div>
                                    <div className e="text-xs text-gray-500">Chọn Box</div>
                                </button>
                            </div>
                        </div>

                        {/* Customer/Destination */}
                        <div className="bg-white rounded-xl border p-5">
                            <h2 className="font-bold text-gray-800 mb-4">Thông Tin Đối Tác</h2>

                            {(orderType === 'SALE' || orderType === 'GIFT') ? (
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-600">Khách hàng</label>
                                    <select
                                        value={customerId}
                                        onChange={(e) => setCustomerId(e.target.value)}
                                        className="w-full h-11 px-4 border rounded-lg bg-white text-sm"
                                    >
                                        <option value="">-- Khách lẻ --</option>
                                        {customers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <Link href="/admin/customers" className="text-xs text-blue-600 hover:underline">
                                        + Thêm khách hàng mới
                                    </Link>
                                </div>
                            ) : orderType === 'TRANSFER' ? (
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-600">Kho đích / Đối tác</label>
                                    <select
                                        value={destinationId}
                                        onChange={(e) => setDestinationId(e.target.value)}
                                        className="w-full h-11 px-4 border rounded-lg bg-white text-sm"
                                    >
                                        <option value="">-- Chọn đích --</option>
                                        {destinations.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">Đơn nội bộ không cần chọn đối tác</p>
                            )}

                            <div className="mt-4 pt-4 border-t">
                                <label className="block text-sm font-medium text-gray-600 mb-2">Nhân viên Sales</label>
                                <select
                                    value={saleStaffId}
                                    onChange={(e) => setSaleStaffId(e.target.value)}
                                    className="w-full h-10 px-4 border rounded-lg bg-white text-sm"
                                >
                                    <option value="">-- Không --</option>
                                    {employees.map(e => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Note */}
                        <div className="bg-white rounded-xl border p-5">
                            <h2 className="font-bold text-gray-800 mb-4">Ghi Chú</h2>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 border rounded-lg text-sm"
                                placeholder="Ghi chú cho đơn hàng..."
                            />
                        </div>
                    </div>

                    {/* RIGHT: Detail (Items/Boxes) + Pricing */}
                    <div className="col-span-2 space-y-6">
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
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={boxSearch}
                                                onChange={(e) => setBoxSearch(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && searchBoxes()}
                                                placeholder="Nhập mã thùng..."
                                                className="w-full h-11 pl-11 pr-4 border rounded-lg text-sm"
                                            />
                                        </div>
                                        <button onClick={searchBoxes} className="h-11 px-4 bg-gray-100 rounded-lg hover:bg-gray-200">
                                            <Search className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Items Table */}
                            {transferType === 'ITEM' ? (
                                <table className="w-full">
                                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                        <tr>
                                            <th className="text-left px-4 py-3">SKU</th>
                                            <th className="text-left px-4 py-3">Tên Sản Phẩm</th>
                                            <th className="text-center px-4 py-3 w-24">SL</th>
                                            <th className="text-right px-4 py-3 w-32">Đơn Giá</th>
                                            <th className="text-right px-4 py-3 w-32">Thành Tiền</th>
                                            <th className="w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {items.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-12 text-gray-400">
                                                    <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                                    <div>Chưa có sản phẩm nào</div>
                                                    <div className="text-sm">Tìm và thêm sản phẩm ở trên</div>
                                                </td>
                                            </tr>
                                        ) : items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-mono text-sm font-medium text-blue-600">{item.product?.sku}</td>
                                                <td className="px-4 py-3 text-sm">{item.product?.name}</td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                                                        className="w-20 h-9 px-2 border rounded text-center"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.unit_price}
                                                        onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                                        className="w-28 h-9 px-2 border rounded text-right"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium">
                                                    {new Intl.NumberFormat('vi-VN').format(item.quantity * item.unit_price)}đ
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
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
                                    {boxResults.length > 0 && (
                                        <div className="p-4 border-b space-y-2">
                                            {boxResults.map(box => (
                                                <button
                                                    key={box.id}
                                                    onClick={() => addBox(box)}
                                                    className="w-full p-3 text-left border rounded-lg hover:bg-blue-50 flex items-center justify-between"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <BoxIcon className="h-5 w-5 text-blue-500" />
                                                        <div>
                                                            <div className="font-mono font-bold">{box.code}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {box.inventory_items?.length || 0} SKU,
                                                                {box.inventory_items?.reduce((s, i) => s + i.quantity, 0) || 0} sản phẩm
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Plus className="h-5 w-5 text-blue-500" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

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
                                                <div className="text-sm text-gray-600 space-y-1 pl-7">
                                                    {box.items.map((item, i) => (
                                                        <div key={i}>• {item.sku}: {item.quantity}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Pricing Summary */}
                        <div className="bg-white rounded-xl border p-5">
                            <h2 className="font-bold text-gray-800 mb-4">Tổng Kết</h2>
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Loại chiết khấu</label>
                                    <select
                                        value={discountType}
                                        onChange={(e) => setDiscountType(e.target.value as any)}
                                        className="w-full h-10 px-3 border rounded-lg text-sm"
                                    >
                                        <option value="PERCENT">Phần trăm (%)</option>
                                        <option value="FIXED">Cố định (đ)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">
                                        Giá trị {discountType === 'PERCENT' ? '(%)' : '(đ)'}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={discountValue}
                                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                        className="w-full h-10 px-3 border rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Tiền chiết khấu</label>
                                    <div className="h-10 px-3 border rounded-lg bg-red-50 flex items-center text-red-600 font-medium">
                                        -{new Intl.NumberFormat('vi-VN').format(calculateDiscount())}đ
                                    </div>
                                </div>
                            </div>

                            <div className="border-t pt-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Tạm tính ({getTotalItems()} sản phẩm)</span>
                                    <span className="font-medium">{new Intl.NumberFormat('vi-VN').format(calculateSubtotal())}đ</span>
                                </div>
                                {calculateDiscount() > 0 && (
                                    <div className="flex justify-between text-sm text-red-600">
                                        <span>Chiết khấu</span>
                                        <span>-{new Intl.NumberFormat('vi-VN').format(calculateDiscount())}đ</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xl font-bold pt-2 border-t">
                                    <span>TỔNG CỘNG</span>
                                    <span className="text-blue-600">{new Intl.NumberFormat('vi-VN').format(calculateTotal())}đ</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
