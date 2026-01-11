"use client"


import { useState } from "react"
import { useRouter } from "next/navigation"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import MobileScannerInput from "@/components/mobile/MobileScannerInput"

export default function ShipPage() {
    const router = useRouter()
    const [code, setCode] = useState("")
    const [loading, setLoading] = useState(false)

    const handleShip = async () => {
        if (!code) return
        if (!confirm(`Xác nhận Giao Hàng (Ship) thùng ${code}? Tồn kho sẽ bị trừ.`)) return

        setLoading(true)
        try {
            const res = await fetch('/api/ship', {
                method: 'POST',
                body: JSON.stringify({ code })
            })
            const json = await res.json()
            if (json.success) {
                alert(`Đã ship thành công ${json.count} sản phẩm!`)
                setCode("")
            } else {
                alert("Lỗi: " + json.error)
            }
        } catch (e) {
            alert("Lỗi kết nối")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <MobileHeader title="Giao Hàng (Ship)" backLink="/mobile" />

            <div className="p-4 space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                    <div className="flex items-center gap-3 text-slate-800 mb-2">
                        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
                        </div>
                        <div className="font-bold text-lg">Quét Thùng Xuất</div>
                    </div>
                    <div className="space-y-4">
                        <MobileScannerInput
                            autoFocus
                            placeholder="Quét mã Thùng (OUT-...)"
                            value={code}
                            onChange={setCode}
                            onEnter={handleShip}
                            className="h-16 text-xl text-center font-bold"
                        />
                        <button
                            className="w-full h-14 text-lg font-bold bg-green-600 text-white rounded-lg shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700"
                            onClick={handleShip}
                            disabled={loading}
                        >
                            {loading ? 'Đang Xử Lý...' : 'Xác Nhận SHIP'}
                        </button>
                    </div>
                </div>

                <div className="bg-yellow-50 p-4 rounded text-sm text-yellow-800 border border-yellow-200">
                    Lưu ý: Hành động này sẽ <b>xóa tồn kho</b> của các sản phẩm trong thùng và ghi nhận giao dịch <b>SHIP</b>.
                </div>
            </div>
        </div>
    )
}
