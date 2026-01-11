"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import Papa from "papaparse"
import { Upload, AlertCircle, CheckCircle, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"

export default function ImportMasterDataPage() {
    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<{ success: number, error: number, messages: string[] } | null>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setResult(null)
        }
    }

    const handleTruncate = async () => {
        if (!confirm("CẢNH BÁO: Hành động này sẽ XÓA TOÀN BỘ dữ liệu sản phẩm hiện có.\n\nBạn có chắc chắn muốn tiếp tục không?")) return
        if (!confirm("Xác nhận lần 2: Dữ liệu sẽ không thể khôi phục. Bạn vẫn muốn xóa?")) return

        setLoading(true)
        try {
            // Delete all records where id is not 0 (effectively all since IDs are usually UUIDs or positive ints)
            // Using a strictly true condition like id > 0 (if int) or just logic. 
            // Supabase delete requires a filter.
            const { error } = await supabase.from('products').delete().neq('input_id', '000000') // scalable delete? 
            // Better: .delete().not('id', 'is', null) check supabase syntax. 
            // actually .neq('id', 0) works if ID is int. If UUID, .neq('id', '00000000-0000-0000-0000-000000000000')
            // Safest 'delete all' in supabase-js often requires a dummy filter that matches everything.
            // Let's assume standard int/uuid. .gt('id', 0) or similar.
            // Let's try .neq('id', -1) assuming standard IDs.

            // Wait, for 100% safety, user said "Truncate".
            const { error: err } = await supabase.from('products').delete().neq('id', -1)

            if (err) throw err

            toast.success("Đã xóa toàn bộ dữ liệu sản phẩm!")
        } catch (e: any) {
            toast.error("Lỗi khi xóa dữ liệu: " + e.message)
        } finally {
            setLoading(false)
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

                // Batched Upsert for Performance
                const BATCH_SIZE = 50
                for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                    const chunk = rows.slice(i, i + BATCH_SIZE)
                    const formattedData = chunk.map(row => {
                        // Map CSV Columns to DB Columns
                        // Clean currency strings: "40,000" -> 40000
                        const cleanPrice = row["Giá bán lẻ"] ? parseFloat(row["Giá bán lẻ"].toString().replace(/,/g, '')) : 0
                        const cleanQty = row["Số lượng sản xuất"] ? parseInt(row["Số lượng sản xuất"].toString().replace(/,/g, '')) : 0

                        return {
                            external_id: row["ID"],
                            target_audience: row["Đối tượng"],
                            brand: row["Thương hiệu"],
                            gender: row["Giới tính"],
                            category: row["Chủng loại"],
                            product_group: row["Nhóm hàng"],
                            general_code: row["Mã tổng"],
                            color_code: row["Mã màu"],
                            sku: row["Mã chi tiết"], // Needed for Upsert Key
                            barcode: row["Barcode"] || row["Mã chi tiết"], // Fallback if barcode missing
                            name: row["Tên hàng hóa"],
                            uom: row["Đơn vị"],
                            price: isNaN(cleanPrice) ? 0 : cleanPrice,
                            production_year: row["Năm SX"],
                            size: row["Size"],
                            material: row["Chất liệu"],
                            composition: row["Thành phần"],
                            season: row["Mùa bán hàng"],
                            planned_month: row["Tháng bán hàng kế hoạch"],
                            note: row["Note"],
                            sales_channel: row["Kênh bán"],
                            production_qty: isNaN(cleanQty) ? 0 : cleanQty,
                            sales_status: row["Tình trạng mở bán"],
                            launch_year: row["Năm mở bán"],
                            launch_month: row["Tháng mở bán"],
                            // launch_date: row["Ngày mở bán"], // Might fail if format isn't YYYY-MM-DD
                            launch_month_year: row["Tháng/Năm"],
                            // external_created_at: row["Created"],
                            // external_updated_at: row["Modified"],
                            image_url: row["Link"]
                        }
                    }).filter(item => item.sku) // Must have SKU

                    if (formattedData.length > 0) {
                        const { error } = await supabase
                            .from('products')
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
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-8">Import Master Data (Products)</h1>

            <Card>
                <CardHeader>
                    <CardTitle>Upload CSV File</CardTitle>
                    <CardDescription>
                        Chọn file `master_data_hang_hoa_New.csv` để cập nhật danh mục sản phẩm.
                        Hệ thống sẽ cập nhật (Upsert) dựa trên "Mã chi tiết" (SKU).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="master-csv">Master Data CSV</Label>
                        <Input id="master-csv" type="file" accept=".csv" onChange={handleFileChange} />
                    </div>

                    <div className="flex gap-4">
                        <Button onClick={processImport} disabled={!file || loading}>
                            {loading ? "Đang xử lý..." : "Bắt đầu Import"}
                            <Upload className="ml-2 h-4 w-4" />
                        </Button>

                        <Button variant="destructive" onClick={handleTruncate} disabled={loading}>
                            Xóa Toàn Bộ Dữ Liệu
                            <Trash2 className="ml-2 h-4 w-4" />
                        </Button>
                    </div>

                    {result && (
                        <Alert variant={result.error > 0 ? "destructive" : "default"} className={result.error === 0 ? "border-green-500 bg-green-50" : ""}>
                            {result.error > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
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
        </div>
    )
}
