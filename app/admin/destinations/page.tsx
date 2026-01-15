"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { MapPin, Search, Plus, Upload, Download, Building, Users, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from 'xlsx'

interface Destination {
    id: string
    code: string
    name: string
    address: string | null
    phone: string | null
    email: string | null
    type: 'store' | 'customer' | 'partner'
    created_at: string
}

export default function DestinationsPage() {
    const [destinations, setDestinations] = useState<Destination[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [activeTab, setActiveTab] = useState("store")

    // Form State
    const [createOpen, setCreateOpen] = useState(false)
    const [importing, setImporting] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [formData, setFormData] = useState({
        code: "",
        name: "",
        address: "",
        phone: "",
        email: "",
        type: "store"
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('destinations')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            toast.error("Lỗi tải dữ liệu: " + error.message)
        } else {
            setDestinations(data || [])
        }
        setLoading(false)
    }

    const handleCreateOrUpdate = async () => {
        if (!formData.code || !formData.name) {
            return toast.error("Vui lòng nhập Mã và Tên")
        }

        try {
            let error;
            if (editingId) {
                const { error: updateError } = await supabase
                    .from('destinations')
                    .update(formData)
                    .eq('id', editingId)
                error = updateError
            } else {
                const { error: insertError } = await supabase
                    .from('destinations')
                    .insert([formData])
                error = insertError
            }

            if (error) throw error

            toast.success(editingId ? "Đã cập nhật thành công" : "Đã thêm mới thành công")
            setCreateOpen(false)
            setEditingId(null)
            setFormData({ code: "", name: "", address: "", phone: "", email: "", type: activeTab })
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi: " + error.message)
        }
    }

    const handleEdit = (item: Destination) => {
        setEditingId(item.id)
        setFormData({
            code: item.code,
            name: item.name,
            address: item.address || "",
            phone: item.phone || "",
            email: item.email || "",
            type: item.type
        })
        setCreateOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Bạn có chắc chắn muốn xóa không?")) return

        try {
            const { error } = await supabase
                .from('destinations')
                .delete()
                .eq('id', id)

            if (error) throw error

            toast.success("Đã xóa thành công")
            fetchData()
        } catch (error: any) {
            toast.error("Lỗi xóa: " + error.message)
        }
    }

    const handleDownloadTemplate = () => {
        const template = [
            { Ma: "KH001", Ten: "Khách Hàng A", DiaChi: "Số 1, Đường X", DienThoai: "0901234567", Email: "a@gmail.com" },
            { Ma: "KH002", Ten: "Khách Hàng B", DiaChi: "Số 2, Đường Y", DienThoai: "0909876543", Email: "" },
        ]
        const ws = XLSX.utils.json_to_sheet(template)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "DS_KhachHang")
        XLSX.writeFile(wb, "Mau_Nhap_KhachHang.xlsx")
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (evt) => {
            try {
                setImporting(true)
                const bstr = evt.target?.result
                const wb = XLSX.read(bstr, { type: 'binary' })
                const wsname = wb.SheetNames[0]
                const ws = wb.Sheets[wsname]
                const data = XLSX.utils.sheet_to_json(ws) as any[]

                const validItems = []

                for (const row of data) {
                    const code = row['Ma'] || row['Code'] || row['code']
                    const name = row['Ten'] || row['Name'] || row['name']

                    if (code && name) {
                        validItems.push({
                            code: String(code),
                            name: String(name),
                            address: row['DiaChi'] || row['Address'] || null,
                            phone: row['DienThoai'] || row['Phone'] || null,
                            email: row['Email'] || null,
                            type: activeTab // Import into current tab type
                        })
                    }
                }

                if (validItems.length > 0) {
                    const { error } = await supabase.from('destinations').upsert(validItems, { onConflict: 'code' })
                    if (error) throw error
                    toast.success(`Đã import/cập nhật ${validItems.length} mục`)
                    fetchData()
                } else {
                    toast.warning("File không có dữ liệu hợp lệ")
                }

            } catch (error: any) {
                toast.error("Lỗi import: " + error.message)
            } finally {
                setImporting(false)
                if (fileInputRef.current) fileInputRef.current.value = ""
            }
        }
        reader.readAsBinaryString(file)
    }

    const filteredDestinations = destinations.filter(d =>
        d.type === activeTab &&
        (d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.code.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <MapPin className="h-8 w-8 text-primary" />
                        Quản Lý Điểm Đến / Đối Tác
                    </h1>
                </div>

                <Tabs defaultValue="store" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
                        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
                            <TabsTrigger value="store" className="gap-2">
                                <Building className="h-4 w-4" /> Cửa Hàng / Kho
                            </TabsTrigger>
                            <TabsTrigger value="customer" className="gap-2">
                                <Users className="h-4 w-4" /> Khách Hàng
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Tìm kiếm..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button onClick={() => setFormData({ ...formData, type: activeTab })} className="gap-2">
                                        <Plus className="h-4 w-4" /> Thêm Mới
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Thêm {activeTab === 'store' ? 'Cửa Hàng' : 'Khách Hàng'}</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label>Mã *</Label>
                                                <Input value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="VD: CH01" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>Tên *</Label>
                                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Tên hiển thị" />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Địa Chỉ</Label>
                                            <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label>Điện Thoại</Label>
                                                <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>Email</Label>
                                                <Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleCreateOrUpdate}>Lưu lại</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            {activeTab === 'customer' && (
                                <>
                                    <Button variant="outline" onClick={handleDownloadTemplate} title="Tải mẫu Excel">
                                        <Download className="h-4 w-4" />
                                    </Button>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileUpload}
                                            accept=".xlsx, .xls"
                                            className="hidden"
                                        />
                                        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} title="Upload Excel">
                                            <Upload className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <TabsContent value="store" className="mt-0">
                        <DestinationTable data={filteredDestinations} onEdit={handleEdit} onDelete={handleDelete} />
                    </TabsContent>
                    <TabsContent value="customer" className="mt-0">
                        <DestinationTable data={filteredDestinations} onEdit={handleEdit} onDelete={handleDelete} />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    )
}

function DestinationTable({ data, onEdit, onDelete }: { data: Destination[], onEdit: (item: Destination) => void, onDelete: (id: string) => void }) {
    if (data.length === 0) {
        return <div className="p-8 text-center border rounded-md bg-white text-muted-foreground">Chưa có dữ liệu.</div>
    }

    return (
        <div className="bg-white rounded-md border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-slate-100 font-medium text-slate-700">
                    <tr>
                        <th className="p-3 text-left w-32">Mã</th>
                        <th className="p-3 text-left">Tên</th>
                        <th className="p-3 text-left">Địa Chỉ</th>
                        <th className="p-3 text-left">Liên Hệ</th>
                        <th className="p-3 text-right">Thao Tác</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {data.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50 group">
                            <td className="p-3 font-medium text-blue-600">{item.code}</td>
                            <td className="p-3 font-semibold">{item.name}</td>
                            <td className="p-3 text-slate-600">{item.address || '--'}</td>
                            <td className="p-3">
                                {item.phone && <div className="text-xs">Tel: {item.phone}</div>}
                                {item.email && <div className="text-xs text-slate-500">{item.email}</div>}
                            </td>
                            <td className="p-3 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="sm" onClick={() => onEdit(item)} className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
