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

export default function ShippingDetailPage() {
    const { id } = useParams()
    const searchParams = useSearchParams()
    const type = searchParams.get('type')
    const router = useRouter()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [isConfirming, setIsConfirming] = useState(false)
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
            if (type === 'ORDER') {
                const { data: order, error } = await supabase
                    .from('orders')
                    .select('*, order_items(*, products(*)), picking_jobs(*, picking_tasks(*, boxes(*)))')
                    .eq('id', id)
                    .single()
                if (error) throw error
                setData(order)
            } else {
                const { data: transfer, error } = await supabase
                    .from('transfer_orders')
                    .select('*, destinations(*), transfer_order_items(*, products(*)), picking_jobs(*, picking_tasks(*, boxes(*)))')
                    .eq('id', id)
                    .single()
                if (error) throw error
                setData(transfer)
            }
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
            const table = type === 'ORDER' ? 'orders' : 'transfer_orders'
            const status = type === 'ORDER' ? 'SHIPPED' : 'shipped'

            const { error } = await supabase
                .from(table)
                .update({
                    status: status,
                    shipped_at: new Date().toISOString()
                })
                .eq('id', id)

            if (error) throw error

            // Update box status if needed (e.g., mark as SHIPPED)
            const boxIds = new Set<string>()
            data.picking_jobs?.forEach((job: any) => {
                job.picking_tasks?.forEach((task: any) => {
                    if (task.boxes?.id) boxIds.add(task.boxes.id)
                })
            })

            if (boxIds.size > 0) {
                await supabase.from('boxes').update({ status: 'SHIPPED' }).in('id', Array.from(boxIds))
            }

            toast.success("Đã xác nhận xuất kho thành công!")
            fetchData()
        } catch (e: any) {
            toast.error("Lỗi xác nhận: " + e.message)
        } finally {
            setIsConfirming(false)
        }
    }

    if (loading) return <div className="p-20 text-center">Đang tải...</div>
    if (!data) return <div className="p-20 text-center text-red-500">Không tìm thấy dữ liệu</div>

    const items = type === 'ORDER' ? data.order_items : data.transfer_order_items
    const destination = type === 'ORDER' ? data.customer_name : data.destinations?.name
    const isShipped = data.status.toUpperCase() === 'SHIPPED'

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
                                {isShipped ? "ĐÃ XUẤT KHO" : "CHỜ XUẤT"}
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
                                {items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-slate-50/50">
                                        <td className="p-4">
                                            <div className="font-bold">{item.products?.sku}</div>
                                            <div className="text-xs text-slate-500">{item.products?.name}</div>
                                        </td>
                                        <td className="p-4 text-center font-bold text-lg">
                                            {type === 'ORDER' ? item.picked_quantity : item.quantity}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-wrap justify-end gap-1">
                                                {/* Logic to find boxes for this product */}
                                                {data.picking_jobs?.flatMap((j: any) =>
                                                    j.picking_tasks?.filter((t: any) => t.product_id === item.product_id)
                                                        .map((t: any) => (
                                                            <Badge key={t.id} variant="outline" className="bg-white">
                                                                {t.boxes?.code || 'LẺ'}
                                                            </Badge>
                                                        ))
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

            {/* PRINT COMPONENT (Hidden) */}
            <div style={{ display: "none" }}>
                <div ref={printRef} className="p-10 font-sans text-slate-900">
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter">Phiếu Xuất Kho</h1>
                            <p className="text-lg font-bold mt-1">{data.code}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-bold">WMS HANGLE System</p>
                            <p className="text-sm text-slate-600">Ngày in: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-10 mb-10">
                        <div className="space-y-4">
                            <h2 className="text-sm font-black uppercase border-b pb-1 text-slate-500">Đơn vị nhận hàng</h2>
                            <div>
                                <p className="text-2xl font-black text-indigo-700 uppercase">{destination}</p>
                                {type === 'TRANSFER' && data.destinations?.address && (
                                    <p className="text-sm text-slate-600 mt-1">{data.destinations.address}</p>
                                )}
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-sm font-black uppercase border-b pb-1 text-slate-500">Thông tin phiếu</h2>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b border-slate-100">
                                        <td className="py-2 text-slate-500">Loại:</td>
                                        <td className="py-2 font-bold">{type === 'ORDER' ? 'Đơn Bán Hàng' : 'Điều Chuyển'}</td>
                                    </tr>
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
                                <th className="p-3 text-left font-black uppercase text-xs">STT</th>
                                <th className="p-3 text-left font-black uppercase text-xs">SKU</th>
                                <th className="p-3 text-left font-black uppercase text-xs">Tên Sản Phẩm</th>
                                <th className="p-3 text-center font-black uppercase text-xs">Số Lượng</th>
                                <th className="p-3 text-right font-black uppercase text-xs">Thùng</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {items.map((item: any, idx: number) => (
                                <tr key={item.id}>
                                    <td className="p-3 text-sm">{idx + 1}</td>
                                    <td className="p-3 font-mono font-bold">{item.products?.sku}</td>
                                    <td className="p-3 text-sm">{item.products?.name}</td>
                                    <td className="p-3 text-center font-black text-lg">
                                        {type === 'ORDER' ? item.picked_quantity : item.quantity}
                                    </td>
                                    <td className="p-3 text-right text-[10px] font-mono">
                                        {data.picking_jobs?.flatMap((j: any) =>
                                            j.picking_tasks?.filter((t: any) => t.product_id === item.product_id)
                                                .map((t: any) => t.boxes?.code || 'LE')
                                        ).join(', ')}
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

                    <div className="mt-20 border-t pt-4 text-center text-[10px] text-slate-400">
                        Cảm ơn quý khách đã tin dùng dịch vụ của NOUS
                    </div>
                </div>
            </div>
        </div>
    )
}
