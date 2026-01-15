"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Save, Upload, Download, CheckCircle, Trash2, Plus } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from 'xlsx'
import Link from "next/link"

interface TransferItem {
    id: string
    product_id: string
    quantity: number
    products?: {
        sku: string
        name: string
        image_url: string
    }
}

interface TransferOrder {
    id: string
    code: string
    from_location_id: string | null
    destination_id: string | null
    status: string
    note: string | null
    created_at: string
    from_location?: { code: string }
    destination?: { name: string, type: string }
    created_by_user?: { email: string }
}

export default function TransferDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const [order, setOrder] = useState<TransferOrder | null>(null)
    const [items, setItems] = useState<TransferItem[]>([])
    const [loading, setLoading] = useState(true)
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (id) fetchData()
    }, [id])

    const fetchData = async () => {
        setLoading(true)
        // Fetch Order Header
        const { data: orderData, error: orderError } = await supabase
            .from('transfer_orders')
            .select(`
                *,
                from_location:locations!transfer_orders_from_location_id_fkey(code),
                destination:destinations(name, type)
            `)
            .eq('id', id)
            .single()

        if (orderError) {
            toast.error("Lỗi tải thông tin phiếu: " + orderError.message)
            setLoading(false)
            return
        }
        setOrder(orderData)

        // Fetch Order Items
        const { data: itemsData, error: itemsError } = await supabase
            .from('transfer_order_items')
            .select(`
                *,
                products (sku, name, image_url)
            `)
            .eq('transfer_id', id)
            .order('created_at', { ascending: true })

        if (itemsError) {
            toast.error("Lỗi tải chi tiết: " + itemsError.message)
        } else {
            setItems(itemsData || [])
        }
        setLoading(false)
    }

    const handleDownloadTemplate = () => {
        const template = [
            { SKU: "SKU123", SoLuong: 10 },
            { SKU: "SKU456", SoLuong: 5 },
        ]
        const ws = XLSX.utils.json_to_sheet(template)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Template")
        XLSX.writeFile(wb, "Mau_Nhap_Dieu_Chuyen.xlsx")
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (evt) => {
            try {
                setImporting(true)
                const bstr = evt.target?.result
                const wb = XLSX.read(bstr, { type: 'binary' })
                const wsname = wb.SheetNames[0]
                const ws = wb.Sheets[wsname]
                const data = XLSX.utils.sheet_to_json(ws) as any[]

                // Validate and Prepare items
                const validItems = []
                const errors = []

                // Get all SKUs to map to IDs
                const { data: products } = await supabase.from('products').select('id, sku')
                const productMap = new Map(products?.map(p => [p.sku, p.id]))

                for (const row of data) {
                    const sku = row['SKU'] || row['sku']
                    const qty = row['SoLuong'] || row['soluong'] || row['Quantity'] || row['quantity']

                    if (!sku || !qty) continue

                    const productId = productMap.get(sku)
                    if (productId) {
                        validItems.push({
                            transfer_id: id,
                            product_id: productId,
                            quantity: Number(qty)
                        })
                    } else {
                        errors.push(sku)
                    }
                }

                if (validItems.length > 0) {
                    const { error } = await supabase.from('transfer_order_items').insert(validItems)
                    if (error) throw error
                    toast.success(`Đã thêm ${validItems.length} sản phẩm`)
                    if (errors.length > 0) toast.warning(`Không tìm thấy SKU: ${errors.join(', ')}`)
                    fetchData() // Refresh
                } else {
                    toast.warning("Không tìm thấy dữ liệu hợp lệ trong file")
                }

            } catch (error: any) {
                toast.error("Lỗi import: " + error.message)
            } finally {
                setImporting(false)
                if (fileInputRef.current) fileInputRef.current.value = ""
            }
        }
        reader.readAsBinaryString(file)
    }

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm("Bạn muốn xóa dòng này?")) return
        const { error } = await supabase.from('transfer_order_items').delete().eq('id', itemId)
        if (error) toast.error("Lỗi xóa: " + error.message)
        else {
            toast.success("Đã xóa")
            fetchData()
        }
    }

    const handleApprove = async () => {
        if (!confirm("Xác nhận DUYỆT phiếu điều chuyển? Hành động này sẽ trừ tồn kho và ghi nhận giao dịch.")) return

        try {
            const res = await fetch('/api/transfers/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transferId: id })
            })
            const result = await res.json()
            if (result.success) {
                toast.success("Đã duyệt phiếu thành công!")
                fetchData()
            } else {
                toast.error("Lỗi duyệt phiếu: " + result.error)
            }
        } catch (error: any) {
            toast.error("Lỗi hệ thống: " + error.message)
        }
    }

    if (loading) return <div className="p-8 text-center text-muted-foreground">Đang tải chi tiết...</div>
    if (!order) return <div className="p-8 text-center text-rose-500">Không tìm thấy phiếu điều chuyển</div>

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">

                {/* Header Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/transfers">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                {order.code}
                                <span className={`px-2 py-1 rounded text-xs font-semibold
                                    ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                        order.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                            'bg-gray-100 text-gray-800'}
                                `}>
                                    {order.status}
                                </span>
                            </h1>
                            <p className="text-slate-500 text-sm">
                                Từ: <strong>{order.from_location?.code || 'Kho Chung'}</strong>
                                {' -> '}
                                Đến: <strong>{order.destination?.name}</strong>
                                {order.destination?.type === 'customer' && <span className="ml-2 bg-orange-100 text-orange-800 px-1 py-0.5 rounded text-xs">KHACH HANG</span>}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {order.status === 'pending' && (
                            <>
                                <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
                                    <Download className="h-4 w-4" /> Mẫu Excel
                                </Button>
                                <div className="relative">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept=".xlsx, .xls"
                                        className="hidden"
                                    />
                                    <Button onClick={() => fileInputRef.current?.click()} disabled={importing} className="gap-2">
                                        <Upload className="h-4 w-4" /> {importing ? 'Đang tải...' : 'Upload Excel'}
                                    </Button>
                                </div>
                                <Button className="bg-green-600 hover:bg-green-700 gap-2" onClick={handleApprove}>
                                    <CheckCircle className="h-4 w-4" /> Duyệt Phiếu
                                </Button>
                            </>
                        )}
                        {/* If approved, maybe show "In phiếu" or similar */}
                    </div>
                </div>

                {/* Items Table */}
                <div className="bg-white rounded-md border shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 font-medium text-slate-700">
                            <tr>
                                <th className="p-3 text-left">SKU</th>
                                <th className="p-3 text-left">Tên Sản Phẩm</th>
                                <th className="p-3 text-center">Số Lượng</th>
                                <th className="p-3 text-right">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.length === 0 ? (
                                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Chưa có sản phẩm nào. Hãy upload Excel.</td></tr>
                            ) : (
                                items.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="p-3 font-medium">{item.products?.sku}</td>
                                        <td className="p-3">{item.products?.name}</td>
                                        <td className="p-3 text-center font-bold text-lg">{item.quantity}</td>
                                        <td className="p-3 text-right">
                                            {order.status === 'pending' && (
                                                <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

            </main>
        </div>
    )
}
