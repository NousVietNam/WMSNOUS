import { useState } from "react"
import { X, AlertTriangle, ArrowRightLeft, Search } from "lucide-react"
import { QRScanner } from "@/components/mobile/QRScanner"

interface PickExceptionModalProps {
    isOpen: boolean
    onClose: () => void
    task: any
    onConfirmShortage: (qty: number, reason: string) => void
    onConfirmSwap: (newBoxCode: string) => void
    isSubmitting: boolean
}

export function PickExceptionModal({ isOpen, onClose, task, onConfirmShortage, onConfirmSwap, isSubmitting }: PickExceptionModalProps) {
    const [mode, setMode] = useState<'MENU' | 'SHORTAGE' | 'SWAP'>('MENU')
    const [qty, setQty] = useState<number>(0)
    const [reason, setReason] = useState("Hàng thiếu / Không tìm thấy")
    const [showScanner, setShowScanner] = useState(false)

    if (!isOpen || !task) return null

    const REASONS = [
        "Hàng thiếu / Không tìm thấy",
        "Hàng hư hỏng / Lỗi",
        "Mã vạch không đọc được",
        "Khác"
    ]

    const handleScan = (code: string) => {
        setShowScanner(false)
        onConfirmSwap(code)
    }

    const renderMenu = () => (
        <div className="space-y-3">
            <button
                onClick={() => setMode('SWAP')}
                className="w-full p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between active:scale-95 transition-all"
            >
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                        <ArrowRightLeft className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-blue-900">Lấy từ thùng khác</div>
                        <div className="text-xs text-blue-600">Tìm sản phẩm này ở vị trí khác</div>
                    </div>
                </div>
                <div className="text-blue-400">→</div>
            </button>

            <button
                onClick={() => setMode('SHORTAGE')}
                className="w-full p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between active:scale-95 transition-all"
            >
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-orange-900">Báo thiếu / Lỗi</div>
                        <div className="text-xs text-orange-600">Ghi nhận thiếu và tiếp tục</div>
                    </div>
                </div>
                <div className="text-orange-400">→</div>
            </button>
        </div>
    )

    const renderShortage = () => (
        <div className="space-y-4 animate-in slide-in-from-right">
            <div className="flex gap-4">
                <div className="flex-1 p-3 bg-slate-50 rounded border text-center">
                    <div className="text-xs text-slate-500 uppercase font-bold">Yêu cầu</div>
                    <div className="text-2xl font-black text-slate-800">{task.quantity}</div>
                </div>
                <div className="flex-1 p-3 bg-blue-50 rounded border border-blue-100 text-center">
                    <div className="text-xs text-blue-600 uppercase font-bold">Thực tế lấy</div>
                    <input
                        type="number"
                        autoFocus
                        value={qty}
                        onChange={e => setQty(Math.min(task.quantity, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full text-center text-2xl font-black text-blue-700 bg-transparent outline-none p-0"
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-sm font-bold text-slate-700">Lý do</label>
                <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full h-12 px-3 rounded-lg border border-slate-300 bg-white"
                >
                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            </div>

            <div className="bg-red-50 p-3 rounded text-xs text-red-600 leading-relaxed">
                ⚠️ Phần thiếu ({task.quantity - qty}) sẽ được ghi nhận "Ngoại lệ".
            </div>

            <button
                onClick={() => onConfirmShortage(qty, reason)}
                disabled={isSubmitting}
                className="w-full h-12 bg-orange-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all"
            >
                {isSubmitting ? "Đang xử lý..." : "Xác Nhận Báo Cáo"}
            </button>

            <button onClick={() => setMode('MENU')} className="w-full py-3 text-slate-500 font-bold text-sm">Quay lại</button>
        </div>
    )

    const renderSwap = () => (
        <div className="space-y-4 animate-in slide-in-from-right text-center py-4">
            <div className="mx-auto h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2 animate-bounce">
                <Search className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Tìm sản phẩm thay thế</h3>
            <p className="text-sm text-slate-500 px-4">Quét mã thùng bất kỳ có chứa sản phẩm <b>{task.products?.sku}</b> để lấy thay thế.</p>

            <button
                onClick={() => setShowScanner(true)}
                className="w-full h-12 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                Mở Máy Quét
            </button>
            <button onClick={() => setMode('MENU')} className="w-full py-3 text-slate-500 font-bold text-sm">Quay lại</button>
        </div>
    )

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                <div className="bg-slate-50 p-4 border-b flex justify-between items-center">
                    <div className="font-bold text-slate-700">
                        {mode === 'MENU' ? 'Xử lý sự cố' : mode === 'SHORTAGE' ? 'Báo thiếu hàng' : 'Lấy hàng thay thế'}
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5">
                    <div className="mb-4 pb-4 border-b">
                        <div className="text-xs text-slate-400 uppercase font-bold">Sản phẩm đang xử lý</div>
                        <div className="font-bold text-slate-800 text-lg">{task.products?.sku}</div>
                    </div>

                    {mode === 'MENU' && renderMenu()}
                    {mode === 'SHORTAGE' && renderShortage()}
                    {mode === 'SWAP' && renderSwap()}
                </div>
            </div>
        </div>
    )
}
