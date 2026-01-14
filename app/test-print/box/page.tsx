"use client"

import { useState } from "react"
import QRCode from "react-qr-code"
import { PrintLayout } from "@/components/print/PrintLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Printer } from "lucide-react"

export default function BoxPrintPage() {
    const [value, setValue] = useState("BOX-001")

    return (
        <div className="p-8 space-y-8">
            <div className="max-w-md mx-auto space-y-4">
                <h1 className="text-2xl font-bold">In Thùng (Box)</h1>
                <div className="flex gap-2">
                    <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Mã thùng..."
                    />
                    <Button onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" />
                        In
                    </Button>
                </div>
            </div>

            <PrintLayout>
                <div className="flex flex-col items-center justify-center h-full w-full p-4 space-y-4">
                    <div className="text-4xl font-bold uppercase tracking-wider mb-4">THÙNG</div>
                    <div className="w-full max-w-[80%] aspect-square">
                        <QRCode
                            size={256}
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            value={value}
                            viewBox={`0 0 256 256`}
                        />
                    </div>
                    <div className="text-3xl font-mono font-bold mt-4 break-all">{value}</div>
                </div>
            </PrintLayout>
        </div>
    )
}
