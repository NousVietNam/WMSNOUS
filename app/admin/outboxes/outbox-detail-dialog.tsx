
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Loader2, Box, Package, FileText, ArrowRight } from "lucide-react"

interface OutboxDetailDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    outboxCode: string | null
}

interface OutboxItem {
    id: string
    quantity: number
    products: {
        sku: string
        name: string
        image: string
    }
    picking_jobs: {
        id: string
        type: string
        orders: {
            code: string
            customer_name: string
        }
    }
    boxes: { // Source Box
        code: string
        location_code: string
    }
}

export function OutboxDetailDialog({ open, onOpenChange, outboxCode }: OutboxDetailDialogProps) {
    const [loading, setLoading] = useState(false)
    const [items, setItems] = useState<OutboxItem[]>([])

    useEffect(() => {
        if (open && outboxCode) {
            fetchDetails()
        }
    }, [open, outboxCode])

    const fetchDetails = async () => {
        setLoading(true)
        try {
            // Query picking_tasks - has all info we need
            const { data, error } = await supabase
                .from('picking_tasks')
                .select(`
                    id,
                    quantity,
                    products (sku, name),
                    boxes!picking_tasks_box_id_fkey (code),
                    picking_jobs (id, type, orders (code, customer_name))
                `)
                .eq('outbox_code', outboxCode)
                .eq('status', 'COMPLETED')

            if (error) throw error
            setItems(data as any)

        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }

    const totalQty = items.reduce((acc, i) => acc + i.quantity, 0)
    const uniqueJobs = Array.from(new Set(items.map(i => i.picking_jobs?.id).filter(Boolean)))
    const uniqueSourceBoxes = Array.from(new Set(items.map(i => i.boxes?.code).filter(Boolean)))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Box className="h-6 w-6 text-blue-600" />
                        Chi Tiết Outbox: <span className="font-mono text-blue-700">{outboxCode}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto py-4">
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-slate-400" /></div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">Chưa có sản phẩm nào trong thùng này.</div>
                    ) : (
                        <div className="space-y-6">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-slate-50 p-4 rounded-lg border">
                                    <div className="text-xs text-slate-500 uppercase font-bold">Tổng Số Lượng</div>
                                    <div className="text-2xl font-bold text-slate-800">{totalQty} <span className="text-sm font-normal text-slate-500">sp</span></div>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-lg border">
                                    <div className="text-xs text-slate-500 uppercase font-bold">Nguồn Hàng</div>
                                    <div className="text-lg font-bold text-slate-800 flex flex-wrap gap-2 mt-1">
                                        {uniqueSourceBoxes.map(b => (
                                            <span key={b} className="bg-white border px-2 py-0.5 rounded text-xs shadow-sm flex items-center gap-1">
                                                <Box className="h-3 w-3 text-slate-400" /> {b}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-lg border">
                                    <div className="text-xs text-slate-500 uppercase font-bold">Từ Job / Đơn Hàng</div>
                                    <div className="text-sm font-medium text-slate-800 mt-1 space-y-1">
                                        {/* List distinct jobs info */}
                                        {Array.from(new Set(items
                                            .map(i => i.picking_jobs)
                                            .filter(j => j != null) // Filter null/undefined
                                            .map(j => JSON.stringify(j))
                                        )).map((jStr, idx) => {
                                            const j = JSON.parse(jStr)
                                            return (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <FileText className="h-3 w-3 text-indigo-500" />
                                                    <span className="font-bold text-indigo-700">{j.orders?.code || `JOB-${j.id.slice(0, 6)}`}</span>
                                                    {j.orders?.customer_name && <span className="text-slate-500 text-xs">({j.orders.customer_name})</span>}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 font-medium text-slate-600">
                                        <tr>
                                            <th className="p-3 text-left">Sản Phẩm</th>
                                            <th className="p-3 text-center">Số Lượng</th>
                                            <th className="p-3 text-left">Nguồn (Box)</th>
                                            <th className="p-3 text-left">Nguồn (Job)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {items.map(item => (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="p-3">
                                                    <div className="font-bold text-slate-800">{item.products?.sku}</div>
                                                    <div className="text-xs text-slate-500 line-clamp-1">{item.products?.name}</div>
                                                </td>
                                                <td className="p-3 text-center font-bold">{item.quantity}</td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-1 text-slate-600">
                                                        <Box className="h-3 w-3" />
                                                        {item.boxes?.code || '---'}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 pl-4">{item.boxes?.location_code}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="text-indigo-600 font-medium">
                                                        {item.picking_jobs?.orders?.code || `JOB-${item.picking_jobs?.id.slice(0, 6)}`}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t pt-4">
                    <Button onClick={() => onOpenChange(false)}>Đóng</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
