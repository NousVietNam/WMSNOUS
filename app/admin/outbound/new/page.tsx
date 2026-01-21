"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { ArrowLeft, Plus, Trash2, Loader2, Box as BoxIcon, Package } from "lucide-react"
import { toast } from "sonner"

type Product = {
    id: string
    sku: string
    name: string
    price?: number
}

type Customer = {
    id: string
    name: string
}

type Destination = {
    id: string
    name: string
}

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
    discount_percent: number
    box_id?: string
}

type SelectedBox = {
    box_id: string
    box_code: string
    items: { product_id: string; sku: string; name: string; quantity: number }[]
}

export default function NewOutboundPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const defaultType = searchParams.get('type') || 'SALE'

    const [type, setType] = useState<string>(defaultType)
    const [transferType, setTransferType] = useState<'ITEM' | 'BOX'>('ITEM')
    const [customerId, setCustomerId] = useState<string>('')
    const [destinationId, setDestinationId] = useState<string>('')

    // ITEM mode
    const [items, setItems] = useState<OrderItem[]>([])

    // BOX mode
    const [selectedBoxes, setSelectedBoxes] = useState<SelectedBox[]>([])
    const [boxSearchQuery, setBoxSearchQuery] = useState('')
    const [availableBoxes, setAvailableBoxes] = useState<BoxWithItems[]>([])
    const [loadingBoxes, setLoadingBoxes] = useState(false)

    const [discountType, setDiscountType] = useState<string>('')
    const [discountValue, setDiscountValue] = useState<number>(0)
    const [note, setNote] = useState<string>('')
    const [loading, setLoading] = useState(false)

    // Dropdowns
    const [products, setProducts] = useState<Product[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [destinations, setDestinations] = useState<Destination[]>([])

    useEffect(() => {
        fetchDropdowns()
    }, [])

    const fetchDropdowns = async () => {
        const [prodRes, custRes, destRes] = await Promise.all([
            supabase.from('products').select('id, sku, name').limit(500),
            supabase.from('customers').select('id, name').limit(200),
            supabase.from('destinations').select('id, name').limit(100)
        ])
        if (prodRes.data) setProducts(prodRes.data)
        if (custRes.data) setCustomers(custRes.data)
        if (destRes.data) setDestinations(destRes.data)
    }

    // BOX mode: Search boxes
    const searchBoxes = async () => {
        if (!boxSearchQuery.trim()) return
        setLoadingBoxes(true)

        const { data, error } = await supabase
            .from('boxes')
            .select(`
                id, code,
                locations (code),
                inventory_items (id, product_id, quantity, products (sku, name))
            `)
            .ilike('code', `%${boxSearchQuery}%`)
            .eq('type', 'STORAGE')
            .limit(20)

        if (!error && data) {
            setAvailableBoxes(data as unknown as BoxWithItems[])
        }
        setLoadingBoxes(false)
    }

    const addBox = (box: BoxWithItems) => {
        if (selectedBoxes.find(b => b.box_id === box.id)) {
            toast.error("Thùng đã được chọn")
            return
        }

        const boxItems = (box.inventory_items || []).map(item => ({
            product_id: item.product_id,
            sku: item.products?.sku || '',
            name: item.products?.name || '',
            quantity: item.quantity
        }))

        setSelectedBoxes([...selectedBoxes, {
            box_id: box.id,
            box_code: box.code,
            items: boxItems
        }])
        setBoxSearchQuery('')
        setAvailableBoxes([])
    }

    const removeBox = (boxId: string) => {
        setSelectedBoxes(selectedBoxes.filter(b => b.box_id !== boxId))
    }

    // ITEM mode functions
    const addItem = () => {
        setItems([...items, { product_id: '', quantity: 1, unit_price: 0, discount_percent: 0 }])
    }

    const updateItem = (index: number, field: keyof OrderItem, value: any) => {
        const newItems = [...items]
        newItems[index] = { ...newItems[index], [field]: value }

        if (field === 'product_id') {
            const product = products.find(p => p.id === value)
            if (product) {
                newItems[index].product = product
                newItems[index].unit_price = product.price || 0
            }
        }

        setItems(newItems)
    }

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    // Calculations
    const calculateSubtotal = () => {
        if (transferType === 'BOX') {
            return 0 // Box orders usually don't have pricing (internal transfer)
        }
        return items.reduce((sum, item) => {
            const lineTotal = item.unit_price * item.quantity * (1 - item.discount_percent / 100)
            return sum + lineTotal
        }, 0)
    }

    const calculateDiscount = () => {
        const subtotal = calculateSubtotal()
        if (discountType === 'PERCENT') return subtotal * discountValue / 100
        if (discountType === 'FIXED') return discountValue
        return 0
    }

    const calculateTotal = () => {
        return calculateSubtotal() - calculateDiscount()
    }

    const handleSubmit = async () => {
        // Validation
        if (transferType === 'ITEM' && items.length === 0) {
            toast.error("Vui lòng thêm ít nhất 1 sản phẩm")
            return
        }

        if (transferType === 'BOX' && selectedBoxes.length === 0) {
            toast.error("Vui lòng chọn ít nhất 1 thùng")
            return
        }

        if ((type === 'SALE' || type === 'GIFT') && !customerId && customers.length > 0) {
            toast.error("Vui lòng chọn khách hàng")
            return
        }

        if (type === 'TRANSFER' && !destinationId && destinations.length > 0) {
            toast.error("Vui lòng chọn điểm đến")
            return
        }

        setLoading(true)
        try {
            // Build items array based on mode
            let submitItems: any[] = []

            if (transferType === 'ITEM') {
                submitItems = items.map(i => ({
                    product_id: i.product_id,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                    discount_percent: i.discount_percent
                }))
            } else {
                // BOX mode: Flatten all items from selected boxes
                selectedBoxes.forEach(box => {
                    box.items.forEach(item => {
                        submitItems.push({
                            product_id: item.product_id,
                            quantity: item.quantity,
                            unit_price: 0,
                            discount_percent: 0,
                            box_id: box.box_id
                        })
                    })
                })
            }

            const res = await fetch('/api/outbound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    transfer_type: transferType,
                    customer_id: customerId || null,
                    destination_id: destinationId || null,
                    items: submitItems,
                    discount_type: discountType || null,
                    discount_value: discountValue,
                    note
                })
            })

            const data = await res.json()
            if (data.success) {
                toast.success("Tạo đơn thành công!")
                router.push(`/admin/outbound/${data.data.id}`)
            } else {
                toast.error(data.error || "Lỗi tạo đơn")
            }
        } catch (e) {
            toast.error("Lỗi kết nối")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/admin/outbound" className="h-10 w-10 flex items-center justify-center rounded-lg border hover:bg-gray-50">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-2xl font-bold">Tạo Đơn Xuất Kho Mới</h1>
            </div>

            {/* Type Selection */}
            <div className="bg-white p-4 rounded-lg border space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Loại đơn</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="w-full h-10 px-3 border rounded-lg"
                        >
                            <option value="SALE">Bán Hàng</option>
                            <option value="TRANSFER">Điều Chuyển</option>
                            <option value="INTERNAL">Nội Bộ</option>
                            <option value="GIFT">Quà Tặng</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Hình thức</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setTransferType('ITEM')}
                                className={`flex-1 h-10 px-4 rounded-lg border-2 flex items-center justify-center gap-2 font-medium transition-all
                                    ${transferType === 'ITEM'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <Package className="h-4 w-4" />
                                Lấy Lẻ
                            </button>
                            <button
                                onClick={() => setTransferType('BOX')}
                                className={`flex-1 h-10 px-4 rounded-lg border-2 flex items-center justify-center gap-2 font-medium transition-all
                                    ${transferType === 'BOX'
                                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <BoxIcon className="h-4 w-4" />
                                Lấy Thùng
                            </button>
                        </div>
                    </div>
                </div>

                {(type === 'SALE' || type === 'GIFT') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
                        <select
                            value={customerId}
                            onChange={(e) => setCustomerId(e.target.value)}
                            className="w-full h-10 px-3 border rounded-lg"
                        >
                            <option value="">-- Chọn khách hàng --</option>
                            {customers.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {type === 'TRANSFER' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Điểm đến</label>
                        <select
                            value={destinationId}
                            onChange={(e) => setDestinationId(e.target.value)}
                            className="w-full h-10 px-3 border rounded-lg"
                        >
                            <option value="">-- Chọn điểm đến --</option>
                            {destinations.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* BOX MODE: Box Selection */}
            {transferType === 'BOX' && (
                <div className="bg-white rounded-lg border">
                    <div className="px-4 py-3 border-b bg-orange-50">
                        <h2 className="font-medium text-orange-700 flex items-center gap-2">
                            <BoxIcon className="h-5 w-5" />
                            Chọn Thùng
                        </h2>
                    </div>

                    {/* Box Search */}
                    <div className="p-4 border-b">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Nhập mã thùng để tìm..."
                                value={boxSearchQuery}
                                onChange={(e) => setBoxSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && searchBoxes()}
                                className="flex-1 h-10 px-3 border rounded-lg"
                            />
                            <button
                                onClick={searchBoxes}
                                disabled={loadingBoxes}
                                className="h-10 px-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                            >
                                {loadingBoxes ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tìm'}
                            </button>
                        </div>

                        {/* Search Results */}
                        {availableBoxes.length > 0 && (
                            <div className="mt-3 border rounded-lg max-h-48 overflow-y-auto">
                                {availableBoxes.map(box => (
                                    <div
                                        key={box.id}
                                        onClick={() => addBox(box)}
                                        className="p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                    >
                                        <div>
                                            <div className="font-mono font-bold">{box.code}</div>
                                            <div className="text-xs text-gray-500">
                                                {box.inventory_items?.length || 0} loại SP •
                                                {box.inventory_items?.reduce((s, i) => s + i.quantity, 0) || 0} tổng SL
                                            </div>
                                        </div>
                                        <Plus className="h-5 w-5 text-orange-500" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected Boxes */}
                    <div className="p-4 space-y-3">
                        {selectedBoxes.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">Chưa chọn thùng nào</div>
                        ) : (
                            selectedBoxes.map(box => (
                                <div key={box.box_id} className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-mono font-bold text-orange-700">{box.box_code}</div>
                                        <button
                                            onClick={() => removeBox(box.box_id)}
                                            className="text-red-500 hover:bg-red-50 p-1 rounded"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="text-sm space-y-1">
                                        {box.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between">
                                                <span>{item.sku} - {item.name}</span>
                                                <span className="font-medium">x{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ITEM MODE: Product Selection */}
            {transferType === 'ITEM' && (
                <div className="bg-white rounded-lg border">
                    <div className="px-4 py-3 border-b flex justify-between items-center">
                        <h2 className="font-medium">Sản phẩm</h2>
                        <button onClick={addItem} className="h-8 px-3 bg-blue-600 text-white text-sm rounded flex items-center gap-1">
                            <Plus className="h-4 w-4" /> Thêm
                        </button>
                    </div>
                    <div className="p-4 space-y-3">
                        {items.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">Chưa có sản phẩm nào</div>
                        ) : (
                            items.map((item, index) => (
                                <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                                    <select
                                        value={item.product_id}
                                        onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                                        className="flex-1 h-9 px-2 border rounded text-sm"
                                    >
                                        <option value="">-- Chọn SP --</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        placeholder="SL"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                        className="w-20 h-9 px-2 border rounded text-sm text-center"
                                        min={1}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Giá"
                                        value={item.unit_price}
                                        onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                        className="w-28 h-9 px-2 border rounded text-sm text-right"
                                    />
                                    <input
                                        type="number"
                                        placeholder="CK%"
                                        value={item.discount_percent}
                                        onChange={(e) => updateItem(index, 'discount_percent', parseFloat(e.target.value) || 0)}
                                        className="w-16 h-9 px-2 border rounded text-sm text-center"
                                        min={0}
                                        max={100}
                                    />
                                    <button onClick={() => removeItem(index)} className="h-9 w-9 flex items-center justify-center text-red-500 hover:bg-red-50 rounded">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Pricing (Only for ITEM mode) */}
            {transferType === 'ITEM' && (
                <div className="bg-white p-4 rounded-lg border space-y-4">
                    <h2 className="font-medium">Giá & Chiết khấu</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">Loại chiết khấu</label>
                            <select
                                value={discountType}
                                onChange={(e) => setDiscountType(e.target.value)}
                                className="w-full h-9 px-2 border rounded text-sm"
                            >
                                <option value="">Không</option>
                                <option value="PERCENT">Phần trăm (%)</option>
                                <option value="FIXED">Cố định (VNĐ)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">Giá trị</label>
                            <input
                                type="number"
                                value={discountValue}
                                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                className="w-full h-9 px-2 border rounded text-sm"
                                disabled={!discountType}
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Tạm tính</span>
                            <span>{new Intl.NumberFormat('vi-VN').format(calculateSubtotal())}đ</span>
                        </div>
                        {calculateDiscount() > 0 && (
                            <div className="flex justify-between text-red-600">
                                <span>Chiết khấu</span>
                                <span>-{new Intl.NumberFormat('vi-VN').format(calculateDiscount())}đ</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-lg pt-2 border-t">
                            <span>Tổng cộng</span>
                            <span className="text-blue-600">{new Intl.NumberFormat('vi-VN').format(calculateTotal())}đ</span>
                        </div>
                    </div>
                </div>
            )}


            {/* Note */}
            <div className="bg-white p-4 rounded-lg border">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full h-20 px-3 py-2 border rounded-lg text-sm"
                    placeholder="Ghi chú thêm..."
                />
            </div>

            {/* Submit */}
            <button
                onClick={handleSubmit}
                disabled={loading || (transferType === 'ITEM' ? items.length === 0 : selectedBoxes.length === 0)}
                className={`w-full h-12 text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50
                    ${transferType === 'BOX'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
            >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {transferType === 'BOX' ? 'Tạo Đơn Lấy Thùng' : 'Tạo Đơn Xuất Kho'}
            </button>
        </div >
    )
}
