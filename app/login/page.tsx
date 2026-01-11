"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Input } from "@/components/ui/input"
import { Package, Loader2 } from "lucide-react"

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        } else {
            // AuthProvider will handle redirect
        }
    }

    return (
        <div className="min-h-screen gradient-mesh flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated gradient orbs */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl animate-pulse-subtle"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500/30 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: '1s' }}></div>

            <div className="w-full max-w-md relative z-10 animate-fade-in-up">
                <div className="glass-strong rounded-2xl p-8 elevation-xl">
                    {/* Logo */}
                    <div className="flex justify-center mb-6">
                        <div className="h-16 w-16 gradient-primary rounded-full flex items-center justify-center elevation-lg animate-pulse-subtle">
                            <Package className="h-8 w-8 text-white" />
                        </div>
                    </div>

                    {/* Title */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold gradient-text mb-2">Đăng Nhập WMS</h1>
                        <p className="text-slate-600 font-medium">Hệ thống Quản lý Kho Hàng</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="space-y-5">
                        {error && (
                            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-lg backdrop-blur-sm animate-fade-in">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Email</label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                                className="h-11 glass-strong border-white/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/50 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Mật khẩu</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                                className="h-11 glass-strong border-white/50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/50 transition-all"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`
                                w-full h-12 rounded-lg font-semibold text-white text-base
                                gradient-primary elevation-md
                                hover:scale-105 hover:elevation-lg
                                active:scale-95
                                transition-all duration-200
                                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                                flex items-center justify-center gap-2
                            `}
                        >
                            {loading && <Loader2 className="h-5 w-5 animate-spin" />}
                            {loading ? 'Đang Đăng Nhập...' : 'Đăng Nhập'}
                        </button>

                        <div className="text-center mt-4">
                            <a
                                href="/forgot-password"
                                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                            >
                                Quên mật khẩu?
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
