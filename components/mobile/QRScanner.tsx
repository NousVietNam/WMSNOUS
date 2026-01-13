"use client"

import { useEffect, useRef, useState } from "react"

interface ScannerProps {
    onScan: (code: string) => void
    onClose: () => void
    mode?: "BARCODE" | "ALL"
}

export function QRScanner({ onScan, onClose, mode = "ALL" }: ScannerProps) {
    const [scriptLoaded, setScriptLoaded] = useState(false)
    const scannerRef = useRef<any>(null)
    const scannerId = "d-qr-reader"

    useEffect(() => {
        // @ts-ignore
        if (window.Html5Qrcode) {
            setScriptLoaded(true)
            return
        }

        const script = document.createElement("script")
        script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
        script.onload = () => setScriptLoaded(true)
        document.body.appendChild(script)
    }, [])

    useEffect(() => {
        if (!scriptLoaded) return

        const initScanner = async () => {
            // @ts-ignore
            if (!window.Html5Qrcode) return

            try {
                // @ts-ignore
                const scanner = new window.Html5Qrcode(scannerId, {
                    verbose: false,
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: false // iOS stability
                    }
                })

                scannerRef.current = scanner

                // Responsive qrbox: 70% of min dimension
                const qrBoxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
                    return {
                        width: Math.floor(minEdge * 0.7),
                        height: Math.floor(minEdge * (mode === "BARCODE" ? 0.4 : 0.7))
                    }
                }

                await scanner.start(
                    {
                        facingMode: "environment",
                        // @ts-ignore: focusMode is supported by many browsers but not in standard types
                        focusMode: "continuous"
                    },
                    {
                        fps: 15, // Higher FPS
                        qrbox: qrBoxFunction,
                        disableFlip: false,
                        aspectRatio: 1.0
                    },
                    (decodedText: string) => {
                        onScan(decodedText)
                    },
                    () => { }
                )
            } catch (e) {
                console.error("Scanner init failed", e)
            }
        }

        const timer = setTimeout(initScanner, 100)

        return () => {
            clearTimeout(timer)
            if (scannerRef.current) {
                scannerRef.current.stop().catch((err: any) => console.error(err)).finally(() => scannerRef.current.clear())
            }
        }
    }, [scriptLoaded, onScan, mode])

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-4 rounded-xl w-full max-w-sm relative flex flex-col">
                <div className="flex justify-between items-center mb-2 shrink-0">
                    <h3 className="font-bold text-lg">Quét Mã {mode === "BARCODE" ? "Vạch" : "QR"}</h3>
                    <button onClick={onClose} className="p-2 text-slate-500">✕</button>
                </div>

                <div id={scannerId} className="w-full bg-black shrink-0 min-h-[300px] overflow-hidden rounded-lg relative">
                    {/* Scanner area */}
                </div>

                <div className="mt-4 space-y-3 shrink-0">
                    <p className="text-center text-sm text-slate-500">
                        Di chuyển camera vào mã cần quét
                    </p>

                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-red-100 text-red-600 rounded-lg font-bold"
                    >
                        Đóng Camera
                    </button>
                </div>
            </div>
        </div>
    )
}
