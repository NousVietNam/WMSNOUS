"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Truck, FileText, ArrowRightLeft, Search, Calendar, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { format } from "date-fns"

interface ShippingRequest {
    id: string
    code: string
    type: 'ORDER' | 'TRANSFER'
    status: string
    customer_name?: string
    destination_name?: string
    created_at: string
    item_count: number
}

export default function ShippingPage() {
    const [requests, setRequests] = useState<ShippingRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        fetchShippingRequests()
    }, [])

    const fetchShippingRequests = async () => {
        setLoading(true)
        try {
            // 1. Fetch Completed Sales Orders
            const { data: orders, error: orderError } = await supabase
                .from('orders')
                .select('id, code, status, customer_name, created_at, order_items(count)')
                .in('status', ['COMPLETED', 'SHIPPED'])
                .order('created_at', { ascending: false })

            if (orderError) throw orderError

            // 2. Fetch Completed Transfer Orders
            const { data: transfers, error: transferError } = await supabase
                .from('transfer_orders')
                .select('id, code, status, destinations(name), created_at, transfer_order_items(count)')
                .in('status', ['completed', 'shipped'])
                .order('created_at', { ascending: false })

            if (transferError) throw transferError

            const mappedOrders: ShippingRequest[] = orders.map(o => ({
                id: o.id,
                code: o.code,
                type: 'ORDER',
                status: o.status,
                customer_name: o.customer_name,
                created_at: o.created_at,
                // @ts-ignore
                item_count: o.order_items?.[0]?.count || 0
            }))

            const mappedTransfers: ShippingRequest[] = transfers.map(t => ({
                id: t.id,
                code: t.code,
                type: 'TRANSFER',
                status: t.status.toUpperCase(),
                // @ts-ignore
                destination_name: t.destinations?.name || 'Unknown',
                created_at: t.created_at,
                // @ts-ignore
                item_count: t.transfer_order_items?.[0]?.count || 0
            }))

            setRequests([...mappedOrders, ...mappedTransfers].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ))
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const filtered = requests.filter(r =>
        r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.customer_name || r.destination_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Truck className="h-10 w-10 text-indigo-600" />
                        Quản Lý Xuất Kho
                    </h1>
                    <p className="text-slate-500 mt-1">Quản lý và in phiếu cho các hàng hóa đã sẵn sàng xuất xưởng</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Tìm mã phiếu, khách hàng..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button onClick={fetchShippingRequests} variant="outline" size="icon">
                        <Calendar className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-slate-500">Đang tải danh sách...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-4">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                            <Truck className="h-8 w-8" />
                        </div>
                        <p className="text-slate-500">Không có phiếu nào chờ xuất xưởng</p>
                    </div>
                ) : (
                    filtered.map((req) => (
                        <Link key={req.id} href={`/admin/shipping/${req.id}?type=${req.type}`}>
                            <Card className="hover:border-indigo-300 transition-all cursor-pointer shadow-sm group">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${req.type === 'ORDER' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                                            }`}>
                                            {req.type === 'ORDER' ? <FileText className="h-6 w-6" /> : <ArrowRightLeft className="h-6 w-6" />}
                                        </div>
                                        <div>
                                            <div className="font-black text-lg text-slate-900 flex items-center gap-2">
                                                {req.code}
                                                <Badge variant={req.status === 'SHIPPED' ? 'default' : 'secondary'} className={
                                                    req.status === 'SHIPPED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                                }>
                                                    {req.status === 'SHIPPED' ? 'Đã Xuất' : 'Chờ Xuất'}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-slate-500 flex items-center gap-3">
                                                <span>{req.customer_name || req.destination_name}</span>
                                                <span>•</span>
                                                <span>{req.item_count} sản phẩm</span>
                                                <span>•</span>
                                                <span>{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button variant="ghost" className="group-hover:translate-x-1 transition-transform">
                                            Chi tiết <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))
                )}
            </div>
        </div>
    )
}
