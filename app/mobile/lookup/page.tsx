"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { supabase } from "@/lib/supabase"

import MobileScannerInput from "@/components/mobile/MobileScannerInput"

export default function MobileLookupPage() {
    const [code, setCode] = useState("")
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleLookup = async () => {
        if (!code) return
        setLoading(true)

        const trimmed = code.trim().toUpperCase()

        // 1. Check BOX
        if (trimmed.startsWith("BOX")) {
            router.push(`/mobile/box/${trimmed}`)
            return
        }

        // 2. Check Locations
        try {
            const { data: loc } = await supabase.from('locations').select('id').eq('code', trimmed).maybeSingle()
            if (loc) {
                router.push(`/mobile/locations/${loc.id}`)
                return
            }
        } catch (e) { console.error(e) }

        // 3. Fallback: Product
        router.push(`/mobile/lookup/product/${encodeURIComponent(trimmed)}`)
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Tra Cứu Đa Năng" backLink="/mobile" />

            <div className="p-4 space-y-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border flex flex-col items-center text-center gap-4">
                    <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Quét Thông Minh</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Hỗ trợ: Barcode Sản Phẩm, Mã Thùng (BOX), Mã Vị Trí
                        </p>
                    </div>

                    <MobileScannerInput
                        autoFocus
                        placeholder="Quét mã bất kỳ..."
                        value={code}
                        onChange={setCode}
                        onEnter={handleLookup}
                        className="h-14 text-lg text-center font-bold"
                        mode="ALL"
                    />

                    <button
                        className="w-full h-12 bg-blue-600 text-white rounded-xl font-bold shadow-md active:scale-95 transition-all text-lg"
                        onClick={handleLookup}
                        disabled={loading}
                    >
                        {loading ? 'Đang Kiểm Tra...' : 'Tra Cứu'}
                    </button>
                </div>

                {/* Visual Guidelines */}
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <div className="flex flex-col items-center gap-1 p-2 bg-white rounded border">
                        <span className="font-bold text-blue-500">BOX-123</span>
                        <span>Thùng</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 p-2 bg-white rounded border">
                        <span className="font-bold text-violet-500">LOC-A1</span>
                        <span>Vị Trí</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 p-2 bg-white rounded border">
                        <span className="font-bold text-emerald-500">893...</span>
                        <span>Sản Phẩm</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
