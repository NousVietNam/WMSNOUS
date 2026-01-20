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

    const [cameras, setCameras] = useState<any[]>([])
    const [selectedCameraId, setSelectedCameraId] = useState<string>("")
    const [camerasLoaded, setCamerasLoaded] = useState(false)
    const [showCameraSelect, setShowCameraSelect] = useState(false)

    // 1. Load Script
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

    // 2. Enumerate Cameras (Once Script Loaded)
    useEffect(() => {
        if (!scriptLoaded || camerasLoaded) return

        const getCameras = async () => {
            // @ts-ignore
            if (!window.Html5Qrcode) return

            try {
                // @ts-ignore
                const devices = await window.Html5Qrcode.getCameras()
                console.log("Scanner Devices:", devices)

                if (devices && devices.length > 0) {
                    setCameras(devices)

                    // Intelligent Choice
                    let bestId = devices[0].id
                    const backCams = devices.filter((d: any) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('sau'))

                    if (backCams.length > 0) {
                        // Avoid "wide" / "telephoto" if possible to get the MAIN camera
                        // iPhone normally labels the main camera as "Back Camera" and ultra-wide as "Back Camera (Ultra Wide)"
                        const mainBack = backCams.find((d: any) =>
                            !d.label.toLowerCase().includes('wide') &&
                            !d.label.toLowerCase().includes('rộng') &&
                            !d.label.toLowerCase().includes('telephoto')
                        )
                        bestId = mainBack ? mainBack.id : backCams[0].id
                    }

                    setSelectedCameraId(bestId)
                } else {
                    setError("Không tìm thấy camera")
                }
                setCamerasLoaded(true)
            } catch (e: any) {
                console.error("Camera enum error", e)
                setError("Lỗi quyền truy cập Camera")
            }
        }

        getCameras()
    }, [scriptLoaded, camerasLoaded])

    // 3. Start/Restart Camera when ID changes
    useEffect(() => {
        if (!scriptLoaded || !selectedCameraId) return

        const startCamera = async () => {
            setCameraStarted(false)
            // Cleanup previous instance if any
            if (scannerRef.current) {
                try {
                    await scannerRef.current.stop()
                    scannerRef.current.clear()
                } catch (e) { console.warn(e) }
                scannerRef.current = null
            }

            // @ts-ignore
            const scanner = new window.Html5Qrcode(scannerId, {
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
                        fps: 10,
                        qrbox: qrBoxFunction,
                        disableFlip: false,
                        aspectRatio: 1.0,
                        videoConstraints: {
                            focusMode: "continuous", // vital for barcodes
                            width: { min: 640, ideal: 1280, max: 1920 },
                            height: { min: 480, ideal: 720, max: 1080 },
                        },
                        formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
                    },
                    (decodedText: string) => {
                        const now = Date.now()
                        if (now - lastScanRef.current < 2000) return
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

        // Small delay to ensure DOM is ready and previous streams closed
        const t = setTimeout(startCamera, 300)
        return () => {
            clearTimeout(t)
            if (scannerRef.current) {
                try {
                    scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => { })
                } catch (e) { }
                scannerRef.current = null
            }
        }
    }, [selectedCameraId, scriptLoaded, mode]) // Added mode to allow restart if mode changes

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-4 rounded-xl w-full max-w-sm relative flex flex-col">
                <div className="flex justify-between items-center mb-2 shrink-0">
                    <h3 className="font-bold text-lg">Quét Mã {mode === "BARCODE" ? "Vạch" : "QR"}</h3>
                    <button onClick={onClose} className="p-2 text-slate-500">✕</button>
                </div>

                <div className="relative w-full shrink-0">
                    <div id={scannerId} className="w-full bg-black min-h-[300px] overflow-hidden rounded-lg"></div>

                    {/* Camera Select Dropdown */}
                    {cameras.length > 1 && (
                        <div className="absolute top-2 right-2 z-10">
                            <select
                                value={selectedCameraId}
                                onChange={(e) => setSelectedCameraId(e.target.value)}
                                className="text-xs p-1 rounded bg-white/80 border text-black max-w-[150px]"
                            >
                                {cameras.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.label || `Camera ${c.id.substring(0, 4)}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

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
                                Đang khởi động...
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
                        {cameraStarted && "Di chuyển camera vào mã cần quét. Nếu mờ, hãy thử đổi camera."}
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
