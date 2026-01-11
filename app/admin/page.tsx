"use client"

import { useEffect, useState } from "react"
import { DashboardStats } from "@/components/dashboard/DashboardStats"
import { DashboardCharts } from "@/components/dashboard/DashboardCharts"
import { RecentActivity } from "@/components/dashboard/RecentActivity"
import { RefreshCcw, TrendingUp } from "lucide-react"

export default function AdminDashboardPage() {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/dashboard/stats')
            const json = await res.json()
            if (json.success) {
                setData(json.data)
            }
        } catch (e) {
            console.error("Failed to fetch dashboard data", e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    return (
        <div className="min-h-screen gradient-mesh pb-10">
            <div className="flex flex-col space-y-6 container mx-auto p-8 max-w-7xl">
                {/* Page Header */}
                <div className="flex items-center justify-between animate-fade-in-up">
                    <div>
                        <h2 className="text-4xl font-bold gradient-text mb-2 flex items-center gap-3">
                            <TrendingUp className="h-8 w-8 text-indigo-600" />
                            Dashboard
                        </h2>
                        <p className="text-slate-600 font-medium">Tổng quan hoạt động kho hàng & đơn hàng</p>
                    </div>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className={`
                            glass-strong px-4 py-2 rounded-lg font-medium text-slate-700
                            hover:scale-105 hover:elevation-md transition-all
                            flex items-center gap-2
                            ${loading ? 'opacity-50' : ''}
                        `}
                    >
                        <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Làm Mới
                    </button>
                </div>

                {/* Stats Cards */}
                <DashboardStats data={data} />

                {/* Charts Area */}
                <DashboardCharts data={data} />

                {/* Bottom Section */}
                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-4 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                    <RecentActivity transactions={data?.activity || []} />

                    {/* System Health */}
                    <div className="col-span-1 glass-strong rounded-xl p-6 elevation-md hover:elevation-lg transition-all">
                        <h3 className="font-bold text-lg gradient-text mb-4">Hệ Thống</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-600 font-medium">Trạng Thái Kho</span>
                                <span className="flex items-center text-emerald-600 font-bold">
                                    <span className="h-2 w-2 rounded-full bg-emerald-600 mr-2 animate-pulse"></span>
                                    Online
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-600 font-medium">Phiên Bản</span>
                                <span className="font-semibold">v1.2.0 (Shipping)</span>
                            </div>
                            <div className="pt-4 border-t border-white/50">
                                <button
                                    onClick={() => window.location.href = '/admin/map'}
                                    className="w-full gradient-primary text-white rounded-lg py-2.5 font-semibold hover:scale-105 hover:elevation-md transition-all"
                                >
                                    Xem Sơ Đồ Kho
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
