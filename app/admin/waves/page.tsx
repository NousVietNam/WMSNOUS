
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import {
    Plus,
    Search,
    Waves,
    Loader2,
    LayoutGrid,
    CheckCircle2,
    Clock,
    Activity,
    ArrowRight,
    Users,
    Zap
} from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

export default function WavesPage() {
    const router = useRouter()
    const [waves, setWaves] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    useEffect(() => {
        fetchWaves()
    }, [])

    const fetchWaves = async () => {
        setLoading(true)
        try {
            const { data: wavesData, error: wavesError } = await supabase
                .from('pick_waves')
                .select('*, picking_jobs(id, code), user:users!pick_waves_created_by_profiles_fkey(name)')
                .order('created_at', { ascending: false })

            if (wavesError) throw wavesError

            const { data: progressData, error: progressError } = await supabase
                .from('view_wave_progress')
                .select('*')

            const enrichedWaves = (wavesData || []).map(w => ({
                ...w,
                view_wave_progress: (progressData || [])?.filter(p => p.wave_id === w.id)
            }))

            setWaves(enrichedWaves)
        } catch (err: any) {
            console.error("Wave fetch error:", err)
            toast.error("Không thể tải danh sách Wave")
        } finally {
            setLoading(false)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PLANNING': return 'bg-amber-50 text-amber-700 border-amber-200'
            case 'RELEASED': return 'bg-sky-50 text-sky-700 border-sky-200 shadow-sm shadow-sky-100'
            case 'COMPLETED': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
            case 'CANCELLED': return 'bg-rose-50 text-rose-700 border-rose-200'
            default: return 'bg-slate-50 text-slate-700 border-slate-200'
        }
    }

    const filteredWaves = waves.filter(w =>
        w.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.inventory_type.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const stats = {
        total: waves.length,
        active: waves.filter(w => w.status === 'RELEASED').length,
        completed: waves.filter(w => w.status === 'COMPLETED').length,
        planning: waves.filter(w => w.status === 'PLANNING').length
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-10 min-h-screen pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 animate-fade-in">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-200">
                            <Waves className="h-7 w-7" />
                        </div>
                        <h1 className="text-4xl font-black tracking-tighter gradient-text">Quản Lý Wave</h1>
                    </div>
                    <p className="text-slate-500 font-medium ml-1">Lập kế hoạch và giám sát các đợt soạn hàng tập trung.</p>
                </div>
                <Button
                    onClick={() => router.push('/admin/waves/new')}
                    className="rounded-2xl h-12 px-6 font-black uppercase tracking-widest text-xs gradient-primary shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all group"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Tạo Wave Mới
                </Button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                {[
                    { label: 'Tổng số Wave', value: stats.total, icon: Activity, color: 'text-indigo-600' },
                    { label: 'Đang thực hiện', value: stats.active, icon: Zap, color: 'text-sky-600', sub: 'Active' },
                    { label: 'Đã hoàn tất', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600' },
                    { label: 'Đang chờ', value: stats.planning, icon: Clock, color: 'text-amber-600' }
                ].map((stat, i) => (
                    <Card key={i} className="rounded-3xl border-slate-100 shadow-sm glass-strong p-6 flex items-center gap-5 hover:border-indigo-200 transition-all group">
                        <div className={`h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-slate-50 transition-transform group-hover:scale-110 ${stat.color}`}>
                            <stat.icon className="h-7 w-7" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                            <p className="text-2xl font-black text-slate-800">{stat.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:max-w-md group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                        <Input
                            placeholder="Tìm kiếm mã Wave / Loại kho..."
                            className="pl-12 h-12 rounded-2xl bg-white border-slate-200 shadow-sm group-hover:border-indigo-100 focus:border-indigo-500 transition-all font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl shadow-slate-200/40 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50/50 backdrop-blur-md sticky top-0 z-10">
                            <TableRow className="hover:bg-transparent border-b">
                                <TableHead className="py-5 px-6 font-black text-[10px] uppercase tracking-widest text-slate-400">Mã Wave</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Loại Kho</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Trạng Thái</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Tiến Độ</TableHead>
                                <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400">Điều Phối</TableHead>
                                <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-slate-400">Hiệu Năng</TableHead>
                                <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-slate-400 px-6">Ngày Tạo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                [1, 2, 3, 4, 5].map(i => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={7} className="px-6 py-4">
                                            <Skeleton className="h-10 w-full rounded-xl" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredWaves.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-24">
                                        <div className="space-y-4">
                                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                                                <Waves className="h-8 w-8 text-slate-200" />
                                            </div>
                                            <p className="text-slate-400 font-medium">Không tìm thấy Wave nào phù hợp.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredWaves.map((wave) => (
                                    <TableRow
                                        key={wave.id}
                                        className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                                        onClick={() => router.push(`/admin/waves/${wave.id}`)}
                                    >
                                        <TableCell className="py-5 px-6">
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase">{wave.code}</span>
                                                <ArrowRight className="h-4 w-4 text-indigo-400 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`font-black text-[10px] rounded-lg px-2.5 py-0.5 ${wave.inventory_type === 'BULK' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                                {wave.inventory_type === 'BULK' ? 'KHO SỈ' : 'KHO LẺ'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`font-black uppercase text-[9px] rounded-lg px-3 py-1 border-2 ${getStatusColor(wave.status)}`}>
                                                {wave.status === 'PLANNING' ? 'ĐANG LÊN KH' : wave.status === 'RELEASED' ? 'ĐANG THỰC HIỆN' : wave.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const statsMap = wave.view_wave_progress?.[0]
                                                const total = statsMap?.total_tasks || 0
                                                const done = statsMap?.completed_tasks || 0
                                                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                                                return (
                                                    <div className="space-y-1.5 min-w-[120px]">
                                                        <div className="flex justify-between text-[9px] font-black items-baseline">
                                                            <span className={pct === 100 ? 'text-emerald-600' : 'text-slate-900'}>{pct}%</span>
                                                            <span className="text-slate-400 font-medium tracking-tight uppercase">{done}/{total} PCS</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : pct > 0 ? 'bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.3)]' : 'bg-slate-200'}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-white shadow-sm">
                                                    <Users className="h-4 w-4" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-xs font-black text-slate-800">{wave.user?.name || '---'}</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Coordinator</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-black text-slate-900">{wave.total_items}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{wave.total_orders} Orders</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right px-6">
                                            <p className="text-xs font-black text-slate-500">
                                                {format(new Date(wave.created_at), 'dd/MM/yyyy')}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                                {format(new Date(wave.created_at), 'HH:mm')}
                                            </p>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
