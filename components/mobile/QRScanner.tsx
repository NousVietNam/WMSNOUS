"use client"

import { useEffect, useRef, useState } from "react"

interface ScannerProps {
    onScan: (code: string) => void
    onClose: () => void
    mode?: "BARCODE" | "ALL"
}

export function QRScanner({ onScan, onClose, mode = "ALL" }: ScannerProps) {
    const [scriptLoaded, setScriptLoaded] = useState(false)
    const [cameraStarted, setCameraStarted] = useState(false)
    const [error, setError] = useState<string>("")
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
        script.onerror = () => setError("Không thể tải thư viện QR Scanner")
        document.body.appendChild(script)
    }, [])

    useEffect(() => {
        if (!scriptLoaded) return

        const initScanner = async () => {
            // @ts-ignore
            if (!window.Html5Qrcode) {
                setError("Thư viện QR chưa sẵn sàng")
                return
            }

            try {
                // @ts-ignore
                const scanner = new window.Html5Qrcode(scannerId, {
                    verbose: true, // Enable verbose logging temporarily for debugging
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true // Re-enable for better detection
                    }
                })

                scannerRef.current = scanner

                // Responsive qrbox: smaller for better focus
                const qrBoxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
                    return {
                        width: Math.floor(minEdge * 0.65), // Reduced to 0.65 for better focus
                        height: Math.floor(minEdge * (mode === "BARCODE" ? 0.35 : 0.65))
                    }
                }

                await scanner.start(
                    { facingMode: "environment" },
                    {
                        fps: 10, // Reduced from 30 to 10 - optimal for mobile
                        qrbox: qrBoxFunction,
                        disableFlip: false,
                        aspectRatio: 1.0,
                        // Support various barcode formats
                        formatsToSupport: [
                            0,  // QR_CODE
                            8,  // CODE_128
                            7,  // CODE_93
                            6,  // CODE_39
                            13, // EAN_13
                            12, // EAN_8
                            14, // UPC_A
                            15  // UPC_E
                        ]
                    },
                    (decodedText: string) => {
                        console.log("✅ QR Scanner detected code:", decodedText)
                        // Vibrate on successful scan (if supported)
                        if (navigator.vibrate) {
                            navigator.vibrate(200)
                        }
                        onScan(decodedText)
                    },
                    (errorMessage: string) => {
                        // Error callback - fires frequently, don't log
                    }
                )

                setCameraStarted(true)
            } catch (e: any) {
                console.error("Scanner init failed", e)
                setError(e.message || "Không thể khởi động camera. Vui lòng cấp quyền truy cập camera.")
            }
        }

        const timer = setTimeout(initScanner, 100)

        return () => {
            clearTimeout(timer)
            if (scannerRef.current) {
                try {
                    scannerRef.current
                        .stop()
                        .then(() => {
                            if (scannerRef.current) {
                                scannerRef.current.clear()
                            }
                        })
                        .catch((err: any) => {
                            console.warn("Scanner stop error (safe to ignore):", err)
                            // Attempt to clear anyway
                            try {
                                if (scannerRef.current) {
                                    scannerRef.current.clear()
                                }
                            } catch (clearErr) {
                                console.warn("Scanner clear error (safe to ignore):", clearErr)
                            }
                        })
                } catch (err) {
                    console.warn("Scanner cleanup error (safe to ignore):", err)
                }
                scannerRef.current = null
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

                {/* Loading/Error overlay - OUTSIDE scanner div to prevent DOM conflicts */}
                <div className="relative w-full shrink-0">
                    <div id={scannerId} className="w-full bg-black min-h-[300px] overflow-hidden rounded-lg"></div>

                    {!scriptLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black rounded-lg">
                            <div className="text-center">
                                <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                                Đang tải thư viện...
                            </div>
                        </div>
                    )}
                    {scriptLoaded && !cameraStarted && !error && (
                        <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black rounded-lg">
                            <div className="text-center">
                                <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                                Đang khởi động camera...
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm p-4 text-center bg-black rounded-lg">
                            <div>
                                <div className="text-4xl mb-2">⚠️</div>
                                {error}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4 space-y-3 shrink-0">
                    <p className="text-center text-sm text-slate-500">
                        {cameraStarted && "Di chuyển camera vào mã cần quét"}
                        {error && "Kiểm tra quyền camera trong cài đặt trình duyệt"}
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
