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

    useEffect(() => {
        fetchJobs()
    }, [session])

    const fetchJobs = async () => {
        setLoading(true)
        // Fetch jobs that are OPEN or IN_PROGRESS
        const { data, error } = await supabase
            .from('picking_jobs')
            .select(`
                *,
                orders (code, customer_name),
                picking_tasks (count),
                users (name)
            `)
            .in('status', ['OPEN', 'IN_PROGRESS'])
            .order('created_at', { ascending: false })

        if (!error && data) setJobs(data)
        setLoading(false)
    }

    const handleTakeJob = async (jobId: string) => {
        if (!session?.user) return

        const { error } = await supabase
            .from('picking_jobs')
            .update({
                status: 'IN_PROGRESS',
                user_id: session.user.id
            })
            .eq('id', jobId)
            .is('user_id', null)

        if (error) console.error(error)
    }

    return (
        <div className="min-h-screen bg-slate-100 pb-20">
            <MobileHeader title="Danh Sách Soạn Hàng" backLink="/mobile" />

            <div className="p-4 space-y-4">
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">Đang tải việc...</div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-16 w-16 mx-auto mb-4 text-slate-300"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6" /><path d="M9 16h6" /><path d="M9 8h6" /></svg>
                        <p>Không có yêu cầu soạn hàng nào.</p>
                    </div>
                ) : (
                    jobs.map(job => (
                        <div key={job.id} className="overflow-hidden bg-white rounded-lg shadow-sm border border-slate-200">
                            <div>
                                <div className="p-4 border-b bg-white">
                                    <div className="flex justify-between items-start mb-1">
                                        <div>
                                            <div className="font-bold text-lg text-indigo-700">{job.orders?.code}</div>
                                            <div className="text-sm text-slate-500">{job.orders?.customer_name}</div>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${job.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                            {job.status === 'OPEN' ? 'MỚI' : 'ĐANG LÀM'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-slate-600 mt-2">
                                        <div className="flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                                            {job.picking_tasks?.[0]?.count || 0} tasks
                                        </div>
                                        {job.user_id && (
                                            <div className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-0.5 rounded">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                Đã nhận
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="p-2 bg-slate-50">
                                    {job.user_id && job.user_id !== session?.user?.id ? (
                                        <button className="w-full h-10 bg-slate-300 text-slate-500 rounded font-medium cursor-not-allowed flex items-center justify-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> Đã nhận bởi {job.users?.name || 'người khác'}
                                        </button>
                                    ) : (
                                        <Link href={`/mobile/picking/${job.id}`} onClick={() => handleTakeJob(job.id)} className={`block w-full h-10 rounded font-bold shadow-sm flex items-center justify-center gap-2 ${job.status === 'OPEN' ? 'bg-indigo-600 text-white active:bg-indigo-700' : 'bg-white text-slate-700 border active:bg-slate-50'}`}>
                                            {job.status === 'OPEN' ? 'Nhận Việc & Bắt Đầu' : 'Tiếp Tục Soạn'}
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
