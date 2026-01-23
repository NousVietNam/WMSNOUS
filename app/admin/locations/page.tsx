"use client"

import { useEffect, useState, useRef } from "react"
import { useReactToPrint } from "react-to-print"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { MapPin, Plus, Printer, Trash2, Search, Box as BoxIcon, Package, Upload, Download, ChevronLeft, ChevronRight, Activity, PieChart, MoreHorizontal } from "lucide-react"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import * as XLSX from 'xlsx'
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

const PAGE_SIZE = 50

interface Location {
    id: string
    code: string
    type: 'SHELF' | 'BIN' | 'FLOOR'
    capacity: number
    description: string
    box_count?: number
    last_update?: string | null
}

export default function LocationsPage() {
    const [locations, setLocations] = useState<Location[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    // Sort & Filter state
    const [sortColumn, setSortColumn] = useState<string | null>(null)
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
    const [typeFilter, setTypeFilter] = useState<string>('ALL')
    const [occupancyFilter, setOccupancyFilter] = useState<string>('ALL')

    // Drill down state
    const [selectedLoc, setSelectedLoc] = useState<Location | null>(null)
    const [locBoxes, setLocBoxes] = useState<any[]>([])
    const [selectedBox, setSelectedBox] = useState<any | null>(null)
    const [boxItems, setBoxItems] = useState<any[]>([])

    // Form state
    const [openDialog, setOpenDialog] = useState(false)
    const [editingLoc, setEditingLoc] = useState<Location | null>(null)
    const [newCode, setNewCode] = useState("")
    const [newType, setNewType] = useState("SHELF")
    const [newCapacity, setNewCapacity] = useState("100")
    const [newDesc, setNewDesc] = useState("")

    // Pagination & Selection
    const [currentPage, setCurrentPage] = useState(1)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [printQueue, setPrintQueue] = useState<Location[]>([])

    const printRef = useRef(null)

    useEffect(() => {
        fetchLocations()
    }, [])

    const fetchLocations = async () => {
        setLoading(true)
        try {
            const { data: locData, error: locError } = await supabase
                .from('locations')
                .select(`*, boxes(count)`)
                .order('code')

            if (locError) throw locError

            const { data: txData, error: txError } = await supabase
                .from('transactions')
                .select('from_location_id, to_location_id, created_at')
                .order('created_at', { ascending: false })

            if (txError) throw txError

            const lastUpdateMap = new Map()
            txData?.forEach(tx => {
                if (tx.from_location_id && !lastUpdateMap.has(tx.from_location_id)) {
                    lastUpdateMap.set(tx.from_location_id, tx.created_at)
                }
                if (tx.to_location_id && !lastUpdateMap.has(tx.to_location_id)) {
                    lastUpdateMap.set(tx.to_location_id, tx.created_at)
                }
            })

            const enriched = (locData || []).map((d: any) => ({
                ...d,
                box_count: d.boxes?.[0]?.count || 0,
                last_update: lastUpdateMap.get(d.id) || null
            }))

            setLocations(enriched)
        } catch (error: any) {
            toast.error("Lỗi tải dữ liệu: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!newCode) return toast.error("Vui lòng nhập mã vị trí")

        const payload = {
            code: newCode.toUpperCase(),
            type: newType,
            capacity: parseInt(newCapacity),
            description: newDesc
        }

        let error
        if (editingLoc) {
            const res = await supabase.from('locations').update(payload).eq('id', editingLoc.id)
            error = res.error
        } else {
            const res = await supabase.from('locations').insert(payload)
            error = res.error
        }

        if (error) {
            toast.error("Lỗi: " + error.message)
        } else {
            setOpenDialog(false)
            fetchLocations()
            toast.success(editingLoc ? "Đã cập nhật vị trí" : "Đã tạo vị trí mới")
        }
    }

    const handleDelete = async (id: string, count: number) => {
        if (count > 0) return toast.error(`Không thể xoá! Vị trí này đang chứa ${count} thùng.`)
        if (!confirm("Bạn chắc chắn muốn xoá vị trí này?")) return
        const { error } = await supabase.from('locations').delete().eq('id', id)
        if (error) toast.error("Lỗi xoá: " + error.message)
        else {
            toast.success("Đã xoá vị trí")
            fetchLocations()
        }
    }

    const handleViewDetails = async (loc: Location) => {
        setSelectedLoc(loc)
        const { data, error } = await supabase
            .from('boxes')
            .select('*, inventory_items(count)')
            .eq('location_id', loc.id)
            .order('code')

        if (error) toast.error("Lỗi tải thùng: " + error.message)
        else setLocBoxes(data || [])
    }

    const handleViewBoxItems = async (box: any) => {
        setSelectedBox(box)
        const { data, error } = await supabase
            .from('inventory_items')
            .select('*, products(name, sku)')
            .eq('box_id', box.id)

        if (error) toast.error("Lỗi tải chi tiết: " + error.message)
        else setBoxItems(data || [])
    }

    const handleReactToPrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Labels-${new Date().toISOString()}`,
        onAfterPrint: () => setPrintQueue([])
    })

    const handlePrintBatch = () => {
        const selected = locations.filter(l => selectedIds.has(l.id))
        if (selected.length === 0) return
        setPrintQueue(selected)
        setTimeout(() => handleReactToPrint(), 100)
    }

    const handleSinglePrint = (loc: Location) => {
        setPrintQueue([loc])
        setTimeout(() => handleReactToPrint(), 100)
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        setLoading(true)
        const tid = toast.loading("Đang nhập dữ liệu...")
        try {
            const res = await fetch('/api/seed-locations', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.success) {
                toast.success(`Đã nhập ${data.count} vị trí`, { id: tid })
                fetchLocations()
            } else {
                toast.error("Lỗi: " + data.error, { id: tid })
            }
        } catch (err: any) {
            toast.error("Lỗi hệ thống", { id: tid })
        } finally {
            setLoading(false)
            e.target.value = ''
        }
    }

    const handleDownloadExample = () => {
        const data = [["code", "type", "capacity", "description"], ["A1-01", "SHELF", "100", "Ví dụ"]]
        const ws = XLSX.utils.aoa_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Template")
        XLSX.writeFile(wb, "locations_template.xlsx")
    }

    const handleSort = (col: string) => {
        if (sortColumn === col) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
        else { setSortColumn(col); setSortDirection('asc'); }
    }

    const getSortIcon = (col: string) => sortColumn === col ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : null

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const filtered = locations.filter(l => {
        const matchSearch = l.code.toLowerCase().includes(searchTerm.toLowerCase()) || (l.description || "").toLowerCase().includes(searchTerm.toLowerCase())
        const matchType = typeFilter === 'ALL' || l.type === typeFilter
        const occupancy = (l.box_count || 0) / l.capacity
        let matchOcc = true
        if (occupancyFilter === 'EMPTY') matchOcc = l.box_count === 0
        else if (occupancyFilter === 'LOW') matchOcc = (l.box_count || 0) > 0 && occupancy < 0.5
        else if (occupancyFilter === 'HIGH') matchOcc = occupancy >= 0.5 && occupancy < 1
        else if (occupancyFilter === 'FULL') matchOcc = occupancy >= 1
        return matchSearch && matchType && matchOcc
    })

    if (sortColumn) {
        filtered.sort((a, b) => {
            let av: any = a[sortColumn as keyof Location]
            let bv: any = b[sortColumn as keyof Location]
            if (sortColumn === 'box_count') { av = a.box_count || 0; bv = b.box_count || 0; }
            return sortDirection === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
        })
    }

    const totalItems = filtered.length
    const totalPages = Math.ceil(totalItems / PAGE_SIZE)
    const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

    const stats = {
        total: locations.length,
        occupied: locations.filter(l => (l.box_count || 0) > 0).length,
        empty: locations.filter(l => (l.box_count || 0) === 0).length,
        full: locations.filter(l => (l.box_count || 0) >= l.capacity).length,
        recent: locations.filter(l => l.last_update && (Date.now() - new Date(l.last_update).getTime() < 86400000)).length
    }
    const occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0

    return (
        <div className="h-[calc(100vh-74px)] flex flex-col bg-slate-50 overflow-hidden">
            <main className="flex-1 p-6 space-y-6 h-full overflow-hidden flex flex-col print:hidden">
                <div className="flex flex-col md:flex-row gap-6 h-full items-start overflow-hidden">
                    <div className="w-full md:w-80 space-y-6 flex-shrink-0 h-full overflow-y-auto pr-1 thin-scrollbar">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-5 sticky top-0 z-20">
                            <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800"><MapPin className="h-6 w-6 text-indigo-600" /> Quản Lý Vị Trí</h1>
                            <div className="space-y-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input placeholder="Tìm mã..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue placeholder="Loại" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả</SelectItem><SelectItem value="SHELF">Kệ</SelectItem><SelectItem value="BIN">Bin</SelectItem><SelectItem value="FLOOR">Sàn</SelectItem></SelectContent></Select>
                                    <Select value={occupancyFilter} onValueChange={setOccupancyFilter}><SelectTrigger><SelectValue placeholder="Trạng thái" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả</SelectItem><SelectItem value="EMPTY">Trống</SelectItem><SelectItem value="LOW">Còn chỗ</SelectItem><SelectItem value="HIGH">Sắp đầy</SelectItem><SelectItem value="FULL">Đầy</SelectItem></SelectContent></Select>
                                </div>
                                <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => { setEditingLoc(null); setNewCode(""); setOpenDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Thêm Mới</Button>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" size="sm" onClick={handlePrintBatch} disabled={selectedIds.size === 0}><Printer className="mr-1.5 h-3.5 w-3.5" /> In ({selectedIds.size})</Button>
                                    <Button variant="outline" size="sm" onClick={handleDownloadExample}><Download className="mr-1.5 h-3.5 w-3.5" /> Mẫu</Button>
                                    <Button variant="outline" size="sm" className="col-span-2 relative">
                                        <Upload className="mr-1.5 h-3.5 w-3.5" /> Import Excel
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImport} />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg col-span-2 relative overflow-hidden text-white">
                                <div className="absolute -right-4 -top-4 text-white/10 rotate-12"><PieChart size={100} /></div>
                                <div className="relative z-10">
                                    <div className="text-3xl font-black">{occupancyRate}%</div>
                                    <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"><Activity size={12} /> Tỷ Lệ Lấp Đầy</div>
                                    <div className="mt-3 w-full bg-white/20 h-1.5 rounded-full overflow-hidden"><div className="bg-white h-full" style={{ width: `${occupancyRate}%` }} /></div>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border shadow-sm">
                                <div className="text-xl font-bold">{stats.total}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase">Tổng Vị Trí</div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border shadow-sm">
                                <div className="text-xl font-bold text-emerald-600">{stats.empty}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase">Đang Trống</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-2xl shadow-sm border flex flex-col h-full overflow-hidden">
                        <div className="border-b p-4 bg-slate-50/50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Badge variant="secondary" className="bg-white border text-slate-700 font-bold">Dữ Liệu Vị Trí</Badge>
                                <span className="text-xs text-slate-400 font-mono uppercase">{totalItems} kết quả</span>
                            </div>
                            {selectedIds.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Bỏ chọn ({selectedIds.size})</Button>}
                        </div>
                        <div className="flex-1 overflow-auto thin-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10 text-[10px] uppercase font-bold text-slate-500 shadow-sm">
                                    <tr>
                                        <th className="p-4 w-10"><Checkbox checked={selectedIds.size === paginated.length} onCheckedChange={() => setSelectedIds(new Set(selectedIds.size ? [] : paginated.map(l => l.id)))} /></th>
                                        {['code', 'type', 'box_count'].map(c => (
                                            <th key={c} className="p-4 cursor-pointer hover:text-indigo-600" onClick={() => handleSort(c)}>{c === 'box_count' ? 'Lấp đầy' : c === 'code' ? 'Mã' : 'Loại'} {getSortIcon(c)}</th>
                                        ))}
                                        <th className="p-4 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(loc => {
                                        const occ = Math.min(100, Math.round(((loc.box_count || 0) / loc.capacity) * 100))
                                        return (
                                            <tr key={loc.id} className="border-b hover:bg-slate-50/50 cursor-pointer" onClick={() => handleViewDetails(loc)}>
                                                <td className="p-4" onClick={e => e.stopPropagation()}><Checkbox checked={selectedIds.has(loc.id)} onCheckedChange={() => toggleSelect(loc.id)} /></td>
                                                <td className="p-4 font-bold text-slate-800">{loc.code}</td>
                                                <td className="p-4"><Badge variant="outline" className="text-[10px]">{loc.type}</Badge></td>
                                                <td className="p-4 w-40">
                                                    <div className="text-[10px] flex justify-between mb-1"><span>{loc.box_count}/{loc.capacity} THÙNG</span><span>{occ}%</span></div>
                                                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${occ > 90 ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${occ}%` }} /></div>
                                                </td>
                                                <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingLoc(loc); setNewCode(loc.code); setNewType(loc.type); setNewCapacity(loc.capacity.toString()); setNewDesc(loc.description || ""); setOpenDialog(true); }}><MoreHorizontal className="h-4 w-4" /></Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSinglePrint(loc)}><Printer className="h-4 w-4" /></Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => handleDelete(loc.id, loc.box_count || 0)}><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t bg-slate-50/50 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400">Trang {currentPage} / {totalPages}</span>
                            <div className="flex gap-1">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Dialog open={openDialog} onOpenChange={setOpenDialog}><DialogContent><DialogHeader><DialogTitle>{editingLoc ? 'Sửa Vị Trí' : 'Thêm Vị Trí'}</DialogTitle></DialogHeader><div className="space-y-4 py-4"><div className="space-y-1"><label className="text-xs font-bold uppercase">Mã</label><Input value={newCode} onChange={e => setNewCode(e.target.value)} /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-xs font-bold uppercase">Loại</label><Select value={newType} onValueChange={setNewType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SHELF">Kệ</SelectItem><SelectItem value="BIN">Bin</SelectItem><SelectItem value="FLOOR">Sàn</SelectItem></SelectContent></Select></div><div className="space-y-1"><label className="text-xs font-bold uppercase">Sức chứa</label><Input type="number" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} /></div></div><div className="space-y-1"><label className="text-xs font-bold uppercase">Mô tả</label><Input value={newDesc} onChange={e => setNewDesc(e.target.value)} /></div><Button className="w-full bg-indigo-600" onClick={handleSave}>Lưu thay đổi</Button></div></DialogContent></Dialog>
            <Dialog open={!!selectedLoc} onOpenChange={o => !o && setSelectedLoc(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Thùng tại {selectedLoc?.code}</DialogTitle></DialogHeader><div className="space-y-4 max-h-[60vh] overflow-auto thin-scrollbar">{locBoxes.length ? locBoxes.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 cursor-pointer" onClick={() => handleViewBoxItems(b)}>
                    <div className="flex items-center gap-3"><BoxIcon className="text-indigo-600" /><div><div className="font-bold">{b.code}</div><div className="text-[10px] text-slate-400 capitalize">{b.status}</div></div></div>
                    <div className="font-bold text-slate-700">{b.inventory_items?.[0]?.count || 0} hàng</div>
                </div>
            )) : <p className="text-center p-10 text-slate-400 italic">Trống</p>}</div></DialogContent></Dialog>
            <Dialog open={!!selectedBox} onOpenChange={o => !o && setSelectedBox(null)}><DialogContent><DialogHeader><DialogTitle>Hàng trong {selectedBox?.code}</DialogTitle></DialogHeader><div className="space-y-3">{boxItems.length ? boxItems.map(i => (
                <div key={i.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"><div className="flex items-center gap-3"><Package size={16} className="text-emerald-500" /><div><div className="text-sm font-bold">{i.products?.name}</div><div className="text-[10px] text-slate-400">{i.products?.sku}</div></div></div><div className="font-black text-indigo-600">x{i.quantity}</div></div>
            )) : <p className="text-center p-5 text-slate-400 italic">Rỗng</p>}<Button className="w-full mt-4" variant="secondary" onClick={() => setSelectedBox(null)}>Đóng</Button></div></DialogContent></Dialog>

            <div style={{ position: "fixed", opacity: 0, pointerEvents: "none" }}>
                <div ref={printRef} className="print:w-full">
                    <style type="text/css" media="print">
                        {`@page { size: 100mm 150mm; margin: 0; }`}
                    </style>
                    {printQueue.map(l => (
                        <div key={l.id} className="flex flex-col items-center justify-center border-black p-6 break-after-page text-center" style={{ width: '100mm', height: '145mm' }}>
                            <div className="text-3xl font-black mb-4 uppercase tracking-widest">VỊ TRÍ</div>
                            <div className="w-full flex justify-center mb-6">
                                <QRCode size={280} value={l.code} style={{ height: "auto", maxWidth: "85%", width: "85%" }} />
                            </div>
                            <div className="text-5xl font-mono font-black w-full whitespace-nowrap overflow-hidden px-2">
                                {l.code}
                            </div>
                            <div className="text-xl font-bold text-slate-500 mt-4 border-t border-slate-200 pt-2 w-1/2 uppercase">
                                {l.type}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
