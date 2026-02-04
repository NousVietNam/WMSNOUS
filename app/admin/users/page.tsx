"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Users, Plus, Trash2, KeyRound, RefreshCw, Shield, Edit, MessageSquare } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

interface User {
    id: string
    email: string
    name: string
    role: string
    telegram_chat_id?: string
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
    const [editOpen, setEditOpen] = useState(false)
    const [resetUserId, setResetUserId] = useState<string | null>(null)
    const [newPassword, setNewPassword] = useState("")

    // Create/Edit form
    const [formData, setFormData] = useState({
        id: "",
        email: "",
        name: "",
        role: "STAFF",
        password: "Welcome@2024",
        telegram_chat_id: ""
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const usersReq = supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })

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
                alert(`Tài khoản đã tạo thành công!\n\nEmail: ${formData.email}\nMật khẩu: ${formData.password}\n\nVui lòng COPY thông tin này gửi cho nhân viên.`)
                toast.success("Đã tạo tài khoản mới")
                setCreateOpen(false)
                resetForm()
                fetchData()
            } else {
                toast.error("Lỗi: " + result.error)
            }
        } catch (e: any) {
            toast.error("Lỗi hệ thống: " + e.message)
        }
    }

    const handleUpdateUser = async () => {
        try {
            const res = await fetch('/api/admin/update-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: formData.id,
                    name: formData.name,
                    role: formData.role,
                    telegram_chat_id: formData.telegram_chat_id
                })
            })

            const result = await res.json()

            if (result.success) {
                toast.success("Đã cập nhật thông tin thành công")
                setEditOpen(false)
                resetForm()
                fetchData()
            } else {
                toast.error("Lỗi: " + result.error)
            }
        } catch (e: any) {
            toast.error("Lỗi hệ thống: " + e.message)
        }
    }

    const resetForm = () => {
        setFormData({
            id: "",
            email: "",
            name: "",
            role: "STAFF",
            password: "Welcome@2024",
            telegram_chat_id: ""
        })
    }

    const openEdit = (user: User) => {
        setFormData({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            password: "",
            telegram_chat_id: user.telegram_chat_id || ""
        })
        setEditOpen(true)
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
                        Quản Lý Tài Khoản
                    </h1>
                    <div className="flex gap-2">
                        <Link href="/admin/roles">
                            <Button variant="outline" className="gap-2">
                                Quản Lý Role
                            </Button>
                        </Link>
                        <Button variant="outline" onClick={fetchData}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Làm mới
                        </Button>
                        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Tạo Tài Khoản
                        </Button>
                    </div>
                </div>

                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 font-bold text-slate-700 border-b">
                            <tr>
                                <th className="p-4 text-left">Email</th>
                                <th className="p-4 text-left">Tên Nhân Viên</th>
                                <th className="p-4 text-left">Vai Trò</th>
                                <th className="p-4 text-left">Telegram ID</th>
                                <th className="p-4 text-left">Ngày Tạo</th>
                                <th className="p-4 text-right">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-slate-300" />
                                        Đang tải dữ liệu...
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                        Chưa có tài khoản nào
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => {
                                    const roleInfo = roles.find(r => r.code === user.role)
                                    const roleName = roleInfo ? roleInfo.name : user.role

                                    return (
                                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-medium text-slate-900">{user.email}</td>
                                            <td className="p-4 font-bold text-indigo-700">{user.name}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-[11px] font-black tracking-tight ${user.role === 'ADMIN'
                                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                                    }`}>
                                                    {roleName.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                {user.telegram_chat_id ? (
                                                    <div className="flex items-center gap-1.5 text-green-600 font-mono text-xs font-bold">
                                                        <MessageSquare className="h-3 w-3" />
                                                        {user.telegram_chat_id}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 italic text-xs">Chưa cài đặt</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-slate-500 text-xs">
                                                {new Date(user.created_at).toLocaleDateString('vi-VN')}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                                                        onClick={() => openEdit(user)}
                                                        title="Sửa thông tin"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50"
                                                        onClick={() => setResetUserId(user.id)}
                                                        title="Reset Mật khẩu"
                                                    >
                                                        <KeyRound className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                                                        onClick={() => openDeleteConfirm({ id: user.id, email: user.email })}
                                                        title="Xóa tài khoản"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
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

                {/* Create/Edit Dialog */}
                <Dialog open={createOpen || editOpen} onOpenChange={(val) => { if (!val) { setCreateOpen(false); setEditOpen(false); } }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{createOpen ? 'Tạo Tài Khoản Mới' : 'Cập Nhật Thông Tin'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="user@example.com"
                                    disabled={editOpen}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Tên Nhân Viên *</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Nhập tên..."
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
                                        {roles.map(r => (
                                            <SelectItem key={r.code} value={r.code}>
                                                {r.name.toUpperCase()}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label className="flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-blue-500" />
                                    Telegram Chat ID
                                </Label>
                                <Input
                                    value={formData.telegram_chat_id}
                                    onChange={(e) => setFormData({ ...formData, telegram_chat_id: e.target.value })}
                                    placeholder="Ví dụ: 8283078267"
                                />
                                <p className="text-[10px] text-muted-foreground italic">
                                    Nhân viên gõ /myid với Bot để lấy ID này. Dùng để nhận Noti job.
                                </p>
                            </div>
                            {createOpen && (
                                <div className="grid gap-2">
                                    <Label>Mật Khẩu Mặc Định</Label>
                                    <Input
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditOpen(false); }}>Hủy</Button>
                            <Button onClick={createOpen ? handleCreateUser : handleUpdateUser}>
                                {createOpen ? 'Lưu & Tạo' : 'Lưu Thay Đổi'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

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
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setResetUserId(null); setNewPassword(""); }}>Hủy</Button>
                            <Button onClick={() => resetUserId && handleResetPassword(resetUserId)}>Xác Nhận Reset</Button>
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
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Hủy</Button>
                            <Button variant="destructive" onClick={confirmDeleteUser}>Xóa Vĩnh Viễn</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    )
}
