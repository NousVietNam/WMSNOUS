"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { AlertCircle, FileText, Plus, Upload, Eye, ShieldCheck } from "lucide-react"
import Link from "next/link"
import Papa from "papaparse"

export default function OrdersPage() {
    const [orders, setOrders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [openDialog, setOpenDialog] = useState(false)
    const [importLoading, setImportLoading] = useState(false)

    // Assign State
    const [users, setUsers] = useState<any[]>([])
    const [assignDialog, setAssignDialog] = useState(false)
    const [selectedOrder, setSelectedOrder] = useState<any>(null)
    const [selectedStaff, setSelectedStaff] = useState("")

    // Manual Create State
    const [newCode, setNewCode] = useState("")
    const [newCustomer, setNewCustomer] = useState("")

    // Shortage Report State
    const [shortageDialog, setShortageDialog] = useState(false)
    const [shortageData, setShortageData] = useState<any[]>([])
    const [shortageOrderCode, setShortageOrderCode] = useState("")

    useEffect(() => {
        fetchOrders()
        fetchUsers()
    }, [])

    const fetchUsers = async () => {
        // Fetch users (support both schema versions if needed, but prioritizing Seed schema)
        // seed/page.tsx uses: name, staff_code, role='STAFF'
        const { data } = await supabase.from('users')
            .select('id, name, staff_code')
            .ilike('role', 'staff') // Case insensitive match
        if (data) setUsers(data)
    }

    const fetchOrders = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(count)')
            .order('created_at', { ascending: false })

        if (error) {
            console.error("Fetch Error:", error)
            alert("Lỗi tải đơn hàng: " + error.message) // Show error to user
        }
        if (data) setOrders(data)
        setLoading(false)
    }

    const handleCreate = async () => {
        if (!newCode) return alert("Vui lòng nhập mã đơn hàng")
        const { error } = await supabase.from('orders').insert({
            code: newCode.toUpperCase(),
            customer_name: newCustomer,
            status: 'PENDING'
        })

        if (error) alert("Lỗi: " + error.message)
        else {
            setOpenDialog(false)
            fetchOrders()
            setNewCode("")
            setNewCustomer("")
        }
    }

    const handleAssign = async () => {
        if (!selectedOrder || !selectedStaff) return

        const { error } = await supabase.from('orders')
            .update({
                assigned_staff_id: selectedStaff,
                assigned_at: new Date().toISOString()
            })
            .eq('id', selectedOrder.id)

        if (error) alert("Lỗi: " + error.message)
        else {
            await supabase.from('picking_jobs')
                .update({ picker_id: selectedStaff })
                .eq('order_id', selectedOrder.id)
                .eq('status', 'OPEN')

            setAssignDialog(false)
            fetchOrders()
        }
    }

    const handleAllocate = async (order: any) => {
        // Confirmation is optional if we have a robust report, but keeping it ensures user intent.
        // if (!confirm("Xác nhận điều phối đơn hàng này?")) return 

        const res = await fetch('/api/allocate', {
            method: 'POST',
            body: JSON.stringify({ orderId: order.id })
        })
        const json = await res.json()

        if (!json.success) {
            if (json.reason === 'SHORTAGE') {
                setShortageOrderCode(order.code)
                setShortageData(json.missingItems)
                setShortageDialog(true)
            } else {
                alert(json.error || "Lỗi giao thức điều phối")
            }
        } else {
            alert(`✅ Điều phối thành công! Đã tạo ${json.tasks} nhiệm vụ lấy hàng.`)
            fetchOrders()
        }
    }

    // CSV Import Logic
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setImportLoading(true)
        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                await processImport(results.data)
                setImportLoading(false)
            },
            error: (err) => {
                alert("Lỗi đọc file: " + err.message)
                setImportLoading(false)
            }
        })
    }

    const processImport = async (rows: any[]) => {
        // Group by OrderCode
        const orderMap: Record<string, { customer: string, items: any[] }> = {}
        const skus = new Set<string>()

        for (const row of rows) {
            if (!row.OrderCode || !row.SKU || !row.Quantity) continue
            if (!orderMap[row.OrderCode]) {
                orderMap[row.OrderCode] = {
                    customer: row.Customer || 'Unknown',
                    items: []
                }
            }
            orderMap[row.OrderCode].items.push({ sku: row.SKU, qty: parseInt(row.Quantity) })
            skus.add(row.SKU)
        }

        // 1. Resolve Products
        const { data: products } = await supabase.from('products').select('id, sku').in('sku', Array.from(skus))
        const skuToId: Record<string, string> = {}
        products?.forEach(p => skuToId[p.sku] = p.id)

        // 2. Insert Orders & Items
        let successCount = 0
        for (const [code, data] of Object.entries(orderMap)) {
            // Check if exists
            const { data: existing } = await supabase.from('orders').select('id').eq('code', code).single()
            if (existing) {
                console.warn(`Order ${code} already exists. Skipping.`)
                continue
            }

            // Create Order
            const { data: newOrder, error } = await supabase.from('orders').insert({
                code,
                customer_name: data.customer,
                status: 'PENDING'
            }).select().single()

            if (error || !newOrder) {
                console.error(`Failed to create order ${code}`, error)
                continue
            }

            // Create Items
            const itemsToInsert = data.items
                .map(item => ({
                    order_id: newOrder.id,
                    product_id: skuToId[item.sku],
                    quantity: item.qty
                }))
                .filter(i => i.product_id) // Skip invalid SKUs

            if (itemsToInsert.length > 0) {
                await supabase.from('order_items').insert(itemsToInsert)
            }
            successCount++
        }

        alert(`Đã nhập thành công ${successCount} đơn hàng!`)
        fetchOrders()
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">            <main className="flex-1 p-6 space-y-6">
            <div className="flex items-center justify-between">
                {/* ... Header same ... */}
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="h-8 w-8 text-primary" />
                    Quản Lý Đơn Hàng
                </h1>
                <div className="flex gap-2">
                    {/* ... Create Buttons same ... */}
                    <Link href="/admin/orders/create">
                        <Button><Plus className="mr-2 h-4 w-4" /> Tạo Đơn Mới</Button>
                    </Link>
                    {/* ... Import / Dialog same ... */}
                    <div className="relative">
                        <input
                            type="file"
                            id="import-csv"
                            className="hidden"
                            accept=".csv"
                            onChange={handleFileUpload}
                        />
                        <Button variant="outline" disabled={importLoading} onClick={() => document.getElementById('import-csv')?.click()}>
                            <Upload className="mr-2 h-4 w-4" /> Import CSV
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={async () => {
                                if (!confirm("Tạo 5 đơn hàng test ngẫu nhiên?")) return;
                                const res = await fetch('/api/seed-orders', { method: 'POST' });
                                const data = await res.json();
                                if (data.success) {
                                    alert(data.message);
                                    fetchOrders();
                                } else {
                                    alert("Lỗi: " + data.error);
                                }
                            }}
                        >
                            ⚡ Tạo Data Test
                        </Button>
                    </div>
                    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                        <DialogTrigger asChild>
                            <Button><Plus className="mr-2 h-4 w-4" /> Tạo Đơn Lẻ</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Tạo Đơn Hàng Mới</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label>Mã Đơn Hàng</label>
                                    <Input placeholder="DH-001" value={newCode} onChange={e => setNewCode(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label>Khách Hàng</label>
                                    <Input placeholder="Tên khách hàng" value={newCustomer} onChange={e => setNewCustomer(e.target.value)} />
                                </div>
                                <Button onClick={handleCreate} className="w-full">Tạo Đơn</Button>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Assign Dialog */}
                    <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Gán Nhân Viên Picking</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="font-bold">Đơn hàng: {selectedOrder?.code}</div>
                                <div className="space-y-2">
                                    <label>Chọn Nhân Viên</label>
                                    <select
                                        className="w-full p-2 border rounded"
                                        value={selectedStaff}
                                        onChange={e => setSelectedStaff(e.target.value)}
                                    >
                                        <option value="">-- Chọn Staff --</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.name} ({u.staff_code})</option>
                                        ))}
                                    </select>
                                </div>
                                <Button onClick={handleAssign} className="w-full" disabled={!selectedStaff}>Xác Nhận Gán</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="bg-white p-4 rounded-md border shadow-sm flex-1 flex flex-col min-h-0">
                <div className="rounded-md border overflow-auto relative flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 font-medium text-slate-700 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4">Mã Đơn</th>
                                <th className="p-4">Khách Hàng</th>
                                <th className="p-4">Số Mặt Hàng</th>
                                <th className="p-4">Nhân Viên Gán</th>
                                <th className="p-4">Trạng Thái</th>
                                <th className="p-4">Duyệt</th>
                                <th className="p-4">Ngày Tạo</th>
                                <th className="p-4 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map(order => (
                                <tr key={order.id} className="border-t hover:bg-slate-50">
                                    <td className="p-4 font-bold text-primary">{order.code}</td>
                                    <td className="p-4">{order.customer_name}</td>
                                    <td className="p-4 font-bold">{order.order_items?.[0]?.count || 0}</td>
                                    <td className="p-4">
                                        {(() => {
                                            const staff = users.find(u => u.id === order.assigned_staff_id)
                                            return staff ? (
                                                <span className="font-semibold text-blue-700">{staff.name}</span>
                                            ) : (
                                                <span className="text-slate-400 italic">Chưa gán</span>
                                            )
                                        })()}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                                            order.status === 'ALLOCATED' ? 'bg-blue-100 text-blue-800' :
                                                order.status === 'PICKING' ? 'bg-purple-100 text-purple-800' :
                                                    order.status === 'PACKED' ? 'bg-orange-100 text-orange-800' :
                                                        order.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : // Legacy
                                                            order.status === 'SHIPPED' ? 'bg-slate-800 text-white' : 'bg-slate-100'
                                            }`}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {order.is_approved ? (
                                            <span className="text-green-600 font-bold text-xs flex items-center gap-1">
                                                <ShieldCheck className="w-4 h-4" /> Đã duyệt
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs italic">Chưa duyệt</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-muted-foreground">{new Date(order.created_at).toLocaleDateString('vi-VN')}</td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        {order.status === 'PENDING' && (
                                            <Button size="sm" onClick={() => handleAllocate(order)}>
                                                Điều phối
                                            </Button>
                                        )}
                                        {order.status === 'ALLOCATED' && (
                                            <Button size="sm" variant="outline" onClick={() => {
                                                setSelectedOrder(order)
                                                setSelectedStaff(order.assigned_staff_id || "")
                                                setAssignDialog(true)
                                            }}>
                                                Gán Staff
                                            </Button>
                                        )}
                                        <Link href={`/admin/orders/${order.id}`}>
                                            <Button size="sm" variant="ghost">
                                                <Eye className="h-4 w-4 mr-1" /> Chi tiết
                                            </Button>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>

            {/* SHORTAGE DIALOG */}
            <Dialog open={shortageDialog} onOpenChange={setShortageDialog}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-6 w-6" />
                            Cảnh Báo Thiếu Hàng - {shortageOrderCode}
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
