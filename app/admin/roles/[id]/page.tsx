"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Shield, Save } from "lucide-react"
import { toast } from "sonner"

// Fallback simple switch to avoid dependency issues
const SimpleSwitch = ({ checked, onCheckedChange }: { checked: boolean, onCheckedChange: (c: boolean) => void }) => (
    <div
        onClick={() => onCheckedChange(!checked)}
        className={`w-12 h-6 rounded-full cursor-pointer transition-colors relative ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
    >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${checked ? 'left-7' : 'left-1'}`} />
    </div>
)

const FEATURES = {
    MOBILE: [
        { key: 'MOBILE_PICKING', label: 'Soạn Hàng (Picking)', desc: 'Cho phép nhận và thực hiện đơn hàng' },
        { key: 'MOBILE_PUTAWAY', label: 'Đóng Hàng (Putaway)', desc: 'Cho phép đóng gói và cất hàng vào kho' },
        { key: 'MOBILE_TRANSFER', label: 'Di Chuyển Nội Bộ', desc: 'Cho phép chuyển hàng giữa các vị trí' },
        { key: 'MOBILE_AUDIT', label: 'Kiểm Kê Kho', desc: 'Cho phép quét kiểm đếm tồn kho' },
        { key: 'MOBILE_INVENTORY', label: 'Tra Cứu Vị Trí', desc: 'Xem danh sách hàng tại vị trí' },
        { key: 'MOBILE_LOOKUP', label: 'Tra Cứu Sản Phẩm', desc: 'Quét Barcode xem thông tin sản phẩm' },
        { key: 'MOBILE_IMPORT', label: 'Nhập Kho (Inbound)', desc: 'Module nhập hàng từ nhà cung cấp' },
        { key: 'MOBILE_SHIP', label: 'Giao Hàng (Outbound)', desc: 'Module xuất kho giao hàng' },
    ]
}

export default function RolePermissionsPage() {
    const { id } = useParams()
    const router = useRouter()
    const [role, setRole] = useState<any>(null)
    const [permissions, setPermissions] = useState<any>({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (id) fetchRoleAndPermissions()
    }, [id])

    const fetchRoleAndPermissions = async () => {
        setLoading(true)
        // 1. Fetch Role
        const { data: roleData } = await supabase.from('roles').select('*').eq('id', id).single()
        setRole(roleData)

        // 2. Fetch Permissions
        const { data: permData } = await supabase.from('role_permissions').select('permissions').eq('role_id', id).single()
        if (permData) {
            setPermissions(permData.permissions || {})
        }
        setLoading(false)
    }

    const togglePermission = (key: string) => {
        setPermissions((prev: any) => ({
            ...prev,
            [key]: !prev[key]
        }))
    }

    const handleSave = async () => {
        const { error } = await supabase.from('role_permissions').upsert({
            role_id: id,
            permissions: permissions,
            updated_at: new Date().toISOString()
        })

        if (error) {
            toast.error("Lỗi khi lưu: " + error.message)
        } else {
            toast.success("Đã lưu phân quyền thành công!", {
                description: `Đã cập nhật quyền cho ${role?.name}`
            })
        }
    }

    if (loading) return <div className="p-8 text-center">Đang tải...</div>

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* AdminHeader is in layout */}
            <main className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            {/* <Shield className="h-8 w-8 text-indigo-600" /> */} Phân Quyền: {role?.name}
                        </h1>
                        <p className="text-slate-500">Quyết định xem role này được phép truy cập tính năng nào</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => router.push('/admin/roles')}>Hủy</Button>
                        <Button onClick={handleSave} className="gap-2">Lưu Thay Đổi</Button>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="bg-slate-100 p-4 font-bold text-slate-700">Mobile App Features</div>
                    <div className="divide-y relative">
                        {FEATURES.MOBILE.map(feat => (
                            <div key={feat.key} className="p-4 flex items-center justify-between hover:bg-slate-50">
                                <div>
                                    <div className="font-bold text-slate-800">{feat.label}</div>
                                    <div className="text-sm text-slate-500">{feat.desc}</div>
                                    <div className="text-xs text-slate-400 font-mono mt-1">{feat.key}</div>
                                </div>
                                <SimpleSwitch
                                    checked={!!permissions[feat.key]}
                                    onCheckedChange={() => togglePermission(feat.key)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    )
}
