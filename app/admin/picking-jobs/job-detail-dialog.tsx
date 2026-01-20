
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
            // Get Job
            const { data: jobData, error: jobError } = await supabase
                .from('picking_jobs')
                .select(`*, orders(code, customer_name)`)
                .eq('id', jobId)
                .single()

            if (jobError) throw jobError
            setJob(jobData)

            // Get Tasks
            const { data: taskData, error: taskError } = await supabase
                .from('picking_tasks')
                .select(`
                    *,
                    products (sku, name),
                    boxes (code, location_id, locations(code))
                `)
                .eq('job_id', jobId)
                .order('id')

            if (taskError) throw taskError
            setTasks(taskData || [])

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
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-600" />
                        Chi Tiết Picking Job: {job?.orders?.code || (jobId ? `JOB-${jobId.slice(0, 8).toUpperCase()}` : '...')}
                    </DialogTitle>
                    <DialogDescription>
                        {job?.type === 'MANUAL_PICK' ? 'Upload thủ công' : job?.orders?.customer_name || 'Chi tiết đơn hàng'}
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
                                <Box className="h-4 w-4" /> Danh Sách Hàng Cần Lấy
                            </h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-slate-700">
                                        <tr>
                                            <th className="p-2 text-left">SKU / Sản Phẩm</th>
                                            <th className="p-2 text-left">Nguồn (Box)</th>
                                            <th className="p-2 text-center">SL</th>
                                            <th className="p-2 text-right">Trạng Thái</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {tasks.map(task => (
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
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="text-xs text-slate-400 italic text-center">
                            * Thông tin thùng Outbox chưa khả dụng trong phiên bản này.
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
