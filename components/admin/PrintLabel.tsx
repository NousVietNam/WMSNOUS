"use client"

import { useRef, useState } from "react"
import QRCode from "react-qr-code"
import { useReactToPrint } from "react-to-print"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Printer } from "lucide-react"

export function PrintLabel() {
    const [value, setValue] = useState("BOX-EXAMPLE-001")
    const contentRef = useRef<HTMLDivElement>(null)

    const handlePrint = useReactToPrint({
        contentRef,
    })

    return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <CardTitle>In Nhãn (QR Code)</CardTitle>
                <CardDescription>Tạo và in nhãn cho Thùng hoặc Vị trí</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        placeholder="Nhập mã (VD: BOX-001)"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                    />
                </div>

                {/* Preview Area */}
                <div className="border rounded-lg p-8 flex flex-col items-center justify-center bg-white">
                    <div ref={contentRef} className="bg-white flex flex-col items-center text-center justify-center w-[100mm] h-[150mm]">
                        <style type="text/css" media="print">
                            {`@page { size: 100mm 150mm; margin: 0; }`}
                        </style>
                        <div className="text-4xl font-bold uppercase tracking-wider mb-4">TEM TỰ DO</div>
                        <div className="w-full max-w-[80%] aspect-square">
                            <QRCode
                                size={256}
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                value={value}
                                viewBox={`0 0 256 256`}
                            />
                        </div>
                        <div className="text-3xl font-mono font-bold mt-6 break-all max-w-full px-4">{value}</div>
                    </div>
                </div>

                <Button className="w-full" onClick={() => handlePrint()}>
                    <Printer className="mr-2 h-4 w-4" />
                    In Ngay
                </Button>
            </CardContent>
        </Card>
    )
}
