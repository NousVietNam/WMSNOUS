"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Plus, Trash2, Target, Loader2, Package, CheckCircle } from "lucide-react"
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
    destination?: { name: string }
    creator?: { name: string }
}

interface TransferItem {
    id: string
    transfer_id: string
    product_id: string
    box_id?: string
    quantity: number
    from_location_id: string | null
    product?: { sku: string, name: string }
    box?: { code: string }
    from_location?: { code: string }
}

interface PickingJob {
    id: string
    status: string
    type: string
    created_at: string
}

export default function TransferDetailPage() {
    const params = useParams()
    const router = useRouter()
    const transferId = params.id as string

    const [transfer, setTransfer] = useState<TransferOrder | null>(null)
    const [items, setItems] = useState<TransferItem[]>([])
    const [jobs, setJobs] = useState<PickingJob[]>([])
    const [loading, setLoading] = useState(true)
    const [allocating, setAllocating] = useState(false)

    const [confirmAllocateOpen, setConfirmAllocateOpen] = useState(false)
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
    const [approveDialogOpen, setApproveDialogOpen] = useState(false)

    // User ID for tracking actions
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    useEffect(() => {
        // Fetch current user
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) setCurrentUserId(data.user.id)
        })
    }, [])

    // Add Item Dialog State (Restored)
    const [addOpen, setAddOpen] = useState(false)
    const [newItem, setNewItem] = useState({
        product_id: "",
        quantity: 1,
        from_location_id: ""
    })
    const [products, setProducts] = useState<any[]>([])
    const [locations, setLocations] = useState<any[]>([])

    // ...

    const handleAllocate = () => {
        setConfirmAllocateOpen(true)
    }

    const executeAllocate = async () => {
        setAllocating(true)
        try {
            const res = await fetch(`/api/transfers/${transferId}/allocate`, {
                method: 'POST'
            })

            const json = await res.json()

            if (!res.ok) throw new Error(json.error || 'Allocate failed')

            toast.success(`Đã phân bổ thành công! Tạo ${json.jobsCreated || 0} picking jobs.`)
            setConfirmAllocateOpen(false)
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi phân bổ: " + error.message)
        } finally {
            setAllocating(false)
        }
    }

    useEffect(() => {
        fetchData()
        fetchProducts()
        fetchLocations()
    }, [transferId])

    const fetchData = async () => {
        setLoading(true)
        // Fetch transfer
        const { data: transferData, error: transferError } = await supabase
            .from('transfer_orders')
            .select(`
                *,
                from_location:locations!transfer_orders_from_location_id_fkey(code),
                destination:destinations(name),
                creator:users!transfer_orders_created_by_fkey(name)
            `)
            .eq('id', transferId)
            .single()

        if (transferError) {
            toast.error("Lỗi tải đơn: " + transferError.message)
            return
        }

        setTransfer(transferData)

        // Fetch items
        const { data: itemsData } = await supabase
            .from('transfer_order_items')
            .select(`
                *,
                product:products(sku, name),
                box:boxes(code),
                from_location:locations(code)
            `)
            .eq('transfer_id', transferId)

        setItems(itemsData || [])

        // Fetch picking jobs
        const { data: jobsData } = await supabase
            .from('picking_jobs')
            .select(`
                id, status, type, created_at,
                picking_tasks (
                    id, 
                    quantity, 
                    status, 
                    products(sku),
                    boxes(code), 
                    locations(code)
                )
            `)
            .eq('transfer_order_id', transferId)
            .order('created_at', { ascending: false })

        setJobs(jobsData || [])
        setLoading(false)
    }

    const fetchProducts = async () => {
        const { data } = await supabase.from('products').select('id, sku, name').order('sku')
        setProducts(data || [])
    }

    const fetchLocations = async () => {
        const { data } = await supabase.from('locations').select('id, code').order('code')
        setLocations(data || [])
    }

    const handleAddItem = async () => {
        if (!newItem.product_id || newItem.quantity <= 0) {
            return toast.error("Vui lòng chọn sản phẩm và nhập số lượng")
        }

        try {
            const { error } = await supabase
                .from('transfer_order_items')
                .insert({
                    transfer_id: transferId,
                    product_id: newItem.product_id,
                    quantity: newItem.quantity,
                    from_location_id: newItem.from_location_id || null
                })

            if (error) throw error

            toast.success("Đã thêm sản phẩm")
            setAddOpen(false)
            setNewItem({ product_id: "", quantity: 1, from_location_id: "" })
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi: " + error.message)
        }
    }

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm("Xóa sản phẩm này khỏi đơn?")) return

        try {
            const { error } = await supabase
                .from('transfer_order_items')
                .delete()
                .eq('id', itemId)

            if (error) throw error

            toast.success("Đã xóa sản phẩm")
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi: " + error.message)
        }
    }



    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-bold">Chờ Xử Lý</span>
            case 'approved': return <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">Đã Duyệt</span>
            case 'allocated': return <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-bold">Đã Phân Bổ</span>
            case 'picking': return <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-bold">Đang Lấy Hàng</span>
            case 'completed': return <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">Hoàn Thành</span>
            case 'cancelled': return <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-bold">Hủy</span>
            default: return <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-bold">{status}</span>
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!transfer) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-lg text-muted-foreground mb-4">Không tìm thấy đơn điều chuyển</p>
                    <Link href="/admin/transfers">
                        <Button>Quay lại</Button>
                    </Link>
                </div>
            </div>
        )
    }




    const handleCancelApprove = () => {
        setCancelDialogOpen(true)
    }

    const handleApprove = () => {
        setApproveDialogOpen(true)
    }



    const executeApprove = async () => {
        setApproveDialogOpen(false)
        console.log("Approved Confirmed via Dialog")

        console.log("Confirmed. Sending Request...")
        setLoading(true)
        try {
            const res = await fetch('/api/transfers/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transferId,
                    userId: currentUserId // Pass User ID
                })
            })

            console.log("Response Status:", res.status)
            const json = await res.json()
            console.log("Response JSON:", json)

            if (!res.ok) throw new Error(json.error || 'Approve failed')

            toast.success("Duyệt thành công!")
            await fetchData() // Await fetch data to ensure UI updates
        } catch (error: any) {
            console.error("Approve Caught Error:", error)
            toast.error("Lỗi: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    const confirmApprove = async () => {
        setApproveDialogOpen(false)
        setLoading(true)
        console.log("Starting approval process...")

        try {
            // 1. Calculate items with SKU
            // ... (rest of logic moved here)
            // But wait, the original logic was long.
            // Let's call the original logic or wrap it.
            // Better to refactor: move original handleApprove logic to `executeApprove`.
            await executeApprove()
        } catch (error: any) {
            toast.error("Lỗi: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    const confirmCancelApprove = async () => {
        setCancelDialogOpen(false)
        setLoading(true)
        try {
            const res = await fetch('/api/transfers/cancel-approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transferId,
                    userId: currentUserId
                })
            })

            const json = await res.json()

            if (!res.ok) throw new Error(json.error || 'Cancel failed')

            toast.success("Đã hủy duyệt thành công!")
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    const canEdit = transfer.status === 'pending'
    const canApprove = transfer.status === 'pending' && items.length > 0
    const canAllocate = (transfer.status === 'pending' || transfer.status === 'approved') && items.length > 0 && transfer.status !== 'allocated'

    return (
        <div className="min-h-screen bg-slate-50">
            <main className="p-6 space-y-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/transfers">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold">{transfer.code}</h1>
                            <p className="text-sm text-muted-foreground">
                                Tạo bởi {transfer.creator?.name} - {new Date(transfer.created_at).toLocaleString('vi-VN')}
                            </p>
                        </div>
                    </div>
                    {getStatusBadge(transfer.status)}
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground mb-1">Từ Kho</p>
                        <p className="font-bold">{transfer.from_location?.code || '--'}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground mb-1">Nơi Đến</p>
                        <p className="font-bold">{transfer.destination?.name || '--'}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground mb-1">Loại Đơn</p>
                        <p className="font-bold">{transfer.transfer_type === 'BOX' ? '📦 Cả Thùng' : '📋 Lẻ'}</p>
                    </div>
                </div>

                {/* Actions: Approve & Allocate */}
                <div className="flex gap-4 justify-end">
                    {/* Approve Button */}
                    {canApprove && (
                        <div className="bg-white p-4 rounded-lg border flex items-center justify-between flex-1">
                            <div>
                                <p className="font-bold text-slate-900">1. Duyệt Phiếu</p>
                                <p className="text-sm text-slate-500">Chốt danh sách và tạo giao dịch</p>
                            </div>
                            <Button onClick={handleApprove} className="gap-2 bg-slate-800 hover:bg-slate-700">
                                <CheckCircle className="h-4 w-4" />
                                Chốt Phiếu
                            </Button>
                        </div>
                    )}

                    {/* Cancel Approve Button */}
                    {transfer.status === 'approved' && !allocating && (
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 flex items-center justify-between flex-1">
                            <div>
                                <p className="font-bold text-orange-900">Hủy Duyệt</p>
                                <p className="text-sm text-orange-700">Quay về trạng thái chờ xử lý</p>
                            </div>
                            <Button
                                onClick={handleCancelApprove}
                                variant="outline"
                                className="gap-2 border-orange-300 text-orange-800 hover:bg-orange-100"
                            >
                                <Trash2 className="h-4 w-4" />
                                Hủy Duyệt
                            </Button>
                        </div>
                    )}

                    {/* Allocate Button */}
                    {canAllocate && transfer.status === 'approved' && (
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 flex items-center justify-between flex-1">
                            <div>
                                <p className="font-bold text-blue-900">2. Phân Bổ</p>
                                <p className="text-sm text-blue-700">Tạo Picking Jobs cho kho</p>
                            </div>
                            <Button
                                onClick={handleAllocate}
                                disabled={allocating}
                                className="gap-2"
                            >
                                {allocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                                Phân Bổ & Tạo Jobs
                            </Button>
                        </div>
                    )}
                </div>

                {/* Items Table */}
                <div className="bg-white rounded-lg border shadow-sm">
                    <div className="p-4 border-b flex items-center justify-between">
                        <h2 className="font-bold">Danh Sách Hàng Hóa ({items.length})</h2>
                        {canEdit && transfer.transfer_type === 'ITEM' && (
                            <Button onClick={() => setAddOpen(true)} size="sm" className="gap-2">
                                <Plus className="h-4 w-4" />
                                Thêm Sản Phẩm
                            </Button>
                        )}
                    </div>
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 font-medium text-slate-700">
                                <tr>
                                    {transfer.transfer_type === 'BOX' && <th className="p-3 text-left">Thùng</th>}
                                    <th className="p-3 text-left">SKU</th>
                                    <th className="p-3 text-left">Tên Sản Phẩm</th>
                                    <th className="p-3 text-center">Số Lượng</th>
                                    <th className="p-3 text-left">Từ Vị Trí</th>
                                    {canEdit && <th className="p-3 text-right">Thao Tác</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={transfer.transfer_type === 'BOX' ? 6 : 5} className="p-8 text-center text-muted-foreground">
                                            Chưa có sản phẩm nào
                                        </td>
                                    </tr>
                                ) : (
                                    items.map(item => (
                                        <tr key={item.id} className="hover:bg-slate-50">
                                            {transfer.transfer_type === 'BOX' && (
                                                <td className="p-3 font-mono font-bold text-purple-600">
                                                    📦 {item.box?.code || '--'}
                                                </td>
                                            )}
                                            <td className="p-3 font-mono">{item.product?.sku}</td>
                                            <td className="p-3">{item.product?.name}</td>
                                            <td className="p-3 text-center font-bold">{item.quantity}</td>
                                            <td className="p-3">{item.from_location?.code || '--'}</td>
                                            {canEdit && (
                                                <td className="p-3 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-red-600"
                                                        onClick={() => handleDeleteItem(item.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Picking Jobs */}
                {jobs.length > 0 && (
                    <div className="bg-white rounded-lg border shadow-sm">
                        <div className="p-4 border-b">
                            <h2 className="font-bold">Picking Jobs ({jobs.length})</h2>
                        </div>
                        <div className="p-4 space-y-2">
                            {jobs.map(job => (
                                <div key={job.id} className="bg-slate-50 rounded mb-2">
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-3">
                                            <Package className="h-5 w-5 text-slate-500" />
                                            <div>
                                                <p className="font-medium text-sm">{job.type}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(job.created_at).toLocaleString('vi-VN')}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                            job.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {job.status}
                                        </span>
                                    </div>

                                    {/* Render Tasks */}
                                    {job.picking_tasks && job.picking_tasks.length > 0 && (
                                        <div className="px-3 pb-3">
                                            <div className="bg-white border rounded text-xs">
                                                <table className="w-full text-left">
                                                    <thead className="bg-slate-50 font-medium text-slate-500">
                                                        <tr>
                                                            <th className="p-2">Sản phẩm / Thùng</th>
                                                            <th className="p-2">Vị trí</th>
                                                            <th className="p-2 text-right">SL</th>
                                                            <th className="p-2">Trạng thái</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {job.picking_tasks.map((task: any) => (
                                                            <tr key={task.id}>
                                                                <td className="p-2 font-mono">
                                                                    {task.boxes ? (
                                                                        <span className="text-purple-600 font-bold">📦 {task.boxes.code}</span>
                                                                    ) : (
                                                                        task.products?.sku
                                                                    )}
                                                                </td>
                                                                <td className="p-2">{task.locations?.code}</td>
                                                                <td className="p-2 text-right font-bold">{task.quantity}</td>
                                                                <td className="p-2 text-slate-500">{task.status}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )
                }
            </main >

            {/* Add Item Dialog */}
            < Dialog open={addOpen} onOpenChange={setAddOpen} >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Thêm Sản Phẩm</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Sản Phẩm *</Label>
                            <Select value={newItem.product_id} onValueChange={(val) => setNewItem({ ...newItem, product_id: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn sản phẩm" />
                                </SelectTrigger>
                                <SelectContent>
                                    {products.map(p => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.sku} - {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Số Lượng *</Label>
                            <Input
                                type="number"
                                min="1"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Từ Vị Trí (Tùy chọn)</Label>
                            <Select value={newItem.from_location_id} onValueChange={(val) => setNewItem({ ...newItem, from_location_id: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Tự động" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">-- Tự động --</SelectItem>
                                    {locations.map(l => (
                                        <SelectItem key={l.id} value={l.id}>
                                            {l.code}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Hủy</Button>
                        <Button onClick={handleAddItem}>Thêm</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Config Allocate Dialog */}
            < Dialog open={confirmAllocateOpen} onOpenChange={setConfirmAllocateOpen} >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Xác nhận phân bổ</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p>Bạn có chắc chắn muốn phân bổ hàng hóa cho đơn này?</p>
                        <p className="text-sm text-muted-foreground mt-2">
                            Hệ thống sẽ tạo Picking Jobs tương ứng. <br />
                            Danh sách hàng hóa sẽ bị khóa sau khi phân bổ.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmAllocateOpen(false)}>Hủy</Button>
                        <Button onClick={executeAllocate} disabled={allocating}>
                            {allocating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Xác Nhận
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >
            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Xác nhận hủy duyệt</DialogTitle>
                        <DialogDescription>
                            Bạn có chắc chắn muốn hủy duyệt phiếu này không?
                            <br /><br />
                            Hành động này sẽ:
                            <ul className="list-disc pl-4 mt-2 mb-2">
                                <li><strong>Ghi log hoàn trả (RELEASE)</strong> toàn bộ số lượng đang giữ.</li>
                                <li>Đưa phiếu về trạng thái <strong>Chờ xử lý (Pending)</strong>.</li>
                            </ul>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Đóng</Button>
                        <Button variant="destructive" onClick={confirmCancelApprove} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Xác nhận Hủy
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Xác nhận Duyệt Phiếu</DialogTitle>
                        <DialogDescription>
                            Bạn có chắc chắn muốn duyệt phiếu điều chuyển này không?
                            <br /><br />
                            Hệ thống sẽ:
                            <ul className="list-disc pl-4 mt-2 mb-2">
                                <li><strong>Chốt danh sách</strong> sản phẩm trong phiếu.</li>
                                <li>Tạo giao dịch <strong>RESERVE (Giữ hàng)</strong> trên hệ thống.</li>
                                <li>Chuyển trạng thái sang <strong>Đã Duyệt (Approved)</strong>.</li>
                            </ul>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Hủy</Button>
                        <Button onClick={executeApprove} className="bg-slate-800 hover:bg-slate-700">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Xác nhận Duyệt
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    )
}
