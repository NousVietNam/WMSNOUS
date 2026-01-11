"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Plus, Save, Search, Trash2, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

export default function CreateOrderPage() {
    const router = useRouter()
    const [customerName, setCustomerName] = useState("")
    const [orderCode, setOrderCode] = useState("")

    const [items, setItems] = useState<{ product_id: string, sku: string, name: string, quantity: number, available: number }[]>([])
    const [showProductModal, setShowProductModal] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    // Auto-generate Order Code
    useEffect(() => {
        setOrderCode(`ORD-${Date.now().toString().slice(-6)}`)
    }, [])

    const handleSearchProducts = async () => {
        setLoading(true)
        // Fetch products + Aggregate Inventory
        // This is complex in Supabase JS client without a specific view, but we can do 2 queries.

        let query = supabase.from('products').select('id, sku, name, barcode')
        if (searchTerm) query = query.ilike('sku', `%${searchTerm}%`) // or name

        const { data: prods } = await query.limit(20)

        if (prods) {
            // Fetch inventory counts for these products
            const prodIds = prods.map(p => p.id)
            const { data: inv } = await supabase.from('inventory_items').select('product_id, quantity').in('product_id', prodIds)

            // Map inventory to products
            const prodsWithStock = prods.map(p => {
                const stock = inv?.filter(i => i.product_id === p.id).reduce((sum, i) => sum + i.quantity, 0) || 0
                return { ...p, stock }
            })
            setProducts(prodsWithStock)
        }
        setLoading(false)
    }

    const handleAddItem = (product: any) => {
        setItems(prev => {
            if (prev.find(i => i.product_id === product.id)) return prev
            return [...prev, {
                product_id: product.id,
                sku: product.sku,
                name: product.name,
                quantity: 1,
                available: product.stock
            }]
        })
        setShowProductModal(false)
    }

    const handleRemoveItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx))
    }

    const handleUpdateQuantity = (idx: number, qty: number) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item))
    }

    const handleSaveOrder = async () => {
        if (!customerName || items.length === 0) {
            alert("Vui lòng nhập tên khách và ít nhất 1 sản phẩm")
            return
        }
        setLoading(true)

        try {
            // 1. Create Order
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    code: orderCode,
                    customer_name: customerName,
                    status: 'PENDING'
                })
                .select()
                .single()

            if (orderError) throw orderError

            // 2. Create Order Items
            const orderItems = items.map(item => ({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
                picked_quantity: 0
            }))

            const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
            if (itemsError) throw itemsError

            alert("Tạo đơn hàng thành công!")
            router.push('/admin/orders')

        } catch (e: any) {
            alert("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">            <main className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <h1 className="text-2xl font-bold">Tạo Đơn Hàng Mới</h1>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* General Info */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader><CardTitle>Thông Tin</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Mã Đơn</Label>
                            <Input value={orderCode} onChange={e => setOrderCode(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Khách Hàng</Label>
                            <Input placeholder="Tên khách hàng..." value={customerName} onChange={e => setCustomerName(e.target.value)} />
                        </div>
                        <Button className="w-full mt-4" size="lg" onClick={handleSaveOrder} disabled={loading}>
                            <Save className="mr-2 h-4 w-4" />
                            {loading ? 'Đang Lưu...' : 'Lưu Đơn Hàng'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Line Items */}
                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Chi Tiết Đơn Hàng</CardTitle>
                        <Button size="sm" variant="outline" onClick={() => { setShowProductModal(true); handleSearchProducts(); }}>
                            <Plus className="mr-2 h-4 w-4" /> Thêm Sản Phẩm
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {items.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground border border-dashed rounded">
                                    Chưa có sản phẩm nào
                                </div>
                            ) : (
                                items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white border rounded shadow-sm gap-4">
                                        <div className="flex-1">
                                            <div className="font-bold">{item.sku}</div>
                                            <div className="text-sm text-slate-500 truncate">{item.name}</div>
                                            <div className="text-xs text-blue-600">Có sẵn: {item.available}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                className="w-20 text-center"
                                                value={item.quantity}
                                                onChange={e => handleUpdateQuantity(idx, parseInt(e.target.value))}
                                                min={1}
                                            />
                                            <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleRemoveItem(idx)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>

            {/* Product Selection Modal */}
            {showProductModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg h-[80vh] flex flex-col bg-white">
                        <CardHeader className="flex flex-row items-center justify-between border-b">
                            <CardTitle>Chọn Sản Phẩm</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setShowProductModal(false)}>
                                <X className="h-5 w-5" />
                            </Button>
                        </CardHeader>
                        <div className="p-4 border-b bg-slate-50 flex gap-2">
                            <Input
                                placeholder="Tìm SKU / Tên..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearchProducts()}
                            />
                            <Button onClick={handleSearchProducts} disabled={loading} size="icon">
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-auto p-2 space-y-2 bg-white">
                            {products.map(p => (
                                <div key={p.id} className="flex items-center justify-between p-3 border rounded hover:bg-slate-50 cursor-pointer bg-white" onClick={() => handleAddItem(p)}>
                                    <div>
                                        <div className="font-bold">{p.sku}</div>
                                        <div className="text-sm text-slate-600">{p.name}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-muted-foreground">Tồn kho</div>
                                        <div className={`font-bold ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>{p.stock}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
