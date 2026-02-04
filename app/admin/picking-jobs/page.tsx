"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Search, Trash2, Package, Loader2, RefreshCw, UserPlus } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import { JobDetailDialog } from "./job-detail-dialog"
import { ExceptionTab } from "./ExceptionTab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function PickingJobsPage() {
    const [jobs, setJobs] = useState<any[]>([])
    const [staffs, setStaffs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filterStatus, setFilterStatus] = useState("ALL")
    const [searchTerm, setSearchTerm] = useState("")
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [assigningId, setAssigningId] = useState<string | null>(null)

    // Detail Dialog State
    const [detailId, setDetailId] = useState<string | null>(null)
    const [showDetail, setShowDetail] = useState(false)

    useEffect(() => {
        fetchJobs()
        fetchStaffs()
    }, [])

    const fetchJobs = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('picking_jobs')
                .select(`
                    id, 
                    type, 
                    status, 
                    created_at,
                    started_at,
                    completed_at,
                    code,
                    zone,
                    user:users!fk_picking_jobs_user(name),
                    assigned_to,
                    assignee:users!fk_picking_jobs_assignee(name),
                    outbound_order:outbound_orders(
                        code, 
                        type,
                        inventory_type, 
                        customer:customers(name),
                        destination:destinations(name)
                    ),
                    wave:pick_waves(code),
                    picking_tasks(id, status, quantity)
                `)
                .order('created_at', { ascending: false })

            if (error) throw error
            setJobs(data || [])
        } catch (error: any) {
            toast.error("Lỗi tải danh sách: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchStaffs = async () => {
        const { data } = await supabase
            .from('users')
            .select('id, name')
            .in('role', ['STAFF', 'ADMIN'])
            .order('name')
        if (data) setStaffs(data)
    }

    const handleAssign = async (jobId: string, staffId: string) => {
        setAssigningId(jobId)
        try {
            const res = await fetch('/api/picking-jobs/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, staffId })
            })
            const result = await res.json()
            if (result.success) {
                toast.success(result.message)
                fetchJobs()
            } else {
                toast.error("Lỗi gán việc: " + result.error)
            }
        } catch (error: any) {
            toast.error("Lỗi kết nối: " + error.message)
        } finally {
            setAssigningId(null)
        }
    }

    const handleDelete = async (jobId: string, type: string) => {
        if (!confirm("Hủy Picking Job này?\n\nHệ thống sẽ:\n1. Xóa Job và các Task.\n2. Hoàn trả tồn kho đã phân bổ.\n3. Đặt lại trạng thái đơn về ALLOCATED.")) return

        setDeletingId(jobId)
        try {
            const res = await fetch('/api/picking-jobs/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            })

            const json = await res.json()

            if (!res.ok) throw new Error(json.error || 'Lỗi khi xóa job')

            toast.success("Đã hủy job và hoàn trả tồn kho thành công!")
            fetchJobs()
        } catch (error: any) {
            toast.error("Thất bại: " + error.message)
        } finally {
            setDeletingId(null)
        }
    }

    const filteredJobs = jobs.filter(job => {
        const matchStatus = filterStatus === 'ALL' || job.status === filterStatus
        const orderCode = job.outbound_order?.code || ''
        const customerName = job.outbound_order?.customer?.name || ''
        const destinationName = job.outbound_order?.destination?.name || ''
        const search = searchTerm.toLowerCase()
        const matchSearch = orderCode.toLowerCase().includes(search) ||
            customerName.toLowerCase().includes(search) ||
            destinationName.toLowerCase().includes(search) ||
            job.code?.toLowerCase().includes(search)
        return matchStatus && matchSearch
    })

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDING': return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 uppercase text-[10px]">Chờ Xử Lý</Badge>
            case 'PLANNED': return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 uppercase text-[10px]">Đã Lên Kế Hoạch</Badge>
            case 'OPEN': return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 uppercase text-[10px]">Mới Tạo</Badge>
            case 'ASSIGNED': return <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200 uppercase text-[10px]">Đã Giao Việc</Badge>
            case 'IN_PROGRESS': return <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200 uppercase text-[10px]">Đang Lấy</Badge>
            case 'PICKING': return <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200 uppercase text-[10px]">Đang Lấy</Badge>
            case 'COMPLETED': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 uppercase text-[10px]">Hoàn Thành</Badge>
            case 'PACKED': return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 uppercase text-[10px]">Đã Đóng Gói</Badge>
            case 'SHIPPED': return <Badge variant="default" className="bg-green-600 hover:bg-green-700 uppercase text-[10px]">Đã Xuất Kho</Badge>
            case 'CANCELLED': return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 uppercase text-[10px]">Đã Hủy</Badge>
            default: return <Badge variant="outline" className="uppercase text-[10px]">{status}</Badge>
        }
    }

    const formatDuration = (start: string | null, end: string | null) => {
        if (!start) return '---'
        const startTime = new Date(start).getTime()
        const endTime = end ? new Date(end).getTime() : Date.now()
        const diff = Math.max(0, endTime - startTime)

        const mins = Math.floor(diff / 60000)
        const secs = Math.floor((diff % 60000) / 1000)

        if (mins > 60) {
            const hrs = Math.floor(mins / 60)
            return `${hrs}h ${mins % 60}m`
        }
        return `${mins}p ${secs}s`
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="h-6 w-6 text-primary" />
                        Quản Lý Picking Jobs
                    </h1>
                    <p className="text-sm text-muted-foreground">Theo dõi và quản lý công việc lấy hàng</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" onClick={fetchJobs}><RefreshCw className="h-4 w-4 mr-2" /> Tải lại</Button>
                </div>
            </div>

            <Tabs defaultValue="jobs" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="jobs">Danh Sách Jobs</TabsTrigger>
                    <TabsTrigger value="exceptions" className="flex items-center gap-2">
                        Ngoại Lệ / Báo Thiếu
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="jobs" className="space-y-4 pt-4">
                    <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-lg border shadow-sm">
                        <div className="flex-1 relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm mã job, đơn, tên khách..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger><SelectValue placeholder="Trạng thái" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tất cả</SelectItem>
                                    <SelectItem value="PENDING">Chờ Xử Lý</SelectItem>
                                    <SelectItem value="OPEN">Mới Tạo</SelectItem>
                                    <SelectItem value="ASSIGNED">Đã Giao</SelectItem>
                                    <SelectItem value="IN_PROGRESS">Đang Lấy</SelectItem>
                                    <SelectItem value="COMPLETED">Hoàn Thành</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 font-medium text-slate-700">
                                <tr>
                                    <th className="p-3 text-left">Mã Đơn / Phiếu</th>
                                    <th className="p-3 text-left">Loại Job</th>
                                    <th className="p-3 text-left">Thông Tin Nguồn/Đích</th>
                                    <th className="p-3 text-center">Tiến Độ</th>
                                    <th className="p-3 text-center">SL Items</th>
                                    <th className="p-3 text-left min-w-[150px]">Nhân Viên</th>
                                    <th className="p-3 text-center">Trạng Thái</th>
                                    <th className="p-3 text-center">Bắt đầu</th>
                                    <th className="p-3 text-center">Thời gian</th>
                                    <th className="p-3 text-right">Ngày Tạo</th>
                                    <th className="p-3 text-right">Hành Động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr><td colSpan={11} className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
                                ) : filteredJobs.length === 0 ? (
                                    <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Không tìm thấy job nào.</td></tr>
                                ) : (
                                    filteredJobs.map(job => {
                                        const order = job.outbound_order
                                        const wave = (job as any).wave
                                        const isManual = job.type === 'MANUAL_PICK'
                                        const isWave = job.type === 'WAVE_PICK'
                                        const isTransfer = order?.type === 'TRANSFER' || order?.type === 'INTERNAL'

                                        const code = job.code || (isManual ? `JOB-${job.id.slice(0, 8).toUpperCase()}` : `PICK-${order?.code || 'N/A'}`)
                                        const link = isWave ? `/admin/waves/${job.wave_id || ''}` : `/admin/outbound/${job.outbound_order_id || ''}`

                                        const info = isWave
                                            ? `Wave: ${wave?.code || 'N/A'} | Zone: ${job.zone || 'N/A'}`
                                            : (isManual ? 'Upload thủ công' : (
                                                isTransfer
                                                    ? (order?.destination?.name || 'Kho nội bộ')
                                                    : (order?.customer?.name || 'Khách lẻ')
                                            ))

                                        const tasks = (job as any).picking_tasks || []
                                        const totalTasks = tasks.length
                                        const completedTasks = tasks.filter((t: any) => t.status === 'COMPLETED').length
                                        const totalItems = tasks.reduce((sum: number, t: any) => sum + (t.quantity || 0), 0)

                                        return (
                                            <tr key={job.id} className="hover:bg-slate-50">
                                                <td className="p-3 font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] px-1.5 py-0.5 font-bold rounded border ${isWave ? 'bg-purple-600 text-white border-purple-700' :
                                                            isManual ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                isTransfer ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                                            }`}>
                                                            {isWave ? 'WAVE' : (isManual ? 'MANUAL' : (isTransfer ? 'TRANSFER' : 'ORDER'))}
                                                        </span>
                                                        <button
                                                            className="hover:underline text-blue-600 font-bold"
                                                            onClick={() => {
                                                                setDetailId(job.id)
                                                                setShowDetail(true)
                                                            }}
                                                        >
                                                            {code}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="p-3 font-mono text-xs">
                                                    {job.type === 'WAVE_PICK' ? (
                                                        <Badge className="bg-purple-100 text-purple-800 border-purple-200">Nhặt Wave</Badge>
                                                    ) : job.type === 'BOX_PICK' ? (
                                                        <Badge variant="outline">Lấy Thùng</Badge>
                                                    ) : (
                                                        <Badge variant="outline">Lấy Lẻ</Badge>
                                                    )}
                                                </td>
                                                <td className="p-3 text-slate-600 truncate max-w-[200px]" title={info}>{info}</td>
                                                <td className="p-3 text-center">
                                                    {totalTasks > 0 ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-xs font-bold">{completedTasks}/{totalTasks}</span>
                                                            <div className="w-12 bg-slate-200 rounded-full h-1.5">
                                                                <div
                                                                    className="bg-green-500 h-1.5 rounded-full transition-all"
                                                                    style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">-</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className="text-sm font-semibold text-blue-700">{totalItems}</span>
                                                </td>
                                                <td className="p-3">
                                                    {job.status === 'COMPLETED' ? (
                                                        <span className="text-sm font-medium text-slate-600">{job.assignee?.name || job.user?.name || '---'}</span>
                                                    ) : (
                                                        <Select
                                                            value={job.assigned_to || "unassigned"}
                                                            onValueChange={(val) => handleAssign(job.id, val)}
                                                            disabled={assigningId === job.id}
                                                        >
                                                            <SelectTrigger className="h-8 text-xs font-semibold bg-indigo-50 border-indigo-100 text-indigo-700">
                                                                {assigningId === job.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
                                                                <SelectValue placeholder="Giao việc..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="unassigned">-- Chưa giao --</SelectItem>
                                                                {staffs.map(s => (
                                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">{getStatusBadge(job.status)}</td>
                                                <td className="p-3 text-center text-[10px] font-medium text-slate-500">
                                                    {job.started_at ? new Date(job.started_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '---'}
                                                </td>
                                                <td className="p-3 text-center text-[10px] font-bold text-indigo-600">
                                                    {formatDuration(job.started_at, job.completed_at || null)}
                                                </td>
                                                <td className="p-3 text-right text-slate-500 text-[10px]">
                                                    {new Date(job.created_at).toLocaleDateString('vi-VN')}
                                                    <br />
                                                    <span className="opacity-60">{new Date(job.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                                                        onClick={() => handleDelete(job.id, job.type)}
                                                        disabled={deletingId === job.id}
                                                    >
                                                        {deletingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="exceptions" className="pt-4">
                    <ExceptionTab />
                </TabsContent>
            </Tabs>

            <JobDetailDialog
                jobId={detailId}
                open={showDetail}
                onOpenChange={setShowDetail}
            />
        </div>
    )
}
