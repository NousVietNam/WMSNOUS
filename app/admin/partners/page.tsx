"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Plus, Pencil, Trash2, Search, X, Loader2, User, Phone, MapPin, Save, Upload, Download, Building, Users, Store, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from 'xlsx'

type TabType = 'CUSTOMER' | 'DESTINATION' | 'STAFF'

type Customer = {
    id: string
    code?: string
    name: string
    phone?: string
    email?: string
    address?: string
    note?: string
    sale_staff_id?: string
    sale_staff?: { name: string, code?: string }
    default_discount?: number
    created_at: string
}

type Destination = {
    id: string
    name: string
    code?: string
    address?: string
    phone?: string
    contact_person?: string
    note?: string
    created_at: string
}

type InternalStaff = {
    id: string
    code?: string
    name: string
    department?: string
    phone?: string
    email?: string
    note?: string
    is_active: boolean
    created_at: string
}

export default function PartnersPage() {
    const [activeTab, setActiveTab] = useState<TabType>('CUSTOMER')

    // Data
    const [customers, setCustomers] = useState<Customer[]>([])
    const [destinations, setDestinations] = useState<Destination[]>([])
    const [staff, setStaff] = useState<InternalStaff[]>([])

    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Modal states
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState<any>(null)
    const [saving, setSaving] = useState(false)

    // Import states
    const [showImportModal, setShowImportModal] = useState(false)
    const [importData, setImportData] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Form states
    const [formData, setFormData] = useState<any>({})

    useEffect(() => {
        fetchAll()
    }, [])

    const fetchAll = async () => {
        setLoading(true)
        const [{ data: custs }, { data: dests }, { data: staffData }] = await Promise.all([
            supabase.from('customers').select('*, sale_staff:internal_staff(name, code)').order('name'),
            supabase.from('destinations').select('*').order('name'),
            supabase.from('internal_staff').select('*').order('name')
        ])
        setCustomers(custs || [])
        setDestinations(dests || [])
        setStaff(staffData || [])
        setLoading(false)
    }

    const getCurrentData = () => {
        switch (activeTab) {
            case 'CUSTOMER': return customers
            case 'DESTINATION': return destinations
            case 'STAFF': return staff
        }
    }

    const getFilteredData = () => {
        const data = getCurrentData()
        if (!searchTerm) return data
        return data.filter((item: any) =>
            item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.phone?.includes(searchTerm) ||
            item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.code?.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }

    const getTableName = () => {
        switch (activeTab) {
            case 'CUSTOMER': return 'customers'
            case 'DESTINATION': return 'destinations'
            case 'STAFF': return 'internal_staff'
        }
    }

    const getTabLabel = () => {
        switch (activeTab) {
            case 'CUSTOMER': return 'Khách Hàng'
            case 'DESTINATION': return 'Cửa Hàng / Kho'
            case 'STAFF': return 'Nhân Viên Nội Bộ'
        }
    }

    // Modal handlers
    const openCreateModal = () => {
        setEditing(null)
        setFormData(activeTab === 'STAFF' ? { is_active: true } : {})
        setShowModal(true)
    }

    const openEditModal = (item: any) => {
        setEditing(item)
        setFormData({ ...item })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!formData.name?.trim()) {
            toast.error('Vui lòng nhập tên')
            return
        }

        setSaving(true)
        try {
            const table = getTableName()
            const saveData = { ...formData }
            delete saveData.id
            delete saveData.created_at
            delete saveData.sale_staff

            if (editing) {
                const { error } = await supabase.from(table).update(saveData).eq('id', editing.id)
                if (error) throw error
                toast.success('Đã cập nhật!')
            } else {
                const { error } = await supabase.from(table).insert(saveData)
                if (error) throw error
                toast.success('Đã thêm mới!')
            }

            setShowModal(false)
            fetchAll()
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (item: any) => {
        if (!confirm(`Xóa "${item.name}"?`)) return

        try {
            const { error } = await supabase.from(getTableName()).delete().eq('id', item.id)
            if (error) throw error
            toast.success('Đã xóa!')
            fetchAll()
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        }
    }

    // Import/Export handlers
    const handleDownloadTemplate = () => {
        let template: any[] = []

        if (activeTab === 'CUSTOMER') {
            template = [{ 'Tên': '', 'Mã': '', 'SĐT': '', 'Email': '', 'Địa Chỉ': '', 'Nhân viên Sale (Mã)': '', 'Ghi Chú': '' }]
        } else if (activeTab === 'DESTINATION') {
            template = [{ 'Tên': '', 'Mã': '', 'SĐT': '', 'Địa Chỉ': '', 'Người Liên Hệ': '', 'Ghi Chú': '' }]
        } else {
            template = [{ 'Mã NV': '', 'Họ Tên': '', 'Phòng Ban': '', 'SĐT': '', 'Email': '', 'Ghi Chú': '' }]
        }

        const ws = XLSX.utils.json_to_sheet(template)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Template')
        XLSX.writeFile(wb, `${getTabLabel()}_template.xlsx`)
        toast.success('Đã tải file mẫu!')
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(worksheet)

            setImportData(jsonData)
            setShowImportModal(true)
        }
        reader.readAsArrayBuffer(file)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleImport = async () => {
        if (importData.length === 0) return

        setImporting(true)
        try {
            const table = getTableName()
            let insertData: any[] = []

            for (const row of importData) {
                if (activeTab === 'CUSTOMER') {
                    const saleStaffCode = row['Nhân viên Sale (Mã)'] || row['sale_staff_code']
                    let saleStaffId = null
                    if (saleStaffCode) {
                        const matchedStaff = staff.find(s => s.code === String(saleStaffCode))
                        if (matchedStaff) saleStaffId = matchedStaff.id
                    }

                    insertData.push({
                        code: row['Mã'] || row['code'],
                        name: row['Tên'] || row['name'],
                        phone: row['SĐT'] || row['phone'],
                        email: row['Email'] || row['email'],
                        address: row['Địa Chỉ'] || row['address'],
                        sale_staff_id: saleStaffId,
                        note: row['Ghi Chú'] || row['note']
                    })
                } else if (activeTab === 'DESTINATION') {
                    insertData.push({
                        name: row['Tên'] || row['name'],
                        code: row['Mã'] || row['code'],
                        phone: row['SĐT'] || row['phone'],
                        address: row['Địa Chỉ'] || row['address'],
                        contact_person: row['Người Liên Hệ'] || row['contact_person'],
                        note: row['Ghi Chú'] || row['note']
                    })
                } else {
                    insertData.push({
                        code: row['Mã NV'] || row['code'],
                        name: row['Họ Tên'] || row['name'],
                        department: row['Phòng Ban'] || row['department'],
                        phone: row['SĐT'] || row['phone'],
                        email: row['Email'] || row['email'],
                        note: row['Ghi Chú'] || row['note'],
                        is_active: true
                    })
                }
            }

            insertData = insertData.filter(d => d.name)

            const { error } = await supabase.from(table).insert(insertData)
            if (error) throw error

            toast.success(`Import thành công ${insertData.length} dòng!`)
            setShowImportModal(false)
            setImportData([])
            fetchAll()
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        } finally {
            setImporting(false)
        }
    }

    const tabs = [
        { key: 'CUSTOMER' as TabType, label: 'Khách Hàng', icon: User, count: customers.length },
        { key: 'DESTINATION' as TabType, label: 'Cửa Hàng / Kho', icon: Store, count: destinations.length },
        { key: 'STAFF' as TabType, label: 'NV Nội Bộ', icon: Users, count: staff.length },
    ]

    const filteredData = getFilteredData()

    // Render form fields based on active tab
    const renderFormFields = () => {
        if (activeTab === 'CUSTOMER') {
            return (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Mã khách hàng</label>
                            <input type="text" value={formData.code || ''} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Mã định danh..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Tên khách hàng <span className="text-red-500">*</span></label>
                            <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Nhập tên..." />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Chiết khấu mặc định (%)</label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={formData.default_discount || ''}
                            onChange={(e) => setFormData({ ...formData, default_discount: parseFloat(e.target.value) || 0 })}
                            className="w-full h-10 px-3 border rounded-lg"
                            placeholder="0"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Số điện thoại</label>
                            <input type="text" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="0912..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                            <input type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="email@..." />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Địa chỉ</label>
                        <input type="text" value={formData.address || ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Địa chỉ..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Nhân viên Sale phụ trách</label>
                        <select
                            value={formData.sale_staff_id || ''}
                            onChange={(e) => setFormData({ ...formData, sale_staff_id: e.target.value || null })}
                            className="w-full h-10 px-3 border rounded-lg bg-white"
                        >
                            <option value="">-- Chọn nhân viên --</option>
                            {staff.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code || 'N/A'})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Ghi chú</label>
                        <textarea value={formData.note || ''} onChange={(e) => setFormData({ ...formData, note: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg" placeholder="Ghi chú..." />
                    </div>
                </>
            )
        }
        else if (activeTab === 'DESTINATION') {
            return (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Tên <span className="text-red-500">*</span></label>
                            <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Tên cửa hàng/kho..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Mã</label>
                            <input type="text" value={formData.code || ''} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Mã viết tắt..." />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Chiết khấu mặc định (%)</label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={formData.default_discount || ''}
                            onChange={(e) => setFormData({ ...formData, default_discount: parseFloat(e.target.value) || 0 })}
                            className="w-full h-10 px-3 border rounded-lg"
                            placeholder="0"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Số điện thoại</label>
                            <input type="text" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="0912..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Người liên hệ</label>
                            <input type="text" value={formData.contact_person || ''} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Tên..." />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Địa chỉ</label>
                        <input type="text" value={formData.address || ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Địa chỉ..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Ghi chú</label>
                        <textarea value={formData.note || ''} onChange={(e) => setFormData({ ...formData, note: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg" placeholder="Ghi chú..." />
                    </div>
                </>
            )
        } else {
            return (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Mã nhân viên</label>
                            <input type="text" value={formData.code || ''} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="NV001..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Họ tên <span className="text-red-500">*</span></label>
                            <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Nhập họ tên..." />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Phòng ban</label>
                            <input type="text" value={formData.department || ''} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="Sales, Kho, ..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Số điện thoại</label>
                            <input type="text" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="0912..." />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                        <input type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full h-10 px-3 border rounded-lg" placeholder="email@..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Ghi chú</label>
                        <textarea value={formData.note || ''} onChange={(e) => setFormData({ ...formData, note: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg" placeholder="Ghi chú..." />
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={formData.is_active !== false}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                            className="h-4 w-4 rounded"
                        />
                        <label htmlFor="is_active" className="text-sm text-gray-600">Đang hoạt động</label>
                    </div>
                </>
            )
        }
    }

    // Render table based on active tab
    const renderTable = () => {
        if (loading) {
            return <tr><td colSpan={6} className="text-center py-8 text-gray-500">Đang tải...</td></tr>
        }
        if (filteredData.length === 0) {
            return <tr><td colSpan={6} className="text-center py-8 text-gray-500">Không có dữ liệu</td></tr>
        }

        if (activeTab === 'CUSTOMER') {
            return (filteredData as Customer[]).map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-400">{item.code || '-'}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
                                <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <span className="font-medium">{item.name}</span>
                        </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-bold text-blue-600">
                        {item.default_discount ? `${item.default_discount}%` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">{item.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                        {item.sale_staff ? (
                            <div className="flex flex-col">
                                <span className="font-medium text-gray-700">{item.sale_staff.name}</span>
                                {item.sale_staff.code && <span className="text-[10px] text-gray-400">{item.sale_staff.code}</span>}
                            </div>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate">{item.address || '-'}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEditModal(item)} className="text-blue-600 hover:text-blue-800"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => handleDelete(item)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    </td>
                </tr>
            ))
        } else if (activeTab === 'DESTINATION') {
            return (filteredData as Destination[]).map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-400">{item.code || '-'}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
                                <Store className="h-4 w-4 text-green-600" />
                            </div>
                            <div className="font-medium">{item.name}</div>
                        </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm">{item.contact_person || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{item.address || '-'}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEditModal(item)} className="text-blue-600 hover:text-blue-800"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => handleDelete(item)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    </td>
                </tr>
            ))
        } else {
            return (filteredData as InternalStaff[]).map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-400">{item.code || '-'}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center">
                                <Users className="h-4 w-4 text-purple-600" />
                            </div>
                            <span className="font-medium">{item.name}</span>
                        </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.department || '-'}</td>
                    <td className="px-4 py-3 text-sm">{item.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm">{item.email || '-'}</td>
                    <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEditModal(item)} className="text-blue-600 hover:text-blue-800"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => handleDelete(item)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    </td>
                </tr>
            ))
        }
    }

    const getTableHeaders = () => {
        if (activeTab === 'CUSTOMER') return ['Mã', 'Tên', 'CK (%)', 'SĐT', 'Nhân viên Sale', 'Địa Chỉ', 'Thao Tác']
        if (activeTab === 'DESTINATION') return ['Mã', 'Tên', 'SĐT', 'Liên Hệ', 'Địa Chỉ', 'Thao Tác']
        return ['Mã NV', 'Họ Tên', 'Phòng Ban', 'SĐT', 'Email', 'Thao Tác']
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản Lý Đối Tác</h1>
                    <p className="text-sm text-gray-500">Khách hàng, cửa hàng, kho & nhân viên nội bộ</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleDownloadTemplate} className="h-10 px-4 border rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm">
                        <Download className="h-4 w-4" />
                        Tải Mẫu
                    </button>
                    <label className="h-10 px-4 border rounded-lg flex items-center gap-2 hover:bg-gray-50 cursor-pointer text-sm">
                        <Upload className="h-4 w-4" />
                        Import
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                    </label>
                    <button onClick={openCreateModal} className="h-10 px-4 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />
                        Thêm Mới
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); setSearchTerm('') }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${activeTab === tab.key
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="flex gap-4 items-center bg-white p-4 rounded-lg border">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={activeTab === 'STAFF' ? 'Tìm theo tên, mã NV, phòng ban...' : 'Tìm theo tên, SĐT, email...'}
                    className="flex-1 h-9 border-none outline-none text-sm"
                />
                <span className="text-sm text-gray-500">{filteredData.length} kết quả</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            {getTableHeaders().map((h, i) => (
                                <th key={i} className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${i === getTableHeaders().length - 1 ? 'text-center w-24' : 'text-left'}`}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {renderTable()}
                    </tbody>
                </table>
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h3 className="text-lg font-bold">{editing ? 'Chỉnh Sửa' : 'Thêm Mới'} {getTabLabel()}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            {renderFormFields()}
                        </div>
                        <div className="p-5 border-t flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Hủy</button>
                            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {editing ? 'Cập Nhật' : 'Thêm Mới'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                                Import {getTabLabel()} - {importData.length} dòng
                            </h3>
                            <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-4 overflow-auto max-h-[50vh]">
                            <table className="w-full text-sm border">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {importData[0] && Object.keys(importData[0]).map(key => (
                                            <th key={key} className="px-3 py-2 text-left border-b font-medium">{key}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {importData.slice(0, 20).map((row, idx) => (
                                        <tr key={idx} className="border-b">
                                            {Object.values(row).map((val: any, i) => (
                                                <td key={i} className="px-3 py-2">{String(val)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {importData.length > 20 && <p className="text-sm text-gray-500 mt-2">...và {importData.length - 20} dòng nữa</p>}
                        </div>
                        <div className="p-4 border-t flex justify-end gap-3">
                            <button onClick={() => setShowImportModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Hủy</button>
                            <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                                {importing ? 'Đang import...' : `Import ${importData.length} dòng`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
