"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { ArrowRightLeft, Search, Trash2, Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

interface TransferOrder {
    id: string
    code: string
    from_location_id: string | null
    destination_id: string | null
    transfer_type: 'BOX' | 'ITEM'
    status: string
    note: string | null
    created_at: string
    created_by: string | null
    from_location?: { code: string }
    destination?: { name: string, type: string }
    creator?: { name: string, email: string }
    items_count?: number
}

export default function TransfersPage() {
    const [orders, setOrders] = useState<TransferOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('transfer_orders')
            .select(`
                *,
                from_location:locations!transfer_orders_from_location_id_fkey(code),
                destination:destinations(name, type),
                creator:users!transfer_orders_created_by_fkey(name, email),
                items:transfer_order_items(count)
            `)
            .order('created_at', { ascending: false })

        if (error) {
            toast.error("Lỗi tải dữ liệu: " + error.message)
        } else {
            const processed = (data || []).map(o => ({
                ...o,
                items_count: o.items?.[0]?.count || 0
            }))
            setOrders(processed)
        }
        setLoading(false)
    }

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [deletingOrder, setDeletingOrder] = useState<{ id: string, code: string } | null>(null)

    const handleDelete = (id: string, code: string) => {
        setDeletingOrder({ id, code })
        setDeleteDialogOpen(true)
    }

    const confirmDelete = async () => {
        if (!deletingOrder) return
        setDeleteDialogOpen(false)

        try {
            const { error } = await supabase
                .from('transfer_orders')
                .delete()
                .eq('id', deletingOrder.id)

            if (error) throw error

            toast.success("Đã xóa đơn điều chuyển")
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi xóa: " + error.message)
        } finally {
            setDeletingOrder(null)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">Chờ Xử Lý</span>
            case 'allocated': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Đã Phân Bổ</span>
            case 'picking': return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">Đang Lấy Hàng</span>
            case 'completed': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Hoàn Thành</span>
            case 'cancelled': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">Hủy</span>
            default: return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">{status}</span>
        }
    }

    const filteredOrders = orders.filter(o =>
        o.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.destination?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.creator?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ArrowRightLeft className="h-8 w-8 text-primary" />
                        Điều Chuyển Kho ({orders.length})
                    </h1>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm mã, người tạo, nơi đến..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Link href="/admin/transfers/create">
                            <Button><Plus className="mr-2 h-4 w-4" /> Tạo Phiếu</Button>
                        </Link>
                    </div>
                </div>

                <div className="bg-white rounded-md border shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 font-medium text-slate-700">
                            <tr>
                                <th className="p-3 text-left">Mã Phiếu</th>
                                <th className="p-3 text-left">Người Tạo</th>
                                <th className="p-3 text-left">Thời Gian</th>
                                <th className="p-3 text-left">Từ Kho</th>
                                <th className="p-3 text-left">Nơi Đến</th>
                                <th className="p-3 text-center">Loại</th>
                                <th className="p-3 text-center">Số Mục</th>
                                <th className="p-3 text-center">Trạng Thái</th>
                                <th className="p-3 text-right">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Đang tải...</td></tr>
                            ) : filteredOrders.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Chưa có phiếu điều chuyển nào.</td></tr>
                            ) : (
                                filteredOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 font-medium text-blue-600">
                                            <Link href={`/admin/transfers/${order.id}`} className="hover:underline">
                                                {order.code}
                                            </Link>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-medium">{order.creator?.name || 'Unknown'}</div>
                                            <div className="text-xs text-slate-500">{order.creator?.email}</div>
                                        </td>
                                        <td className="p-3 text-slate-500">
                                            {new Date(order.created_at).toLocaleDateString('vi-VN')}
                                            <div className="text-xs">{new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td className="p-3">{order.from_location?.code || <span className="text-slate-300 italic">--</span>}</td>
                                        <td className="p-3">
                                            {order.destination?.name || <span className="text-slate-300 italic">--</span>}
                                            {order.destination?.type === 'customer' && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1 rounded">KH</span>}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${order.transfer_type === 'BOX'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                {order.transfer_type === 'BOX' ? 'Cả Thùng' : 'Lẻ'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center font-bold">{order.items_count}</td>
                                        <td className="p-3 text-center">{getStatusBadge(order.status)}</td>
                                        <td className="p-3 text-right">
                                            {order.status === 'pending' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => handleDelete(order.id, order.code)}
                                                    title="Xóa đơn"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Xác nhận xóa phiếu</DialogTitle>
                        <DialogDescription>
                            Bạn có chắc chắn muốn xóa phiếu điều chuyển <strong>{deletingOrder?.code}</strong> không?
                            <br /><br />
                            <span className="text-red-600 font-medium">Lưu ý:</span> Hành động này không thể hoàn tác và sẽ xóa tất cả dữ liệu liên quan (picking jobs, logs).
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Hủy</Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Xác nhận Xóa
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
