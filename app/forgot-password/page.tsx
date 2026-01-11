"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const router = useRouter()

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        })

        if (error) {
            alert("Lỗi: " + error.message)
        } else {
            setSent(true)
        }

        setLoading(false)
    }

    if (sent) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
                <Card className="w-[400px]">
                    <CardHeader>
                        <CardTitle>✅ Email đã gửi</CardTitle>
                        <CardDescription>
                            Vui lòng kiểm tra email để reset mật khẩu
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Chúng tôi đã gửi 1 email đến <strong>{email}</strong> với link để reset mật khẩu.
                            Link này có hiệu lực trong 1 giờ.
                        </p>
                        <Link href="/login">
                            <Button className="w-full">Quay lại Đăng nhập</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
            <Card className="w-[400px]">
                <CardHeader>
                    <CardTitle>Quên Mật Khẩu</CardTitle>
                    <CardDescription>
                        Nhập email để nhận link reset mật khẩu
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="user@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Đang gửi..." : "Gửi Link Reset"}
                        </Button>
                        <div className="text-center text-sm">
                            <Link href="/login" className="text-primary hover:underline">
                                ← Quay lại Đăng nhập
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
