import { useState } from "react"
import { X, AlertTriangle } from "lucide-react"

interface ReportIssueModalProps {
    isOpen: boolean
    onClose: () => void
    task: any
    onConfirm: (qty: number, reason: string) => void
    isSubmitting: boolean
}

export function ReportIssueModal({ isOpen, onClose, task, onConfirm, isSubmitting }: ReportIssueModalProps) {
    const [qty, setQty] = useState<number>(0)
    const [reason, setReason] = useState("Hàng thiếu / Không tìm thấy")

    if (!isOpen || !task) return null

    const REASONS = [
        "Hàng thiếu / Không tìm thấy",
        "Hàng hư hỏng / Lỗi",
        "Mã vạch không đọc được",
        "Khác"
    ]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                <div className="bg-orange-50 p-4 border-b border-orange-100 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-orange-700 font-bold">
                        <AlertTriangle className="h-5 w-5" />
                        Báo cáo vấn đề
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <div className="text-sm text-slate-500 mb-1">Sản phẩm</div>
                        <div className="font-bold text-slate-800 text-lg">{task.products?.sku}</div>
                        <div className="text-xs text-slate-400">{task.products?.name}</div>
                    </div>

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
                        ⚠️ Phần thiếu ({task.quantity - qty}) sẽ được ghi nhận vào hệ thống "Ngoại lệ". Bạn sẽ ĐƯỢC PHÉP tiếp tục đơn hàng này.
                    </div>

                    <button
                        onClick={() => onConfirm(qty, reason)}
                        disabled={isSubmitting}
                        className="w-full h-12 bg-orange-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all text-lg flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? "Đang xử lý..." : "Xác Nhận Báo Cáo"}
                    </button>
                </div>
            </div>
        </div>
    )
}
