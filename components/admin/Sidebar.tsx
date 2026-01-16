"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Package, MapPin, FileText, Box, ArrowRightLeft, History, Printer, User, LogOut, Settings, BarChart3, Cloud, Menu } from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"

export function Sidebar() {
    const pathname = usePathname()
    const { signOut } = useAuth()
    const [isCollapsed, setIsCollapsed] = useState(false)

    const navItems = [
        { href: "/admin", icon: LayoutDashboard, label: "Tổng Quan" },
        { href: "/admin/map", icon: MapPin, label: "Sơ Đồ Kho" },
        { href: "/admin/locations", icon: Cloud, label: "DS Vị Trí" },
        { href: "/admin/orders", icon: FileText, label: "Đơn Hàng" },
        { href: "/admin/inventory", icon: Package, label: "Tồn Kho" },
        { href: "/admin/boxes", icon: Box, label: "Thùng Hàng" },
        { href: "/admin/transfers", icon: ArrowRightLeft, label: "Điều Chuyển" },
        { href: "/admin/outboxes", icon: Package, label: "Outbox" },
        { href: "/admin/history", icon: History, label: "Lịch Sử" },
        { href: "/admin/bulk-print", icon: Printer, label: "In Lô" },
        { href: "/admin/destinations", icon: MapPin, label: "Đối Tác" },
        { href: "/admin/users", icon: User, label: "Người Dùng" },
    ]

    return (
        <aside
            className={`
                hidden md:flex flex-col h-screen fixed left-0 top-0 z-40
                bg-[#0a0a0a] border-r border-white/5 shadow-2xl
                transition-all duration-300 ease-in-out
                ${isCollapsed ? "w-20" : "w-64"}
            `}
        >
            {/* Logo Area */}
            <div className="h-20 flex items-center justify-between px-6 mb-2">
                {!isCollapsed && (
                    <div className="flex items-center gap-3 animate-fade-in">
                        <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/20">
                            W
                        </div>
                        <span className="text-xl font-bold text-slate-100 tracking-tight">
                            WMS
                        </span>
                    </div>
                )}
                {isCollapsed && (
                    <div className="h-10 w-10 mx-auto bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg">
                        W
                    </div>
                )}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1.5 rounded-lg hover:bg-white/50 text-slate-500"
                >
                    <Menu className="h-5 w-5" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto scrollbar-none px-4 space-y-2 py-4">
                {navItems.map(({ href, icon: Icon, label }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`
                                relative group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300
                                ${isActive
                                    ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 scale-105 font-bold"
                                    : "text-slate-500 hover:bg-white/50 hover:text-indigo-600 font-medium"
                                }
                                ${isCollapsed ? "justify-center" : ""}
                            `}
                        >
                            <Icon className={`h-5 w-5 ${isActive ? "animate-pulse-subtle" : ""}`} strokeWidth={isActive ? 3 : 2} />

                            {!isCollapsed && (
                                <span className="animate-fade-in whitespace-nowrap">{label}</span>
                            )}

                            {/* Tooltip for collapsed state */}
                            {isCollapsed && (
                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-xl">
                                    {label}
                                </div>
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-white/20">
                <button
                    onClick={() => signOut()}
                    className={`
                        w-full flex items-center gap-3 px-3 py-3 rounded-xl 
                        text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors
                        ${isCollapsed ? "justify-center" : ""}
                    `}
                >
                    <LogOut className="h-5 w-5" />
                    {!isCollapsed && <span className="font-medium animate-fade-in">Đăng xuất</span>}
                </button>
            </div>
        </aside>
    )
}
