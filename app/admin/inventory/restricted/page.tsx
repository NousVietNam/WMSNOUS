"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import Papa from "papaparse"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { Upload, CircleAlert, CheckCircle, Trash2, ShieldAlert, FileDown } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

interface RestrictedItem {
    id: string
    sku: string
    barcode: string | null
    current_stock: number
    reason: string | null
    is_launching_soon: boolean
    created_at: string
}

export default function RestrictedInventoryPage() {
    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<{ success: number, error: number, messages: string[] } | null>(null)
    const [items, setItems] = useState<RestrictedItem[]>([])

    useEffect(() => {
        fetchItems()
    }, [])

    const fetchItems = async () => {
        const { data, error } = await supabase
            .from('restricted_inventory')
            .select('*')
            .order('created_at', { ascending: false })

        if (data && !error) {
            setItems(data)
        }
    }

    const toggleLaunchingSoon = async (id: string, current: boolean) => {
        const { error } = await supabase
            .from('restricted_inventory')
            .update({ is_launching_soon: !current })
            .eq('id', id)

        if (error) toast.error(error.message)
        else fetchItems()
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setResult(null)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Xóa mã này khỏi danh sách hạn chế?")) return

        const { error } = await supabase
            .from('restricted_inventory')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error("Lỗi: " + error.message)
        } else {
            toast.success("Đã xóa!")
            fetchItems()
        }
    }

    const processImport = async () => {
        if (!file) return
        setLoading(true)
        setResult({ success: 0, error: 0, messages: [] })

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[]
                let successCount = 0
                let errorCount = 0
                const logs: string[] = []

                // Batched Upsert
                const BATCH_SIZE = 50
                for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                    const chunk = rows.slice(i, i + BATCH_SIZE)
                    const formattedData = chunk.map(row => {
                        const cleanStock = row["current_stock"] ? parseInt(row["current_stock"].toString().replace(/,/g, '')) : 0
                        const launchingSoonStr = (row["is_launching_soon"] || "").toString().toLowerCase()
                        const isLaunchingSoon = launchingSoonStr === 'yes' || launchingSoonStr === 'true' || launchingSoonStr === '1' || launchingSoonStr === 'y'

                        return {
                            sku: row["sku"],
                            barcode: row["barcode"] || null,
                            current_stock: isNaN(cleanStock) ? 0 : cleanStock,
                            reason: row["reason"] || null,
                            is_launching_soon: isLaunchingSoon
                        }
                    }).filter(item => item.sku) // Must have SKU

                    if (formattedData.length > 0) {
                        const { error } = await supabase
                            .from('restricted_inventory')
                            .upsert(formattedData, { onConflict: 'sku' })

                        if (error) {
                            console.error("Batch Error", error)
                            errorCount += chunk.length
                            logs.push(`Batch ${i / BATCH_SIZE + 1} Error: ${error.message}`)
                        } else {
                            successCount += formattedData.length
                        }
                    }
                }

                setResult({
                    success: successCount,
                    error: errorCount,
                    messages: logs
                })
                setLoading(false)
                if (errorCount === 0) {
                    toast.success(`Import hoàn tất: ${successCount} dòng thành công.`)
                } else {
                    toast.warning(`Import hoàn tất với lỗi: ${errorCount} dòng thất bại.`)
                }
                fetchItems()
            },
            error: (error) => {
                console.error("Parse Error", error)
                setLoading(false)
                setResult({ success: 0, error: 1, messages: ["CSV Parse Error: " + error.message] })
                toast.error("Lỗi đọc file CSV: " + error.message)
            }
        })
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                        <ShieldAlert className="h-8 w-8 text-red-600" />
                        Hàng Bị Hạn Chế Nhập Kho
                    </h1>
                    <p className="text-slate-600">
                        Quản lý danh sách hàng không được phép thêm vào thùng khi Put-away.
                    </p>
                </div>
            </div>

            {/* Upload Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Upload CSV File</CardTitle>
                    <CardDescription>
                        File CSV cần có các cột: <code>sku</code>, <code>barcode</code>, <code>current_stock</code>, <code>reason</code>, <code>is_launching_soon</code> (Yes/No)
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="restricted-csv">Restricted Inventory CSV</Label>
                        <Input id="restricted-csv" type="file" accept=".csv" onChange={handleFileChange} />
                    </div>

                    <div className="flex gap-4">
                        <Button onClick={processImport} disabled={!file || loading}>
                            {loading ? "Đang xử lý..." : "Bắt đầu Import"}
                            <Upload className="ml-2 h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                const worksheet = XLSX.utils.json_to_sheet(items.map(i => ({
                                    'Mã Hàng (SKU)': i.sku,
                                    'Barcode': i.barcode || '',
                                    'Số Tồn Hiện Tại': i.current_stock,
                                    'Lý Do Hạn Chế': i.reason || '',
                                    'Chuẩn Bị Mở Bán': i.is_launching_soon ? 'Yes' : 'No'
                                })))
                                const workbook = XLSX.utils.book_new()
                                XLSX.utils.book_append_sheet(workbook, worksheet, 'Restricted')

                                // Direct XLSX export
                                const fileName = `restricted_inventory_${new Date().toISOString().split('T')[0]}.xlsx`
                                XLSX.writeFile(workbook, fileName)
                                toast.success("Đang tải file Excel (.xlsx)...")
                            }}
                            disabled={items.length === 0}
                        >
                            <FileDown className="mr-2 h-4 w-4" />
                            TẢI FILE EXCEL (.XLSX)
                        </Button>
                    </div>

                    {result && (
                        <Alert variant={result.error > 0 ? "destructive" : "default"} className={result.error === 0 ? "border-green-500 bg-green-50" : ""}>
                            {result.error > 0 ? <CircleAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
                            <AlertTitle>{result.error > 0 ? "Có lỗi xảy ra" : "Hoàn tất"}</AlertTitle>
                            <AlertDescription>
                                <p>Thành công: <b>{result.success}</b> dòng.</p>
                                <p>Lỗi: <b>{result.error}</b> dòng.</p>
                                {result.messages.length > 0 && (
                                    <div className="mt-2 max-h-40 overflow-y-auto text-xs bg-black/10 p-2 rounded">
                                        {result.messages.map((m, i) => <div key={i}>{m}</div>)}
                                    </div>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {/* List Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Danh Sách Hàng Bị Hạn Chế ({items.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="p-3 text-left font-medium">Mã Hàng (SKU)</th>
                                    <th className="p-3 text-left font-medium">Barcode</th>
                                    <th className="p-3 text-right font-medium">Số Tồn</th>
                                    <th className="p-3 text-left font-medium">Lý Do</th>
                                    <th className="p-3 text-center font-medium">Mở Bán</th>
                                    <th className="p-3 text-right font-medium">Ngày Thêm</th>
                                    <th className="p-3 text-right font-medium">Hành Động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                            Chưa có mã hàng nào bị hạn chế
                                        </td>
                                    </tr>
                                ) : (
                                    items.map(item => (
                                        <tr key={item.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-mono font-bold">{item.sku}</td>
                                            <td className="p-3 font-mono text-slate-600">{item.barcode || '-'}</td>
                                            <td className="p-3 text-right font-bold text-orange-600">{item.current_stock.toLocaleString()}</td>
                                            <td className="p-3 text-slate-600">{item.reason || '-'}</td>
                                            <td className="p-3 text-center">
                                                <Badge
                                                    onClick={() => toggleLaunchingSoon(item.id, item.is_launching_soon)}
                                                    className={`cursor-pointer ${item.is_launching_soon ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                                >
                                                    {item.is_launching_soon ? 'Yes' : 'No'}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-right text-xs text-slate-500">
                                                {new Date(item.created_at).toLocaleDateString('vi-VN')}
                                            </td>
                                            <td className="p-3 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-red-600"
                                                    onClick={() => handleDelete(item.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
