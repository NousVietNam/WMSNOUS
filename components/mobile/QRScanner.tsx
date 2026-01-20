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

    // 1. Enumerate Cameras & Initialize
    useEffect(() => {
        const initScanner = async () => {
            try {
                const devices = await Html5Qrcode.getCameras()
                console.log("Scanner Devices:", devices)

                if (devices && devices.length > 0) {
                    setCameras(devices)

                    // 1. Check cached preference
                    const cachedId = localStorage.getItem(CAMERA_PREF_KEY)
                    const cachedCam = devices.find(d => d.id === cachedId)

                    if (cachedCam) {
                        setSelectedCameraId(cachedCam.id)
                    } else {
                        // 2. Intelligent Auto-Select (Fallback)
                        let bestId = devices[0].id
                        const backCams = devices.filter((d: any) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('sau'))

                        if (backCams.length > 0) {
                            const mainBack = backCams.find((d: any) =>
                                !d.label.toLowerCase().includes('wide') &&
                                !d.label.toLowerCase().includes('rộng') &&
                                !d.label.toLowerCase().includes('telephoto')
                            )
                            bestId = mainBack ? mainBack.id : backCams[0].id
                        }
                        setSelectedCameraId(bestId)
                    }
                } else {
                    setError("Không tìm thấy camera")
                }
                setCamerasLoaded(true)
            } catch (e: any) {
                console.error("Camera enum error", e)
                setError("Lỗi quyền truy cập Camera")
            }
        }

        initScanner()
    }, [])

    // 2. Start/Restart Camera when ID changes
    useEffect(() => {
        if (!selectedCameraId) return

        const startCamera = async () => {
            setCameraStarted(false)

            // Save preference
            localStorage.setItem(CAMERA_PREF_KEY, selectedCameraId)

            // Cleanup previous instance
            if (scannerRef.current) {
                try {
                    await scannerRef.current.stop()
                    scannerRef.current.clear()
                } catch (e) { console.warn("Stop error", e) }
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
                        fps: 15, // Increased FPS for faster feel
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
                setCameraStarted(true)
            } catch (e: any) {
                console.error("Start failed", e)
                setError("Không thể khởi động camera này")
            }
        }

        // Reduced delay to 50ms for faster startup
        const t = setTimeout(startCamera, 50)
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
