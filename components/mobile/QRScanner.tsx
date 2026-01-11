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
        // Check if already loaded
        // @ts-ignore
        if (window.Html5Qrcode) {
            setScriptLoaded(true)
            return
        }

        const script = document.createElement("script")
        script.src = "https://unpkg.com/html5-qrcode"
        script.onload = () => {
            console.log("Manual script loaded")
            setScriptLoaded(true)
        }
        script.onerror = (e) => console.error("Manual script failed", e)
        document.body.appendChild(script)

        return () => {
        }
    }, [])

    useEffect(() => {
        if (!scriptLoaded) return

        const initScanner = async () => {
            // @ts-ignore
            if (!window.Html5Qrcode) return

            try {
                let formats = undefined
                if (mode === "BARCODE") {
                    formats = [
                        // @ts-ignore
                        window.Html5QrcodeSupportedFormats.CODE_128,
                        // @ts-ignore
                        window.Html5QrcodeSupportedFormats.EAN_13,
                        // @ts-ignore
                        window.Html5QrcodeSupportedFormats.CODE_39,
                        // @ts-ignore
                        window.Html5QrcodeSupportedFormats.UPC_A,
                        // @ts-ignore
                        window.Html5QrcodeSupportedFormats.UPC_E,
                    ]
                }

                // Use Html5Qrcode (Core) instead of Scanner (Widget) to force camera
                // @ts-ignore
                const scanner = new window.Html5Qrcode(scannerId, {
                    formatsToSupport: formats,
                    verbose: false
                })

                scannerRef.current = scanner

                // Determine box dimensions
                const qrBoxSize = mode === "BARCODE"
                    ? { width: 300, height: 150 }   // Rectangle for Barcode
                    : { width: 250, height: 250 }   // Square for QR/Universal

                await scanner.start(
                    { facingMode: "environment" }, // Prefer Back Camera
                    {
                        fps: 10,
                        qrbox: qrBoxSize,
                        aspectRatio: 1.0,
                    },
                    (decodedText: string) => {
                        onScan(decodedText)
                        // Don't stop automatically, let user scan multiple or close? 
                        // Actually better to pause or let parent close.
                        // Parent calls onClose -> cleanup
                    },
                    (errorMessage: string) => {
                        // ignore
                    }
                )

            } catch (e) {
                console.error("Scanner init failed", e)
                // Fallback or retry?
            }
        }

        // Small timeout to ensure DOM is ready
        const timer = setTimeout(initScanner, 100)

        return () => {
            clearTimeout(timer)
            if (scannerRef.current) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current.clear()
                }).catch((err: any) => console.error("Failed to stop scanner", err))
            }
        }
    }, [scriptLoaded, onScan, mode])

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-4 rounded-xl w-full max-w-sm relative">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-lg">Quét Mã QR/Barcode</h3>
                    <button onClick={onClose} className="p-2 text-slate-500">✕</button>
                </div>

                <div id={scannerId} className="w-full overflow-hidden rounded-lg bg-slate-100 min-h-[300px]"></div>

                {!scriptLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                        <span className="text-slate-500">Đang tải thư viện...</span>
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="mt-4 w-full py-3 bg-red-100 text-red-600 rounded-lg font-bold"
                >
                    Đóng Camera
                </button>
            </div>
        </div>
    )
}
