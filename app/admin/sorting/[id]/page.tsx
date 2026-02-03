
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Layers, Tractor } from "lucide-react"

export default function SortingVisualPage() {
    const { id } = useParams()
    const router = useRouter()

    // Data
    const [wave, setWave] = useState<any>(null)
    const [orders, setOrders] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])

    // Stats
    const [stats, setStats] = useState({ total: 0, sorted: 0, pct: 0 })

    useEffect(() => {
        fetchData()
        const int = setInterval(fetchData, 3000)
        return () => clearInterval(int)
    }, [])

    const fetchData = async () => {
        const { data: w } = await supabase.from('pick_waves').select('*, sorter:users(name)').eq('id', id).single()
        setWave(w)

        const { data: j } = await supabase.from('picking_jobs').select('*').eq('wave_id', id)
        setJobs(j || [])

        const { data: o } = await supabase.rpc('get_wave_sorting_details', { p_wave_id: id })
        if (o) {
            setOrders(o)
            const total = o.reduce((acc: number, order: any) => acc + (order.total_qty || 0), 0)
            const sorted = o.reduce((acc: number, order: any) => acc + (order.sorted_qty || 0), 0)
            setStats({
                total, sorted,
                pct: total > 0 ? Math.round((sorted / total) * 100) : 0
            })
        }
    }

    if (!wave) return <div className="p-10 text-white bg-slate-900 h-screen flex items-center justify-center font-bold text-xl">Loading Command Center...</div>

    const CENTER_X = 50
    const CENTER_Y = 50

    // Simple Static Line Helper
    const drawLine = (startX: number, startY: number, endX: number, endY: number, status: string, uniqueId: string) => {
        const midX = (startX + endX) / 2

        // Colors
        let color = '#475569' // Slate-600 Pending
        if (status === 'PROCESSING') color = '#6366f1' // Indigo-500
        if (status === 'COMPLETED') color = '#22c55e' // Green-500

        const strokeWidth = (status === 'PROCESSING' || status === 'COMPLETED') ? "2.5" : "1.5"
        const opacity = (status === 'PROCESSING' || status === 'COMPLETED') ? "0.8" : "0.3"

        const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`

        return (
            <path
                key={uniqueId}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                strokeLinecap="round"
                // Add simple glow for active lines
                style={status === 'PROCESSING' ? { filter: 'drop-shadow(0 0 3px rgba(99,102,241,0.5))' } : {}}
            />
        )
    }

    return (
        <div className="h-screen bg-[#020617] text-slate-100 overflow-hidden relative font-sans selection:bg-indigo-500/30">
            {/* Background Texture */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

            {/* HEADER */}
            <div className="absolute top-0 left-0 w-full p-6 z-50 flex justify-between items-center pointer-events-none">
                <button onClick={() => router.back()} className="pointer-events-auto flex items-center gap-2 bg-slate-900 border border-slate-700 px-6 py-2 rounded-lg hover:bg-slate-800 transition-all active:scale-95 text-sm font-bold text-white uppercase tracking-wide">
                    <ArrowLeft size={16} /> Back
                </button>

                <div className="text-sm font-bold text-slate-600 uppercase tracking-[0.5em] select-none">Sorting Command Center</div>

                <div className="flex gap-4 pointer-events-auto">
                    <div className="flex items-center gap-2 text-xs font-bold bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-1.5 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1s_infinite]"></div>
                        LIVE
                    </div>
                </div>
            </div>

            {/* SVG LAYER */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Job Lines */}
                {jobs.map((job, idx) => {
                    const y = 20 + (idx * 60 / Math.max(jobs.length - 1, 1))
                    const jId = job.id || `job-${idx}`
                    return drawLine(15, y, CENTER_X, CENTER_Y, job.status, `job-${jId}-${idx}`)
                })}

                {/* Order Lines */}
                {orders.map((order, idx) => {
                    const total = Math.max(orders.length - 1, 1)
                    const angleDeg = -70 + (idx * 140 / total)
                    const angleRad = (angleDeg * Math.PI) / 180

                    const radius = 35
                    const endX = CENTER_X + radius * Math.cos(angleRad)
                    const endY = CENTER_Y + radius * Math.sin(angleRad)

                    const status = order.sorted_qty >= order.total_qty ? 'COMPLETED' : order.sorted_qty > 0 ? 'PROCESSING' : 'PENDING'
                    return drawLine(CENTER_X, CENTER_Y, endX, endY, status, `order-${order.order_id}-${idx}`)
                })}
            </svg>

            {/* 1. CENTER WAVE NODE */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="relative group">
                    {/* Static Ring */}
                    <div className="absolute inset-[-10%] border border-indigo-500/20 rounded-full w-[120%] h-[120%]"></div>

                    {/* Core */}
                    <div className="w-64 h-64 bg-[#0f172a] border border-indigo-500/40 rounded-full shadow-[0_0_80px_rgba(99,102,241,0.15)] flex flex-col items-center justify-center p-6 relative overflow-hidden z-10">
                        {/* Simple glow */}
                        <div className="absolute inset-0 bg-indigo-500/5"></div>

                        <div className="relative z-10 flex flex-col items-center gap-1">
                            <div className="text-indigo-400 p-2 bg-indigo-500/10 rounded-full"><Layers size={24} /></div>
                            <h1 className="text-xl font-bold text-white tracking-tight mt-1">{wave.code}</h1>
                            <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest bg-indigo-900/40 px-2 py-0.5 rounded">{wave.sorting_status}</div>
                        </div>

                        <div className="relative z-10 grid grid-cols-2 gap-4 w-full mt-4 pt-4 border-t border-slate-800/50">
                            <div className="text-center">
                                <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Orders</div>
                                <div className="text-lg font-bold text-white">{orders.length}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Items</div>
                                <div className="text-lg font-bold text-indigo-400">{stats.sorted}/{stats.total}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. LEFT NODES: JOBS */}
            <div className="absolute top-0 left-0 w-[20%] h-full flex flex-col justify-center px-6 gap-4 z-10 pointer-events-none">
                {jobs.map((job, idx) => {
                    const y = 20 + (idx * 60 / Math.max(jobs.length - 1, 1))
                    const isDone = job.status === 'COMPLETED'
                    return (
                        <div
                            key={job.id}
                            className={`
                                relative p-4 rounded-lg border-l-2 flex items-center gap-3 backdrop-blur-sm pointer-events-auto w-[240px] shadow-lg transition-all
                                ${isDone ? 'bg-green-950/40 border-l-green-500 border-y-transparent border-r-transparent' : 'bg-slate-900/80 border-l-indigo-500 border-white/5'}
                            `}
                            style={{ position: 'absolute', top: `${y}%`, left: '4%', transform: 'translateY(-50%)' }}
                        >
                            <div className={`p-2 rounded border ${isDone ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}`}>
                                <Tractor size={18} />
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Job {job.id.slice(0, 6)}</div>
                                <div className={`text-xs font-bold uppercase ${isDone ? 'text-green-400' : 'text-slate-200'}`}>{job.status}</div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* 3. RIGHT NODES: OUTBOXES */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                {orders.map((order, idx) => {
                    const total = Math.max(orders.length - 1, 1)
                    const angleDeg = -70 + (idx * 140 / total)
                    const angleRad = (angleDeg * Math.PI) / 180
                    const radius = 35
                    const x = CENTER_X + radius * Math.cos(angleRad)
                    const y = CENTER_Y + radius * Math.sin(angleRad)

                    const pct = order.total_qty ? (order.sorted_qty / order.total_qty) * 100 : 0
                    const isFull = pct >= 100

                    return (
                        <div
                            key={order.order_id}
                            className={`
                                p-3 rounded-lg border shadow-lg flex flex-col gap-1 w-56 backdrop-blur-sm pointer-events-auto hover:z-50 transition-all absolute hover:bg-slate-900/90 hover:scale-105
                                ${isFull ? 'bg-green-950/60 border-green-500/30' : 'bg-slate-900/80 border-slate-700/50'}
                            `}
                            style={{
                                left: `${x}%`,
                                top: `${y}%`,
                                transform: 'translate(0%, -50%)'
                            }}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0 mr-2">
                                    <div className="font-bold text-xs text-slate-100 truncate" title={order.customer_name}>{order.customer_name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{order.code}</div>
                                </div>
                                {order.outbox_code && (
                                    <div className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-indigo-500/10 border-indigo-500/30 text-indigo-300">
                                        {order.outbox_code.replace('BOX-', '')}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all ${isFull ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }}></div>
                                </div>
                                <div className={`text-[10px] font-bold ${isFull ? 'text-green-400' : 'text-slate-400'}`}>{order.sorted_qty}/{order.total_qty}</div>
                            </div>

                            {isFull && order.status !== 'PACKED' && (
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        const { data: userData } = await supabase.auth.getUser();
                                        if (!userData.user) return;
                                        const { error } = await supabase.rpc('confirm_order_packed', {
                                            p_order_id: order.order_id,
                                            p_user_id: userData.user.id
                                        });
                                        if (error) {
                                            alert("Lỗi xác nhận: " + error.message);
                                        } else {
                                            fetchData();
                                        }
                                    }}
                                    className="mt-2 w-full py-1.5 bg-green-600 hover:bg-green-500 text-white text-[10px] font-black rounded uppercase tracking-wider transition-colors shadow-lg shadow-green-900/20"
                                >
                                    Xác nhận Đóng gói
                                </button>
                            )}

                            {order.status === 'PACKED' && (
                                <div className="mt-2 w-full py-1 border border-green-500/50 text-green-400 text-[9px] font-bold rounded text-center uppercase bg-green-500/10">
                                    Đã Đóng Gói ✓
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
