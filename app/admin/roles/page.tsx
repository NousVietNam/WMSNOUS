"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { Shield, Plus, Trash2, Edit } from "lucide-react"
import Link from "next/link"

interface Role {
    id: string
    name: string
    code: string
    created_at: string
}

export default function RolesManagementPage() {
    const [roles, setRoles] = useState<Role[]>([])
    const [loading, setLoading] = useState(true)
    const [createOpen, setCreateOpen] = useState(false)

    const [formData, setFormData] = useState({
        name: "",
        code: ""
    })

    useEffect(() => {
        fetchRoles()
    }, [])

    const fetchRoles = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('roles')
            .select('*')
            .order('created_at', { ascending: false })

        if (!error && data) {
            setRoles(data)
        }
        setLoading(false)
    }

    const handleCreateRole = async () => {
        if (!formData.name || !formData.code) {
            return alert("Vui lòng nhập tên và mã role")
        }

        const { error } = await supabase.from('roles').insert([
            { name: formData.name, code: formData.code.toUpperCase() }
        ])

        if (error) {
            alert("Lỗi: " + error.message)
        } else {
            alert("Đã tạo Role mới!")
            setCreateOpen(false)
            setFormData({ name: "", code: "" })
            fetchRoles()
        }
    }

    const deleteRole = async (id: string) => {
        if (!confirm("Bạn có chắc chắn muốn xóa Role này? Các nhân viên thuộc role này sẽ bị mất quyền hạn.")) return
        const { error } = await supabase.from('roles').delete().eq('id', id)
        if (error) alert("Lỗi: " + error.message)
        else fetchRoles()
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        {/* <Shield className="h-8 w-8 text-indigo-600" /> */} Quản Lý Vai Trò (Roles)
                    </h1>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => window.history.back()}>
                            Quay Lại
                        </Button>
                        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                            <DialogTrigger asChild>
                                <Button>Thêm Role</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Tạo Role Mới</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label>Tên Role (Hiển thị)</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Ví dụ: Trưởng Ca Kho"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Mã Role (Code)</Label>
                                        <Input
                                            value={formData.code}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                            placeholder="LEADER"
                                        />
                                        <p className="text-xs text-muted-foreground">Mã viết hóa, không dấu, dùng để định danh hệ thống</p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleCreateRole}>Tạo Role</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-md border shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 font-medium">
                            <tr>
                                <th className="p-3 text-left">Tên Role</th>
                                <th className="p-3 text-left">Mã Code</th>
                                <th className="p-3 text-right">Phân Quyền</th>
                                <th className="p-3 text-right">Hành Động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={4} className="p-4 text-center">Đang tải...</td></tr>
                            ) : roles.map(role => (
                                <tr key={role.id} className="hover:bg-slate-50">
                                    <td className="p-3 font-bold">{role.name}</td>
                                    <td className="p-3 font-mono text-slate-500">{role.code}</td>
                                    <td className="p-3 text-right">
                                        <Link href={`/admin/roles/${role.id}`}>
                                            <Button size="sm" variant="secondary" className="gap-2">
                                                Cấu Hình Quyền (Nav)
                                            </Button>
                                        </Link>
                                    </td>
                                    <td className="p-3 text-right">
                                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteRole(role.id)}>
                                            Xóa
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    )
}
