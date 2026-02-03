"use client"
import Link from "next/link"
import { MobileHeader } from "../../components/mobile/MobileHeader"
import { useAuth } from "@/components/auth/AuthProvider"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function MobileMenu() {
    const { session, permissions } = useAuth()
    const [profile, setProfile] = useState<any>(null)

    useEffect(() => {
        if (session?.user?.id) {
            getProfile()
        }
    }, [session])

    const getProfile = async () => {
        const { data } = await supabase.from('users').select('*').eq('id', session?.user?.id).single()
        setProfile(data)
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            <MobileHeader
                title="WMS Nous App"
                rightElement={
                    <div className="mr-2 text-right">
                        <div className="text-[11px] font-bold text-slate-700 truncate max-w-[120px] leading-tight">
                            {profile?.name || profile?.full_name || session?.user?.email?.split('@')[0] || 'User'}
                        </div>
                    </div>
                }
            />

            <main className="p-5 space-y-6">
                {/* Hero / Quick Action */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h2 className="text-2xl font-bold mb-1">Tra Cứu</h2>
                            <p className="text-indigo-100 text-sm opacity-90">Quét mã vạch để xem thông tin</p>
                        </div>
                        <div className="bg-white/20 p-2 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><rect width="10" height="10" x="7" y="7" rx="2" /></svg>
                        </div>
                    </div>
                    <Link href="/mobile/lookup">
                        <button className="w-full h-12 bg-white text-indigo-700 rounded-xl font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                            <span>Quét Camera Ngay</span>
                        </button>
                    </Link>
                </div>

                {/* Main Operations Grid */}
                <div>
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">Tác Vụ Kho</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {session?.user && (permissions?.MOBILE_PICKING || permissions.ALL) && (
                            <Link href="/mobile/picking" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11V6a3 3 0 0 1 6 0v5" /><path d="M12 11v8" /><path d="M9 19h6" /><path d="M2 11v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Soạn Hàng</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Picking</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_PUTAWAY || permissions.ALL) && (
                            <Link href="/mobile/putaway" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Đóng Hàng</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Put-away</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_TRANSFER || permissions.ALL) && (
                            <Link href="/mobile/transfer" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" /><polyline points="14 2 14 8 20 8" /><path d="m2 15 3 3 3-3" /><path d="M5 18v-6" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Di Chuyển</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Transfer</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_TRANSFER || permissions.ALL) && (
                            <Link href="/mobile/launch-soon" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Mở Bán Mới</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium text-red-500 font-bold">Priority</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_AUDIT || permissions.ALL) && (
                            <Link href="/mobile/audit" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500"><path d="M9 11V6a3 3 0 0 1 6 0v5" /><path d="M12 11v8" /><path d="M9 19h6" /><path d="M2 11v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11V6a3 3 0 0 1 6 0v5" /><path d="M12 11v8" /><path d="M9 19h6" /><path d="M2 11v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Kiểm Kê</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Audit</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_INVENTORY || permissions.ALL) && (
                            <Link href="/mobile/locations" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Vị Trí</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Locations</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_IMPORT || permissions.ALL) && (
                            <Link href="/mobile/import" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Nhập Kho Lẻ</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Inbound</div>
                                </div>
                            </Link>
                        )}

                        {session?.user && (permissions?.MOBILE_IMPORT || permissions.ALL) && (
                            <Link href="/mobile/bulk-putaway" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Nhập Tồn Sỉ</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Bulk Inbound</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_SHIP || permissions.ALL) && (
                            <Link href="/mobile/ship" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><rect width="8" height="8" x="2" y="11" rx="1" /><path d="M10 11V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M14 19h2" /><path d="M10 19h2" /><path d="M21 19V9a2 2 0 0 0-2-2h-3" /><path d="M5 19v2" /><path d="M19 19v2" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="8" x="2" y="11" rx="1" /><path d="M10 11V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M14 19h2" /><path d="M10 19h2" /><path d="M21 19V9a2 2 0 0 0-2-2h-3" /><path d="M5 19v2" /><path d="M19 19v2" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Giao Hàng</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Outbound</div>
                                </div>
                            </Link>
                        )}


                        {session?.user && (permissions?.MOBILE_LOOKUP || permissions.ALL) && (
                            <Link href="/mobile/barcode" className="group">
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-all h-full flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-500"><path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" /></svg>
                                    </div>
                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center text-cyan-600 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" /></svg>
                                        </div>
                                        <div className="font-bold text-slate-800 text-lg">Mã Hàng</div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">Check Code</div>
                                </div>
                            </Link>
                        )}
                    </div>
                </div>
            </main>

            {/* Bottom Nav moved to layout.tsx */}
        </div>
    )
}
