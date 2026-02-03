"use client"

import { useEffect, useState } from "react"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { useAuth } from "@/components/auth/AuthProvider"
// import { ClipboardList, Package, User, ArrowRight } from "lucide-react"

export default function PickingJobsPage() {
    const { session } = useAuth()
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filterOnlyAvail, setFilterOnlyAvail] = useState(false)

    useEffect(() => {
        fetchJobs()
    }, [session])

    const fetchJobs = async () => {
        setLoading(true)
        // Fetch jobs that are OPEN or IN_PROGRESS
        const { data, error } = await supabase
            .from('picking_jobs')
            .select(`
                id,
                code,
                type,
                status,
                zone,
                assigned_to,
                created_at,
                outbound_order_id,
                wave_id,
                outbound_orders (
                    code, 
                    type,
                    inventory_type,
                    customers (name),
                    destinations (name)
                ),
                pick_waves (code),
                view_picking_job_progress (total_tasks, completed_tasks),
                users (name)
            `)
            .in('status', ['OPEN', 'IN_PROGRESS'])
            .order('created_at', { ascending: false })

        if (!error && data) setJobs(data)
        setLoading(false)
    }

    const handleTakeJob = async (jobId: string) => {
        if (!session?.user) return

        const { error } = await supabase.rpc('start_picking_job', {
            p_job_id: jobId,
            p_user_id: session.user.id
        })

        if (error) console.error(error)
    }

    const filteredJobs = jobs.filter(job => {
        if (filterOnlyAvail) {
            return !job.assigned_to
        }
        return true
    })

    return (
        <div className="min-h-screen bg-slate-100 pb-20">
            <MobileHeader title="Danh Sách Soạn Hàng" backLink="/mobile" />

            {/* Filter Bar */}
            <div className="px-4 pt-4">
                <button
                    onClick={() => setFilterOnlyAvail(!filterOnlyAvail)}
                    className={`w-full h-12 rounded-xl border-2 flex items-center justify-center gap-3 font-bold transition-all active:scale-95 shadow-sm ${filterOnlyAvail
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200'
                        }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                    {filterOnlyAvail ? 'ĐANG LỌC: CHỈ VIỆC TRỐNG' : 'HIỆN TẤT CẢ CÔNG VIỆC'}
                </button>
            </div>

            <div className="p-4 space-y-4">
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">Đang tải việc...</div>
                ) : filteredJobs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-16 w-16 mx-auto mb-4 text-slate-300"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6" /><path d="M9 16h6" /><path d="M9 8h6" /></svg>
                        <p>{filterOnlyAvail ? 'Hiện không còn việc trống nào.' : 'Không có yêu cầu soạn hàng nào.'}</p>
                    </div>
                ) : (
                    filteredJobs.map(job => (
                        <div key={job.id} className={`overflow-hidden rounded-xl shadow-md border bg-white ${job.type === 'WAVE_PICK' ? 'border-purple-200 ring-2 ring-purple-500/10' : 'border-slate-200'}`}>
                            <div>
                                <div className={`p-4 border-b ${job.type === 'WAVE_PICK' ? 'bg-purple-50/50' : 'bg-white'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <div>
                                            <div className={`font-black text-lg ${job.type === 'WAVE_PICK' ? 'text-purple-700' : 'text-indigo-700'}`}>
                                                {job.type === 'WAVE_PICK'
                                                    ? `WAVE: ${job.pick_waves?.code || 'WEB'}`
                                                    : job.outbound_orders?.code ? `PICK-${job.outbound_orders.code}` : `JOB-${job.id.slice(0, 8)}`
                                                }
                                            </div>
                                            <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mt-0.5">
                                                <div className={`w-2 h-2 rounded-full ${job.type === 'WAVE_PICK' ? 'bg-purple-500' : 'bg-slate-400'}`}></div>
                                                {job.zone ? `PHÂN VÙNG: ${job.zone}` : 'Chưa phân vùng'}
                                            </div>
                                            <div className="text-[13px] text-slate-500 mt-1 italic">
                                                {job.type === 'WAVE_PICK'
                                                    ? 'Nhặt gộp nhiều đơn hàng'
                                                    : job.outbound_orders?.customers?.name || job.outbound_orders?.destinations?.name || (job.type === 'MANUAL_PICK' ? 'Upload Thủ Công' : '')
                                                }
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-[10px] font-black tracking-wider ${job.status === 'OPEN' ? 'bg-green-500 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm'
                                            }`}>
                                            {job.status === 'OPEN' ? 'MỚI' : 'ĐANG LÀM'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-slate-600 mt-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase ${job.type === 'WAVE_PICK' ? 'bg-purple-600 text-white border-purple-600 shadow-sm' :
                                            job.type === 'BOX_PICK' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                'bg-blue-100 text-blue-700 border-blue-200'
                                            }`}>
                                            {job.type === 'WAVE_PICK' ? 'NHẶT WAVE' : job.type === 'BOX_PICK' ? 'LẤY THÙNG' : 'LẤY LẺ'}
                                        </span>
                                        <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-[11px] font-bold">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                                            {job.view_picking_job_progress?.[0] ? (
                                                <span className={job.view_picking_job_progress[0].completed_tasks === job.view_picking_job_progress[0].total_tasks ? 'text-green-600 font-bold' : ''}>
                                                    {job.view_picking_job_progress[0].completed_tasks}/{job.view_picking_job_progress[0].total_tasks}
                                                </span>
                                            ) : '0'}
                                        </div>
                                        {job.assigned_to && (
                                            <div className="flex items-center gap-1 text-[11px] bg-slate-200 px-2 py-0.5 rounded-full font-bold">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                {job.assigned_to === session?.user?.id ? 'BẠN ĐANG LÀM' : 'ĐÃ NHẬN'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className={`p-3 ${job.type === 'WAVE_PICK' ? 'bg-purple-50/20' : 'bg-slate-50'}`}>
                                    {job.assigned_to && job.assigned_to !== session?.user?.id ? (
                                        <button className="w-full h-11 bg-slate-300 text-slate-500 rounded-lg font-bold cursor-not-allowed flex items-center justify-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                            NHẬN BỞI {job.users?.name?.toUpperCase() || 'NGƯỜI KHÁC'}
                                        </button>
                                    ) : (
                                        <Link href={`/mobile/picking/${job.id}`} onClick={() => handleTakeJob(job.id)} className={`block w-full h-11 rounded-lg font-black shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-95 ${job.type === 'WAVE_PICK' ? (job.status === 'OPEN' ? 'bg-purple-600 text-white active:bg-purple-700' : 'bg-white text-purple-700 border-2 border-purple-600') : (job.status === 'OPEN' ? 'bg-indigo-600 text-white active:bg-indigo-700' : 'bg-white text-slate-700 border border-slate-300 active:bg-slate-50')}`}>
                                            {job.status === 'OPEN' ? 'BẮT ĐẦU NGAY' : 'TIẾP TỤC CÔNG VIỆC'}
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
