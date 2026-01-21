"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { ArrowLeft, Plus, Trash2, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

type Product = { id: string; sku: string; name: string; price?: number }
type Customer = { id: string; name: string }
type Destination = { id: string; name: string }

type OrderItem = {
    id?: string
    product_id: string
    product?: Product
    quantity: number
    unit_price: number
}

export default function EditOutboundPage() {
    const { id } = useParams()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Order data
    const [orderCode, setOrderCode] = useState('')
    const [orderType, setOrderType] = useState<string>('SALE')
    const [customerId, setCustomerId] = useState<string>('')
    const [destinationId, setDestinationId] = useState<string>('')
    const [note, setNote] = useState('')
    const [discountType, setDiscountType] = useState<string>('PERCENT')
    const [discountValue, setDiscountValue] = useState<number>(0)

    // Items
    const [items, setItems] = useState<OrderItem[]>([])

    // Dropdowns
    const [products, setProducts] = useState<Product[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [destinations, setDestinations] = useState<Destination[]>([])
    const [productSearch, setProductSearch] = useState('')

    useEffect(() => {
        fetchDropdowns()
        if (id) fetchOrder()
    }, [id])

    const fetchDropdowns = async () => {
        const [{ data: prods }, { data: custs }, { data: dests }] = await Promise.all([
            supabase.from('products').select('id, sku, name, price').limit(500),
            supabase.from('customers').select('id, name').order('name'),
            supabase.from('destinations').select('id, name').order('name')
        ])
        setProducts(prods || [])
        setCustomers(custs || [])
        setDestinations(dests || [])
    }

    const fetchOrder = async () => {
        setLoading(true)

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

        // Check if can edit
        if (order.status !== 'PENDING' || order.is_approved) {
            toast.error('Không thể sửa đơn đã duyệt hoặc đang xử lý')
            router.push(`/admin/outbound/${id}`)
            return
        }

        setOrderCode(order.code)
        setOrderType(order.type)
        setCustomerId(order.customer_id || '')
        setDestinationId(order.destination_id || '')
        setNote(order.note || '')
        setDiscountType(order.discount_type || 'PERCENT')
        setDiscountValue(order.discount_value || 0)

        // Fetch items
        const { data: orderItems } = await supabase
            .from('outbound_order_items')
            .select('id, product_id, quantity, unit_price, products (id, sku, name)')
            .eq('order_id', id)

        if (orderItems) {
            setItems(orderItems.map(i => ({
                id: i.id,
                product_id: i.product_id,
                product: i.products as any,
                quantity: i.quantity,
                unit_price: i.unit_price
            })))
        }

        setLoading(false)
    }

    const addItem = () => {
        setItems([...items, { product_id: '', quantity: 1, unit_price: 0 }])
    }

    const updateItem = (index: number, field: keyof OrderItem, value: any) => {
        const updated = [...items]
        if (field === 'product_id') {
            const product = products.find(p => p.id === value)
            updated[index] = {
                ...updated[index],
                product_id: value,
                product: product,
                unit_price: product?.price || 0
            }
        } else {
            (updated[index] as any)[field] = value
        }
        setItems(updated)
    }

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    // Calculations
    const calculateSubtotal = () => {
        return items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
    }

    const calculateDiscount = () => {
        const subtotal = calculateSubtotal()
        if (discountType === 'PERCENT') {
            return subtotal * (discountValue / 100)
        }
        return discountValue
    }

    const calculateTotal = () => {
        return Math.max(0, calculateSubtotal() - calculateDiscount())
    }

    const handleSave = async () => {
        if (items.length === 0) {
            toast.error('Vui lòng thêm ít nhất 1 sản phẩm')
            return
        }

        if (items.some(i => !i.product_id || i.quantity <= 0)) {
            toast.error('Vui lòng điền đầy đủ thông tin sản phẩm')
            return
        }

        setSaving(true)

        try {
            const subtotal = calculateSubtotal()
            const discountAmount = calculateDiscount()
            const total = calculateTotal()

            // Update order
            const { error: orderError } = await supabase
                .from('outbound_orders')
                .update({
                    type: orderType,
                    customer_id: customerId || null,
                    destination_id: destinationId || null,
                    note: note || null,
                    discount_type: discountType,
                    discount_value: discountValue,
                    discount_amount: discountAmount,
                    subtotal,
                    total
                })
                .eq('id', id)

            if (orderError) throw orderError

            // Delete existing items
            await supabase.from('outbound_order_items').delete().eq('order_id', id)

            // Insert new items
            const itemsToInsert = items.map(item => ({
                order_id: id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                line_total: item.quantity * item.unit_price,
                picked_quantity: 0
            }))

            const { error: itemsError } = await supabase
                .from('outbound_order_items')
                .insert(itemsToInsert)

            if (itemsError) throw itemsError

            toast.success('Đã lưu đơn hàng!')
            router.push(`/admin/outbound/${id}`)
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const filteredProducts = products.filter(p =>
        p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.name.toLowerCase().includes(productSearch.toLowerCase())
    ).slice(0, 50)

    if (loading) {
        return <div className="p-6 text-center">Đang tải...</div>
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href={`/admin/outbound/${id}`} className="h-10 w-10 flex items-center justify-center rounded-lg border hover:bg-gray-50">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">Sửa Đơn: {orderCode}</h1>
                    <p className="text-sm text-gray-500">Chỉnh sửa thông tin đơn hàng</p>
                </div>
            </div>

            {/* Order Info */}
            <div className="bg-white rounded-lg border p-4 space-y-4">
                <h2 className="font-medium text-gray-700">Thông tin đơn</h2>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Loại đơn</label>
                        <select
                            value={orderType}
                            onChange={(e) => setOrderType(e.target.value)}
                            className="w-full h-10 px-3 border rounded-lg"
                        >
                            <option value="SALE">Bán Hàng</option>
                            <option value="TRANSFER">Điều Chuyển</option>
                            <option value="INTERNAL">Nội Bộ</option>
                            <option value="GIFT">Quà Tặng</option>
                        </select>
                    </div>

                    {(orderType === 'SALE' || orderType === 'GIFT') ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Khách hàng</label>
                            <select
                                value={customerId}
                                onChange={(e) => setCustomerId(e.target.value)}
                                className="w-full h-10 px-3 border rounded-lg"
                            >
                                <option value="">Khách lẻ</option>
                                {customers.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Kho đích</label>
                            <select
                                value={destinationId}
                                onChange={(e) => setDestinationId(e.target.value)}
                                className="w-full h-10 px-3 border rounded-lg"
                            >
                                <option value="">Chọn kho đích</option>
                                {destinations.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Ghi chú</label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Ghi chú cho đơn hàng..."
                    />
                </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-lg border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <h2 className="font-medium">Danh sách sản phẩm ({items.length})</h2>
                    <button
                        onClick={addItem}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                        <Plus className="h-4 w-4" />
                        Thêm dòng
                    </button>
                </div>

                <table className="w-full">
                    <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="text-left px-4 py-2 w-[40%]">Sản phẩm</th>
                            <th className="text-center px-4 py-2">SL</th>
                            <th className="text-right px-4 py-2">Đơn giá</th>
                            <th className="text-right px-4 py-2">Thành tiền</th>
                            <th className="px-4 py-2 w-12"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="px-4 py-2">
                                    <select
                                        value={item.product_id}
                                        onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                                        className="w-full h-9 px-2 border rounded text-sm"
                                    >
                                        <option value="">Chọn sản phẩm</option>
                                        {filteredProducts.map(p => (
                                            <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                                        className="w-20 h-9 px-2 border rounded text-center"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="number"
                                        min="0"
                                        value={item.unit_price}
                                        onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                        className="w-28 h-9 px-2 border rounded text-right"
                                    />
                                </td>
                                <td className="px-4 py-2 text-right font-medium">
                                    {new Intl.NumberFormat('vi-VN').format(item.quantity * item.unit_price)}đ
                                </td>
                                <td className="px-4 py-2">
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
            </div>

            {/* Pricing */}
            <div className="bg-white rounded-lg border p-4 space-y-4">
                <h2 className="font-medium text-gray-700">Chiết khấu & Tổng</h2>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Loại CK</label>
                        <select
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value)}
                            className="w-full h-10 px-3 border rounded-lg"
                        >
                            <option value="PERCENT">Phần trăm (%)</option>
                            <option value="FIXED">Cố định (đ)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
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
                        <label className="block text-sm font-medium text-gray-600 mb-1">Thành tiền CK</label>
                        <div className="h-10 px-3 border rounded-lg bg-gray-50 flex items-center text-red-600 font-medium">
                            -{new Intl.NumberFormat('vi-VN').format(calculateDiscount())}đ
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Tạm tính</span>
                        <span>{new Intl.NumberFormat('vi-VN').format(calculateSubtotal())}đ</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg">
                        <span>Tổng cộng</span>
                        <span className="text-blue-600">{new Intl.NumberFormat('vi-VN').format(calculateTotal())}đ</span>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-12 bg-blue-600 text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Lưu Thay Đổi
            </button>
        </div>
    )
}
