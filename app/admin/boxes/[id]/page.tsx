"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Box as BoxIcon, Printer } from "lucide-react"
import QRCode from "react-qr-code"

export default function BoxDetailPage() {
    const params = useParams()
    // Support both ID and Code in URL? usually ID.
    // However, if we scan a code, we might want to redirect here.
    // Let's assume URL is /admin/boxes/[id].
    // If the param is a UUID, search by ID. If it looks like 'BOX-...', search by code.
    // For simplicity, let's assume [id] is effectively the ID, but handle Code if needed?
    // Actually, usually easier to just query both.

    const idOrCode = params.id as string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [box, setBox] = useState<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [items, setItems] = useState<any[]>([])
    const router = useRouter()

    useEffect(() => {
        fetchBox()
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
    }

    if (!box) return <div>Loading...</div>

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
                            <CardTitle>Danh Sách Hàng Hoá Trong Thùng ({items.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 font-medium">
                                    <tr>
                                        <th className="p-3">Sản Phẩm</th>
                                        <th className="p-3 text-right">Số Lượng</th>
                                        <th className="p-3">Hạn Sử Dụng</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.id} className="border-t">
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
                                            <td colSpan={3} className="p-8 text-center text-muted-foreground">Thùng rỗng</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </div>

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
