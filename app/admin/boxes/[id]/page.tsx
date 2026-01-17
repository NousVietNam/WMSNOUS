"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Box as BoxIcon, Printer, MoveRight } from "lucide-react"
import QRCode from "react-qr-code"
import { toast } from "sonner"

export default function BoxDetailPage() {
    const params = useParams()
    const idOrCode = params.id as string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [box, setBox] = useState<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [items, setItems] = useState<any[]>([])
    const router = useRouter()

    // Transfer feature state
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
    const [transferDialogOpen, setTransferDialogOpen] = useState(false)
    const [destinationBoxCode, setDestinationBoxCode] = useState("")
    const [transferring, setTransferring] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    useEffect(() => {
        fetchBox()
        // Get current user for audit
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) setCurrentUserId(data.user.id)
        })
    }, [idOrCode])

    const fetchBox = async () => {
        // Fetch Box
        let query = supabase.from('boxes').select('*, locations(code)')

        // UUID check regex (loose)
        if (idOrCode.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/)) {
            query = query.eq('id', idOrCode)
        } else {
            query = query.eq('code', idOrCode)
        }

        const { data: boxData, error } = await query.single()

        if (error || !boxData) {
            alert("Không tìm thấy thùng!")
            router.push('/admin/boxes')
            return
        }

        setBox(boxData)

        // Fetch Items in Box
        const { data: itemData } = await supabase
            .from('inventory_items')
            .select('*, product:products(*)')
            .eq('box_id', boxData.id)

        if (itemData) setItems(itemData)

        // Clear selection
        setSelectedItems(new Set())
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedItems(new Set(items.map(item => item.id)))
        } else {
            setSelectedItems(new Set())
        }
    }

    const handleSelectItem = (itemId: string, checked: boolean) => {
        const newSelection = new Set(selectedItems)
        if (checked) {
            newSelection.add(itemId)
        } else {
            newSelection.delete(itemId)
        }
        setSelectedItems(newSelection)
    }

    const handleTransferClick = () => {
        if (selectedItems.size === 0) {
            toast.error("Vui lòng chọn ít nhất 1 sản phẩm để chuyển")
            return
        }
        setTransferDialogOpen(true)
    }

    const handleTransferConfirm = async () => {
        if (!destinationBoxCode.trim()) {
            toast.error("Vui lòng nhập mã thùng đích")
            return
        }

        const payload = {
            sourceBoxId: box.id,
            destinationBoxCode: destinationBoxCode.trim(),
            inventoryItemIds: Array.from(selectedItems),
            userId: currentUserId
        }

        setTransferring(true)
        try {
            const res = await fetch('/api/boxes/transfer-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const data = await res.json()

            if (!res.ok) {
                if (data.error === 'BOX_ALLOCATED') {
                    toast.error(data.message || 'Thùng đang được phân bổ, không thể chuyển!')
                } else if (data.details) {
                    console.error('Transfer failed details:', data)
                    toast.error(`Lỗi: ${data.error}`)
                } else {
                    throw new Error(data.error || 'Transfer failed')
                }
                return
            }

            toast.success(`Đã chuyển ${data.movedCount} sản phẩm sang thùng ${data.destinationBox}`)
            setTransferDialogOpen(false)
            setDestinationBoxCode("")
            fetchBox() // Refresh data
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        } finally {
            setTransferring(false)
        }
    }

    if (!box) return <div>Loading...</div>

    const allSelected = items.length > 0 && selectedItems.size === items.length

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <BoxIcon className="h-8 w-8 text-primary" />
                        Chi Tiết Thùng: {box.code}
                    </h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-1">
                        <CardHeader>
                            <CardTitle>Thông Tin Chung</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">Trạng Thái</div>
                                <div className="text-lg font-bold">{box.status}</div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">Vị Trí Hiện Tại</div>
                                <div className="text-lg">{box.locations?.code || "Chưa xếp kho"}</div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">Ngày Tạo</div>
                                <div>{new Date(box.created_at).toLocaleString('vi-VN')}</div>
                            </div>
                            <Button variant="outline" className="w-full" onClick={() => window.print()}>
                                <Printer className="mr-2 h-4 w-4" /> Print Label
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-2">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Danh Sách Hàng Hoá Trong Thùng ({items.length})</CardTitle>
                                {selectedItems.size > 0 && (
                                    <Button onClick={handleTransferClick} className="gap-2">
                                        <MoveRight className="h-4 w-4" />
                                        Chuyển ({selectedItems.size})
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 font-medium">
                                    <tr>
                                        <th className="p-3 w-12">
                                            <Checkbox
                                                checked={allSelected}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </th>
                                        <th className="p-3">Sản Phẩm</th>
                                        <th className="p-3 text-right">Số Lượng</th>
                                        <th className="p-3">Hạn Sử Dụng</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.id} className="border-t">
                                            <td className="p-3">
                                                <Checkbox
                                                    checked={selectedItems.has(item.id)}
                                                    onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <div className="font-medium">{item.product?.name}</div>
                                                <div className="text-xs text-muted-foreground">{item.product?.sku}</div>
                                            </td>
                                            <td className="p-3 text-right font-bold">{item.quantity}</td>
                                            <td className="p-3">
                                                {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('vi-VN') : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-muted-foreground">Thùng rỗng</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </div>

                {/* Transfer Dialog */}
                <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Chuyển Hàng Sang Thùng Khác</DialogTitle>
                            <DialogDescription>
                                Chuyển {selectedItems.size} sản phẩm từ thùng <strong>{box.code}</strong>
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="destBox">Mã Thùng Đích</Label>
                                <Input
                                    id="destBox"
                                    placeholder="Nhập mã thùng..."
                                    value={destinationBoxCode}
                                    onChange={(e) => setDestinationBoxCode(e.target.value)}
                                    disabled={transferring}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setTransferDialogOpen(false)} disabled={transferring}>
                                Hủy
                            </Button>
                            <Button onClick={handleTransferConfirm} disabled={transferring}>
                                {transferring ? 'Đang chuyển...' : 'Xác Nhận'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Hidden Print Wrapper */}
                <div id="print-area" className="hidden print:flex flex-col items-center justify-center w-full h-full">
                    <h1 className="text-4xl font-bold mb-4">{box.code}</h1>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <QRCode value={box.code} size={250} />
                    <p className="mt-4 text-xl">{box.locations?.code || 'NO-LOC'}</p>
                    <p className="text-sm text-slate-500 mt-2">{new Date().toLocaleDateString('vi-VN')}</p>
                </div>
            </main>
        </div>
    )
}
