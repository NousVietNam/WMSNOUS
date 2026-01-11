"use client"

import React, { useState } from "react"
import { QRScanner } from "./QRScanner"

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
                    placeholder={placeholder || "Nhập mã..."}
                    className={`w-full pl-4 pr-12 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${className}`}
                    autoFocus={autoFocus}
                />
                <button
                    className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center text-slate-400 hover:text-indigo-600 active:scale-90 transition-all"
                    onClick={() => setShowScanner(true)}
                    tabIndex={-1}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                </button>
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
