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

    // Initialize Speech Recognition
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition()
                recognition.continuous = false
                recognition.interimResults = false
                recognition.lang = 'vi-VN' // Default to Vietnamese for better local number recognition

                recognition.onstart = () => setIsListening(true)
                recognition.onend = () => setIsListening(false)
                recognition.onerror = (event: any) => {
                    console.error("Speech Error", event)
                    setIsListening(false)
                    if (event.error !== 'no-speech') {
                        toast.error("Lỗi nhận diện giọng nói: " + event.error)
                    }
                }
                recognition.onresult = (event: any) => {
                    const transcript = event.results[0][0].transcript
                    // Clean up: remove spaces (common in dictated numbers), keep alphanumeric
                    const cleaned = transcript.replace(/\s/g, '').toUpperCase()
                    onChange(cleaned)
                    toast.success(`Đã nhận diện: ${cleaned}`)
                    if (onEnter) setTimeout(() => onEnter(), 300)
                }
                recognitionRef.current = recognition
            }
        }

        return () => {
            if (recognitionRef.current) recognitionRef.current.abort()
        }
    }, [onChange, onEnter])

    const toggleListening = () => {
        if (!recognitionRef.current) {
            return toast.error("Trình duyệt không hỗ trợ nhận diện giọng nói")
        }

        if (isListening) {
            recognitionRef.current.stop()
        } else {
            try {
                recognitionRef.current.start()
            } catch (e) {
                console.warn("Recognition already started")
            }
        }
    }

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
