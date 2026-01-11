"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { MobileHeader } from "@/components/mobile/MobileHeader"

import MobileScannerInput from "@/components/mobile/MobileScannerInput"

export default function MobileBarcodePage() {
    const [code, setCode] = useState("")
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleLookup = async () => {
        if (!code) return
        setLoading(true)

        const trimmed = code.trim().toUpperCase()

        // Barcode ONLY: Just go to product detail
        router.push(`/mobile/lookup/product/${encodeURIComponent(trimmed)}`)
    }



    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Check Mã Hàng" backLink="/mobile" />

            <div className="p-4 space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
                    <div className="text-center font-bold text-lg text-slate-800">Bước 1: Quét Mã</div>
                    <div className="space-y-4">
                        <MobileScannerInput
                            autoFocus
                            placeholder="Quét mã hàng..."
                            value={code}
                            onChange={setCode}
                            onEnter={handleLookup}
                            className="h-14 text-lg text-center font-bold"
                        // We need to pass a signal for barcode only. 
                        // Since I can't pass the enum, I will update QRScanner to handle string 'BARCODE_ONLY'
                        />
                        <button
                            className="w-full h-12 bg-indigo-600 text-white rounded-lg font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleLookup}
                            disabled={loading}
                        >
                            {loading ? 'Đang Kiểm Tra...' : 'Tra Cứu'}
                        </button>
                    </div>
                </div>
                <div className="text-center text-xs text-slate-400 mt-4">
                    Chế độ: Chỉ quét Barcode sản phẩm
                </div>
            </div>
        </div>
    )
}
