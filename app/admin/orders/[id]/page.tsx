"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { AlertCircle, ArrowLeft, Box, CheckCircle, ClipboardList, Play, Truck, User } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function OrderDetailPage() {
    const { id } = useParams()
    const router = useRouter()
    const [order, setOrder] = useState<any>(null)
    const [items, setItems] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [allocating, setAllocating] = useState(false)
    const [availableUsers, setAvailableUsers] = useState<any[]>([])

    // Shortage Report State
    const [shortageDialog, setShortageDialog] = useState(false)
    const [shortageData, setShortageData] = useState<any[]>([])

    const handleAssignJob = async (jobId: string, userId: string | null) => {
        const { error } = await supabase.from('picking_jobs').update({ user_id: userId }).eq('id', jobId)
        if (error) alert("Lỗi assign: " + error.message)
        else fetchOrder() // Refresh
    }

    useEffect(() => {
        if (id) fetchOrder()
    }, [id])

    const fetchOrder = async () => {
        setLoading(true)
        // Fetch Order
        const { data: orderData } = await supabase.from('orders').select('*').eq('id', id).single()
        setOrder(orderData)

        // Fetch Items
        const { data: itemData } = await supabase
            .from('order_items')
            .select('*, products(name, sku, barcode)')
            .eq('order_id', id)
        setItems(itemData || [])

        // Fetch Jobs
        const { data: jobData } = await supabase
            .from('picking_jobs')
            .select('*, picking_tasks(*, products(sku), locations(code), boxes(code)), users(id, name)')
            .eq('order_id', id)
        setJobs(jobData || [])

        // Fetch Users for assignment
        const { data: userData } = await supabase.from('users').select('id, name').eq('role', 'STAFF') // Or all?
        setAvailableUsers(userData || [])

        setLoading(false)
    }

    const handleAllocate = async () => {
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

    const handleDelete = async () => {
        if (!confirm("Bạn có chắc chắn muốn xoá đơn hàng này? Hành động không thể hoàn tác.")) return
        setLoading(true)
        try {
            // Delete Items
            const { error: itemError } = await supabase.from('order_items').delete().eq('order_id', id)
            if (itemError) throw itemError

            // Delete Order
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
                    <div className="ml-auto flex gap-2">
                        {order.status === 'PENDING' && (
                            <Button size="lg" onClick={handleAllocate} disabled={allocating} className="bg-blue-600 hover:bg-blue-700">
                                <Play className="mr-2 h-4 w-4" />
                                {allocating ? 'Đang Xử Lý...' : 'Điều Phối Tồn Kho'}
                            </Button>
                        )}
                        {order.status === 'PENDING' && (
                            <Button variant="destructive" size="icon" onClick={handleDelete} title="Xoá Đơn Hàng">
                                <ClipboardList className="h-5 w-5" />
                            </Button>
                        )}
                        {order.status !== 'PENDING' && (
                            <div className="bg-green-100 text-green-800 px-4 py-2 rounded font-bold flex items-center">
                                <CheckCircle className="mr-2 h-5 w-5" /> {order.status}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Items List */}
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle>Danh Sách Hàng Hoá ({items.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 font-medium">
                                    <tr>
                                        <th className="p-3">Sản Phẩm</th>
                                        <th className="p-3 text-right">Yêu Cầu</th>
                                        <th className="p-3 text-right">Đã Giữ</th>
                                        <th className="p-3 text-right">Đã Nhặt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {items.map(item => (
                                        <tr key={item.id} className="border-t">
                                            <td className="p-3">
                                                <div className="font-bold">{item.products?.sku}</div>
                                                <div className="text-xs text-muted-foreground">{item.products?.name}</div>
                                            </td>
                                            <td className="p-3 text-right font-bold text-lg">{item.quantity}</td>
                                            <td className="p-3 text-right text-blue-600 font-bold">{item.allocated_quantity}</td>
                                            <td className="p-3 text-right text-green-600 font-bold">{item.picked_quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                                                <span className="font-medium">{job.users.name}</span>
                                            ) : (
                                                <span className="text-muted-foreground italic">Chưa giao</span>
                                            )}

                                            {/* Assignment Dropdown */}
                                            <Select
                                                value={job.user_id || "unassigned"}
                                                onValueChange={(val) => handleAssignJob(job.id, val === "unassigned" ? null : val)}
                                            >
                                                <SelectTrigger className="h-7 w-[130px] text-xs ml-auto">
                                                    <SelectValue placeholder="Chọn..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="unassigned">-- Bỏ chọn --</SelectItem>
                                                    {availableUsers.map(u => (
                                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="text-xs text-muted-foreground">
                                            {job.picking_tasks?.length} nhiệm vụ
                                        </div>
                                        <div className="space-y-1">
                                            {job.picking_tasks?.map((task: any) => (
                                                <div key={task.id} className="flex gap-2 text-xs border-t pt-1">
                                                    <Box className="h-3 w-3 mt-0.5" />
                                                    <div className="flex-1">
                                                        <div>Lấy <b>{task.quantity}</b> x {task.products?.sku}</div>
                                                        <div className="text-muted-foreground">
                                                            tại {task.boxes?.code || task.locations?.code}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
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
