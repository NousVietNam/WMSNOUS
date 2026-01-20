"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Search, Trash2, Package, Loader2, RefreshCw, Upload, Download, AlertTriangle, X } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import * as XLSX from "xlsx"

import { JobDetailDialog } from "./job-detail-dialog"

export default function PickingJobsPage() {
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filterStatus, setFilterStatus] = useState("ALL")
    const [searchTerm, setSearchTerm] = useState("")
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Detail Dialog State
    const [detailId, setDetailId] = useState<string | null>(null)
    const [showDetail, setShowDetail] = useState(false)

    // Upload Error State
    const [uploadErrors, setUploadErrors] = useState<string[]>([])
    const [showErrorDialog, setShowErrorDialog] = useState(false)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        setUploadErrors([])
        try {
            const data = await file.arrayBuffer()
            const wb = XLSX.read(data)
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json<{ 'Box Code': string; SKU: string; Quantity: number }>(ws)

            if (rows.length === 0) {
                toast.error("File rỗng hoặc không đúng định dạng")
                return
            }

            // Map to API format
            const items = rows.map(r => ({
                boxCode: String(r['Box Code']).trim(),
                sku: String(r['SKU']).trim(),
                quantity: Number(r['Quantity'])
            })).filter(i => i.boxCode && i.sku && i.quantity > 0)

            if (items.length === 0) {
                toast.error("Không có dòng hợp lệ để xử lý")
                return
            }

            // Call API
            const res = await fetch('/api/picking-jobs/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items })
            })

            const result = await res.json()
            if (!res.ok) {
                // If API returns structured errors even on 400/500
                if (result.errors?.length > 0) {
                    setUploadErrors(result.errors)
                    setShowErrorDialog(true)
                } else {
                    throw new Error(result.error || 'Lỗi tạo job')
                }
                return
            }

            toast.success(`Đã tạo Picking Job với ${result.tasksCreated} task(s)`)
            if (result.errors?.length > 0) {
                toast.warning(`Cảnh báo: ${result.errors.length} dòng lỗi`)
                setUploadErrors(result.errors)
                setShowErrorDialog(true)
            }
            fetchJobs()
        } catch (error: any) {
            toast.error("Lỗi: " + error.message)
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    useEffect(() => {
        fetchJobs()
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
                    user:users(name),
                    order:orders(code, customer_name),
                    transfer:transfer_orders(code, from_location:locations(code), destination:destinations(name))
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

    const handleDelete = async (jobId: string, type: string) => {
        if (!confirm("Hủy Picking Job này?\n\nHệ thống sẽ:\n1. Xóa Job và các Task.\n2. Hoàn trả tồn kho đã phân bổ.\n3. Tạo giao dịch RELEASE.")) return

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

        const code = job.transfer?.code || job.order?.code || ''
        const extra = job.order?.customer_name || job.transfer?.destination?.name || ''
        const search = searchTerm.toLowerCase()
        const matchSearch = code.toLowerCase().includes(search) || extra.toLowerCase().includes(search)

        return matchStatus && matchSearch
    })

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDING': return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Chờ Xử Lý</Badge>
            case 'OPEN': return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Mới Tạo (Open)</Badge>
            case 'IN_PROGRESS': return <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200">Đang Lấy</Badge>
            case 'COMPLETED': return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Hoàn Thành</Badge>
            case 'CANCELLED': return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Đã Hủy</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
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
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                    />
                    <Button
                        variant="default"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        Upload Danh Sách
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            const template = [
                                ['Box Code', 'SKU', 'Quantity'],
                                ['BOX-0001', 'ABC-123-XL', 2],
                                ['BOX-0002', 'DEF-456-M', 1]
                            ]
                            const ws = XLSX.utils.aoa_to_sheet(template)
                            const wb = XLSX.utils.book_new()
                            XLSX.utils.book_append_sheet(wb, ws, 'Template')
                            XLSX.writeFile(wb, 'picking_upload_template.xlsx')
                        }}
                    >
                        <Download className="h-4 w-4 mr-2" /> Tải File Mẫu
                    </Button>
                    <Button variant="outline" onClick={fetchJobs}><RefreshCw className="h-4 w-4 mr-2" /> Tải lại</Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex-1 relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Tìm mã đơn, tên khách/kho..."
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
                            <th className="p-3 text-left">Nhân Viên</th>
                            <th className="p-3 text-center">Trạng Thái</th>
                            <th className="p-3 text-right">Ngày Tạo</th>
                            <th className="p-3 text-right">Hành Động</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
                        ) : filteredJobs.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Không tìm thấy job nào.</td></tr>
                        ) : (
                            filteredJobs.map(job => {
                                const isTransfer = !!job.transfer
                                const isManual = job.type === 'MANUAL_PICK'
                                const code = isManual ? `JOB-${job.id.slice(0, 8).toUpperCase()}` : (isTransfer ? job.transfer.code : job.order?.code)
                                const link = isTransfer ? `/admin/transfers/${job.transfer_order_id || ''}` : `/admin/orders/${job.order_id || ''}`
                                const info = isManual
                                    ? 'Upload thủ công'
                                    : (isTransfer
                                        ? `${job.transfer.from_location?.code || ''} ➔ ${job.transfer.destination?.name || ''}`
                                        : `Khách: ${job.order?.customer_name || 'N/A'}`)

                                return (
                                    <tr key={job.id} className="hover:bg-slate-50">
                                        <td className="p-3 font-medium">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs px-1.5 rounded border ${isManual ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    isTransfer ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                                    }`}>
                                                    {isManual ? 'THỦ CÔNG' : (isTransfer ? 'TRANSFER' : 'ORDER')}
                                                </span>
                                                {/* Make Code Clickable for Detail View */}
                                                <button
                                                    className="hover:underline text-blue-600 font-bold"
                                                    onClick={() => {
                                                        setDetailId(job.id)
                                                        setShowDetail(true)
                                                    }}
                                                >
                                                    {code}
                                                </button>

                                                {/* Optional: Link to Source for non-manual */}
                                                {!isManual && (
                                                    <Link href={link} className="text-xs text-slate-400 hover:text-slate-600 ml-1">
                                                        [Source]
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 font-mono text-xs">
                                            {job.type === 'BOX_PICK' ? (
                                                <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100">Lấy Thùng</Badge>
                                            ) : job.type === 'ITEM_PICK' ? (
                                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">Lấy Lẻ</Badge>
                                            ) : (
                                                <span className="text-slate-500">{job.type}</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-slate-600">{info}</td>
                                        <td className="p-3 text-slate-600 text-sm">
                                            {job.user?.name || '---'}
                                        </td>
                                        <td className="p-3 text-center">{getStatusBadge(job.status)}</td>
                                        <td className="p-3 text-right text-slate-500 text-xs">
                                            {new Date(job.created_at).toLocaleString('vi-VN')}
                                        </td>
                                        <td className="p-3 text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                                onClick={() => handleDelete(job.id, job.type)}
                                                disabled={deletingId === job.id}
                                                title="Hủy Job & Hoàn kho"
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

            <JobDetailDialog
                jobId={detailId}
                open={showDetail}
                onOpenChange={setShowDetail}
            />

            {showErrorDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-red-600 flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5" />
                                Lỗi Upload ({uploadErrors.length})
                            </h3>
                            <button onClick={() => setShowErrorDialog(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
                            <ul className="space-y-2 text-sm font-mono text-slate-700">
                                {uploadErrors.map((err, i) => (
                                    <li key={i} className="bg-white p-2 border rounded border-red-100 flex gap-2">
                                        <span className="text-red-500 font-bold">•</span>
                                        {err}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="p-4 border-t bg-slate-50 rounded-b-lg text-right">
                            <Button onClick={() => setShowErrorDialog(false)}>Đóng</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
