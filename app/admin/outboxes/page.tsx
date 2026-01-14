"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { Plus, Printer, RefreshCw, Trash2, Box, Download } from "lucide-react"
import QRCode from "react-qr-code"
import * as XLSX from 'xlsx'
import { useReactToPrint } from "react-to-print"
import { saveAs } from 'file-saver'

const getDefaultDateStr = () => {
    const d = new Date()
    const day = d.getDate().toString().padStart(2, '0')
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    const year = d.getFullYear().toString().slice(-2)
    return `${day}${month}${year}`
}

export default function OutboxPage() {
    // Data State
    const [outboxes, setOutboxes] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)

    // Filters
    const [searchCode, setSearchCode] = useState("")
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
    const [filterOrder, setFilterOrder] = useState("")

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Create Form
    const [formData, setFormData] = useState({
        prefix: "OUT",
        from: "1",
        to: "50",
        dateStr: getDefaultDateStr()
    })

    const fetchOutboxes = async () => {
        setLoading(true)
        let query = supabase
            .from('boxes')
            .select('*, orders (code), inventory_items (quantity)')
            .eq('type', 'OUTBOX')
            .order('code', { ascending: true })

        if (searchCode) query = query.ilike('code', `%${searchCode}%`)
        if (filterDate) {
            const [y, m, d] = filterDate.split('-')
            const dateStr = `${d}${m}${y.slice(-2)}`
            query = query.ilike('code', `%${dateStr}%`)
        }

        const { data, error } = await query
        if (error) alert(error.message)
        else {
            let result = data || []
            if (filterOrder) result = result.filter(b => b.orders?.code?.toLowerCase().includes(filterOrder.toLowerCase()))
            setOutboxes(result)
        }
        setLoading(false)
    }

    useEffect(() => { fetchOutboxes() }, [filterDate])

    const handleCreate = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/outboxes/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            const result = await response.json()

            if (!response.ok || !result.success) {
                setLoading(false)
                return alert(result.error || "Lỗi tạo thùng xuất")
            }

            alert(`Đã tạo ${result.count} thùng xuất thành công!`)
            setCreateOpen(false)
            fetchOutboxes()
        } catch (e: any) {
            console.error('Create outbox error:', e)
            alert("Lỗi: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string, count: number) => {
        if (count > 0) return alert(`Không thể xoá! Chứa ${count} SP.`)
        if (confirm("Xoá thùng này?")) {
            await supabase.from('boxes').delete().eq('id', id)
            fetchOutboxes()
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return alert("Chọn ít nhất 1 thùng để xóa")

        // Check if any selected boxes have items
        const selectedBoxes = outboxes.filter(b => selectedIds.has(b.id))
        const boxesWithItems = selectedBoxes.filter(b => (b.inventory_items?.[0]?.count || 0) > 0)

        if (boxesWithItems.length > 0) {
            return alert(`Không thể xóa! ${boxesWithItems.length} thùng đang chứa sản phẩm.`)
        }

        if (!confirm(`Xác nhận xóa ${selectedIds.size} thùng rỗng?`)) return

        const { error } = await supabase.from('boxes').delete().in('id', Array.from(selectedIds))
        if (error) alert("Lỗi: " + error.message)
        else {
            setSelectedIds(new Set())
            fetchOutboxes()
        }
    }

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const selectAll = () => {
        if (selectedIds.size === outboxes.length) setSelectedIds(new Set())
        else setSelectedIds(new Set(outboxes.map(b => b.id)))
    }

    const handleExport = async () => {
        if (selectedIds.size === 0) return alert("Vui lòng chọn ít nhất 1 thùng")

        try {
            setLoading(true)
            const response = await fetch('/api/export/boxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boxIds: Array.from(selectedIds) })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Lỗi xuất file')
            }

            const blob = await response.blob()
            const filename = `Export_Outboxes_${new Date().toISOString().split('T')[0]}.xlsx`
            saveAs(blob, filename)
        } catch (e: any) {
            alert(e.message)
        } finally {
            setLoading(false)
        }
    }

    // Print State
    const [printBox, setPrintBox] = useState<any | null>(null) // For Modal Preview
    const [printQueue, setPrintQueue] = useState<any[]>([]) // For Actual Print Job

    const printRef = useRef(null)
    const handleReactToPrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Outbox-Labels-${new Date().toISOString()}`,
        pageStyle: `
        @page {
            size: 100mm 150mm;
            margin: 0;
        }
    `,
        onAfterPrint: () => setPrintQueue([])
    })

    const triggerPrint = (items: any[]) => {
        setPrintQueue(items)
        setTimeout(() => handleReactToPrint(), 100)
    }

    // --- TRIGGER PRINT ---
    const triggerBatchPrint = () => {
        if (selectedIds.size === 0) return alert("Chọn thùng để in")
        const queue = outboxes.filter(b => selectedIds.has(b.id))
        triggerPrint(queue)
    }

    const triggerSinglePrint = (box: any) => {
        triggerPrint([box])
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* MAIN CONTENT - HIDDEN WHEN PRINTING */}
            <main className="flex-1 p-6 space-y-6 print:hidden">
                <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Box className="h-8 w-8 text-primary" /> Quản Lý Thùng Xuất (Outbox)
                    </h1>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={triggerBatchPrint} disabled={selectedIds.size === 0}>
                            <Printer className="mr-2 h-4 w-4" /> In Đã Chọn
                        </Button>
                        <Button variant="outline" onClick={handleExport} disabled={selectedIds.size === 0}>
                            <Download className="mr-2 h-4 w-4" /> Excel
                        </Button>
                        <Button variant="outline" onClick={handleBulkDelete} disabled={selectedIds.size === 0} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="mr-2 h-4 w-4" /> Xóa Đã Chọn ({selectedIds.size})
                        </Button>
                        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Tạo Mới</Button></DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Tạo Thùng</DialogTitle></DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">Prefix</Label><Input value={formData.prefix} onChange={e => setFormData({ ...formData, prefix: e.target.value })} className="col-span-3" /></div>
                                    <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">Date</Label><Input value={formData.dateStr} onChange={e => setFormData({ ...formData, dateStr: e.target.value })} className="col-span-3" /></div>
                                    <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">From</Label><Input value={formData.from} onChange={e => setFormData({ ...formData, from: e.target.value })} className="col-span-3" /></div>
                                    <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">To</Label><Input value={formData.to} onChange={e => setFormData({ ...formData, to: e.target.value })} className="col-span-3" /></div>
                                </div>
                                <DialogFooter><Button onClick={handleCreate}>Xác Nhận</Button></DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Filter UI */}
                <div className="bg-white p-4 rounded-lg border flex flex-col md:flex-row gap-4 items-end">
                    <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-[150px]" />
                    <Input placeholder="Mã thùng..." value={searchCode} onChange={e => setSearchCode(e.target.value)} className="flex-1" />
                    <Button onClick={fetchOutboxes}><RefreshCw className="h-4 w-4" /></Button>
                </div>

                {/* Table */}
                <div className="bg-white p-4 rounded-md border shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 font-medium">
                            <tr>
                                <th className="p-3 w-10 text-center"><input type="checkbox" onChange={selectAll} checked={outboxes.length > 0 && selectedIds.size === outboxes.length} className="w-4 h-4" /></th>
                                <th className="p-3 text-left">Mã Thùng</th>
                                <th className="p-3 text-left">Đơn Hàng</th>
                                <th className="p-3 text-center">SL</th>
                                <th className="p-3 text-center">TT</th>
                                <th className="p-3 text-right">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {outboxes.map(box => (
                                <tr key={box.id} className="hover:bg-slate-50">
                                    <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.has(box.id)} onChange={() => toggleSelect(box.id)} className="w-4 h-4" /></td>
                                    <td className="p-3 font-bold text-blue-700 cursor-pointer" onClick={() => setPrintBox(box)}>{box.code}</td>
                                    <td className="p-3">{box.orders?.code || '-'}</td>
                                    <td className="p-3 text-center">{box.inventory_items?.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0) || 0}</td>
                                    <td className="p-3 text-center">{box.status}</td>
                                    <td className="p-3 text-right flex justify-end gap-2">
                                        <Button size="sm" variant="outline" onClick={() => setPrintBox(box)}><Printer className="h-4 w-4" /></Button>
                                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(box.id, box.inventory_items?.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0) || 0)}><Trash2 className="h-4 w-4" /></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* PREVIEW MODAL */}
            <Dialog open={!!printBox} onOpenChange={open => !open && setPrintBox(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Xem Trước Tem In</DialogTitle></DialogHeader>
                    {/* Preview Area */}
                    <div className="flex justify-center p-4 bg-slate-100 rounded-lg overflow-auto">
                        {printBox && (
                            <div className="print-label-container scale-75 origin-top shadow-lg">
                                <div className="text-4xl font-bold uppercase tracking-wider mb-4">OUTBOX</div>
                                <div className="w-full max-w-[80%] aspect-square">
                                    <QRCode
                                        size={256}
                                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                        value={printBox.code}
                                        viewBox={`0 0 256 256`}
                                    />
                                </div>
                                <div className="text-3xl font-mono font-bold mt-6 break-all line-clamp-2">{printBox.code}</div>
                            </div>
                        )}
                    </div>        <div className="text-sm text-muted-foreground mt-2">Khổ in: 100x150mm</div>
                    <DialogFooter>
                        <Button onClick={() => triggerSinglePrint(printBox)}>In Ngay</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PRINT AREA - HIDDEN NORMALLY */}
            <div style={{ overflow: "hidden", height: 0, width: 0, position: "absolute" }}>
                <div ref={printRef}>
                    <style type="text/css" media="print">
                        {`@page { size: 100mm 150mm; margin: 0; }`}
                    </style>
                    {printQueue.map(box => (
                        <div key={box.id} className="print-label-container break-after-page p-4">
                            <div className="text-4xl font-bold uppercase tracking-wider mb-4">OUTBOX</div>
                            <div className="w-full max-w-[80%] aspect-square">
                                <QRCode
                                    size={256}
                                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                    value={box.code}
                                    viewBox={`0 0 256 256`}
                                />
                            </div>
                            <div className="text-3xl font-mono font-bold mt-6 break-all line-clamp-2">{box.code}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
