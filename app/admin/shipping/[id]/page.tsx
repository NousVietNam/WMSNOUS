"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Truck, Printer, ArrowLeft, Package, User, MapPin, CheckCircle2 } from "lucide-react"
import { useReactToPrint } from "react-to-print"
import { format } from "date-fns"
import { toast } from "sonner"
import QRCode from "react-qr-code"

export default function ShippingDetailPage() {
    const { id } = useParams()
    const searchParams = useSearchParams()
    const type = searchParams.get('type')
    const router = useRouter()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [isConfirming, setIsConfirming] = useState(false)
    const [productBoxMap, setProductBoxMap] = useState<Record<string, Set<string>>>({})
    const printRef = useRef(null)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `PHIEU_XUAT_KHO_${data?.code}`,
    })

    useEffect(() => {
        fetchData()
    }, [id, type])

    const fetchData = async () => {
        setLoading(true)
        try {
            let localData: any = null

            if (type === 'ORDER' || type === 'TRANSFER') {
                const { data: outbound, error } = await supabase
                    .from('outbound_orders')
                    .select('*, outbound_order_items(*, products(*)), picking_jobs(*, picking_tasks(*, boxes:boxes!box_id(*)))')
                    .eq('id', id)
                    .single()
                if (error) throw error
                localData = outbound
            } else if (type === 'MANUAL_JOB') {
                const { data: job, error } = await supabase
                    .from('picking_jobs')
                    .select('*, picking_tasks(*, boxes:boxes!box_id(*), products(*))')
                    .eq('id', id)
                    .single()
                if (error) throw error
                localData = {
                    ...job,
                    code: `JOB-${job.id.slice(0, 8).toUpperCase()}`,
                    status: job.status,
                    created_at: job.created_at,
                    manual_items: job.picking_tasks
                }
            }

            if (!localData) throw new Error("Không tìm thấy dữ liệu")

            // 4. Fetch Linked Level 2 Info (Outboxes & Inventory)
            if (type === 'ORDER' || type === 'TRANSFER') {
                const { data: linkedBoxes } = await supabase
                    .from('boxes')
                    .select('id, code, type')
                    .eq('outbound_order_id', id)

                if (linkedBoxes && linkedBoxes.length > 0) {
                    const boxIds = linkedBoxes.map(b => b.id)
                    const { data: invItems } = await supabase
                        .from('inventory_items')
                        .select('product_id, quantity, box_id')
                        .in('box_id', boxIds)

                    const map: Record<string, Set<string>> = {}
                    const boxCodeById = linkedBoxes.reduce((acc: any, b: any) => {
                        acc[b.id] = b.code
                        return acc
                    }, {})

                    invItems?.forEach(inv => {
                        if (!map[inv.product_id]) map[inv.product_id] = new Set()
                        const code = boxCodeById[inv.box_id]
                        if (code) map[inv.product_id].add(code)
                    })
                    setProductBoxMap(map)
                }
            } else if (type === 'MANUAL_JOB') {
                const map: Record<string, Set<string>> = {}
                localData.manual_items?.forEach((task: any) => {
                    if (task.product_id && task.outbox_code) {
                        if (!map[task.product_id]) map[task.product_id] = new Set()
                        map[task.product_id].add(task.outbox_code)
                    }
                })
                setProductBoxMap(map)
            }

            // 5. Fetch Outbound Shipment Info
            if (localData.status === 'SHIPPED' || localData.status === 'COMPLETED') {
                const { data: shipment } = await supabase
                    .from('outbound_shipments')
                    .select('*')
                    .eq('outbound_order_id', id)
                    .single()

                if (shipment) {
                    localData.shipment_info = shipment
                    if (!localData.shipped_at) localData.shipped_at = shipment.created_at
                }
            }

            setData(localData)
        } catch (e: any) {
            toast.error("Lỗi tải dữ liệu: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleConfirmShipment = async () => {
        const confirm = window.confirm("Xác nhận toàn bộ hàng đã được bốc lên xe và xuất kho?")
        if (!confirm) return

        setIsConfirming(true)
        try {
            if (type === 'ORDER' || type === 'TRANSFER') {
                const res = await fetch('/api/orders/ship', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: id })
                })
                const json = await res.json()
                if (!json.success) throw new Error(json.error)
                toast.success(json.message)
            } else if (type === 'MANUAL_JOB') {
                const res = await fetch('/api/picking-jobs/ship', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId: id })
                })
                const json = await res.json()
                if (!json.success) throw new Error(json.error)
                toast.success(json.message)
            }
            fetchData()
        } catch (e: any) {
            toast.error("Lỗi xác nhận: " + e.message)
        } finally {
            setIsConfirming(false)
        }
    }

    if (loading) return <div className="p-20 text-center">Đang tải...</div>
    if (!data) return <div className="p-20 text-center text-red-500">Không tìm thấy dữ liệu</div>

    const items = (type === 'ORDER' || type === 'TRANSFER') ? data.outbound_order_items : (type === 'MANUAL_JOB' ? data.manual_items : [])
    const destination = (type === 'ORDER' || type === 'TRANSFER') ? data.customer_name : (type === 'MANUAL_JOB' ? 'Xuất Thủ Công' : 'Unknown')
    const isShipped = data.status.toUpperCase() === 'SHIPPED' || (type !== 'MANUAL_JOB' && data.status.toUpperCase() === 'COMPLETED')

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => router.back()} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Quay lại
                </Button>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handlePrint()} className="gap-2">
                        <Printer className="h-4 w-4" /> In Phiếu Xuất
                    </Button>
                    {!isShipped && (
                        <Button onClick={handleConfirmShipment} disabled={isConfirming} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                            <Truck className="h-4 w-4" /> {isConfirming ? "Đang xử lý..." : "Xác Nhận Xuất Hàng"}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 shadow-sm">
                    <CardHeader className="border-b bg-slate-50/50">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-indigo-600" />
                                Danh Sách Hàng Hóa
                            </CardTitle>
                            <Badge variant={isShipped ? "default" : "secondary"} className={isShipped ? "bg-green-100 text-green-700" : ""}>
                                {isShipped ? "ĐÀ XUẤT KHO" : "CHỜ XUẤT"}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                                <tr>
                                    <th className="p-4 text-left">SKU/Sản phẩm</th>
                                    <th className="p-4 text-center">Số lượng</th>
                                    <th className="p-4 text-right">Thùng hàng</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items?.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-slate-50/50">
                                        <td className="p-4">
                                            <div className="font-bold">{item.products?.sku}</div>
                                            <div className="text-xs text-slate-500">{item.products?.name}</div>
                                        </td>
                                        <td className="p-4 text-center font-bold text-lg">
                                            {item.picked_quantity ?? item.quantity}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-wrap justify-end gap-1">
                                                {productBoxMap[item.product_id] && Array.from(productBoxMap[item.product_id]).map(code => (
                                                    <Badge key={code} variant="outline" className="bg-white border-blue-200 text-blue-700">
                                                        {code}
                                                    </Badge>
                                                ))}
                                                {(!productBoxMap[item.product_id] || productBoxMap[item.product_id].size === 0) && (
                                                    <Badge variant="outline" className="bg-white">LẺ</Badge>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="shadow-sm border-indigo-100">
                        <CardHeader className="bg-indigo-50/50">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <User className="h-4 w-4 text-indigo-600" /> Thông Tin Giao Nhận
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Đối tác / Khách hàng</label>
                                <div className="font-bold text-lg text-indigo-700">{destination}</div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Mã Phiếu</label>
                                <div className="font-mono font-bold text-slate-700">{data.code}</div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Trạng Thái</label>
                                <div>
                                    <Badge className={isShipped ? "bg-green-600" : "bg-blue-600"}>
                                        {data.status.toUpperCase()}
                                    </Badge>
                                </div>
                            </div>
                            {isShipped && data.shipped_at && (
                                <div className="p-3 bg-green-50 rounded-lg border border-green-100 flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    <div>
                                        <div className="text-xs text-green-700 font-bold uppercase">Đã xuất lúc</div>
                                        <div className="text-sm font-bold">{format(new Date(data.shipped_at), 'dd/MM/yyyy HH:mm')}</div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-200 bg-slate-50/30">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-slate-500" /> Vị Trí Tập Kết
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 text-center">
                            <div className="text-2xl font-black text-slate-800 tracking-widest">GATE-OUT</div>
                            <p className="text-xs text-slate-500 mt-1">Hàng hóa đang nằm tại Cửa Xuất</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div style={{ display: "none" }}>
                <div ref={printRef} className="bg-white p-5 font-sans text-slate-900 mx-auto" style={{ width: "210mm", minHeight: "297mm" }}>
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter">Phiếu Xuất Kho</h1>
                            <p className="text-lg font-bold mt-1">{data.code}</p>
                        </div>
                        <div className="flex flex-col items-end">
                            <div className="mb-2">
                                <QRCode value={data.code} size={64} level="M" />
                            </div>
                            <p className="font-bold">WMS NOUS System</p>
                            <p className="text-sm text-slate-600">Ngày in: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-10 mb-10">
                        <div className="space-y-4">
                            <h2 className="text-sm font-black uppercase border-b pb-1 text-slate-500">Đơn vị nhận hàng</h2>
                            <div>
                                <p className="text-2xl font-black text-indigo-700 uppercase">{destination}</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-sm font-black uppercase border-b pb-1 text-slate-500">Thông tin phiếu</h2>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b border-slate-100">
                                        <td className="py-2 text-slate-500">Ngày tạo:</td>
                                        <td className="py-2 font-bold">{format(new Date(data.created_at), 'dd/MM/yyyy')}</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 text-slate-500">Trạng thái:</td>
                                        <td className="py-2 font-black uppercase">{data.status}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <h2 className="text-sm font-black uppercase border-b-2 border-slate-900 pb-1 mb-4">Chi tiết hàng hóa</h2>
                    <table className="w-full border-collapse mb-10">
                        <thead>
                            <tr className="bg-slate-50 border-b-2 border-slate-900">
                                <th className="p-2 text-left font-black uppercase text-xs w-10">STT</th>
                                <th className="p-2 text-left font-black uppercase text-xs">SKU</th>
                                <th className="p-2 text-left font-black uppercase text-xs">Tên Sản Phẩm</th>
                                <th className="p-2 text-center font-black uppercase text-xs w-20">Số Lượng</th>
                                <th className="p-2 text-right font-black uppercase text-xs w-24">Thùng</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {items?.map((item: any, idx: number) => (
                                <tr key={item.id}>
                                    <td className="p-2 text-sm text-center">{idx + 1}</td>
                                    <td className="p-2 font-mono font-bold">{item.products?.sku}</td>
                                    <td className="p-2 text-sm">{item.products?.name}</td>
                                    <td className="p-2 text-center font-black text-lg">
                                        {item.picked_quantity ?? item.quantity}
                                    </td>
                                    <td className="p-2 text-right text-[10px] font-mono">
                                        {productBoxMap[item.product_id] ? Array.from(productBoxMap[item.product_id]).join(', ') : 'LẺ'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="grid grid-cols-3 gap-4 mt-20 text-center uppercase font-black text-xs h-32">
                        <div className="flex flex-col justify-between">
                            <p>Người Lập Phiếu</p>
                            <p>(Ký tên)</p>
                        </div>
                        <div className="flex flex-col justify-between">
                            <p>Người Giao Hàng</p>
                            <p>(Ký tên)</p>
                        </div>
                        <div className="flex flex-col justify-between">
                            <p>Người Nhận Hàng</p>
                            <p>(Ký tên)</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
