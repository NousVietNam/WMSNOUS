"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import QRCode from "react-qr-code"
import { useReactToPrint } from "react-to-print"

export default function TestPrintPage() {
    const printRef = useRef(null)
    const [isPrinting, setIsPrinting] = useState(false)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: "Test-Label",
        pageStyle: `
            @page {
                size: 100mm 150mm;
                margin: 0;
            }
            @media print {
                body {
                    margin: 0;
                    padding: 0;
                }
            }
        `,
        onBeforePrint: () => {
            setIsPrinting(true)
            return new Promise((resolve) => {
                setTimeout(resolve, 500) // Simulate wait
            })
        },
        onAfterPrint: () => setIsPrinting(false)
    })

    return (
        <div className="p-10">
            <h1 className="text-2xl mb-4">Test Print Functionality</h1>
            <Button onClick={() => handlePrint()}>Print Label (100x150mm)</Button>

            {/* Print Container: Visible but off-screen to ensure render */}
            <div style={{
                position: "fixed",
                top: 0,
                left: "-10000px", // Move off-screen
                width: "100mm",
                height: "150mm",
                overflow: "hidden"
            }}>
                <div ref={printRef} className="w-[100mm] h-[150mm] flex flex-col items-center justify-center bg-white p-4 text-center border border-gray-200">
                    <h1 className="text-5xl font-black mb-6">TEST BOX</h1>
                    <div className="border-4 border-black p-4 rounded-xl">
                        <QRCode value="TEST-BOX-001" size={280} />
                    </div>
                    <p className="mt-6 text-3xl font-mono font-black tracking-widest">TEST-001</p>
                </div>
            </div>
        </div>
    )
}
