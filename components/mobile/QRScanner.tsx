"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"

interface ScannerProps {
    onScan: (code: string) => void
    onClose: () => void
    mode?: "BARCODE" | "ALL"
}

export function QRScanner({ onScan, onClose, mode = "ALL" }: ScannerProps) {
    const [cameraStarted, setCameraStarted] = useState(false)
    const [error, setError] = useState<string>("")
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const scannerId = "d-qr-reader"

    // 1. Start Camera
    useLayoutEffect(() => {
        const startCamera = async () => {
            setCameraStarted(false)
            setError("")

            // Cleanup previous instance
            if (scannerRef.current) {
                try {
                    await scannerRef.current.stop()
                    scannerRef.current.clear()
                } catch (e) { }
                scannerRef.current = null
            }

            // Create new instance
            const scanner = new Html5Qrcode(scannerId, {
                verbose: false,
                experimentalFeatures: { useBarCodeDetectorIfSupported: true }
            })
            scannerRef.current = scanner

            try {
                const qrBoxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
                    return {
                        width: Math.floor(minEdge * 0.7),
                        height: Math.floor(minEdge * (mode === "BARCODE" ? 0.4 : 0.7))
                    }
                }
                const lastScanRef = { current: 0 }

                await scanner.start(
                    { facingMode: "environment" },
                    {
                        fps: 20,
                        qrbox: qrBoxFunction,
                        disableFlip: false,
                        aspectRatio: 1.0,
                        videoConstraints: {
                            facingMode: "environment",
                            // @ts-ignore
                            focusMode: "continuous",
                            width: { min: 480, ideal: 720, max: 1280 },
                            height: { min: 480, ideal: 720, max: 1280 },
                        },
                        formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
                    },
                    (decodedText: string) => {
                        const now = Date.now()
                        if (now - lastScanRef.current < 1500) return
                        lastScanRef.current = now
                        if (navigator.vibrate) navigator.vibrate(200)
                        onScan(decodedText)
                    },
                    (errorMessage: string) => { }
                )

                setCameraStarted(true)
            } catch (e: any) {
                console.error("Start failed", e)
                setError("Không thể khởi động camera sau. Vui lòng cấp quyền truy cập camera.")
            }
        }

        startCamera()

        return () => {
            if (scannerRef.current) {
                try {
                    const scanner = scannerRef.current
                    scanner.stop().then(() => scanner.clear()).catch(() => { })
                } catch (e) { }
                scannerRef.current = null
            }
        }
    }, [mode])

    return (
        <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-4 rounded-xl w-full max-w-sm relative flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-2 shrink-0">
                    <h3 className="font-bold text-lg">Quét Mã {mode === "BARCODE" ? "Vạch" : "QR"}</h3>
                    <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">✕</button>
                </div>

                <div className="relative w-full shrink-0 bg-black rounded-lg overflow-hidden min-h-[300px]">
                    <div id={scannerId} className="w-full h-full"></div>

                    {!cameraStarted && !error && (
                        <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/50 backdrop-blur-sm z-20">
                            <div className="text-center">
                                <div className="animate-spin h-8 w-8 border-4 border-white/30 border-t-white rounded-full mx-auto mb-3"></div>
                                <p>Đang khởi động...</p>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center text-white text-sm p-6 text-center bg-black/80 z-20">
                            <div>
                                <div className="text-4xl mb-3">⚠️</div>
                                <p className="text-red-300 font-medium">{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4 space-y-3 shrink-0">
                    <p className="text-center text-xs text-slate-400">
                        Camera sau đang hoạt động
                    </p>

                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-slate-100 active:bg-slate-200 text-slate-900 rounded-lg font-bold transition-colors"
                    >
                        Đóng Camera
                    </button>
                </div>
            </div>
        </div>
    )
}
