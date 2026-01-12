"use client"

import { useAuth } from "@/components/auth/AuthProvider"
import Link from "next/link"
import { ReactNode } from "react"

export function MobileHeader({ title, backLink, rightElement }: { title?: string, backLink?: string, rightElement?: ReactNode }) {
    const { session, signOut } = useAuth()

    return (
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/95 backdrop-blur-sm px-4 shadow-sm transition-all duration-200">
            <div className="flex items-center gap-3 max-w-[70%]">
                {backLink && (
                    <Link href={backLink} className="flex items-center justify-center h-12 w-12 -ml-3 text-slate-700 hover:bg-slate-50 active:bg-slate-100 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </Link>
                )}
                <div>
                    <div className="font-bold text-xl text-slate-900 leading-tight flex items-center gap-2">
                        {!backLink && <img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain" />}
                        {title || "WMS Mobile"}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {rightElement && (
                    <div>{rightElement}</div>
                )}

                {/* Fallback Legacy User Display (Desktop only mostly) */}
                {!rightElement && session && (
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-medium text-slate-500">Xin chào,</div>
                        <div className="text-sm font-bold text-slate-900 truncate max-w-[100px]">
                            {session.user.user_metadata.name || "Nhân Viên"}
                        </div>
                    </div>
                )}

                <button
                    onClick={signOut}
                    className="h-10 w-10 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                    title="Đăng xuất"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                </button>
            </div>
        </header>
    )
}
