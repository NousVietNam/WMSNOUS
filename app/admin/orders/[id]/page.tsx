"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { AlertCircle, ArrowLeft, Box, CheckCircle, ClipboardList, Play, Truck, User, Lock, Edit, ShieldCheck, Plus } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth/AuthProvider"
import { Input } from "@/components/ui/input"

export default function OrderDetailPage() {
    const { id } = useParams()
    const router = useRouter()
    const { session } = useAuth()

    // Data State
    const [order, setOrder] = useState<any>(null)
    const [items, setItems] = useState<any[]>([])
    const [boxes, setBoxes] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
    const [availableStock, setAvailableStock] = useState<Record<string, number>>({})
    const [availableUsers, setAvailableUsers] = useState<any[]>([])

    // UI State
    const [loading, setLoading] = useState(true)
    const [allocating, setAllocating] = useState(false)

    // Shortage Report State
    const [shortageDialog, setShortageDialog] = useState(false)
    const [shortageData, setShortageData] = useState<any[]>([])

    // Edit Order State
    const [editMode, setEditMode] = useState(false)
    const [editingItems, setEditingItems] = useState<any[]>([])
    const [savingEdit, setSavingEdit] = useState(false)

    // Add Item State
    const [addItemOpen, setAddItemOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [foundProducts, setFoundProducts] = useState<any[]>([])

    const searchProducts = async (term: string) => {
        if (!term || term.length < 2) {
            setFoundProducts([])
            return
        }
        const { data } = await supabase
            .from('products')
            .select('id, sku, name')
            .or(`sku.ilike.%${term}%,name.ilike.%${term}%`)
            .limit(10)
        setFoundProducts(data || [])
    }

    const addItemToOrder = (product: any) => {
        // Check if exists
        const exists = editingItems.find(i => i.product_id === product.id)
        if (exists) {
            alert("Sản phẩm đã có trong đơn hàng!")
            return
        }
        // Add new
        setEditingItems([...editingItems, {
            product_id: product.id,
            products: product, // For display
            quantity: 1,
            allocated_quantity: 0,
            picked_quantity: 0
        }])
    }

    useEffect(() => {
        if (id) fetchOrder()
    }, [id])

    const fetchOrder = async () => {
        setLoading(true)
        // Fetch Order
        const { data: orderData } = await supabase.from('orders').select('*').eq('id', id).single()
        setOrder(orderData)

        // Fetch Items (for ITEM orders)
        const { data: itemData } = await supabase
            .from('order_items')
            .select('*, products(id, name, sku, barcode)')
            .eq('order_id', id)
            .order('id')
        setItems(itemData || [])
        setEditingItems(JSON.parse(JSON.stringify(itemData || []))) // Init edit state

        // Fetch Boxes (for BOX orders)
        const { data: boxData } = await supabase
            .from('boxes')
            .select('id, code, status, location_id, inventory_items(quantity, products(sku, name))')
            .eq('order_id', id)
        setBoxes(boxData || [])

        // Fetch Jobs
        const { data: jobData } = await supabase
            .from('picking_jobs')
            .select('*, picking_tasks(*, products(sku), locations(code), boxes(code)), users(id, name)')
            .eq('order_id', id)
        setJobs(jobData || [])

        // Fetch Users for assignment
        const { data: userData } = await supabase.from('users').select('id, name').eq('role', 'STAFF')
        setAvailableUsers(userData || [])

        // Fetch Available Stock for Items
        if (itemData && itemData.length > 0) {
            const productIds = itemData.map((i: any) => i.product_id).filter((pid: any) => pid);
            // We need aggregate count from inventory_items
            // Since we can't do complex GROUP BY easily with JS client on large data, 
            // we will fetch all inventory items for these products. 
            // Optimization: If many items, this is heavy. Ideally use RPC. 
            // For MVP: Fetch inventory_items where product_id in list.
            if (productIds.length > 0) {
                const { data: invData } = await supabase
                    .from('inventory_items')
                    .select('product_id, quantity')
                    .in('product_id', productIds)

                // Aggregate
                const stockMap: Record<string, number> = {}
                invData?.forEach((inv: any) => {
                    stockMap[inv.product_id] = (stockMap[inv.product_id] || 0) + inv.quantity
                })
                setAvailableStock(stockMap)
            }
        }

        setLoading(false)
    }

    const handleAssignJob = async (jobId: string, userId: string | null) => {
        const { error } = await supabase.from('picking_jobs').update({ user_id: userId }).eq('id', jobId)
        if (error) alert("Lỗi assign: " + error.message)
        else fetchOrder()
    }

    const handleAllocate = async () => {
        if (!order.is_approved) {
            alert("Đơn hàng chưa được DUYỆT. Vui lòng duyệt trước khi điều phối.")
            return
        }

        setAllocating(true)
        try {
            const res = await fetch('/api/allocate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: id })
            })
            const data = await res.json()

            if (data.success) {
                alert(`Đã điều phối xong! Tạo ${data.jobCount} việc lấy hàng.`)
                fetchOrder()
            } else {
                if (data.reason === 'SHORTAGE') {
                    setShortageData(data.missingItems)
                    setShortageDialog(true)
                } else {
                    alert("Lỗi: " + (data.error || "Giao thức không xác định"))
                }
            }
        } catch (e: any) {
            alert("Lỗi server: " + e.message)
        }
        setAllocating(false)
    }

    const handleToggleApproval = async () => {
        if (!session?.user) return
        const newStatus = !order.is_approved

        const res = await fetch('/api/orders/approve', {
            method: 'POST',
            body: JSON.stringify({
                orderId: id,
                isApproved: newStatus,
                userId: session.user.id
            })
        })
        const json = await res.json()
        if (json.success) fetchOrder()
        else alert("Lỗi: " + json.error)
    }

    const handleSaveEdit = async () => {
        setSavingEdit(true)
        const res = await fetch('/api/orders/update', {
            method: 'POST',
            body: JSON.stringify({
                orderId: id,
                items: editingItems
            })
        })
        const json = await res.json()
        if (json.success) {
            alert("Cập nhật đơn hàng thành công!")
            setEditMode(false)
            fetchOrder()
        } else {
            alert("Lỗi: " + json.error)
        }
        setSavingEdit(false)
    }

    const updateEditItem = (index: number, field: string, value: any) => {
        const newItems = [...editingItems]
        newItems[index] = { ...newItems[index], [field]: value }
        setEditingItems(newItems)
    }

    const handleDelete = async () => {
        if (!confirm("Bạn có chắc chắn muốn xoá đơn hàng này? Hành động không thể hoàn tác.")) return
        setLoading(true)
        try {
            const { error: itemError } = await supabase.from('order_items').delete().eq('order_id', id)
            if (itemError) throw itemError

            const { error: orderError } = await supabase.from('orders').delete().eq('id', id)
            if (orderError) throw orderError

            router.push('/admin/orders')
        } catch (e: any) {
            alert("Lỗi khi xoá: " + e.message)
            setLoading(false)
        }
    }

    if (!order) return <div className="p-8">Loading...</div>

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Truck className="h-8 w-8 text-primary" />
                        Đơn Hàng: {order.code}
                    </h1>

                    {/* Status Badges */}
                    <div className="flex items-center gap-2">
                        {order.is_approved ? (
                            <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> ĐÃ DUYỆT
                            </div>
                        ) : (
                            <div className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">
                                CHƯA DUYỆT
                            </div>
                        )}
                        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1
                            ${order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                                order.status === 'ALLOCATED' ? 'bg-blue-100 text-blue-800' :
                                    order.status === 'PICKING' ? 'bg-purple-100 text-purple-800' :
                                        order.status === 'PACKED' ? 'bg-orange-100 text-orange-800' :
                                            order.status === 'SHIPPED' ? 'bg-slate-800 text-white' : 'bg-slate-100'}
                        `}>
                            {order.status}
                        </div>
                    </div>

                    <div className="ml-auto flex gap-2">
                        {/* APPROVE BUTTON */}
                        {order.status === 'PENDING' && (
                            <Button
                                variant={order.is_approved ? "secondary" : "default"}
                                onClick={handleToggleApproval}
                                className={!order.is_approved ? "bg-green-600 hover:bg-green-700" : ""}
                            >
                                {order.is_approved ? "Bỏ Duyệt" : "Duyệt Đơn"}
                            </Button>
                        )}

                        {/* EDIT BUTTON */}
                        {order.status === 'PENDING' && !order.is_approved && !editMode && (
                            <Button variant="outline" onClick={() => setEditMode(true)}>
                                <Edit className="mr-2 h-4 w-4" /> Chỉnh Sửa
                            </Button>
                        )}

                        {/* ALLOCATE */}
                        {order.status === 'PENDING' && (
                            <Button
                                size="lg"
                                onClick={handleAllocate}
                                disabled={allocating || !order.is_approved}
                                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                                title={!order.is_approved ? "Cần duyệt đơn trước" : ""}
                            >
                                <Play className="mr-2 h-4 w-4" />
                                {allocating ? 'Đang Xử Lý...' : 'Điều Phối'}
                            </Button>
                        )}

                        {/* DELETE */}
                        {order.status === 'PENDING' && !order.is_approved && (
                            <Button variant="destructive" size="icon" onClick={handleDelete} title="Xoá Đơn Hàng">
                                <ClipboardList className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Items List */}
                    <Card className="md:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>
                                {order.type === 'BOX' ? `Danh Sách Thùng (${boxes.length})` : `Danh Sách Hàng Hoá (${items.length})`}
                            </CardTitle>
                            {editMode && (
                                <div className="flex gap-2">
                                    {/* ADD ITEM DIALOG */}
                                    <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={() => { setSearchTerm(""); setFoundProducts([]) }}>
                                                <Plus className="mr-2 h-4 w-4" /> Thêm SP
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader><DialogTitle>Thêm Sản Phẩm</DialogTitle></DialogHeader>
                                            <div className="space-y-4 pt-4">
                                                <div className="flex gap-2">
                                                    <Input
                                                        placeholder="Tìm mã SKU hoặc Tên..."
                                                        value={searchTerm}
                                                        onChange={e => {
                                                            setSearchTerm(e.target.value)
                                                            searchProducts(e.target.value)
                                                        }}
                                                    />
                                                </div>
                                                <div className="border rounded-md max-h-[300px] overflow-auto">
                                                    {foundProducts.length === 0 ? (
                                                        <div className="p-4 text-center text-slate-500 text-sm">Nhập từ khóa để tìm kiếm...</div>
                                                    ) : (
                                                        foundProducts.map(p => (
                                                            <div key={p.id} className="p-3 hover:bg-slate-100 cursor-pointer flex justify-between items-center border-b last:border-0"
                                                                onClick={() => {
                                                                    addItemToOrder(p)
                                                                    setAddItemOpen(false)
                                                                }}
                                                            >
                                                                <div>
                                                                    <div className="font-bold text-sm">{p.sku}</div>
                                                                    <div className="text-xs text-slate-500">{p.name}</div>
                                                                </div>
                                                                <Button size="sm" variant="ghost"><Plus className="h-4 w-4" /></Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>

                                    <Button variant="ghost" size="sm" onClick={() => {
                                        setEditMode(false)
                                        setEditingItems(JSON.parse(JSON.stringify(items))) // Reset
                                    }}>Hủy</Button>
                                    <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit}>
                                        {savingEdit ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            {order.type === 'BOX' ? (
                                /* BOX ORDER DISPLAY */
                                <div className="space-y-3">
                                    {boxes.length === 0 ? (
                                        <div className="text-center text-slate-500 py-8">Chưa có thùng nào</div>
                                    ) : (
                                        boxes.map((box, idx) => {
                                            const totalQty = box.inventory_items?.reduce((sum: number, inv: any) => sum + inv.quantity, 0) || 0
                                            return (
                                                <div key={box.id} className="border rounded-lg p-4 bg-slate-50">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <Box className="h-5 w-5 text-blue-600" />
                                                            <span className="font-bold text-lg">{box.code}</span>
                                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{box.status}</span>
                                                        </div>
                                                        <div className="text-sm text-slate-600">
                                                            <span className="font-semibold">{totalQty}</span> sản phẩm
                                                        </div>
                                                    </div>
                                                    {box.inventory_items && box.inventory_items.length > 0 && (
                                                        <div className="space-y-2 pl-7">
                                                            {box.inventory_items.map((inv: any, invIdx: number) => (
                                                                <div key={invIdx} className="flex justify-between text-sm border-l-2 border-blue-200 pl-3 py-1">
                                                                    <span className="text-slate-700">
                                                                        <span className="font-mono">{inv.products?.sku}</span>
                                                                        {' - '}
                                                                        <span>{inv.products?.name}</span>
                                                                    </span>
                                                                    <span className="font-bold">x{inv.quantity}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {!box.inventory_items || box.inventory_items.length === 0 && (
                                                        <div className="text-xs text-slate-400 pl-7">Thùng rỗng</div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    )}
                                    <div className="bg-amber-50 border border-amber-200 rounded p-3 mt-4">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                                            <span className="text-sm text-amber-800">
                                                <strong>Lưu ý:</strong> Đơn theo thùng sẽ lấy nguyên cả thùng. Không chia nhỏ sản phẩm.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* ITEM ORDER DISPLAY */
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 font-medium">
                                        <tr>
                                            <th className="p-3">Sản Phẩm</th>
                                            <th className="p-3 text-right">Yêu Cầu</th>
                                            <th className="p-3 text-right text-slate-500">Tồn Có Sẵn</th>
                                            {!editMode && order.status !== 'PENDING' && (
                                                <>
                                                    <th className="p-3 text-right">Đã Giữ</th>
                                                    <th className="p-3 text-right">Đã Nhặt</th>
                                                </>
                                            )}
                                            {editMode && <th className="p-3 text-right">Xóa</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {(editMode ? editingItems : items).map((item, idx) => {
                                            const avail = availableStock[item.product_id] || 0;
                                            const isShortage = item.quantity > avail;
                                            return (
                                                <tr key={idx} className="border-t">
                                                    <td className="p-3">
                                                        <div className="font-bold">{item.products?.sku}</div>
                                                        <div className="text-xs text-muted-foreground">{item.products?.name}</div>
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-lg">
                                                        {editMode ? (
                                                            <Input
                                                                type="number"
                                                                className="w-20 text-right ml-auto h-8"
                                                                value={item.quantity}
                                                                onChange={e => updateEditItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                                                            />
                                                        ) : item.quantity}
                                                    </td>
                                                    <td className={`p-3 text-right font-mono ${isShortage ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                                                        {avail}
                                                    </td>
                                                    {!editMode && order.status !== 'PENDING' && (
                                                        <>
                                                            <td className="p-3 text-right text-blue-600 font-bold">{item.allocated_quantity}</td>
                                                            <td className="p-3 text-right text-green-600 font-bold">{item.picked_quantity}</td>
                                                        </>
                                                    )}
                                                    {editMode && (
                                                        <td className="p-3 text-right">
                                                            <Button variant="ghost" size="sm" className="text-red-500 h-8 w-8 p-0" onClick={() => {
                                                                const newItems = editingItems.filter((_, i) => i !== idx);
                                                                setEditingItems(newItems);
                                                            }}>x</Button>
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Picking Jobs */}
                    <Card className="md:col-span-1">
                        <CardHeader>
                            <CardTitle>Công Việc Soạn Hàng (Picking)</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {jobs.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">Chưa có lệnh soạn hàng.</p>
                            ) : (
                                jobs.map((job, idx) => (
                                    <div key={job.id} className="border rounded p-3 space-y-2 bg-white">
                                        <div className="flex justify-between font-bold text-sm">
                                            <span>Job #{idx + 1}</span>
                                            <span className="text-blue-600">{job.status}</span>
                                        </div>

                                        {/* Picker Assignment */}
                                        <div className="flex items-center gap-2 text-sm">
                                            <User className="h-4 w-4 text-slate-500" />
                                            {job.users ? (
                                                <span className="font-medium flex items-center gap-1">
                                                    {job.users.name}
                                                    {/* Locked Icon if assigned */}
                                                    <Lock className="w-3 h-3 text-slate-400" />
                                                </span>
                                            ) : (
                                                <div className="flex-1">
                                                    <Select
                                                        value={job.user_id || "unassigned"}
                                                        onValueChange={(val) => handleAssignJob(job.id, val === "unassigned" ? null : val)}
                                                    >
                                                        <SelectTrigger className="h-7 w-full text-xs">
                                                            <SelectValue placeholder="Chọn nhân viên..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="unassigned">-- Bỏ chọn --</SelectItem>
                                                            {availableUsers.map(u => (
                                                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-xs text-muted-foreground">
                                            {job.picking_tasks?.length} nhiệm vụ
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>

            {/* SHORTAGE DIALOG */}
            <Dialog open={shortageDialog} onOpenChange={setShortageDialog}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-6 w-6" />
                            Cảnh Báo Thiếu Hàng - {order?.code}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="bg-red-50 text-red-800 p-4 rounded-md text-sm">
                            Đơn hàng không thể điều phối do thiếu tồn kho cho các mã hàng dưới đây.
                            Vui lòng nhập thêm hàng hoặc kiểm tra lại tồn kho.
                        </div>

                        <div className="border rounded-md overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 font-semibold text-slate-700">
                                    <tr>
                                        <th className="p-3 text-left">Mã SKU</th>
                                        <th className="p-3 text-left">Tên Sản Phẩm</th>
                                        <th className="p-3 text-right">Yêu Cầu</th>
                                        <th className="p-3 text-right">Có Sẵn</th>
                                        <th className="p-3 text-right text-red-600">Thiếu</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {shortageData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3 font-mono font-medium">{item.sku}</td>
                                            <td className="p-3">{item.name}</td>
                                            <td className="p-3 text-right font-medium">{item.needed}</td>
                                            <td className="p-3 text-right text-slate-500">{item.available}</td>
                                            <td className="p-3 text-right font-bold text-red-600">-{item.missing}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button variant="secondary" onClick={() => setShortageDialog(false)}>Đóng</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
