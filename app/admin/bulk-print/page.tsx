"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Printer } from "lucide-react"
import QRCode from "react-qr-code"

export default function BulkPrintPage() {
    const [input, setInput] = useState("")
    const [codes, setCodes] = useState<string[]>([])

    const handlePreview = () => {
        // Split by newline, trim, remove empty
        const list = input.split('\n').map(s => s.trim()).filter(Boolean)
        setCodes(list)
    }

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">            <main className="flex-1 p-6 space-y-6 print:hidden">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Printer className="h-8 w-8 text-primary" />
                    In Tem Hàng Loạt
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Nhập Mã (Mỗi mã 1 dòng)</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Textarea
                                placeholder="BOX-001&#10;BOX-002&#10;A1-01&#10;..."
                                rows={15}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <Button onClick={handlePreview} className="w-full">Xem Trước</Button>
                                <Button variant="secondary" onClick={() => { setInput(""); setCodes([]) }}>Xoá</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Xem Trước ({codes.length} tem)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4 max-h-[500px] overflow-y-auto border p-4 rounded bg-white">
                                {codes.length === 0 && <p className="text-muted-foreground text-center">Chưa có mã nào.</p>}
                                {codes.map((code, i) => (
                                    <div key={i} className="flex items-center gap-4 border-b pb-2">
                                        <div className="h-10 w-10 bg-slate-100 flex items-center justify-center">
                                            <QRCode value={code} size={30} />
                                        </div>
                                        <span className="font-mono font-bold">{code}</span>
                                    </div>
                                ))}
                            </div>
                            <Button className="w-full mt-4" disabled={codes.length === 0} onClick={handlePrint}>
                                In Ngay (Ctrl+P)
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </main>

            {/* Print Area - Visible only when printing */}
            <div id="bulk-print-area" className="hidden print:block">
                {codes.map((code, i) => (
                    <div key={i} className="w-[100mm] h-[150mm] flex flex-col items-center justify-center break-after-page page-break text-center">
                        <h1 className="text-4xl font-bold mb-6">{code}</h1>
                        <QRCode value={code} size={250} />
                        <p className="mt-6 text-xl text-slate-600 font-mono">WMS LABEL</p>
                    </div>
                ))}
            </div>

            <style jsx global>{`
                @media print {
                    @page { margin: 0; size: 100mm 150mm; }
                    body * { visibility: hidden; }
                    #bulk-print-area, #bulk-print-area * { visibility: visible; }
                    #bulk-print-area { position: absolute; left: 0; top: 0; width: 100%; }
                    .page-break { break-after: page; page-break-after: always; }
                }
            `}</style>
        </div>
    )
}
