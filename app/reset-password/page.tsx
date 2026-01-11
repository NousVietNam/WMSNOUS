"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"

export default function ResetPasswordPage() {
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()

        if (newPassword !== confirmPassword) {
            return alert("Mật khẩu xác nhận không khớp!")
        }

        if (newPassword.length < 6) {
            return alert("Mật khẩu phải có ít nhất 6 ký tự!")
        }

        setLoading(true)

        const { error } = await supabase.auth.updateUser({
            password: newPassword
        })

        if (error) {
            alert("Lỗi: " + error.message)
            setLoading(false)
        } else {
            alert("Mật khẩu đã được thay đổi thành công!")
            router.push('/login')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
            <Card className="w-[400px]">
                <CardHeader>
                    <CardTitle>Tạo Mật Khẩu Mới</CardTitle>
                    <CardDescription>
                        Nhập mật khẩu mới cho tài khoản của bạn
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">Mật khẩu mới</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm">Xác nhận mật khẩu</Label>
                            <Input
                                id="confirm"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Đang xử lý..." : "Đổi Mật Khẩu"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
