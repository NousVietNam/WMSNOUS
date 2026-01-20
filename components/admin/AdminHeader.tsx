"use client"

import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { LayoutDashboard, LogOut, Package, User, MapPin, Box, History, Printer, FileText, ArrowRightLeft, Cloud } from "lucide-react"
import Link from "next/link"

export function AdminHeader() {
    const { session, signOut } = useAuth()
    const user = session?.user
    const router = useRouter()
    const pathname = usePathname()

    const handleLogout = async () => {
        await signOut()
        router.push('/login')
    }

    const navItems = [
        { href: "/admin", icon: LayoutDashboard, label: "Tổng Quan" },
        { href: "/admin/map", icon: MapPin, label: "Sơ Đồ Kho" },
        { href: "/admin/locations", icon: MapPin, label: "DS Vị Trí" },
        { href: "/admin/orders", icon: FileText, label: "Đơn Hàng" },
        { href: "/admin/inventory", icon: Package, label: "Tồn Kho" },
        { href: "/admin/boxes", icon: Box, label: "Thùng" },
        { href: "/admin/transfers", icon: ArrowRightLeft, label: "Điều Chuyển" },
        { href: "/admin/outboxes", icon: Package, label: "Outbox" },
        { href: "/admin/shipping", icon: Cloud, label: "Xuất Kho" },
        { href: "/admin/picking-jobs", icon: Package, label: "Jobs" },
        { href: "/admin/history", icon: History, label: "Lịch Sử" },
        { href: "/admin/bulk-print", icon: Printer, label: "In Lô" },
        { href: "/admin/destinations", icon: MapPin, label: "Đối Tác" },
        { href: "/admin/users", icon: User, label: "Users" },
    ]

    return (
        <header className="gradient-primary sticky top-0 z-50 elevation-md">
            <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-6">
                    <Link href="/admin" className="text-xl font-bold text-white flex items-center gap-2 hover:scale-105 transition-transform">
                        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center p-1">
                            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <span>WMS Admin</span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-2">
                        {navItems.map(({ href, icon: Icon, label }) => {
                            const isActive = pathname === href
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`
                                        inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                                        transition-all duration-200 hover:scale-105
                                        ${isActive
                                            ? 'bg-white/30 text-white shadow-lg backdrop-blur-sm'
                                            : 'text-white/90 hover:bg-white/20 hover:text-white'
                                        }
                                    `}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                </Link>
                            )
                        })}
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-semibold text-white">{user?.user_metadata?.name || 'Admin'}</div>
                        <div className="text-xs text-white/80">{user?.email}</div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="h-10 w-10 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 hover:scale-105 transition-all flex items-center justify-center text-white"
                        title="Đăng xuất"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </header>
    )
}
