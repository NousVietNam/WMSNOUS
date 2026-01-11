"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { MapPin, Plus, Printer, Trash2, Search, Box as BoxIcon, Package } from "lucide-react"
import QRCode from "react-qr-code"

interface Location {
    id: string
    code: string
    type: 'SHELF' | 'BIN' | 'FLOOR'
    capacity: number
    description: string
    box_count?: number
    boxes?: { count: number }[]
}

export default function LocationsPage() {
    const [locations, setLocations] = useState<Location[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    // Dialogs
    const [openDialog, setOpenDialog] = useState(false) // Create
    const [selectedLoc, setSelectedLoc] = useState<Location | null>(null) // Drill down view
    const [locBoxes, setLocBoxes] = useState<any[]>([]) // Boxes in selected loc
    const [selectedBox, setSelectedBox] = useState<any | null>(null) // Items in selected box
    const [boxItems, setBoxItems] = useState<any[]>([]) // Items

    // Form state
    const [newCode, setNewCode] = useState("")
    const [newType, setNewType] = useState("SHELF")
    const [newCapacity, setNewCapacity] = useState("100")
    const [newDesc, setNewDesc] = useState("")

    // Print State
    const [printLocation, setPrintLocation] = useState<Location | null>(null)

    useEffect(() => {
        fetchLocations()
    }, [])

    const fetchLocations = async () => {
        setLoading(true)
        // Fetch locations with count of boxes
        const { data, error } = await supabase
            .from('locations')
            .select('*, boxes(count)')
            .order('code')

        if (!error && data) {
            const mapped = data.map((d: any) => ({
                ...d,
                box_count: d.boxes?.[0]?.count || 0
            }))
            setLocations(mapped)
        }
        setLoading(false)
    }

    const handleCreate = async () => {
        if (!newCode) return alert("Vui lòng nhập mã vị trí")

        const { error } = await supabase.from('locations').insert({
            code: newCode.toUpperCase(),
            type: newType,
            capacity: parseInt(newCapacity),
            description: newDesc
        })

        if (error) {
            alert("Lỗi: " + error.message)
        } else {
            setOpenDialog(false)
            fetchLocations()
            setNewCode("")
            setNewDesc("")
        }
    }

    const handleDelete = async (id: string, count: number) => {
        if (count > 0) {
            alert(`Không thể xoá! Vị trí này đang chứa ${count} thùng.`)
            return
        }
        if (!confirm("Bạn chắc chắn muốn xoá vị trí này?")) return
        const { error } = await supabase.from('locations').delete().eq('id', id)
        if (error) alert("Lỗi xoá: " + error.message)
        else fetchLocations()
    }

    // Drill down logic
    const handleViewDetails = async (loc: Location) => {
        setSelectedLoc(loc)
        // Fetch boxes in this location
        const { data } = await supabase
            .from('boxes')
            .select('*, inventory_items(count)')
            .eq('location_id', loc.id)
            .order('code')

        if (data) setLocBoxes(data)
    }

    const handleViewBoxItems = async (box: any) => {
        setSelectedBox(box)
        const { data } = await supabase
            .from('inventory_items')
            .select('*, products(name, sku)')
            .eq('box_id', box.id)

        if (data) setBoxItems(data)
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        setLoading(true)
        const res = await fetch('/api/seed-locations', { method: 'POST', body: formData })
        const data = await res.json()
        setLoading(false)
        if (data.success) {
            alert(`Đã nhập thành công ${data.count} vị trí!`)
            fetchLocations()
        } else {
            alert("Lỗi: " + data.error)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    const filteredLocations = locations.filter(l =>
        l.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">            <main className="flex-1 p-6 space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <MapPin className="h-8 w-8 text-primary" />
                        Quản Lý Vị Trí
                    </h1>
                    <div className="flex flex-1 w-full md:w-auto md:max-w-sm gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm kiếm vị trí..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Button variant="outline" className="cursor-pointer">
                                Import CSV
                                <input type="file" accept=".csv" onChange={handleImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            </Button>
                        </div>
                        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Thêm</Button></DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Tạo Vị Trí Mới</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Mã</label>
                                        <Input placeholder="A1-01" value={newCode} onChange={e => setNewCode(e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Loại</label>
                                            <Select value={newType} onValueChange={setNewType}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="SHELF">Kệ</SelectItem>
                                                    <SelectItem value="BIN">Bin</SelectItem>
                                                    <SelectItem value="FLOOR">Sàn</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Sức Chứa</label>
                                            <Input type="number" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Mô tả</label>
                                        <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                                    </div>
                                    <Button className="w-full" onClick={handleCreate}>Lưu</Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-md border shadow-sm flex-1 flex flex-col min-h-0">
                    <div className="rounded-md border overflow-auto relative flex-1">
                        <table className="w-full text-sm text-left relative">
                            <thead className="bg-slate-100 font-medium text-slate-700 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4">Mã Vị Trí</th>
                                    <th className="p-4">Loại</th>
                                    <th className="p-4">Hiện Tại</th>
                                    <th className="p-4">Sức Chứa</th>
                                    <th className="p-4">Mô tả</th>
                                    <th className="p-4 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLocations.map(loc => (
                                    <tr key={loc.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => handleViewDetails(loc)}>
                                        <td className="p-4 font-bold text-primary underline">{loc.code}</td>
                                        <td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{loc.type}</span></td>
                                        <td className="p-4">
                                            <span className={`font-bold ${loc.box_count! > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                                {loc.box_count} thùng
                                            </span>
                                        </td>
                                        <td className="p-4">{loc.capacity}</td>
                                        <td className="p-4 text-muted-foreground">{loc.description}</td>
                                        <td className="p-4 text-right flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                            <Button size="sm" variant="outline" onClick={() => setPrintLocation(loc)}><Printer className="h-4 w-4" /></Button>
                                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(loc.id, loc.box_count || 0)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Print Dialog */}
                <Dialog open={!!printLocation} onOpenChange={(open) => !open && setPrintLocation(null)}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>In Mã Vị Trí</DialogTitle></DialogHeader>
                        <div className="flex flex-col items-center p-6 border-2 border-dashed rounded-lg" id="print-area">
                            {printLocation && (
                                <>
                                    <h2 className="text-3xl font-bold mb-2">{printLocation.code}</h2>
                                    <QRCode value={printLocation.code} size={200} />
                                    <p className="mt-2 text-sm">{printLocation.type}</p>
                                </>
                            )}
                        </div>
                        <Button onClick={handlePrint}>In Ngay</Button>
                    </DialogContent>
                </Dialog>

                {/* Drill Down Dialog: List Boxes */}
                <Dialog open={!!selectedLoc} onOpenChange={(open) => !open && setSelectedLoc(null)}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Danh sách Thùng tại {selectedLoc?.code}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            {locBoxes.length === 0 ? (
                                <p className="text-center text-muted-foreground p-4">Vị trí trống</p>
                            ) : (
                                <div className="grid gap-2">
                                    {locBoxes.map(box => (
                                        <div
                                            key={box.id}
                                            className="flex items-center justify-between p-3 border rounded hover:bg-slate-50 cursor-pointer"
                                            onClick={() => handleViewBoxItems(box)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <BoxIcon className="h-5 w-5 text-blue-600" />
                                                <div>
                                                    <div className="font-bold">{box.code}</div>
                                                    <div className="text-xs text-muted-foreground">Trạng thái: {box.status}</div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-medium">
                                                {/* Use computed count if available, mostly it is count objects */}
                                                {box.inventory_items?.[0]?.count || 0} món
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Nested Dialog: List Items */}
                <Dialog open={!!selectedBox} onOpenChange={(open) => !open && setSelectedBox(null)}>
                    <DialogContent className="max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Hàng trong thùng {selectedBox?.code}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2">
                            {boxItems.length === 0 ? (
                                <p className="text-center text-muted-foreground">Thùng rỗng</p>
                            ) : (
                                <div className="border rounded divide-y max-h-[50vh] overflow-y-auto">
                                    {boxItems.map(item => (
                                        <div key={item.id} className="p-3 flex justify-between items-center">
                                            <div className="flex gap-3 items-center">
                                                <Package className="h-5 w-5 text-green-600" />
                                                <div>
                                                    <div className="font-bold text-sm">{item.products?.name}</div>
                                                    <div className="text-xs text-muted-foreground">{item.products?.sku}</div>
                                                </div>
                                            </div>
                                            <div className="font-bold text-lg">x{item.quantity}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Button variant="secondary" className="w-full mt-4" onClick={() => setSelectedBox(null)}>Quay Lai</Button>
                        </div>
                    </DialogContent>
                </Dialog>

            </main>
        </div >
    )
}
