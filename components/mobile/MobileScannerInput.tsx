"use client"

import React, { useState, useRef, useEffect } from "react"
import { QRScanner } from "./QRScanner"
import { Mic, MicOff, Camera } from "lucide-react"
import { toast } from "sonner"

// const QRScanner = dynamic(() => import("./QRScanner").then(mod => mod.QRScanner), { ssr: false })

interface MobileScannerInputProps {
    value: string
    onChange: (val: string) => void
    onEnter?: () => void
    placeholder?: string
    className?: string
    autoFocus?: boolean
    onScan?: any
    mode?: "BARCODE" | "ALL"
}

export default function MobileScannerInput({ value, onChange, onEnter, placeholder, className, autoFocus, mode }: MobileScannerInputProps) {
    const [showScanner, setShowScanner] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const recognitionRef = useRef<any>(null)

    // Preload Scanner Script
    useEffect(() => {
        // @ts-ignore
        if (typeof window !== 'undefined' && !window.Html5Qrcode) {
            const script = document.createElement("script")
            script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
            script.async = true
            document.body.appendChild(script)
        }
    }, [])

    const toggleListening = () => {
        if (typeof window === 'undefined') return

        // 1. Check for HTTPS (Mandatory for Web Speech on iOS)
        if (!window.isSecureContext) {
            return toast.error("Nhận diện giọng nói yêu cầu kết nối bảo mật (HTTPS).")
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) {
            return toast.error("Trình duyệt không hỗ trợ nhận diện giọng nói")
        }

        if (isListening) {
            if (recognitionRef.current) recognitionRef.current.stop()
            return
        }

        try {
            // 2. Instantiate on-demand for iOS compatibility
            const recognition = new SpeechRecognition()

            // iOS Safari often works better with these settings
            recognition.continuous = true
            recognition.interimResults = true
            recognition.lang = 'vi-VN'

            recognition.onstart = () => setIsListening(true)
            recognition.onend = () => setIsListening(false)

            let finalTranscript = ''

            recognition.onerror = (event: any) => {
                console.error("Speech Error", event)
                setIsListening(false)
                if (event.error === 'service-not-allowed') {
                    toast.error("iOS chặn quyền: Hãy vào Cài đặt > Cài đặt chung > Bàn phím > Bật 'Đọc chính tả'.")
                } else if (event.error !== 'no-speech') {
                    toast.error("Lỗi: " + event.error)
                }
            }

            recognition.onresult = (event: any) => {
                let currentTranscript = ''
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript
                    } else {
                        currentTranscript += event.results[i][0].transcript
                    }
                }

                const textToUse = (finalTranscript || currentTranscript).replace(/\s/g, '').toUpperCase()
                if (textToUse) {
                    onChange(textToUse)
                    // If we have a final result, stop and trigger search
                    if (finalTranscript) {
                        recognition.stop()
                        toast.success(`Đã nhận diện: ${textToUse}`)
                        if (onEnter) setTimeout(() => onEnter(), 300)
                    }
                }
            }

            recognitionRef.current = recognition

            // 3. Small delay to ensure clean startup context on iOS
            setTimeout(() => {
                try {
                    recognition.start()
                } catch (e) {
                    console.error("Recognition start internal error", e)
                }
            }, 100)

        } catch (e: any) {
            console.error("Failed to start speech", e)
            toast.error("Không thể khởi động giọng nói")
        }
    }

    // Helper to handle scan result
    const handleScan = (code: string) => {
        onChange(code)
        setShowScanner(false)
        if (onEnter) {
            setTimeout(() => onEnter(), 100)
        }
    }

    return (
        <div className="relative w-full">
            <div className="relative">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
                    placeholder={placeholder || (isListening ? "Đang lắng nghe..." : "Nhập mã...")}
                    className={`w-full pl-4 pr-24 py-4 rounded-2xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all text-lg font-medium ${isListening ? 'bg-indigo-50 border-indigo-300' : ''} ${className}`}
                    autoFocus={autoFocus}
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 gap-1">
                    <button
                        type="button"
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${isListening ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}
                        onClick={toggleListening}
                        tabIndex={-1}
                    >
                        {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </button>
                    <button
                        type="button"
                        className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-all active:scale-90"
                        onClick={() => setShowScanner(true)}
                        tabIndex={-1}
                    >
                        <Camera className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {showScanner && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
                    <QRScanner
                        onScan={handleScan}
                        onClose={() => setShowScanner(false)}
                        mode={mode}
                    />
                </div>
            )}
        </div>
    )
}
