
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Plus, Search, Waves, Loader2 } from "lucide-react"
import { format } from "date-fns"

export default function WavesPage() {
    const router = useRouter()
    const [waves, setWaves] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchWaves()
    }, [])

    const fetchWaves = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('pick_waves')
            .select(`
                *,
                user:users(name)
            `)
            .order('created_at', { ascending: false })

        if (data) setWaves(data)
        setLoading(false)
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PLANNING': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
            case 'RELEASED': return 'bg-blue-100 text-blue-800 border-blue-200'
            case 'COMPLETED': return 'bg-green-100 text-green-800 border-green-200'
            case 'CANCELLED': return 'bg-red-100 text-red-800 border-red-200'
            default: return 'bg-slate-100 text-slate-800'
        }
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center animate-fade-in-up">
                <div>
                    <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
                        <Waves className="h-8 w-8 text-indigo-600" />
                        Quản Lý Đợt Soạn (Waves)
                    </h1>
                    <p className="text-slate-600">Gom đơn hàng loạt và tối ưu đường đi lấy hàng</p>
                </div>
                <Button
                    onClick={() => router.push('/admin/waves/new')}
                    className="gradient-primary text-white shadow-lg hover:scale-105 transition-transform"
                >
                    <Plus className="mr-2 h-4 w-4" /> Tạo Wave Mới
                </Button>
            </div>

            <div className="glass-strong rounded-xl p-6 border shadow-sm animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <div className="mb-4 relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Tìm kiếm mã Wave..." className="pl-9 max-w-sm" />
                </div>

                <div className="rounded-lg border bg-white overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead>Mã Wave</TableHead>
                                <TableHead>Loại Kho</TableHead>
                                <TableHead>Trạng Thái</TableHead>
                                <TableHead>Người Tạo</TableHead>
                                <TableHead className="text-right">Số Đơn</TableHead>
                                <TableHead className="text-right">Tổng Sản Phẩm</TableHead>
                                <TableHead className="text-right">Ngày Tạo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
                                    </TableCell>
                                </TableRow>
                            ) : waves.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                        Chưa có Wave nào được tạo.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                waves.map((wave) => (
                                    <TableRow
                                        key={wave.id}
                                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                                        onClick={() => router.push(`/admin/waves/${wave.id}`)}
                                    >
                                        <TableCell className="font-mono font-bold text-indigo-600">{wave.code}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={wave.inventory_type === 'BULK' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
                                                {wave.inventory_type === 'BULK' ? 'KHO SỈ' : 'KHO LẺ'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className={`${getStatusColor(wave.status)} uppercase text-[10px]`}>
                                                {wave.status === 'PLANNING' ? 'ĐANG LÊN KH' : wave.status === 'RELEASED' ? 'ĐANG THỰC HIỆN' : wave.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{wave.user?.name || '---'}</TableCell>
                                        <TableCell className="text-right font-medium">{wave.total_orders}</TableCell>
                                        <TableCell className="text-right font-medium">{wave.total_items}</TableCell>
                                        <TableCell className="text-right text-slate-500 text-sm">
                                            {format(new Date(wave.created_at), 'dd/MM/yyyy HH:mm')}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
