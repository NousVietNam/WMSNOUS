"use client"

import { useAuth } from "@/components/auth/AuthProvider"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function ProfilePage() {
    const { session, signOut } = useAuth()
    const router = useRouter()
    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    // Password Change State
    const [isChangePassOpen, setChangePassOpen] = useState(false)
    const [newPass, setNewPass] = useState("")
    const [confirmPass, setConfirmPass] = useState("")
    const [updating, setUpdating] = useState(false)

    useEffect(() => {
        if (session?.user?.id) {
            fetchProfile()
        }
    }, [session])

    const fetchProfile = async () => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', session?.user?.id)
                .single()

            if (data) setProfile(data)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    const handleChangePassword = async () => {
        if (!newPass) return toast.error("Vui lòng nhập mật khẩu mới")
        if (newPass.length < 6) return toast.error("Mật khẩu phải từ 6 ký tự trở lên")
        if (newPass !== confirmPass) return toast.error("Mật khẩu nhập lại không khớp")

        setUpdating(true)
        try {
            const { error } = await supabase.auth.updateUser({ password: newPass })

            if (error) {
                toast.error("Lỗi: " + error.message)
            } else {
                toast.success("Đổi mật khẩu thành công!")
                setChangePassOpen(false)
                setNewPass("")
                setConfirmPass("")
            }
        } catch (e: any) {
            toast.error("Lỗi: " + e.message)
        } finally {
            setUpdating(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Cá Nhân" backLink="/mobile" />

            <div className="p-4 space-y-6">
                {/* Profile Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center">
                    <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-2xl font-bold mb-4">
                        {profile?.name?.[0] || profile?.full_name?.[0] || session?.user?.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">{profile?.name || profile?.full_name || 'Nhân Viên Kho'}</h2>
                    <p className="text-slate-500">{session?.user?.email}</p>
                    <div className="mt-3 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold uppercase tracking-wider">
                        {profile?.role || 'Staff'}
                    </div>
                </div>

                {/* Settings / Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <button
                        onClick={() => setChangePassOpen(true)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors border-b border-slate-50"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            </div>
                            <span className="font-medium text-slate-700">Đổi Mật Khẩu</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-400"><path d="m9 18 6-6-6-6" /></svg>
                    </button>

                    <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                            </div>
                            <span className="font-medium text-slate-700">Trợ Giúp</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-400"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                </div>

                <button
                    onClick={handleSignOut}
                    className="w-full h-12 bg-red-50 text-red-600 rounded-xl font-bold border border-red-100 active:bg-red-100 transition-colors flex items-center justify-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                    Đăng Xuất
                </button>

                <div className="text-center text-xs text-slate-400 mt-8">
                    Version 1.0.0
                </div>
            </div>

            {/* Change Password Dialog */}
            <Dialog open={isChangePassOpen} onOpenChange={setChangePassOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Đổi Mật Khẩu</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-pass">Mật khẩu mới</Label>
                            <Input
                                id="new-pass"
                                type="password"
                                value={newPass}
                                onChange={(e) => setNewPass(e.target.value)}
                                placeholder="Nhập mật khẩu mới..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-pass">Nhập lại mật khẩu</Label>
                            <Input
                                id="confirm-pass"
                                type="password"
                                value={confirmPass}
                                onChange={(e) => setConfirmPass(e.target.value)}
                                placeholder="Xác nhận mật khẩu..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setChangePassOpen(false)}>Hủy</Button>
                        <Button onClick={handleChangePassword} disabled={updating}>
                            {updating ? "Đang lưu..." : "Lưu Thay Đổi"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
