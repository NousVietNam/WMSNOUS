"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
    inventory_items?: { id: string; product_id: string; quantity: number; products?: { sku: string; name: string; barcode?: string } }[]
}

type OrderItem = {
    product_id: string
    product?: Product
    quantity: number
    unit_price: number
    barcode?: string
}

type SelectedBox = {
    box_id: string
    box_code: string
    items: { product_id: string; sku: string; name: string; quantity: number; unit_price: number; barcode?: string }[]
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

    useEffect(() => {
        fetchDropdowns()

        // Check for pre-selected boxes from URL
        const boxIds = searchParams.get('boxes')
        if (boxIds) {
            setTransferType('BOX')
            loadBoxesFromUrl(boxIds.split(','))
        }
    }, [])

    // Apply default discount when customer changes logic
    useEffect(() => {
        if (orderType === 'SALE' && saleClass === 'NORMAL' && customerId) {
            const cust = customers.find(c => c.id === customerId)
            if (cust?.default_discount) {
                setDiscountType('PERCENT')
                setDiscountValue(cust.default_discount)
            } else {
                setDiscountValue(0)
            }
        }
    }, [customerId, orderType, saleClass, customers])

    // GIFT defaults: 100% discount, no bonus
    useEffect(() => {
        if (orderType === 'GIFT') {
            setDiscountType('PERCENT')
            setDiscountValue(100)
            setIsBonusConsideration(false)
            setIsBonusCalculation(false)
        }
    }, [orderType])

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

    const loadBoxesFromUrl = async (boxIds: string[]) => {
        const { data } = await supabase
            .from('boxes')
            .select('id, code, location:locations(code), inventory_items(id, product_id, quantity, products!inner(sku, name, price, barcode))')
            .in('id', boxIds)

        if (data) {
            setSelectedBoxes(data.map(box => ({
                box_id: box.id,
                box_code: box.code,
                items: box.inventory_items?.map(i => {
                    const productData = Array.isArray((i as any).products) ? (i as any).products[0] : ((i as any).products as any) || {}

                    return {
                        product_id: i.product_id,
                        sku: productData.sku || '',
                        name: productData.name || '',
                        barcode: productData.barcode || '',
                        quantity: i.quantity,
                        unit_price: productData.price || 0
                    }
                }) || []
            })))
        }
    }

    // Product search (Server-side)
    const handleProductSearch = async (term: string) => {
        setProductSearch(term)
        if (term.length >= 2) {
            setIsSearchingBox(false) // Re-use loading state or create new one if needed, but for now just query
            const { data } = await supabase
                .from('products')
                .select('id, sku, name, price, barcode')
                .or(`sku.ilike.%${term}%,name.ilike.%${term}%,barcode.eq.${term}`) // barcode eq for exact scan, or ilike
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
        setSelectedBoxes([...selectedBoxes, {
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
            // Generate code using DB Sequence
            let prefix = ''
            switch (orderType) {
                case 'SALE': prefix = 'SO'; break;
                case 'TRANSFER': prefix = 'TO'; break;
                case 'INTERNAL': prefix = 'IO'; break;
                case 'GIFT': prefix = 'GO'; break;
                default: prefix = 'OT';
            }
            // Pass prefix as a parameter object: { prefix: 'SO' }
            const { data: codeData, error: codeError } = await supabase.rpc('generate_outbound_order_code', { prefix })
            if (codeError) throw codeError
            const orderCode = codeData

            // Get current user
            const { data: { user } } = await supabase.auth.getUser()

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
                    description: description || null,
                    is_bonus_consideration: orderType === 'SALE' ? isBonusConsideration : null,
                    is_bonus_calculation: orderType === 'SALE' ? isBonusCalculation : null,
                    discount_type: discountType,
                    discount_value: discountValue,
                    discount_amount: discountAmount,
                    subtotal,
                    total,
                    created_by: user?.id
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
                        itemsToInsert.push({
                            order_id: newOrder.id,
                            product_id: item.product_id,
                            box_id: box.box_id,
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

    const filteredCustomers = saleStaffId
        ? customers.filter(c => c.sale_staff_id === saleStaffId)
        : customers

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="w-full px-6 py-4">
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
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (confirm('Đơn hàng chưa được lưu. Bạn có chắc chắn muốn hủy và quay về danh sách?')) {
                                        router.push('/admin/outbound')
                                    }
                                }}
                                className="h-11 px-6 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50"
                            >
                                Hủy Bỏ
                            </button>
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
                                        onChange={(e) => {
                                            const val = e.target.value
                                            setCustomerId(val)
                                            // Sync Sale Staff
                                            const customer = customers.find(c => c.id === val)
                                            if (customer?.sale_staff_id) {
                                                setSaleStaffId(customer.sale_staff_id)
                                            }
                                        }}
                                    >
                                        <option value="">-- Chọn khách hàng --</option>
                                        {filteredCustomers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
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

                            {/* Sale Staff - Hide for TRANSFER, INTERNAL, GIFT */}
                            {orderType === 'SALE' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên Sales</label>
                                    <select
                                        className="w-full p-2 border rounded-lg"
                                        value={saleStaffId || ''}
                                        onChange={(e) => {
                                            const val = e.target.value
                                            setSaleStaffId(val)
                                            if (val && !customerId) {
                                                const custsForStaff = customers.filter(c => c.sale_staff_id === val)
                                                if (custsForStaff.length === 1) {
                                                    const cust = custsForStaff[0]
                                                    setCustomerId(cust.id)
                                                    if (orderType === 'SALE' && saleClass === 'NORMAL' && cust.default_discount) {
                                                        setDiscountType('PERCENT')
                                                        setDiscountValue(cust.default_discount)
                                                    }
                                                }
                                            }
                                        }}
                                    >
                                        <option value="">-- Chọn nhân viên --</option>
                                        {employees.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>
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
                        {orderType === 'SALE' && (
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
                                            if (newClass === 'NORMAL' && customerId) {
                                                const cust = customers.find(c => c.id === customerId)
                                                if (cust?.default_discount) {
                                                    setDiscountType('PERCENT')
                                                    setDiscountValue(cust.default_discount)
                                                }
                                            }
                                        }}
                                        className="w-full h-9 px-3 border rounded-lg bg-white text-sm"
                                    >
                                        <option value="NORMAL">Đơn thường (CK mặc định)</option>
                                        <option value="PROMOTION">Đơn khuyến mãi (Sửa CK)</option>
                                    </select>
                                </div>
                                {/* Bonus Selection (Only for SALE) */}
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
                                                    {item.barcode || '-'}
                                                </td>
                                                <td className="px-4 py-2 text-gray-700 font-medium">
                                                    {item.product?.name}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                                                        className="w-full px-2 py-1 text-center border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
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
                                                                    <td className="px-2 py-1.5 text-gray-500 font-mono">{item.barcode || '-'}</td>
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
                        <div className="bg-white rounded-xl border p-5">
                            <h2 className="font-bold text-gray-800 mb-4">Tổng Kết</h2>
                            {/* Discount - Hide for TRANSFER */}
                            {orderType !== 'TRANSFER' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Loại chiết khấu</label>
                                        <select
                                            className="w-full px-3 py-2 border rounded-lg bg-white"
                                            value={discountType}
                                            onChange={(e) => setDiscountType(e.target.value as any)}
                                        >
                                            <option value="PERCENT">Phần trăm (%)</option>
                                            <option value="AMOUNT">Số tiền (VNĐ)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                            Giá trị {discountType === 'PERCENT' ? '(%)' : '(VNĐ)'}
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full px-3 py-2 border rounded-lg"
                                            value={discountValue}
                                            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Summary Lines */}
                            <div className="space-y-2 pt-2 text-sm">
                                <div className="flex justify-between text-gray-600">
                                    <span>Tạm tính ({items.length} sản phẩm)</span>
                                    <span className="font-bold text-gray-900">{calculateSubtotal().toLocaleString('vi-VN')}₫</span>
                                </div>
                                {orderType !== 'TRANSFER' && (
                                    <div className="flex justify-between text-red-500">
                                        <span>Chiết khấu</span>
                                        <span>-{new Intl.NumberFormat('vi-VN').format(calculateDiscount())}đ</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-3 border-t">
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-bold text-gray-800">Thành tiền sau CK</span>
                                    <span className="text-2xl font-bold text-blue-600 w-[180px] text-right">
                                        {new Intl.NumberFormat('vi-VN').format(calculateTotal())}đ
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div >
        </div >
    )
}
