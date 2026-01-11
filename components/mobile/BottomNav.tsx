"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function BottomNav() {
    const pathname = usePathname()

    // Helper to determine active state
    const isActive = (path: string) => {
        if (path === "/mobile" && pathname === "/mobile") return true
        if (path !== "/mobile" && pathname.startsWith(path)) return true
        return false
    }

    const navItems = [
        {
            path: "/mobile",
            label: "Trang Chủ",
            icon: (active: boolean) => active ? (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="opacity-20 absolute scale-[2] text-indigo-600" />
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                </>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            )
        },

        {
            path: "/mobile/tasks",
            label: "Nhiệm Vụ",
            icon: (active: boolean) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-indigo-600" : ""}><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" /></svg>
            )
        },
        {
            path: "/mobile/profile",
            label: "Cá Nhân",
            icon: (active: boolean) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-indigo-600" : ""}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            )
        }
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around z-40 pb-safe">
            {navItems.map((item) => {
                const active = isActive(item.path)
                return (
                    <Link key={item.path} href={item.path} className={`flex flex-col items-center gap-1 ${active ? "text-indigo-600 font-bold" : "text-slate-400 font-medium hover:text-slate-600"}`}>
                        {item.icon(active)}
                        <span className="text-[10px]">{item.label}</span>
                    </Link>
                )
            })}
        </nav>
    )
}
