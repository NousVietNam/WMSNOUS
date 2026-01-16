"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Plus, Save, Search, Trash2, X, Box as BoxIcon, Package, Upload, Download } from "lucide-react"
import { toast } from "sonner"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import Papa from "papaparse"

export default function CreateTransferPage() {
    const router = useRouter()

    // Form State
    const [destinationId, setDestinationId] = useState("")
    const [transferType, setTransferType] = useState<'BOX' | 'ITEM'>('ITEM')
    const [note, setNote] = useState("")
    const [code, setCode] = useState("")

    // Data State
    const [destinations, setDestinations] = useState<{ id: string, name: string }[]>([])

    // Selection State
    const [items, setItems] = useState<any[]>([]) // Stores selected items or boxes
    const [showModal, setShowModal] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [availableOptions, setAvailableOptions] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [importLoading, setImportLoading] = useState(false)

    useEffect(() => {
        setCode(`TRFx${Date.now().toString().slice(-6)}`)
        fetchInitialData()
    }, [])

    const fetchInitialData = async () => {
        // Fetch Destinations (Store Only)
        // type != 'customer'
        const { data: dests } = await supabase.from('destinations')
            .select('id, name')
            .neq('type', 'customer')
            .order('name')
        if (dests) setDestinations(dests)
    }

    const handleSearchOptions = async () => {
        setLoading(true)
        setAvailableOptions([])

        if (transferType === 'BOX') {
            // 1. Get List of Boxes currently in Active Transfers (Pending/Approved/Allocated/Picking)
            // We want to exclude them.
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

            // 2. Search Available Boxes in ENTIRE WAREHOUSE
            let query = supabase
                .from('boxes')
                .select('id, code, status, location_id')
                .neq('status', 'SHIPPED') // Only available boxes

            if (searchTerm) query = query.ilike('code', `%${searchTerm}%`)

            const { data } = await query.limit(50)
            if (data) {
                // Filter out already selected AND busy boxes
                const selectedIds = new Set(items.map(i => i.id))
                setAvailableOptions(data.filter(b => !selectedIds.has(b.id) && !busyBoxIds.has(b.id)))
            }

        } else {
            // Search Items in ENTIRE WAREHOUSE
            // Fix Search Logic: Separate queries if 'or' syntax is tricky inside client
            let products = []

            // Try simple ILIKE on sku first
            const { data: bySku } = await supabase.from('products').select('id, sku, name').ilike('sku', `%${searchTerm}%`).limit(20)
            products = bySku || []

            // If few results or no results, try name
            if (products.length < 20) {
                const { data: byName } = await supabase.from('products').select('id, sku, name').ilike('name', `%${searchTerm}%`).limit(20)
                if (byName) {
                    // Merge unique
                    const existing = new Set(products.map(p => p.id))
                    byName.forEach(p => !existing.has(p.id) && products.push(p))
                }
            }

            if (products.length > 0) {
                const prodIds = products.map(p => p.id)

                // A. Check Physical Inventory (Global)
                // REMOVED .gt('quantity', 0) to be safe, filter later
                const { data: inv } = await supabase.from('inventory_items')
                    .select('product_id, quantity, allocated_quantity')
                    .in('product_id', prodIds)

                // B. Check Soft Allocated (Pending/Approved Transfers)
                const { data: activeTransferItems } = await supabase
                    .from('transfer_order_items')
                    .select('product_id, quantity, transfer_orders!inner(status)')
                    // @ts-ignore
                    .in('transfer_orders.status', ['pending', 'approved', 'allocated'])
                    .in('product_id', prodIds)

                // Aggregate Soft Allocations
                const softAllocated = new Map<string, number>()
                activeTransferItems?.forEach((item: any) => {
                    const qty = item.quantity || 0
                    softAllocated.set(item.product_id, (softAllocated.get(item.product_id) || 0) + qty)
                })

                // Merge
                const options = []
                for (const p of products) {
                    // Physical Available = Qty - Hard Allocated
                    const physicalStock = inv?.filter(i => i.product_id === p.id).reduce((sum, x) => sum + (x.quantity - (x.allocated_quantity || 0)), 0) || 0

                    // Soft Available = Physical - Soft Allocated
                    const softQty = softAllocated.get(p.id) || 0
                    const finalStock = Math.max(0, physicalStock - softQty)

                    // Show even if 0 stock so user knows product exists but out of stock?
                    // User said "search k ra mã nào" -> "search doesn't return any code". He probably expects to see it even if 0?
                    // Usually transfer creation requires available stock.
                    // I'll stick to > 0 for now but rely on the fact that I fetched ALL inventory rows now, not just gt 0.

                    // Show even if 0 stock so user knows product exists
                    options.push({
                        id: p.id,
                        code: p.sku,
                        name: p.name,
                        stock: finalStock,
                        realStock: physicalStock
                    })
                }

                // Filter out already selected
                const selectedIds = new Set(items.map(i => i.id))
                setAvailableOptions(options.filter(o => !selectedIds.has(o.id)))
            }
        }
        setLoading(false)
    }

    const handleAddItem = (option: any) => {
        if (transferType === 'BOX') {
            setItems(prev => [...prev, {
                id: option.id,
                code: option.code
                // No quantity for box
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

    // CSV Import Logic
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (transferType === 'BOX') {
            toast.error("Import CSV chỉ hỗ trợ cho loại 'Sản Phẩm Lẻ'")
            return
        }

        setImportLoading(true)
        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                await processImport(results.data)
                setImportLoading(false)
                // Reset input
                e.target.value = ""
            },
            error: (err) => {
                toast.error("Lỗi đọc file: " + err.message)
                setImportLoading(false)
            }
        })
    }

    const processImport = async (rows: any[]) => {
        const skusRequested = new Map<string, number>()

        // 1. Parse Rows
        for (const row of rows) {
            const sku = row.SKU || row.sku
            const qty = parseInt(row.Quantity || row.quantity || row.qty || '0')
            if (sku && qty > 0) {
                skusRequested.set(sku, (skusRequested.get(sku) || 0) + qty)
            }
        }

        if (skusRequested.size === 0) {
            toast.error("File không có dữ liệu hợp lệ (Cần cột SKU, Quantity)")
            return
        }

        // 2. Resolve Products
        const skuList = Array.from(skusRequested.keys())
        const { data: products } = await supabase.from('products').select('id, sku, name').in('sku', skuList)

        if (!products || products.length === 0) {
            toast.error("Không tìm thấy sản phẩm nào khớp SKU")
            return
        }

        // 3. Check Inventory (Physical + Soft Allocation)
        const prodIds = products.map(p => p.id)

        // A. Physical
        const { data: inv } = await supabase.from('inventory_items')
            .select('product_id, quantity, allocated_quantity')
            .in('product_id', prodIds)
            .gt('quantity', 0)

        // B. Soft Allocation
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

        let addedCount = 0
        let newItems: any[] = []

        for (const p of products) {
            const requestedQty = skusRequested.get(p.sku) || 0

            // Physical
            const physicalStock = inv?.filter(i => i.product_id === p.id).reduce((sum, x) => sum + (x.quantity - (x.allocated_quantity || 0)), 0) || 0

            // Soft Available
            const softQty = softAllocated.get(p.id) || 0
            const stock = Math.max(0, physicalStock - softQty)

            if (stock > 0) {
                // Add to list, cap at stock
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

        // Merge with existing items
        setItems(prev => {
            // Avoid duplicates
            const existingIds = new Set(prev.map(i => i.id))
            const uniqueNew = newItems.filter(i => !existingIds.has(i.id))
            return [...prev, ...uniqueNew]
        })

        if (addedCount > 0) {
            toast.success(`Đã thêm ${addedCount} sản phẩm từ file CSV`)
        } else {
            toast.warning("Không thêm được sản phẩm nào (Hết hàng hoặc sai mã)")
        }
    }

    const handleDownloadTemplate = () => {
        const csvContent = "SKU,Quantity\nSP-001,10\nSP-002,5"
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', 'template_transfer_items.csv')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }


    const handleSave = async () => {
        if (!destinationId || items.length === 0) {
            toast.error("Vui lòng điền đủ thông tin và chọn ít nhất 1 mục")
            return
        }

        setLoading(true)
        try {
            // 1. Create Order
            // from_location_id omitted (NULL) implies "Any" or "Warehouse Level"
            const { data: order, error: orderError } = await supabase
                .from('transfer_orders')
                .insert({
                    code,
                    // from_location_id: null,
                    destination_id: destinationId,
                    transfer_type: transferType,
                    status: 'pending',
                    note,
                    created_by: (await supabase.auth.getUser()).data.user?.id
                })
                .select()
                .single()

            if (orderError) throw orderError

            // 2. Create Items
            const orderItems = items.map(item => {
                if (transferType === 'BOX') {
                    return {
                        transfer_id: order.id,
                        box_id: item.id,
                        quantity: 1
                    }
                } else {
                    return {
                        transfer_id: order.id,
                        product_id: item.id,
                        quantity: item.quantity,
                        // from_location_id: null // Auto-allocate from anywhere
                    }
                }
            })

            const { error: itemsError } = await supabase
                .from('transfer_order_items')
                .insert(orderItems)

            if (itemsError) throw itemsError

            toast.success("Tạo phiếu điều chuyển thành công")
            router.push('/admin/transfers')

        } catch (error: any) {
            console.error(error)
            toast.error("Lỗi: " + error.message)
            setLoading(false)
        }
    }

    // Reset items if type changes
    useEffect(() => {
        setItems([])
    }, [transferType])

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/admin/transfers')}>
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-2xl font-bold">Tạo Phiếu Điều Chuyển</h1>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {/* INFO CARD */}
                    <Card className="md:col-span-1 h-fit">
                        <CardHeader><CardTitle>Thông Tin Chung</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Mã Phiếu</Label>
                                <Input value={code} onChange={e => setCode(e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>Kho Nguồn</Label>
                                <Input value="Kho Chính (Mặc Định)" disabled className="bg-slate-100" />
                            </div>

                            <div className="space-y-2">
                                <Label>Nơi Đến (Cửa Hàng)</Label>
                                <Select value={destinationId} onValueChange={setDestinationId}>
                                    <SelectTrigger><SelectValue placeholder="Chọn nơi đến..." /></SelectTrigger>
                                    <SelectContent>
                                        {destinations.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Loại Điều Chuyển</Label>
                                <RadioGroup value={transferType} onValueChange={(v: 'BOX' | 'ITEM') => setTransferType(v)} className="flex gap-4">
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

                            <div className="space-y-2">
                                <Label>Ghi Chú</Label>
                                <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú thêm..." />
                            </div>

                            <Button className="w-full mt-4" size="lg" onClick={handleSave} disabled={loading}>
                                <Save className="mr-2 h-4 w-4" />
                                {loading ? 'Đang Xử Lý...' : 'Lưu Phiếu'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* ITEMS CARD */}
                    <Card className="md:col-span-2 min-h-[500px] flex flex-col">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>
                                {transferType === 'BOX' ? 'Danh Sách Thùng Hàng' : 'Danh Sách Sản Phẩm'}
                            </CardTitle>
                            <div className="flex gap-2">
                                {transferType === 'ITEM' && (
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
                                    {transferType === 'BOX' ? 'Chọn Thùng' : 'Thêm SP'}
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
                                                {transferType === 'BOX' ? <BoxIcon className="h-5 w-5 text-blue-600" /> : <Package className="h-5 w-5 text-green-600" />}
                                                <div>
                                                    <div className="font-bold">{item.code}</div>
                                                    {item.name && <div className="text-sm text-slate-500">{item.name}</div>}
                                                    {item.stock !== undefined && <div className="text-xs text-blue-600">Có sẵn: {item.stock}</div>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {transferType === 'ITEM' && (
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
                                    {transferType === 'BOX' ? 'Chọn Thùng Hàng' : 'Chọn Sản Phẩm'}
                                </CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => setShowModal(false)}>
                                    <X className="h-5 w-5" />
                                </Button>
                            </CardHeader>
                            <div className="p-4 border-b bg-slate-50 flex gap-2">
                                <Input
                                    placeholder={transferType === 'BOX' ? "Tìm mã thùng..." : "Tìm SKU / Tên..."}
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
                                            {transferType === 'BOX' ? <BoxIcon className="h-4 w-4 text-slate-500" /> : <Package className="h-4 w-4 text-slate-500" />}
                                            <div>
                                                <div className="font-bold">{opt.code}</div>
                                                {opt.name && <div className="text-sm text-slate-600">{opt.name}</div>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {transferType === 'BOX' ? (
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
            </main>
        </div>
    )
}
