"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Plus, Save, Search, Trash2, X, Box as BoxIcon, Package, Upload, Download, Eye, User } from "lucide-react"
import { toast } from "sonner"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Papa from "papaparse"

export default function CreateOrderPage() {
    const router = useRouter()

    // Form State
    const [customerName, setCustomerName] = useState("")
    const [orderType, setOrderType] = useState<'BOX' | 'ITEM'>('ITEM')
    const [note, setNote] = useState("")
    const [code, setCode] = useState("")

    // Selection State
    const [items, setItems] = useState<any[]>([]) // Stores selected items or boxes
    const [destinations, setDestinations] = useState<any[]>([])
    const [customerId, setCustomerId] = useState("")
    const [showModal, setShowModal] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [availableOptions, setAvailableOptions] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [importLoading, setImportLoading] = useState(false)

    // Box Viewer State
    const [viewingBox, setViewingBox] = useState<{ id: string, code: string } | null>(null)
    const [boxDetails, setBoxDetails] = useState<any[]>([])
    const [loadingDetails, setLoadingDetails] = useState(false)

    useEffect(() => {
        if (viewingBox) {
            fetchBoxDetails(viewingBox.id)
        }
    }, [viewingBox])

    const fetchBoxDetails = async (boxId: string) => {
        setLoadingDetails(true)
        const { data, error } = await supabase.from('inventory_items')
            .select('*, products(name, sku)')
            .eq('box_id', boxId)
            .gt('quantity', 0)

        if (data) setBoxDetails(data)
        setLoadingDetails(false)
    }

    useEffect(() => {
        setCode(`ORD-${Date.now().toString().slice(-6)}`)
        fetchCustomers()
    }, [])

    const fetchCustomers = async () => {
        const { data } = await supabase.from('destinations')
            .select('id, name, code, phone')
            .eq('type', 'customer')
            .order('name')
        if (data) setDestinations(data)
    }

    const handleSearchOptions = async () => {
        setLoading(true)
        setAvailableOptions([])

        if (orderType === 'BOX') {
            // 1. Get List of Boxes currently in Active Transfers OR Linked to an Active Order
            // Filter out boxes that are part of an active Transfer
            const { data: activeTransfers } = await supabase
                .from('transfer_orders')
                .select('id')
                .in('status', ['pending', 'approved', 'allocated', 'picking'])

            let busyBoxIds = new Set<string>()
            if (activeTransfers && activeTransfers.length > 0) {
                const transferIds = activeTransfers.map(t => t.id)
                const { data: busyItems } = await supabase
                    .from('transfer_order_items')
                    .select('box_id')
                    .in('transfer_id', transferIds)
                    .not('box_id', 'is', null)

                busyItems?.forEach(i => i.box_id && busyBoxIds.add(i.box_id))
            }

            // Also filter out boxes already linked to an active Order (if we support that check)
            // But 'boxes' table has 'order_id' column directly? If so, we check that.
            // Assuming boxes.order_id implies it's packed/associated.
            // Actually, for 'Sales Order by Box', we will SET the order_id. So we need to make sure order_id is NULL.

            // 2. Search Available Boxes in ENTIRE WAREHOUSE
            let query = supabase
                .from('boxes')
                .select('id, code, status, location_id, order_id')
                .neq('status', 'SHIPPED')
                .is('order_id', null) // Must not be linked to another order

            if (searchTerm) query = query.ilike('code', `%${searchTerm}%`)

            const { data } = await query.limit(50)
            if (data) {
                // Filter out already selected AND busy boxes (transfer busy)
                const selectedIds = new Set(items.map(i => i.id))
                setAvailableOptions(data.filter(b => !selectedIds.has(b.id) && !busyBoxIds.has(b.id)))
            }

        } else {
            // Search Items (Reuse logic from Transfer)
            let products = []

            // Try simple ILIKE on sku first
            const { data: bySku } = await supabase.from('products').select('id, sku, name').ilike('sku', `%${searchTerm}%`).limit(20)
            products = bySku || []

            // If few results or no results, try name
            if (products.length < 20) {
                const { data: byName } = await supabase.from('products').select('id, sku, name').ilike('name', `%${searchTerm}%`).limit(20)
                if (byName) {
                    const existing = new Set(products.map(p => p.id))
                    byName.forEach(p => !existing.has(p.id) && products.push(p))
                }
            }

            if (products.length > 0) {
                const prodIds = products.map(p => p.id)

                // A. Check Physical Inventory
                const { data: inv } = await supabase.from('inventory_items')
                    .select('product_id, quantity, allocated_quantity')
                    .in('product_id', prodIds)

                // B. Check Soft Allocated (Transfers) - reused logic for accuracy
                const { data: activeTransferItems } = await supabase
                    .from('transfer_order_items')
                    .select('product_id, quantity, transfer_orders!inner(status)')
                    // @ts-ignore
                    .in('transfer_orders.status', ['pending', 'approved', 'allocated'])
                    .in('product_id', prodIds)

                const softAllocated = new Map<string, number>()
                activeTransferItems?.forEach((item: any) => {
                    const qty = item.quantity || 0
                    softAllocated.set(item.product_id, (softAllocated.get(item.product_id) || 0) + qty)
                })

                const options = []
                for (const p of products) {
                    const physicalStock = inv?.filter(i => i.product_id === p.id).reduce((sum, x) => sum + (x.quantity - (x.allocated_quantity || 0)), 0) || 0
                    const softQty = softAllocated.get(p.id) || 0
                    const finalStock = Math.max(0, physicalStock - softQty)

                    options.push({
                        id: p.id,
                        code: p.sku,
                        name: p.name,
                        stock: finalStock,
                        realStock: physicalStock
                    })
                }

                const selectedIds = new Set(items.map(i => i.id))
                setAvailableOptions(options.filter(o => !selectedIds.has(o.id)))
            }
        }
        setLoading(false)
    }

    const handleAddItem = (option: any) => {
        if (orderType === 'BOX') {
            setItems(prev => [...prev, {
                id: option.id,
                code: option.code
            }])
        } else {
            setItems(prev => [...prev, {
                id: option.id,
                code: option.code,
                name: option.name,
                stock: option.stock,
                quantity: 1
            }])
        }
        setShowModal(false)
    }

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index))
    }

    const handleUpdateQuantity = (index: number, qty: number) => {
        setItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: qty } : item))
    }

    // CSV Import Logic (Only for Items)
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (orderType === 'BOX') {
            toast.error("Import CSV chỉ hỗ trợ cho loại 'Sản Phẩm Lẻ'")
            return
        }

        setImportLoading(true)
        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                await processImport(results.data)
                setImportLoading(false)
                e.target.value = ""
            },
            error: (err) => {
                toast.error("Lỗi đọc file: " + err.message)
                setImportLoading(false)
            }
        })
    }

    const processImport = async (rows: any[]) => {
        // Reuse import logic from Transfer
        const skusRequested = new Map<string, number>()
        for (const row of rows) {
            const sku = row.SKU || row.sku
            const qty = parseInt(row.Quantity || row.quantity || row.qty || '0')
            if (sku && qty > 0) {
                skusRequested.set(sku, (skusRequested.get(sku) || 0) + qty)
            }
        }

        if (skusRequested.size === 0) {
            toast.error("File không hợp lệ")
            return
        }

        const skuList = Array.from(skusRequested.keys())
        const { data: products } = await supabase.from('products').select('id, sku, name').in('sku', skuList)

        if (!products || products.length === 0) {
            toast.error("Không tìm thấy sản phẩm nào khớp SKU")
            return
        }

        // Check stock (omitted for brevity, assume user knows what they are doing or handled by save validation)
        // Ideally we should check stock here too. Let's do a quick physical check.
        const prodIds = products.map(p => p.id)
        const { data: inv } = await supabase.from('inventory_items').select('product_id, quantity, allocated_quantity').in('product_id', prodIds)

        let addedCount = 0
        let newItems: any[] = []

        for (const p of products) {
            const requestedQty = skusRequested.get(p.sku) || 0
            const stock = inv?.filter(i => i.product_id === p.id).reduce((sum, x) => sum + (x.quantity - (x.allocated_quantity || 0)), 0) || 0

            if (stock > 0) {
                const safeQty = Math.min(requestedQty, stock)
                newItems.push({
                    id: p.id,
                    code: p.sku,
                    name: p.name,
                    stock: stock,
                    quantity: safeQty
                })
                addedCount++
            }
        }

        setItems(prev => {
            const existingIds = new Set(prev.map(i => i.id))
            const uniqueNew = newItems.filter(i => !existingIds.has(i.id))
            return [...prev, ...uniqueNew]
        })

        if (addedCount > 0) toast.success(`Đã thêm ${addedCount} sản phẩm`)
        else toast.warning("Không thêm được sản phẩm nào (Hết hàng)")
    }

    const handleDownloadTemplate = () => {
        const csvContent = "SKU,Quantity\nSP-001,10\nSP-002,5"
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', 'template_order_items.csv')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleSave = async () => {
        if (!customerId || items.length === 0) {
            toast.error("Vui lòng chọn khách hàng và ít nhất 1 mục")
            return
        }

        const selectedCustomer = destinations.find(d => d.id === customerId)
        if (!selectedCustomer) return

        setLoading(true)
        try {
            const payload = {
                code,
                customerName: selectedCustomer.name, // Send Name as before
                customerId: selectedCustomer.id, // Send ID in case API supports it later
                note,
                type: orderType,
                items: orderType === 'ITEM' ? items.map(i => ({ id: i.id, quantity: i.quantity })) : [],
                boxes: orderType === 'BOX' ? items.map(i => ({ id: i.id, code: i.code })) : []
            }

            const res = await fetch('/api/orders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const json = await res.json()
            if (!json.success) throw new Error(json.error)

            toast.success("Tạo đơn hàng thành công")
            router.push('/admin/orders')

        } catch (error: any) {
            console.error(error)
            toast.error("Lỗi: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    // Reset items if type changes
    useEffect(() => {
        setItems([])
    }, [orderType])

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/admin/orders')}>
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-2xl font-bold">Tạo Đơn Hàng Mới</h1>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {/* INFO CARD */}
                    <Card className="md:col-span-1 h-fit">
                        <CardHeader><CardTitle>Thông Tin Chung</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Mã Đơn</Label>
                                <Input value={code} onChange={e => setCode(e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>Khách Hàng</Label>
                                <Select value={customerId} onValueChange={setCustomerId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Chọn khách hàng..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {destinations.length === 0 ? (
                                            <div className="p-2 text-sm text-muted-foreground">Chưa có khách hàng. Vui lòng tạo ở mục Quản Lý Điểm Đến.</div>
                                        ) : destinations.map(d => (
                                            <SelectItem key={d.id} value={d.id}>
                                                {d.name} ({d.code})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Loại Đơn Hàng</Label>
                                <RadioGroup value={orderType} onValueChange={(v: 'BOX' | 'ITEM') => setOrderType(v)} className="flex gap-4">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="ITEM" id="type-item" />
                                        <Label htmlFor="type-item">Sản Phẩm Lẻ</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="BOX" id="type-box" />
                                        <Label htmlFor="type-box">Nguyên Thùng</Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            {orderType === 'BOX' && (
                                <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded border border-blue-200">
                                    Chế độ này sẽ gán các thùng hàng vào đơn. Hệ thống sẽ tạo lệnh lấy nguyên thùng.
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Ghi Chú</Label>
                                <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú đơn hàng..." />
                            </div>

                            <Button className="w-full mt-4" size="lg" onClick={handleSave} disabled={loading}>
                                <Save className="mr-2 h-4 w-4" />
                                {loading ? 'Đang Lưu...' : 'Lưu Đơn Hàng'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* ITEMS CARD */}
                    <Card className="md:col-span-2 min-h-[500px] flex flex-col">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>
                                {orderType === 'BOX' ? 'Danh Sách Thùng Hàng' : 'Danh Sách Sản Phẩm'}
                            </CardTitle>
                            <div className="flex gap-2">
                                {orderType === 'ITEM' && (
                                    <>
                                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate} title="Tải file mẫu">
                                            <Download className="h-4 w-4" />
                                        </Button>
                                        <div className="relative">
                                            <Button variant="outline" size="sm" disabled={importLoading}>
                                                <Upload className="mr-2 h-4 w-4" /> Import CSV
                                            </Button>
                                            <input
                                                type="file"
                                                accept=".csv"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                onChange={handleFileUpload}
                                                disabled={importLoading}
                                            />
                                        </div>
                                    </>
                                )}
                                <Button size="sm" variant="default" onClick={() => { setShowModal(true); setSearchTerm(""); setAvailableOptions([]); }}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    {orderType === 'BOX' ? 'Chọn Thùng' : 'Thêm SP'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            {items.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground border border-dashed rounded">
                                    Chưa có mục nào được chọn
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {items.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-white border rounded shadow-sm gap-4">
                                            <div className="flex items-center gap-3 flex-1">
                                                {orderType === 'BOX' ? <BoxIcon className="h-5 w-5 text-blue-600" /> : <Package className="h-5 w-5 text-green-600" />}
                                                <div>
                                                    <div className="font-bold">{item.code}</div>
                                                    {item.name && <div className="text-sm text-slate-500">{item.name}</div>}
                                                    {item.stock !== undefined && <div className="text-xs text-blue-600">Có sẵn: {item.stock}</div>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {orderType === 'BOX' && (
                                                    <Button variant="ghost" size="icon" onClick={() => setViewingBox({ id: item.id, code: item.code })}>
                                                        <Eye className="h-4 w-4 text-blue-500" />
                                                    </Button>
                                                )}
                                                {orderType === 'ITEM' && (
                                                    <Input
                                                        type="number"
                                                        className="w-20 text-center"
                                                        value={item.quantity}
                                                        onChange={e => handleUpdateQuantity(idx, parseInt(e.target.value))}
                                                        min={1}
                                                        max={item.stock}
                                                    />
                                                )}
                                                <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleRemoveItem(idx)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* SELECTION MODAL */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <Card className="w-full max-w-lg h-[80vh] flex flex-col bg-white">
                            <CardHeader className="flex flex-row items-center justify-between border-b py-3">
                                <CardTitle className="text-lg">
                                    {orderType === 'BOX' ? 'Chọn Thùng Hàng' : 'Chọn Sản Phẩm'}
                                </CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => setShowModal(false)}>
                                    <X className="h-5 w-5" />
                                </Button>
                            </CardHeader>
                            <div className="p-4 border-b bg-slate-50 flex gap-2">
                                <Input
                                    placeholder={orderType === 'BOX' ? "Tìm mã thùng..." : "Tìm SKU / Tên..."}
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearchOptions()}
                                    autoFocus
                                />
                                <Button onClick={handleSearchOptions} disabled={loading} size="icon">
                                    <Search className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex-1 overflow-auto p-2 space-y-2 bg-white">
                                {loading && <div className="text-center p-4">Đang tìm...</div>}
                                {!loading && availableOptions.length === 0 && (
                                    <div className="text-center p-4 text-muted-foreground">Không tìm thấy kết quả hoặc đã chọn hết.</div>
                                )}
                                {availableOptions.map(opt => (
                                    <div key={opt.id} className="flex items-center justify-between p-3 border rounded hover:bg-slate-50 cursor-pointer" onClick={() => handleAddItem(opt)}>
                                        <div className="flex items-center gap-3">
                                            {orderType === 'BOX' ? <BoxIcon className="h-4 w-4 text-slate-500" /> : <Package className="h-4 w-4 text-slate-500" />}
                                            <div>
                                                <div className="font-bold">{opt.code}</div>
                                                {opt.name && <div className="text-sm text-slate-600">{opt.name}</div>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {orderType === 'BOX' ? (
                                                <div className="text-xs bg-slate-100 px-2 py-1 rounded">{opt.status}</div>
                                            ) : (
                                                <div className="text-xs font-bold text-green-600">Sẵn: {opt.stock}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                {/* VIEW BOX DETAILS DIALOG */}
                {viewingBox && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <Card className="w-full max-w-lg max-h-[80vh] flex flex-col bg-white">
                            <CardHeader className="flex flex-row items-center justify-between border-b py-3">
                                <CardTitle className="text-lg">Chi tiết thùng {viewingBox.code}</CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => setViewingBox(null)}>
                                    <X className="h-5 w-5" />
                                </Button>
                            </CardHeader>
                            <div className="flex-1 overflow-auto p-4">
                                {loadingDetails ? (
                                    <div className="text-center py-8">Đang tải dữ liệu...</div>
                                ) : boxDetails.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">Thùng rỗng</div>
                                ) : (
                                    <div className="space-y-4">
                                        {boxDetails.map((item: any) => (
                                            <div key={item.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                                                <div>
                                                    <div className="font-medium">{item.products?.name || 'Sản phẩm không tên'}</div>
                                                    <div className="text-xs text-slate-500">SKU: {item.products?.sku}</div>
                                                </div>
                                                <div className="font-bold text-lg">x{item.quantity}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t bg-slate-50 text-right">
                                <Button onClick={() => setViewingBox(null)}>Đóng</Button>
                            </div>
                        </Card>
                    </div>
                )}
            </main>
        </div>
    )
}
