"use client"

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"

interface ScannerProps {
    onScan: (code: string) => void
    onClose: () => void
    mode?: "BARCODE" | "ALL"
}

const CAMERA_PREF_KEY = "wms_camera_pref_id"

export function QRScanner({ onScan, onClose, mode = "ALL" }: ScannerProps) {
    const [cameraStarted, setCameraStarted] = useState(false)
    const [error, setError] = useState<string>("")
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const scannerId = "d-qr-reader"

    const [cameras, setCameras] = useState<any[]>([])
    const [selectedCameraId, setSelectedCameraId] = useState<string>("")
    const [camerasLoaded, setCamerasLoaded] = useState(false)

    // 1. Initialize
    useEffect(() => {
        const init = async () => {
            // Optimistic check for cached ID
            // Optimistic check for cached ID
            const cachedId = localStorage.getItem(CAMERA_PREF_KEY)
            if (cachedId) {
                setSelectedCameraId(cachedId)
                // NOTE: We do NOT fetch cameras here to avoid race condition with start()
            } else {
                fetchCamerasAndSelectBest()
            }
        }
        init()
    }, [])

    // 2. Start/Restart Camera when ID changes
    useEffect(() => {
        if (!selectedCameraId) return

        const startCamera = async () => {
            setCameraStarted(false)
            setError("") // Clear error

            // Save preference
            localStorage.setItem(CAMERA_PREF_KEY, selectedCameraId)

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
                    selectedCameraId,
                    {
                        fps: 15,
                        qrbox: qrBoxFunction,
                        disableFlip: false,
                        aspectRatio: 1.0,
                        videoConstraints: {
                            deviceId: { exact: selectedCameraId },
                            focusMode: "continuous",
                            width: { min: 640, ideal: 1280, max: 1920 },
                            height: { min: 480, ideal: 720, max: 1080 },
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

                // SUCCESS
                setCameraStarted(true)

                // If we succeeded but don't have the list yet (optimistic case), fetch it now safely
                if (cameras.length === 0) {
                    Html5Qrcode.getCameras().then(devices => {
                        if (devices) setCameras(devices)
                    }).catch(e => console.warn("Bg fetch failed", e))
                }

            } catch (e: any) {
                console.error("Start failed", e)

                // FAIL RECOVERY
                // If we failed with the cached ID, we should try to reset and fetch fresh
                const cached = localStorage.getItem(CAMERA_PREF_KEY)
                if (cached === selectedCameraId) {
                    console.log("Cached ID failed, retrying with fresh list...")
                    localStorage.removeItem(CAMERA_PREF_KEY)
                    // Trigger fallback
                    // We must ensure we don't loop if fetchCamerasAndSelectBest picks the same broken ID
                    // But typically ID changes or is invalid, so picking fresh is correct.
                    fetchCamerasAndSelectBest()
                } else {
                    setError("Không thể khởi động camera. Hãy thử chọn camera khác.")
                }
            }
        }

        // Slight delay to ensure DOM and cleanup
        const t = setTimeout(startCamera, 100)

        return () => {
            clearTimeout(t)
            if (scannerRef.current) {
                try {
                    scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => { })
                } catch (e) { }
                scannerRef.current = null
            }
        }
    }, [selectedCameraId, mode])

    // Manual Switch Handler
    const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedCameraId(e.target.value)
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white p-4 rounded-xl w-full max-w-sm relative flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-2 shrink-0">
                    <h3 className="font-bold text-lg">Quét Mã {mode === "BARCODE" ? "Vạch" : "QR"}</h3>
                    <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">✕</button>
                </div>

                <div className="relative w-full shrink-0 bg-black rounded-lg overflow-hidden min-h-[300px]">
                    <div id={scannerId} className="w-full h-full"></div>

                    {/* Camera Select Dropdown */}
                    {cameras.length > 1 && (
                        <div className="absolute top-2 right-2 z-10">
                            <select
                                value={selectedCameraId}
                                onChange={handleCameraChange}
                                className="text-xs p-1.5 rounded bg-white/90 font-medium border-none shadow-sm text-black max-w-[150px] outline-none"
                            >
                                {cameras.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.label || `Camera ${c.id.substring(0, 4)}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

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
                        {cameraStarted ? "Giữ camera ổn định để lấy nét" : "Đang chuẩn bị..."}
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
