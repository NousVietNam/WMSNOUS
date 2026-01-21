"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Plus, Pencil, Trash2, Search, X, Loader2, User, Phone, MapPin, Save } from "lucide-react"
import { toast } from "sonner"

type Customer = {
    id: string
    name: string
    phone?: string
    email?: string
    address?: string
    note?: string
    created_at: string
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Modal states
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState<Customer | null>(null)
    const [saving, setSaving] = useState(false)

    // Form states
    const [formName, setFormName] = useState('')
    const [formPhone, setFormPhone] = useState('')
    const [formEmail, setFormEmail] = useState('')
    const [formAddress, setFormAddress] = useState('')
    const [formNote, setFormNote] = useState('')

    useEffect(() => {
        fetchCustomers()
    }, [])

    const fetchCustomers = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('name')

        if (!error && data) setCustomers(data)
        setLoading(false)
    }

    const openCreateModal = () => {
        setEditing(null)
        setFormName('')
        setFormPhone('')
        setFormEmail('')
        setFormAddress('')
        setFormNote('')
        setShowModal(true)
    }

    const openEditModal = (customer: Customer) => {
        setEditing(customer)
        setFormName(customer.name)
        setFormPhone(customer.phone || '')
        setFormEmail(customer.email || '')
        setFormAddress(customer.address || '')
        setFormNote(customer.note || '')
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!formName.trim()) {
            toast.error('Vui lòng nhập tên khách hàng')
            return
        }

        setSaving(true)
        try {
            if (editing) {
                // Update
                const { error } = await supabase
                    .from('customers')
                    .update({
                        name: formName.trim(),
                        phone: formPhone.trim() || null,
                        email: formEmail.trim() || null,
                        address: formAddress.trim() || null,
                        note: formNote.trim() || null
                    })
                    .eq('id', editing.id)

                if (error) throw error
                toast.success('Đã cập nhật khách hàng!')
            } else {
                // Create
                const { error } = await supabase
                    .from('customers')
                    .insert({
                        name: formName.trim(),
                        phone: formPhone.trim() || null,
                        email: formEmail.trim() || null,
                        address: formAddress.trim() || null,
                        note: formNote.trim() || null
                    })

                if (error) throw error
                toast.success('Đã thêm khách hàng mới!')
            }

            setShowModal(false)
            fetchCustomers()
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (customer: Customer) => {
        if (!confirm(`Xóa khách hàng "${customer.name}"?`)) return

        try {
            const { error } = await supabase
                .from('customers')
                .delete()
                .eq('id', customer.id)

            if (error) throw error
            toast.success('Đã xóa khách hàng!')
            fetchCustomers()
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        }
    }

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản Lý Khách Hàng</h1>
                    <p className="text-sm text-gray-500">Danh sách khách hàng cho đơn bán hàng</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="h-10 px-4 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700"
                >
                    <Plus className="h-4 w-4" />
                    Thêm Mới
                </button>
            </div>

            {/* Search */}
            <div className="flex gap-4 items-center bg-white p-4 rounded-lg border">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm theo tên, SĐT, email..."
                    className="flex-1 h-9 border-none outline-none text-sm"
                />
                <span className="text-sm text-gray-500">{filteredCustomers.length} khách hàng</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tên</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">SĐT</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Địa chỉ</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ghi chú</th>
                            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase w-24">Thao Tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-gray-500">Đang tải...</td>
                            </tr>
                        ) : filteredCustomers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-gray-500">Không có dữ liệu</td>
                            </tr>
                        ) : (
                            filteredCustomers.map(customer => (
                                <tr key={customer.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                                <User className="h-4 w-4 text-blue-600" />
                                            </div>
                                            <span className="font-medium">{customer.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {customer.phone ? (
                                            <span className="flex items-center gap-1">
                                                <Phone className="h-3 w-3 text-gray-400" />
                                                {customer.phone}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{customer.email || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={customer.address}>
                                        {customer.address || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate" title={customer.note}>
                                        {customer.note || '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => openEditModal(customer)}
                                                className="text-blue-600 hover:text-blue-800"
                                                title="Sửa"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(customer)}
                                                className="text-red-500 hover:text-red-700"
                                                title="Xóa"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="text-lg font-bold">
                                {editing ? 'Sửa Khách Hàng' : 'Thêm Khách Hàng Mới'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">
                                    Tên khách hàng <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full h-10 px-3 border rounded-lg"
                                    placeholder="Nhập tên..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">Số điện thoại</label>
                                    <input
                                        type="text"
                                        value={formPhone}
                                        onChange={(e) => setFormPhone(e.target.value)}
                                        className="w-full h-10 px-3 border rounded-lg"
                                        placeholder="0912..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={formEmail}
                                        onChange={(e) => setFormEmail(e.target.value)}
                                        className="w-full h-10 px-3 border rounded-lg"
                                        placeholder="email@..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">Địa chỉ</label>
                                <input
                                    type="text"
                                    value={formAddress}
                                    onChange={(e) => setFormAddress(e.target.value)}
                                    className="w-full h-10 px-3 border rounded-lg"
                                    placeholder="Địa chỉ giao hàng..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">Ghi chú</label>
                                <textarea
                                    value={formNote}
                                    onChange={(e) => setFormNote(e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    placeholder="Ghi chú..."
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {editing ? 'Cập Nhật' : 'Thêm Mới'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
