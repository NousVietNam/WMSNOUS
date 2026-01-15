"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { ArrowRightLeft, Search, Plus, Filter, Calendar, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

interface TransferOrder {
    id: string
    code: string
    from_location_id: string | null
    destination_id: string | null
    status: string
    note: string | null
    created_at: string
    from_location?: { code: string }
    destination?: { name: string, type: string }
    created_by_user?: { email: string }
    items?: any[]
}

interface Location {
    id: string
    code: string
}

export default function TransfersPage() {
    const [orders, setOrders] = useState<TransferOrder[]>([])
    const [locations, setLocations] = useState<Location[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    // Create Form State
    const [createOpen, setCreateOpen] = useState(false)
    const [newOrder, setNewOrder] = useState({
        code: "",
        from_location_id: "",
        destination_id: "",
        note: ""
    })

    useEffect(() => {
        fetchData()
        fetchLocations()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('transfer_orders')
            .select(`
                *,
                from_location:locations!transfer_orders_from_location_id_fkey(code),
                destination:destinations(name, type),
                items:transfer_order_items(count)
            `)
            .order('created_at', { ascending: false })

        if (error) {
            toast.error("Lỗi tải dữ liệu: " + error.message)
        } else {
            setOrders(data || [])
        }
        setLoading(false)
    }

    const fetchLocations = async () => {
        const { data } = await supabase.from('locations').select('id, code').order('code')
        if (data) setLocations(data)
    }

    const generateCode = () => {
        const date = new Date()
        const code = `TRF-${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
        setNewOrder(prev => ({ ...prev, code }))
    }

    const handleCreate = async () => {
        if (!newOrder.code) {
            return toast.error("Vui lòng nhập hoặc tạo mã phiếu")
        }
        if (!newOrder.destination_id) {
            return toast.error("Vui lòng chọn nơi chuyển đến")
        }

        try {
            const { data: userData } = await supabase.auth.getUser()

            const { error } = await supabase
                .from('transfer_orders')
                .insert({
                    code: newOrder.code,
                    from_location_id: newOrder.from_location_id || null,
                    destination_id: newOrder.destination_id,
                    note: newOrder.note,
                    created_by: userData.user?.id,
                    status: 'pending'
                })

            if (error) throw error

            toast.success("Đã tạo phiếu điều chuyển")
            setCreateOpen(false)
            setNewOrder({ code: "", from_location_id: "", destination_id: "", note: "" })
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi tạo phiếu: " + error.message)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">Chờ Duyệt</span>
            case 'approved': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Đã Duyệt</span>
            case 'completed': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Hoàn Thành</span>
            case 'cancelled': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">Hủy</span>
            default: return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">{status}</span>
        }
    }

    const filteredOrders = orders.filter(o =>
        o.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.destination?.name.toLowerCase().includes(searchTerm.toLowerCase())
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
                                placeholder="Tìm mã, nơi đến, ghi chú..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={generateCode} className="gap-2">
                                    <Plus className="h-4 w-4" /> Tạo Phiếu
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Tạo Phiếu Điều Chuyển</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label>Mã Phiếu *</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={newOrder.code}
                                                onChange={e => setNewOrder({ ...newOrder, code: e.target.value })}
                                                placeholder="TRF-..."
                                            />
                                            <Button variant="outline" size="icon" onClick={generateCode} title="Tạo mã tự động">
                                                <RefreshCw className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Từ Kho/Vị Trí</Label>
                                            <Select
                                                value={newOrder.from_location_id}
                                                onValueChange={val => setNewOrder({ ...newOrder, from_location_id: val })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Chọn nguồn (Tùy chọn)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="null">-- Không xác định --</SelectItem>
                                                    {locations.map(loc => (
                                                        <SelectItem key={loc.id} value={loc.id}>{loc.code}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Nơi Đến (Kho/Khách Hàng) *</Label>
                                            <DestinationSelect
                                                value={newOrder.destination_id}
                                                onChange={(val) => setNewOrder({ ...newOrder, destination_id: val })}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Ghi Chú</Label>
                                        <Input
                                            value={newOrder.note}
                                            onChange={e => setNewOrder({ ...newOrder, note: e.target.value })}
                                            placeholder="Ghi chú điều chuyển..."
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button>
                                    <Button onClick={handleCreate}>Tạo Mới</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <div className="bg-white rounded-md border shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 font-medium text-slate-700">
                            <tr>
                                <th className="p-3 text-left">Mã Phiếu</th>
                                <th className="p-3 text-left">Ngày Tạo</th>
                                <th className="p-3 text-left">Từ Vị Trí</th>
                                <th className="p-3 text-left">Nơi Đến</th>
                                <th className="p-3 text-center">Số Mục</th>
                                <th className="p-3 text-center">Trạng Thái</th>
                                <th className="p-3 text-left">Ghi Chú</th>
                                <th className="p-3 text-right">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Đang tải...</td></tr>
                            ) : filteredOrders.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Chưa có phiếu điều chuyển nào.</td></tr>
                            ) : (
                                filteredOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 font-medium text-blue-600">
                                            <Link href={`/admin/transfers/${order.id}`} className="hover:underline">
                                                {order.code}
                                            </Link>
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
                                        <td className="p-3 text-center font-bold">{order.items ? order.items[0]?.count : 0}</td>
                                        <td className="p-3 text-center">{getStatusBadge(order.status)}</td>
                                        <td className="p-3 text-slate-600 max-w-[200px] truncate" title={order.note || ""}>{order.note}</td>
                                        <td className="p-3 text-right">
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                <span className="sr-only">Menu</span>
                                                <ArrowRightLeft className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    )
}

// Helper Component for Destination Select
function DestinationSelect({ value, onChange }: { value: string, onChange: (val: string) => void }) {
    const [destinations, setDestinations] = useState<{ id: string, name: string, type: string }[]>([])

    useEffect(() => {
        supabase.from('destinations').select('id, name, type').order('name')
            .then(({ data }) => setDestinations(data || []))
    }, [])

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger>
                <SelectValue placeholder="Chọn nơi đến" />
            </SelectTrigger>
            <SelectContent>
                {destinations.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.type === 'store' ? 'Kho' : 'KH'})
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
