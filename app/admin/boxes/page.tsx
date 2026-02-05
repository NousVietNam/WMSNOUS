"use client"

import { useEffect, useState, useRef } from "react"
import { useReactToPrint } from "react-to-print"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase"
import { Box as BoxIcon, Plus, Printer, Trash2, Download, Package, Search, ArrowRightLeft, ChevronLeft, ChevronRight } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import QRCode from "react-qr-code"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { ReceivingReminder } from "@/components/mobile/ReceivingReminder"

interface Box {
    id: string
    code: string
    status: 'OPEN' | 'CLOSED' | 'FULL' | 'LOCKED' | 'SHIPPED'
    location_id: string | null
    inventory_type: 'PIECE' | 'BULK'
    type?: 'STORAGE' | 'OUTBOX' | 'CART'
    created_at: string
    locations?: { code: string }
    inventory_items?: { quantity: number }[]
    item_count?: number
    holding_order?: { id: string; code: string; status: string } | null
}

export default function BoxesPage() {
    const [boxes, setBoxes] = useState<Box[]>([])
    const [loading, setLoading] = useState(true)
    const [openDialog, setOpenDialog] = useState(false)

    // Sort state
    const [sortColumn, setSortColumn] = useState<string | null>(null)
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

    // Print State
    const [printBox, setPrintBox] = useState<Box | null>(null) // For Modal Preview
    const [printQueue, setPrintQueue] = useState<Box[]>([]) // For Actual Print - Hidden
    const [bulkQty, setBulkQty] = useState<string>('')
    const [searchTerm, setSearchTerm] = useState<string>('')
    const [customCode, setCustomCode] = useState<string>('')

    // Pagination & Filter State
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const PAGE_SIZE = 50
    const [statusFilter, setStatusFilter] = useState<string>('OPEN')

    // Return Goods State
    const [customers, setCustomers] = useState<{ code: string, name: string }[]>([])
    const [returnCustomer, setReturnCustomer] = useState<string>('')
    const [customerSearch, setCustomerSearch] = useState<string>('')
    const [returnStart, setReturnStart] = useState<string>('1')
    const [returnEnd, setReturnEnd] = useState<string>('1')

    // Stats State - Separate from Boxes Data
    const [statsPiece, setStatsPiece] = useState({ total: 0, empty: 0, small: 0, medium: 0, large: 0 })
    const [statsBulk, setStatsBulk] = useState({ total: 0, empty: 0, small: 0, medium: 0, large: 0 })
    const [maxCodes, setMaxCodes] = useState({ piece: 'N/A', bulk: 'N/A' })

    useEffect(() => {
        setPage(1) // Reset page on filter change
    }, [statusFilter, searchTerm])

    const printRef = useRef(null)
    const handleReactToPrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Box-Labels-${new Date().toISOString()}`,
        pageStyle: `
        @page {
            size: 100mm 150mm;
            margin: 0;
        }
    `,
        onAfterPrint: () => setPrintQueue([])
    })

    const triggerPrint = (boxesToPrint: Box[]) => {
        setPrintQueue(boxesToPrint)
        // Need timeout to allow render
        setTimeout(() => {
            handleReactToPrint()
        }, 100)
    }

    const handlePrintBatch = () => {
        if (selectedIds.size === 0) return
        const selectedBoxes = boxes.filter(b => selectedIds.has(b.id))
        triggerPrint(selectedBoxes)
    }

    // Cleaned up client-side logic

    // UseEffect Trigger REMOVED

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Drill Down
    const [selectedBox, setSelectedBox] = useState<Box | null>(null)
    const [boxItems, setBoxItems] = useState<any[]>([])

    useEffect(() => {
        fetchBoxes()
        fetchStats()
        fetchMaxCodes()
        fetchCustomers()
    }, [page, statusFilter, searchTerm, sortColumn, sortDirection])

    const fetchCustomers = async () => {
        const { data } = await supabase.from('customers').select('code, name').order('name')
        if (data) setCustomers(data)
    }

    const handleCreateReturn = async () => {
        if (!returnCustomer) return alert("Vui lòng chọn khách hàng")
        const start = parseInt(returnStart)
        const end = parseInt(returnEnd)

        if (isNaN(start) || isNaN(end) || start > end) {
            return alert("Vui lòng nhập khoảng số thứ tự hợp lệ")
        }

        setLoading(true)
        try {
            const res = await fetch('/api/boxes/generate-return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerCode: returnCustomer,
                    startNum: start,
                    endNum: end
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to create')

            alert(`Đã tạo thành công ${data.count} thùng hàng trả lại!`)
            setOpenDialog(false)
            fetchBoxes()
        } catch (e: any) {
            alert("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchBoxes = async () => {
        setLoading(true)

        // Base Query using Unified View
        let query = supabase
            .from('view_boxes_with_counts')
            .select(`
                *, 
                outbound_orders(id, code, status)
            `, { count: 'exact' })

        // 1. Status Filter
        if (statusFilter !== 'ALL') {
            query = query.eq('status', statusFilter)
        }

        // 2. Search
        if (searchTerm) {
            query = query.ilike('code', `%${searchTerm}%`)
        }

        // 3. Sort
        if (sortColumn) {
            if (['code', 'created_at', 'updated_at', 'status', 'inventory_type'].includes(sortColumn)) {
                query = query.order(sortColumn, { ascending: sortDirection === 'asc' })
            }
        } else {
            query = query.order('created_at', { ascending: false })
        }

        // 4. Pagination
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        query = query.range(from, to)

        const { data, error, count } = await query

        if (!error && data) {
            const mapped = data.map((b: any) => {
                return {
                    ...b,
                    item_count: b.total_item_count,
                    locations: { code: b.location_code },
                    holding_order: b.outbound_orders
                }
            })
            setBoxes(mapped)
            setTotalCount(count || 0)
        }
        setLoading(false)
    }

    const fetchStats = async () => {
        let query = supabase.from('view_boxes_with_counts').select('inventory_type, total_item_count')

        // 1. Status Filter
        if (statusFilter !== 'ALL') {
            query = query.eq('status', statusFilter)
        }

        // 2. Search
        if (searchTerm) {
            query = query.ilike('code', `%${searchTerm}%`)
        }

        const { data } = await query

        if (data) {
            const getStats = (type: string) => {
                const filtered = data.filter((b: any) => b.inventory_type === type)
                return {
                    total: filtered.length,
                    empty: filtered.filter((b: any) => b.total_item_count === 0).length,
                    small: filtered.filter((b: any) => b.total_item_count > 0 && b.total_item_count < 50).length,
                    medium: filtered.filter((b: any) => b.total_item_count >= 50 && b.total_item_count < 100).length,
                    large: filtered.filter((b: any) => b.total_item_count >= 100).length
                }
            }
            setStatsPiece(getStats('PIECE') as any)
            setStatsBulk(getStats('BULK') as any)
        }
    }

    const fetchMaxCodes = async () => {
        const now = new Date()
        const month = (now.getMonth() + 1).toString().padStart(2, '0')
        const year = now.getFullYear().toString().slice(-2)

        const getMax = async (prefix: string) => {
            const { data } = await supabase.from('boxes')
                .select('code')
                .ilike('code', `${prefix}%`)
                .order('code', { ascending: false })
                .limit(1)
            return data && data.length > 0 ? data[0].code : 'Chưa có'
        }

        const maxPiece = await getMax(`BOX-${month}${year}-`)
        const maxBulk = await getMax(`INB-${month}${year}-`)

        setMaxCodes({ piece: maxPiece, bulk: maxBulk })
    }

    // Inventory Type State
    const [inventoryType, setInventoryType] = useState<'PIECE' | 'BULK'>('PIECE')
    const [createMode, setCreateMode] = useState<'standard' | 'return' | 'cart'>('standard')

    const getLocationReceivingId = async () => {
        try {
            // 1. Try to find "RECEIVING"
            let { data, error } = await supabase.from('locations').select('id').eq('code', 'RECEIVING').single()
            if (data) return data.id
            if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
                console.warn("Error finding RECEIVING location:", error)
            }
        } catch (e) {
            console.warn("Exception finding RECEIVING location:", e)
        }

        // 2. If not exist, create it
        const { data: newLoc, error } = await supabase.from('locations').insert({
            code: 'RECEIVING',
            type: 'receiving',
            description: 'Khu vực tiếp nhận hàng (Mặc định)'
        }).select('id').single()

        if (error || !newLoc) {
            alert("Không thể tạo vị trí RECEIVING: " + error?.message)
            return null
        }
        return newLoc.id
    }

    const generateBoxCode = async (type: 'PIECE' | 'BULK' | 'CART', count: number = 1): Promise<string[]> => {
        const now = new Date()
        const month = (now.getMonth() + 1).toString().padStart(2, '0')
        const year = now.getFullYear().toString().slice(-2)

        // Logic: PIECE -> BOX-MMYY-xxxx, BULK -> INB-MMYY-xxxx, CART -> CART-xxxx
        let prefix = ''
        if (type === 'CART') prefix = 'CART-'
        else prefix = type === 'PIECE' ? `BOX-${month}${year}-` : `INB-${month}${year}-`

        // Get max code for this prefix
        const { data } = await supabase.from('boxes')
            .select('code')
            .ilike('code', `${prefix}%`)
            .order('code', { ascending: false })
            .limit(1)

        let startSuffix = 1
        if (data && data.length > 0) {
            const lastCode = data[0].code
            // Handle CART-01 vs BOX-MMYY-0001
            const parts = lastCode.split('-')
            const lastPart = parts[parts.length - 1]
            const lastSuffix = parseInt(lastPart || '0')
            startSuffix = lastSuffix + 1
        }

        const codes = []
        for (let i = 0; i < count; i++) {
            const suffix = (startSuffix + i).toString().padStart(type === 'CART' ? 2 : 4, '0')
            codes.push(`${prefix}${suffix}`)
        }
        return codes
    }

    const handleCreateAuto = async () => {
        const receivingLocId = await getLocationReceivingId()
        if (!receivingLocId) return

        const [code] = await generateBoxCode(inventoryType, 1)

        const { error } = await supabase.from('boxes').insert({
            code,
            status: 'OPEN',
            type: 'STORAGE', // Keep original logic
            inventory_type: inventoryType, // New column
            location_id: receivingLocId
        })
        if (error) alert("Lỗi: " + error.message)
        else { setOpenDialog(false); fetchBoxes() }
    }

    const handleCreateCustom = async () => {
        const code = customCode.trim()
        if (!code) return alert("Vui lòng nhập mã thùng")
        // validation loose for custom to allow flexibility, or enforce? 
        // User asked to change logic for auto/bulk. Custom might be custom.
        // Let's keep custom simple but maybe warn if it doesn't match standard?
        // For now, let custom be custom.

        setLoading(true)
        try {
            // Check uniqueness
            const { data: existing } = await supabase
                .from('boxes')
                .select('id')
                .eq('code', code)
                .single()

            if (existing) {
                setLoading(false)
                return alert(`Mã thùng '${code}' đã tồn tại!`)
            }

            const receivingLocId = await getLocationReceivingId()
            if (!receivingLocId) { setLoading(false); return }

            const { error } = await supabase.from('boxes').insert({
                code,
                status: 'OPEN',
                type: 'STORAGE',
                inventory_type: 'PIECE', // Default custom to piece?
                location_id: receivingLocId
            })

            if (error) throw error

            setOpenDialog(false)
            setCustomCode('')
            fetchBoxes()
            alert(`Đã tạo thùng '${code}' thành công!`)
        } catch (e: any) {
            alert("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateBulk = async (qty: number, isCart: boolean = false) => {
        if (qty > 100) return alert("Tối đa 100 thùng/lần")
        setLoading(true)

        const receivingLocId = await getLocationReceivingId()
        if (!receivingLocId) { setLoading(false); return }

        // Use 'CART' type for generation if isCart is true
        const genType = isCart ? 'CART' : inventoryType
        const codes = await generateBoxCode(genType as any, qty)

        const boxesToInsert = codes.map(code => ({
            code,
            status: 'OPEN',
            type: isCart ? 'CART' : 'STORAGE',
            inventory_type: isCart ? 'PIECE' : inventoryType,
            location_id: receivingLocId
        }))

        const { error } = await supabase.from('boxes').insert(boxesToInsert)
        if (error) alert("Lỗi: " + error.message)
        else { setOpenDialog(false); fetchBoxes() }
        setLoading(false)
    }

    const handleDelete = async (id: string, count: number) => {
        if (count > 0) return alert(`Không thể xoá! Thùng này đang chứa ${count} sản phẩm.`)
        if (!confirm("Xoá thùng rỗng này?")) return
        const { error } = await supabase.from('boxes').delete().eq('id', id)
        if (error) alert("Lỗi: " + error.message)
        else {
            setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
            fetchBoxes()
        }
    }

    // Drill down
    const handleViewItems = async (box: Box) => {
        setSelectedBox(box)
        const { data } = await supabase.from('view_box_contents_unified')
            .select('*')
            .eq('box_id', box.id)
            .gt('quantity', 0)
        if (data) setBoxItems(data)
    }

    // Export Logic
    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const toggleAll = () => {
        if (selectedIds.size === boxes.length) setSelectedIds(new Set())
        else setSelectedIds(new Set(boxes.map(b => b.id)))
    }

    const handleExport = async () => {
        if (selectedIds.size === 0) return alert("Vui lòng chọn ít nhất 1 thùng")

        try {
            // Use server-side API for Chrome compatibility
            const response = await fetch('/api/export/boxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boxIds: Array.from(selectedIds) })
            })

            if (!response.ok) {
                const errData = await response.json()
                return alert(errData.error || "Lỗi xuất file")
            }

            // Download the file
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '')
            a.download = `PackingList_Storage_${timestamp}.xlsx`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (error: any) {
            console.error('Export error:', error)
            alert("Lỗi xuất file: " + error.message)
        }
    }

    const handleExportAll = async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('view_boxes_with_counts')
                .select(`
                    code,
                    location_code,
                    total_item_count,
                    status,
                    inventory_type
                `)

            if (statusFilter !== 'ALL') {
                query = query.eq('status', statusFilter)
            }
            if (searchTerm) {
                query = query.ilike('code', `%${searchTerm}%`)
            }

            const { data, error } = await query

            if (error) throw error
            if (!data || data.length === 0) return alert("Không có dữ liệu để xuất")

            const exportData = data.map(item => ({
                "Mã Thùng": item.code,
                "Vị Trí": item.location_code || "N/A",
                "Số Lượng SP": item.total_item_count || 0,
                "Trạng Thái": item.status,
                "Loại": item.inventory_type
            }))

            const ws = XLSX.utils.json_to_sheet(exportData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "DanhSachThung")

            const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '')
            XLSX.writeFile(wb, `DanhSachThung_ALL_${timestamp}.xlsx`)

        } catch (error: any) {
            console.error("Export all error:", error)
            alert("Lỗi xuất file: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    const triggerSinglePrint = (box: Box) => {
        triggerPrint([box])
    }

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortColumn(column)
            setSortDirection('asc')
        }
    }

    const getSortIcon = (column: string) => {
        if (sortColumn !== column) return null
        return sortDirection === 'asc' ? ' ↑' : ' ↓'
    }


    return (
        <div className="h-[calc(100vh-74px)] flex flex-col bg-slate-50 overflow-hidden">
            {/* MAIN CONTENT */}
            <main className="flex-1 p-6 space-y-6 h-full overflow-hidden flex flex-col print:hidden">
                <div className="flex flex-col md:flex-row gap-6 h-full items-start overflow-hidden">
                    {/* LEFT PANEL: DASHBOARD & FILTER */}
                    <div className="w-full md:w-80 space-y-6 flex-shrink-0 h-full overflow-y-auto pr-1">
                        {/* Title & Actions */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4 sticky top-0 z-20">
                            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <BoxIcon className="h-6 w-6 text-primary" /> Quản Lý Thùng
                            </h1>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Tìm mã thùng, vị trí..."
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1 pt-6">
                                <Label className="text-xs text-muted-foreground">Lọc Trạng Thái</Label>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                                        <SelectItem value="OPEN">OPEN (Đang mở)</SelectItem>
                                        <SelectItem value="CLOSED">CLOSED (Đã đóng)</SelectItem>
                                        <SelectItem value="LOCKED">LOCKED (Đã khóa)</SelectItem>
                                        <SelectItem value="SHIPPED">SHIPPED (Đã xuất)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="pt-2">
                                <ReceivingReminder title="Giám Sát Thùng Chờ Cất" />
                            </div>

                            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                                <DialogTrigger asChild><Button className="w-full"><Plus className="mr-2 h-4 w-4" /> Tạo Mới</Button></DialogTrigger>
                                <DialogContent className="max-w-xl">
                                    <DialogHeader><DialogTitle>Tạo Thùng Mới</DialogTitle></DialogHeader>

                                    {/* Create Mode Selection */}
                                    <div className="flex p-1 bg-slate-100 rounded-lg">
                                        <button
                                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${createMode === 'standard' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            onClick={() => setCreateMode('standard')}
                                        >
                                            Thùng Tiêu Chuẩn
                                        </button>
                                        <button
                                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${createMode === 'cart' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            onClick={() => setCreateMode('cart')}
                                        >
                                            Xe Đẩy / Rổ
                                        </button>
                                        <button
                                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${createMode === 'return' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            onClick={() => setCreateMode('return')}
                                        >
                                            Hàng Trả Lại (HTL)
                                        </button>
                                    </div>

                                    <div className="py-4 space-y-6">

                                        {createMode === 'standard' ? (
                                            <>
                                                <div className="space-y-4">
                                                    <label className="text-sm font-medium block">Loại Thùng (Inventory Type)</label>
                                                    <div className="flex gap-4">
                                                        <div
                                                            className={`flex-1 p-3 border rounded-lg cursor-pointer text-center transition-colors ${inventoryType === 'PIECE' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-slate-50'}`}
                                                            onClick={() => setInventoryType('PIECE')}
                                                        >
                                                            <div className="font-bold">PIECE</div>
                                                            <div className="text-xs opacity-75">Hàng Lẻ</div>
                                                        </div>
                                                        <div
                                                            className={`flex-1 p-3 border rounded-lg cursor-pointer text-center transition-colors ${inventoryType === 'BULK' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-slate-50'}`}
                                                            onClick={() => setInventoryType('BULK')}
                                                        >
                                                            <div className="font-bold">BULK</div>
                                                            <div className="text-xs opacity-75">Hàng Sỉ/Inbound</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                                    <div className="space-y-3">
                                                        <label className="text-sm font-medium block">Tạo 1 thùng lẻ</label>
                                                        <div className="flex gap-2">
                                                            <Input
                                                                placeholder="VD: BOX-VIP-01"
                                                                value={customCode}
                                                                onChange={(e) => setCustomCode(e.target.value)}
                                                                className="bg-white"
                                                            />
                                                            <Button onClick={handleCreateCustom} disabled={loading} size="sm">
                                                                Tạo
                                                            </Button>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 italic">* Tùy chỉnh</p>
                                                    </div>
                                                    <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-blue-200" /></div><div className="relative flex justify-center text-[10px] uppercase"><span className="bg-[#f8fafc] px-2 text-blue-400 font-bold">Hoặc</span></div></div>
                                                    <Button size="sm" onClick={handleCreateAuto} className="w-full" variant="outline">
                                                        Tạo Mã Kế Tiếp ({inventoryType === 'PIECE' ? 'BOX-...' : 'INB-...'})
                                                    </Button>
                                                </div>

                                                <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-muted-foreground">Hoặc tạo hàng loạt</span></div></div>

                                                <div className="space-y-4 bg-slate-50 p-4 rounded-lg border">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-bold uppercase text-slate-500">Số lượng</label>
                                                            <input
                                                                type="number" min="1" max="100"
                                                                className="w-full h-10 px-3 rounded border"
                                                                placeholder="VD: 50"
                                                                value={bulkQty}
                                                                onChange={(e) => setBulkQty(e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-bold uppercase text-slate-500">Mẫu Mã</label>
                                                            <div className="text-xs text-slate-600 font-mono bg-white p-2 rounded border truncate">
                                                                {inventoryType === 'PIECE' ? 'BOX-MMYY-XXXX' : 'INB-MMYY-XXXX'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button onClick={() => {
                                                        const qty = parseInt(bulkQty)
                                                        if (qty > 0) handleCreateBulk(qty)
                                                        else alert("Vui lòng nhập số lượng hợp lệ")
                                                    }} className="w-full" disabled={loading}>
                                                        {loading ? 'Đang tạo...' : 'Tạo Hàng Loạt'}
                                                    </Button>
                                                    <p className="text-[10px] text-slate-400 text-center">
                                                        *Hệ thống sẽ tạo mã liên tục tiếp theo
                                                    </p>
                                                </div>
                                            </>
                                        ) : createMode === 'cart' ? (
                                            /* CART MODE */
                                            <div className="space-y-4">
                                                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-purple-900 space-y-2">
                                                    <div className="flex items-center gap-2 font-bold">
                                                        <BoxIcon className="h-5 w-5" /> Tạo Mã Xe Đẩy / Rổ Gom
                                                    </div>
                                                    <p className="text-sm">
                                                        Tạo nhanh mã vạch dán lên xe đẩy hoặc rổ nhựa dùng để nhặt hàng (Picking Container).
                                                    </p>
                                                </div>

                                                <div className="space-y-4 bg-slate-50 p-4 rounded-lg border">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-bold uppercase text-slate-500">Số lượng cần tạo</label>
                                                            <input
                                                                type="number" min="1" max="50"
                                                                className="w-full h-10 px-3 rounded border"
                                                                placeholder="VD: 5"
                                                                value={bulkQty}
                                                                onChange={(e) => setBulkQty(e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-bold uppercase text-slate-500">Mẫu Mã</label>
                                                            <div className="text-xs text-slate-600 font-mono bg-white p-2 rounded border truncate">
                                                                CART-XX
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        onClick={() => {
                                                            const qty = parseInt(bulkQty)
                                                            if (qty > 0) handleCreateBulk(qty, true)
                                                            else alert("Vui lòng nhập số lượng hợp lệ")
                                                        }}
                                                        className="w-full bg-purple-600 hover:bg-purple-700"
                                                        disabled={loading}
                                                    >
                                                        {loading ? 'Đang tạo...' : 'Tạo Mã Xe Đẩy'}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* RETURN GOODS MODE */
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Khách Hàng</label>

                                                    {/* Searchable Customer Selection */}
                                                    <div className="border rounded-md p-3 bg-slate-50 space-y-2">
                                                        <Input
                                                            placeholder="🔍 Tìm tên hoặc mã khách hàng..."
                                                            className="bg-white"
                                                            onChange={(e) => {
                                                                // Simple local filtering
                                                                const term = e.target.value.toLowerCase()
                                                                // We'll filter in the render or separate state. 
                                                                // Better to filter the list directly below.
                                                                // Use a data attribute or class to hide/show? No, React state is cleaner.
                                                                // But here we need to insert state logic. 
                                                                // Since replace_file is limited, I'll rely on a new state added below or use a simplified approach.
                                                                // Wait, I can't add state here easily without replacing the whole file header.
                                                                // Strategy: Add the state in a separate replace call first, then use it here?
                                                                // Or just use a simple state I add now. I'll add `customerSearch` state in the header later/now.
                                                                setCustomerSearch(e.target.value)
                                                            }}
                                                            value={customerSearch}
                                                        />

                                                        <div className="max-h-40 overflow-y-auto border rounded bg-white shadow-sm space-y-1 p-1">
                                                            {customers
                                                                .filter(c =>
                                                                    !customerSearch ||
                                                                    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                                                                    c.code.toLowerCase().includes(customerSearch.toLowerCase())
                                                                )
                                                                .map(c => (
                                                                    <div
                                                                        key={c.code}
                                                                        className={`px-2 py-1.5 text-sm cursor-pointer rounded flex justify-between items-center ${returnCustomer === c.code ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100'}`}
                                                                        onClick={() => setReturnCustomer(c.code)}
                                                                    >
                                                                        <span>{c.name}</span>
                                                                        <span className="text-xs text-slate-400 font-mono bg-slate-50 px-1 rounded border">{c.code}</span>
                                                                    </div>
                                                                ))}
                                                            {customers.length === 0 && <div className="p-2 text-xs text-center text-slate-400">Đang tải danh sách...</div>}
                                                        </div>
                                                        {returnCustomer && (
                                                            <div className="text-xs text-blue-600 font-medium pt-1">
                                                                Đã chọn: <span className="font-bold">{customers.find(c => c.code === returnCustomer)?.name} ({returnCustomer})</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Từ Số (Start)</label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={returnStart}
                                                            onChange={e => setReturnStart(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Đến Số (End)</label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={returnEnd}
                                                            onChange={e => setReturnEnd(e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="bg-orange-50 p-4 rounded border border-orange-100 text-sm text-orange-800 space-y-2">
                                                    <div className="font-bold">Xem trước mã thùng:</div>
                                                    <div className="font-mono bg-white p-2 border rounded text-slate-700">
                                                        HTL-{returnCustomer || 'XXX'}-{returnStart.padStart(3, '0')}
                                                        <span className="mx-2">...</span>
                                                        HTL-{returnCustomer || 'XXX'}-{returnEnd.padStart(3, '0')}
                                                    </div>
                                                    <p className="text-xs opacity-75">* Hệ thống sẽ tự động bỏ qua nếu mã đã tồn tại</p>
                                                </div>

                                                <Button
                                                    onClick={handleCreateReturn}
                                                    disabled={loading}
                                                    className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                                                >
                                                    {loading ? 'Đang tạo...' : 'Tạo Thùng Hàng Trả Lại'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>
                            <Button variant="outline" onClick={handlePrintBatch} disabled={selectedIds.size === 0} className="w-full">
                                <Printer className="mr-2 h-4 w-4" /> In ({selectedIds.size})
                            </Button>
                            <Button variant="outline" onClick={handleExport} disabled={selectedIds.size === 0} className="w-full">
                                <Download className="mr-2 h-4 w-4" /> Xuất Excel ({selectedIds.size})
                            </Button>
                            <Button variant="secondary" onClick={handleExportAll} className="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
                                <Download className="mr-2 h-4 w-4" /> Xuất Toàn Bộ
                            </Button>
                        </div>

                        {/* Stats Dashboard - PIECE */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-sm text-slate-500 uppercase flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                Kho Hàng Lẻ (PIECE)
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 col-span-2">
                                    <div className="text-2xl font-bold text-blue-700">{statsPiece.total}</div>
                                    <div className="text-xs text-blue-600 font-medium">Tổng Thùng</div>
                                    <div className="mt-2 pt-2 border-t border-blue-200">
                                        <div className="text-[10px] text-blue-500 uppercase font-bold">Mã lớn nhất (Tháng này)</div>
                                        <div className="text-sm font-mono font-bold text-blue-800">{maxCodes.piece}</div>
                                    </div>

                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="text-xl font-bold text-slate-700">{statsPiece.empty}</div>
                                    <div className="text-xs text-slate-500 font-medium">Rỗng</div>
                                </div>
                                <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                                    <div className="text-xl font-bold text-yellow-700">{statsPiece.small}</div>
                                    <div className="text-xs text-yellow-600 font-medium">&lt; 50 SP</div>
                                </div>
                                <div className="bg-orange-50 p-3 rounded-xl border border-orange-200">
                                    <div className="text-xl font-bold text-orange-700">{statsPiece.medium}</div>
                                    <div className="text-xs text-orange-600 font-medium">50-100 SP</div>
                                </div>
                                <div className="bg-red-50 p-3 rounded-xl border border-red-200">
                                    <div className="text-xl font-bold text-red-700">{statsPiece.large}</div>
                                    <div className="text-xs text-red-600 font-medium">&gt; 100 SP</div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Dashboard - BULK */}
                        <div className="space-y-4 pt-4 border-t">
                            <h3 className="font-bold text-sm text-slate-500 uppercase flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                Kho Hàng Sỉ (BULK)
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-purple-50 p-3 rounded-xl border border-purple-100 col-span-2">
                                    <div className="text-2xl font-bold text-purple-700">{statsBulk.total}</div>
                                    <div className="text-xs text-purple-600 font-medium">Tổng Thùng</div>
                                    <div className="mt-2 pt-2 border-t border-purple-200">
                                        <div className="text-[10px] text-purple-500 uppercase font-bold">Mã lớn nhất (Tháng này)</div>
                                        <div className="text-sm font-mono font-bold text-purple-800">{maxCodes.bulk}</div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="text-xl font-bold text-slate-700">{statsBulk.empty}</div>
                                    <div className="text-xs text-slate-500 font-medium">Rỗng</div>
                                </div>
                                <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                                    <div className="text-xl font-bold text-yellow-700">{statsBulk.small}</div>
                                    <div className="text-xs text-yellow-600 font-medium">&lt; 50 SP</div>
                                </div>
                                <div className="bg-orange-50 p-3 rounded-xl border border-orange-200">
                                    <div className="text-xl font-bold text-orange-700">{statsBulk.medium}</div>
                                    <div className="text-xs text-orange-600 font-medium">50-100 SP</div>
                                </div>
                                <div className="bg-red-50 p-3 rounded-xl border border-red-200">
                                    <div className="text-xl font-bold text-red-700">{statsBulk.large}</div>
                                    <div className="text-xs text-red-600 font-medium">&gt; 100 SP</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL: TABLE */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm border flex flex-col h-full min-h-0 relative overflow-hidden">
                        <div className="border-b p-3 bg-slate-50 flex justify-between items-center rounded-t-xl shrink-0">
                            <h2 className="font-bold text-slate-700">Danh Sách Thùng</h2>
                            <div className="text-xs text-slate-400">
                                Hiển thị {boxes.length}/{totalCount} kết quả
                            </div>
                        </div>
                        <div className="overflow-auto flex-1">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white font-semibold text-slate-700 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 w-[40px] border-b"><Checkbox checked={boxes.length > 0 && selectedIds.size === boxes.length} onCheckedChange={toggleAll} /></th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('code')}>
                                            Mã Thùng {getSortIcon('code')}
                                        </th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('inventory_type')}>
                                            Loại {getSortIcon('inventory_type')}
                                        </th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('location')}>
                                            Vị Trí {getSortIcon('location')}
                                        </th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('item_count')}>
                                            Số Lượng {getSortIcon('item_count')}
                                        </th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('holding_order')}>
                                            Giữ Bởi Đơn {getSortIcon('holding_order')}
                                        </th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('created_at')}>
                                            Ngày Tạo {getSortIcon('created_at')}
                                        </th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('updated_at')}>
                                            Cập Nhật {getSortIcon('updated_at')}
                                        </th>
                                        <th className="p-3 border-b cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('status')}>
                                            Trạng Thái {getSortIcon('status')}
                                        </th>
                                        <th className="p-3 border-b text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {boxes.map(box => (
                                        <tr key={box.id} className="hover:bg-slate-50 cursor-pointer group" onClick={() => window.location.href = `/admin/boxes/${box.id}`}>
                                            <td className="p-3" onClick={e => e.stopPropagation()}>
                                                <Checkbox checked={selectedIds.has(box.id)} onCheckedChange={() => toggleSelect(box.id)} />
                                            </td>
                                            <td className="p-3 font-bold text-primary group-hover:underline">{box.code}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${box.inventory_type === 'BULK' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                    {box.inventory_type || 'PIECE'}
                                                </span>
                                            </td>
                                            <td className="p-3">{box.locations?.code || <span className="text-slate-300">-</span>}</td>
                                            <td className="p-3 font-bold">{box.item_count}</td>
                                            <td className="p-3" onClick={e => e.stopPropagation()}>
                                                {box.holding_order ? (
                                                    <a href={`/admin/outbound/${box.holding_order.id}`} className="text-xs font-bold text-blue-600 hover:underline">
                                                        {box.holding_order.code}
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-xs text-slate-500">{new Date(box.created_at).toLocaleDateString('vi-VN')}</td>
                                            <td className="p-3 text-xs text-slate-500">{(box as any).updated_at ? new Date((box as any).updated_at).toLocaleDateString('vi-VN') : '-'}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${box.status === 'OPEN' ? 'bg-green-50 text-green-600 border-green-200' :
                                                    box.status === 'LOCKED' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                                        'bg-slate-50 text-slate-500 border-slate-200'
                                                    }`}>
                                                    {box.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPrintBox(box)}><Printer className="h-4 w-4" /></Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50" onClick={() => handleDelete(box.id, box.item_count || 0)}><Trash2 className="h-4 w-4" /></Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls - Style matched with Inventory Page */}
                        <div className="p-3 border-t bg-slate-50 flex items-center justify-end">
                            <div className="flex items-center gap-1 bg-white border rounded-md px-2 py-1 h-10 shadow-sm">
                                <div className="text-xs text-muted-foreground mr-2 whitespace-nowrap hidden sm:block">
                                    {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)} / {totalCount}
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs font-medium px-1">{page}</div>
                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= Math.ceil(totalCount / PAGE_SIZE)} onClick={() => setPage(page + 1)}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Print Dialog (Preview) */}
                <Dialog open={!!printBox} onOpenChange={(open) => !open && setPrintBox(null)}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>In Mã Thùng</DialogTitle></DialogHeader>
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-slate-50">
                            {printBox && (
                                <>
                                    {/* Preview Area - Matches Print Output */}
                                    <div className="flex justify-center p-4 bg-slate-100 rounded-lg overflow-auto">
                                        {printBox && (
                                            <div className="print-label-container scale-75 origin-top shadow-lg">
                                                <div className="text-4xl font-bold uppercase tracking-wider mb-4">THÙNG</div>
                                                <div className="w-full max-w-[80%] aspect-square">
                                                    <QRCode
                                                        size={256}
                                                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                                        value={printBox.code}
                                                        viewBox={`0 0 256 256`}
                                                    />
                                                </div>
                                                <div className="text-4xl font-mono font-bold mt-6 break-all line-clamp-2">{printBox.code}</div>
                                            </div>
                                        )}
                                    </div>                </>
                            )}
                        </div>
                        <DialogFooter><Button onClick={() => printBox && triggerSinglePrint(printBox)}>In Ngay</Button></DialogFooter>
                    </DialogContent>
                </Dialog>




                {/* Drill Down Items */}
                <Dialog open={!!selectedBox} onOpenChange={(open) => !open && setSelectedBox(null)}>
                    <DialogContent className="max-w-xl">
                        <DialogHeader><DialogTitle>Hàng trong thùng {selectedBox?.code}</DialogTitle></DialogHeader>
                        <div className="space-y-2">
                            {boxItems.length === 0 ? <p className="text-center text-muted-foreground">Thùng rỗng</p> : (
                                <div className="border rounded divide-y max-h-[50vh] overflow-y-auto">
                                    {boxItems.map(item => (
                                        <div key={item.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                                            <div className="flex gap-3 items-center overflow-hidden">
                                                <div className="h-10 w-10 bg-slate-100 rounded flex items-center justify-center shrink-0">
                                                    <Package className="h-5 w-5 text-slate-500" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-sm truncate">{item.product_name || 'Sản phẩm không tên'}</div>
                                                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                                                        <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700 border">
                                                            SKU: {item.sku || '-'}
                                                        </span>
                                                        {item.barcode && (
                                                            <span className="bg-blue-50 px-1.5 py-0.5 rounded font-mono text-blue-700 border border-blue-100">
                                                                BC: {item.barcode}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="font-bold text-lg text-primary shrink-0 pl-2">x{item.quantity}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Button variant="secondary" className="w-full mt-4" onClick={() => setSelectedBox(null)}>Đóng</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </main>

            {/* PRINT AREA - HIDDEN NORMALLY */}
            <div style={{ overflow: "hidden", height: 0, width: 0, position: "absolute" }}>
                <div ref={printRef}>
                    <style type="text/css" media="print">
                        {`@page { size: 100mm 150mm; margin: 0; }`}
                    </style>
                    {printQueue.map(box => (
                        <div key={box.id} className="print-label-container break-after-page p-4">
                            <div className="text-4xl font-bold uppercase tracking-wider mb-4">THÙNG</div>
                            <div className="w-full max-w-[80%] aspect-square">
                                <QRCode
                                    size={256}
                                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                    value={box.code}
                                    viewBox={`0 0 256 256`}
                                />
                            </div>
                            <div className="text-4xl font-mono font-bold mt-6 break-all line-clamp-2">{box.code}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
