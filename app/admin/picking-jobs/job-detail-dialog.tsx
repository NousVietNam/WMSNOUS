
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Loader2, Package, CheckCircle2, Box } from "lucide-react"

interface JobDetailDialogProps {
    jobId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function JobDetailDialog({ jobId, open, onOpenChange }: JobDetailDialogProps) {
    const [loading, setLoading] = useState(false)
    const [tasks, setTasks] = useState<any[]>([])
    const [job, setJob] = useState<any>(null)

    useEffect(() => {
        if (open && jobId) {
            fetchDetails()
        } else {
            setTasks([])
            setJob(null)
        }
    }, [open, jobId])

    const fetchDetails = async () => {
        setLoading(true)
        try {
            // Get Job - Updated to use outbound_orders
            const { data: jobData, error: jobError } = await supabase
                .from('picking_jobs')
                .select(`
                    *, 
                    outbound_order:outbound_orders(
                        code, 
                        type,
                        transfer_type,
                        customer:customers(name),
                        destination:destinations(name)
                    )
                `)
                .eq('id', jobId)
                .single()

            if (jobError) throw jobError
            setJob(jobData)

            // Get Tasks - Include order_item_id for BOX jobs
            const { data: taskData, error: taskError } = await supabase
                .from('picking_tasks')
                .select(`
                    *,
                    products (sku, name, barcode),
                    boxes:boxes!box_id (code, location_id, locations(code)),
                    order_item:outbound_order_items(
                        id,
                        product_id,
                        quantity,
                        from_box_id,
                        product:products(sku, name, barcode)
                    )
                `)
                .eq('job_id', jobId)
                .order('id')

            if (taskError) throw taskError

            // Sort: Location -> Box -> SKU
            const sortedTasks = (taskData || []).sort((a: any, b: any) => {
                const locA = a.boxes?.locations?.code || ''
                const locB = b.boxes?.locations?.code || ''
                if (locA !== locB) return locA.localeCompare(locB)

                const boxA = a.boxes?.code || ''
                const boxB = b.boxes?.code || ''
                if (boxA !== boxB) return boxA.localeCompare(boxB, undefined, { numeric: true })

                return (a.products?.sku || '').localeCompare(b.products?.sku || '')
            })

            setTasks(sortedTasks)

        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const stats = {
        total: tasks.reduce((sum, t) => sum + t.quantity, 0),
        picked: tasks.filter(t => t.status === 'COMPLETED').reduce((sum, t) => sum + t.quantity, 0),
        progress: 0
    }
    stats.progress = stats.total > 0 ? Math.round((stats.picked / stats.total) * 100) : 0

    // Group items by Box (Source)
    // For Outbox display, currently we don't have direct link.
    // We can show "Status" and "Source Box".

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-600" />
                        Chi Tiết Picking Job: {job?.outbound_order?.code || (jobId ? `JOB-${jobId.slice(0, 8).toUpperCase()}` : '...')}
                    </DialogTitle>
                    <DialogDescription>
                        {job?.type === 'MANUAL_PICK'
                            ? 'Upload thủ công'
                            : job?.type === 'BOX_PICK'
                                ? `Lấy Thùng - ${job?.outbound_order?.customer?.name || job?.outbound_order?.destination?.name || 'N/A'}`
                                : job?.outbound_order?.customer?.name || job?.outbound_order?.destination?.name || 'Chi tiết đơn hàng'}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
                ) : (
                    <div className="space-y-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-slate-50 p-3 rounded-lg border">
                                <div className="text-xs text-slate-500 uppercase font-bold">Tổng SL Hàng</div>
                                <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
                            </div>
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <div className="text-xs text-blue-600 uppercase font-bold">Đã Lấy</div>
                                <div className="text-2xl font-bold text-blue-700">{stats.picked}</div>
                            </div>
                            <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                <div className="text-xs text-green-600 uppercase font-bold">Tiến Độ</div>
                                <div className="text-2xl font-bold text-green-700">{stats.progress}%</div>
                            </div>
                        </div>

                        {/* Task List */}
                        <div>
                            <h3 className="font-bold mb-2 flex items-center gap-2 text-sm">
                                <Box className="h-4 w-4" />
                                {job?.type === 'BOX_PICK' ? 'Danh Sách Thùng Cần Lấy' : 'Danh Sách Hàng Cần Lấy'}
                            </h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    {job?.type !== 'BOX_PICK' && (
                                        <thead className="bg-slate-100 text-slate-700">
                                            <tr>
                                                <th className="p-2 text-left">SKU / Sản Phẩm</th>
                                                <th className="p-2 text-left">Nguồn (Box)</th>
                                                <th className="p-2 text-center">SL</th>
                                                <th className="p-2 text-right">Trạng Thái</th>
                                            </tr>
                                        </thead>
                                    )}
                                    <tbody className="divide-y">
                                        {tasks.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-slate-400 text-sm">
                                                    Không có thông tin (Chưa phân bổ hàng)
                                                </td>
                                            </tr>
                                        ) : job?.type === 'BOX_PICK' ? (
                                            // For BOX jobs: Group by box and show items in each box
                                            (() => {
                                                // Group tasks by box
                                                const boxGroups = tasks.reduce((acc: any, task: any) => {
                                                    const boxCode = task.boxes?.code || 'Unknown'
                                                    if (!acc[boxCode]) {
                                                        acc[boxCode] = {
                                                            box: task.boxes,
                                                            tasks: [],
                                                            status: task.status
                                                        }
                                                    }
                                                    acc[boxCode].tasks.push(task)
                                                    return acc
                                                }, {})

                                                return Object.entries(boxGroups).map(([boxCode, group]: [string, any]) => (
                                                    <tr key={boxCode} className="hover:bg-slate-50">
                                                        <td className="p-4" colSpan={4}>
                                                            <div className="space-y-3">
                                                                {/* Box Header */}
                                                                <div className="flex items-center gap-3 pb-2 border-b-2 border-purple-200">
                                                                    <div className="text-2xl">📦</div>
                                                                    <div>
                                                                        <div className="font-bold text-lg text-purple-700">Thùng: {boxCode}</div>
                                                                        <div className="text-xs text-slate-500">
                                                                            📍 {group.box?.locations?.code || 'N/A'} • {group.tasks.length} sản phẩm
                                                                        </div>
                                                                    </div>
                                                                    <div className="ml-auto">
                                                                        {group.status === 'COMPLETED' ? (
                                                                            <Badge className="bg-green-100 text-green-800 border-green-200">Đã Lấy</Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="text-slate-500">Chờ</Badge>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Items Table */}
                                                                <table className="w-full text-sm">
                                                                    <thead className="bg-purple-50">
                                                                        <tr>
                                                                            <th className="p-2 text-left font-semibold text-purple-700">STT</th>
                                                                            <th className="p-2 text-left font-semibold text-purple-700">Mã SKU</th>
                                                                            <th className="p-2 text-left font-semibold text-purple-700">Tên Sản Phẩm</th>
                                                                            <th className="p-2 text-left font-semibold text-purple-700">Barcode</th>
                                                                            <th className="p-2 text-center font-semibold text-purple-700">Số Lượng</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-purple-100">
                                                                        {group.tasks.map((task: any, idx: number) => {
                                                                            const product = task.order_item?.product || task.products
                                                                            return (
                                                                                <tr key={task.id} className="hover:bg-purple-50/50">
                                                                                    <td className="p-2">
                                                                                        <div className="w-6 h-6 bg-purple-200 rounded-full flex items-center justify-center text-purple-700 font-bold text-xs">
                                                                                            {idx + 1}
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="p-2">
                                                                                        <span className="font-mono font-bold text-slate-700">{product?.sku || 'N/A'}</span>
                                                                                    </td>
                                                                                    <td className="p-2">
                                                                                        <span className="text-slate-600">{product?.name || 'N/A'}</span>
                                                                                    </td>
                                                                                    <td className="p-2">
                                                                                        <span className="font-mono text-xs text-slate-500">{product?.barcode || '-'}</span>
                                                                                    </td>
                                                                                    <td className="p-2 text-center">
                                                                                        <span className="inline-flex items-center justify-center px-3 py-1 bg-blue-100 text-blue-700 font-bold rounded-full">
                                                                                            {task.quantity}
                                                                                        </span>
                                                                                    </td>
                                                                                </tr>
                                                                            )
                                                                        })}
                                                                    </tbody>
                                                                    <tfoot className="bg-purple-50">
                                                                        <tr>
                                                                            <td colSpan={4} className="p-2 text-right font-semibold text-purple-700">Tổng cộng:</td>
                                                                            <td className="p-2 text-center">
                                                                                <span className="inline-flex items-center justify-center px-3 py-1 bg-purple-600 text-white font-bold rounded-full">
                                                                                    {group.tasks.reduce((sum: number, t: any) => sum + t.quantity, 0)}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    </tfoot>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            })()
                                        ) : (
                                            // For ITEM jobs: Show individual items
                                            tasks.map(task => (
                                                <tr key={task.id} className="hover:bg-slate-50">
                                                    <td className="p-2">
                                                        <div className="font-bold">{task.products?.sku}</div>
                                                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{task.products?.name}</div>
                                                    </td>
                                                    <td className="p-2">
                                                        <Badge variant="outline" className="bg-slate-100">
                                                            {task.boxes?.code || 'Loose'}
                                                        </Badge>
                                                        <div className="text-[10px] text-slate-400 mt-1">
                                                            {task.boxes?.locations?.code || 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 text-center font-bold">
                                                        {task.quantity}
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        {task.status === 'COMPLETED' ? (
                                                            <Badge className="bg-green-100 text-green-800 border-green-200">Đã Lấy</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-slate-500">Chờ</Badge>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="text-xs text-slate-400 italic text-center">
                            * Thông tin thùng Outbox chưa khả dụng trong phiên bản này.
                        </div>
                    </div>
                )
                }
            </DialogContent >
        </Dialog >
    )
}
