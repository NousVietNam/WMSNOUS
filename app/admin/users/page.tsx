"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Users, Plus, Trash2, KeyRound, RefreshCw, Shield } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

interface User {
    id: string
    email: string
    name: string
    role: string // Now a string code
    created_at: string
}

interface Role {
    id: string
    name: string
    code: string
}

export default function UsersManagementPage() {
    const [users, setUsers] = useState<User[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [loading, setLoading] = useState(true)
    const [createOpen, setCreateOpen] = useState(false)
    const [resetUserId, setResetUserId] = useState<string | null>(null)
    const [newPassword, setNewPassword] = useState("")

    // Create form
    const [formData, setFormData] = useState({
        email: "",
        name: "",
        role: "STAFF", // Default Code
        password: "Welcome@2024"
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        // 1. Fetch Users
        const usersReq = supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })

        // 2. Fetch Roles (via API or Direct DB if possible)
        // Since we created an API, let's use it or just direct DB since it's client
        const rolesReq = supabase
            .from('roles')
            .select('*')
            .order('name', { ascending: true })

        const [usersRes, rolesRes] = await Promise.all([usersReq, rolesReq])

        if (usersRes.data) setUsers(usersRes.data)
        if (rolesRes.data) setRoles(rolesRes.data)

        setLoading(false)
    }

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [userToDelete, setUserToDelete] = useState<{ id: string, email: string } | null>(null)

    const handleCreateUser = async () => {
        if (!formData.email || !formData.name) {
            return toast.error("Vui lòng điền đầy đủ thông tin")
        }

        try {
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            const result = await res.json()

            if (result.success) {
                // Keep alert for Credentials as it needs to be copied
                alert(`Tài khoản đã tạo thành công!\n\nEmail: ${formData.email}\nMật khẩu: ${formData.password}\n\nVui lòng COPY thông tin này gửi cho nhân viên.`)
                toast.success("Đã tạo tài khoản mới")
                setCreateOpen(false)
                setFormData({
                    email: "",
                    name: "",
                    role: "STAFF",
                    password: "Welcome@2024"
                })
                fetchData()
            } else {
                toast.error("Lỗi: " + result.error)
            }
        } catch (e: any) {
            toast.error("Lỗi hệ thống: " + e.message)
        }
    }

    const handleResetPassword = async (userId: string) => {
        if (!newPassword) {
            return toast.error("Vui lòng nhập mật khẩu mới")
        }

        try {
            const res = await fetch('/api/admin/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, newPassword })
            })

            const result = await res.json()

            if (result.success) {
                toast.success(`Đã đổi mật khẩu thành công!`, {
                    description: `Mật khẩu mới: ${newPassword}`
                })
                setResetUserId(null)
                setNewPassword("")
            } else {
                toast.error("Lỗi đổi mật khẩu: " + result.error)
            }
        } catch (e: any) {
            toast.error("Lỗi hệ thống: " + e.message)
        }
    }

    const openDeleteConfirm = (user: { id: string, email: string }) => {
        setUserToDelete(user)
        setDeleteConfirmOpen(true)
    }

    const confirmDeleteUser = async () => {
        if (!userToDelete) return

        try {
            const res = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userToDelete.id })
            })

            const result = await res.json()

            if (result.success) {
                toast.success("Đã xóa tài khoản " + userToDelete.email)
                fetchData()
            } else {
                toast.error("Lỗi xóa tài khoản: " + result.error)
            }
        } catch (e: any) {
            toast.error("Lỗi hệ thống: " + e.message)
        } finally {
            setDeleteConfirmOpen(false)
            setUserToDelete(null)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        {/* <Users className="h-8 w-8 text-primary" /> */} Quản Lý Tài Khoản
                    </h1>
                    <div className="flex gap-2">
                        <Link href="/admin/roles">
                            <Button variant="outline" className="gap-2">
                                Quản Lý Role
                            </Button>
                        </Link>
                        <Button variant="outline" onClick={fetchData}>
                            Cloud Sync
                        </Button>
                        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                            <DialogTrigger asChild>
                                <Button>Tạo Tài Khoản</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Tạo Tài Khoản Mới</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label>Email *</Label>
                                        <Input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            placeholder="user@example.com"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Tên *</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Nguyễn Văn A"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Vai Trò</Label>
                                        <Select
                                            value={formData.role}
                                            onValueChange={(val) => setFormData({ ...formData, role: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {roles.length > 0 ? roles.map(r => (
                                                    <SelectItem key={r.code} value={r.code}>
                                                        {r.name} ({r.code})
                                                    </SelectItem>
                                                )) : (
                                                    // Fallback if role fetch fails
                                                    <>
                                                        <SelectItem value="STAFF">Nhân Viên (STAFF)</SelectItem>
                                                        <SelectItem value="ADMIN">Quản Lý (ADMIN)</SelectItem>
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">Các vai trò được lấy từ cấu hình hệ thống</p>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Mật Khẩu Mặc Định</Label>
                                        <Input
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Nhân viên sẽ nhận được mật khẩu này để đăng nhập lần đầu
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button>
                                    <Button onClick={handleCreateUser}>Tạo Tài Khoản</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-md border shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 font-medium">
                            <tr>
                                <th className="p-3 text-left">Email</th>
                                <th className="p-3 text-left">Tên</th>
                                <th className="p-3 text-left">Vai Trò</th>
                                <th className="p-3 text-left">Ngày Tạo</th>
                                <th className="p-3 text-right">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                        Đang tải...
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                        Chưa có tài khoản nào
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => {
                                    const roleInfo = roles.find(r => r.code === user.role)
                                    const roleName = roleInfo ? roleInfo.name : user.role

                                    return (
                                        <tr key={user.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium">{user.email}</td>
                                            <td className="p-3">{user.name}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${user.role === 'ADMIN'
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                    {roleName}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {new Date(user.created_at).toLocaleDateString('vi-VN')}
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setResetUserId(user.id)}
                                                    >
                                                        Reset MK
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-destructive"
                                                        onClick={() => openDeleteConfirm({ id: user.id, email: user.email })}
                                                    >
                                                        Xóa
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Reset Password Dialog */}
                <Dialog open={!!resetUserId} onOpenChange={(open) => !open && setResetUserId(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset Mật Khẩu</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Mật Khẩu Mới</Label>
                                <Input
                                    type="text"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Password123@"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Nhân viên sẽ sử dụng mật khẩu này để đăng nhập
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => {
                                setResetUserId(null)
                                setNewPassword("")
                            }}>
                                Hủy
                            </Button>
                            <Button onClick={() => resetUserId && handleResetPassword(resetUserId)}>
                                Xác Nhận Reset
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="text-red-600">Xác Nhận Xóa Tài Khoản</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <p>Bạn có chắc chắn muốn xóa tài khoản <strong>{userToDelete?.email}</strong>?</p>
                            <p className="text-sm text-muted-foreground mt-2">Hành động này không thể hoàn tác.</p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                                Hủy
                            </Button>
                            <Button variant="destructive" onClick={confirmDeleteUser}>
                                Xóa Vĩnh Viễn
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    )
}
