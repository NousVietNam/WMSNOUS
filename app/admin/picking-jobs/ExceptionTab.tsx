"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { format } from "date-fns"
import { AlertTriangle, CheckCircle, Package, Search, Filter } from "lucide-react"
import { toast } from "sonner"

export function ExceptionTab() {
    const [exceptions, setExceptions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filterStatus, setFilterStatus] = useState('OPEN')

    const [replacingId, setReplacingId] = useState<string | null>(null)
    const [selectedBoxId, setSelectedBoxId] = useState<string>('') // Changed logic from Code to ID for accuracy

    // Suggestion State
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
    const [currentExpertionDetail, setCurrentExceptionDetail] = useState<any>(null)

    useEffect(() => {
        if (replacingId) {
            // Fetch suggestions when modal opens
            const ex = exceptions.find(e => e.id === replacingId)
            if (ex) {
                setCurrentExceptionDetail(ex)
                fetchSuggestions(ex)
            }
        } else {
            setSuggestions([])
            setSelectedBoxId('')
            setCurrentExceptionDetail(null)
        }
    }, [replacingId]) // Only depending on replacingId is enough

    const fetchSuggestions = async (exception: any) => {
        setIsLoadingSuggestions(true)
        const qtyMissing = exception.quantity_expected - exception.quantity_actual
        const { data, error } = await supabase.rpc('get_replacement_box_suggestions', {
            p_product_id: exception.product_id,
            p_current_box_id: exception.box_id,
            p_required_qty: qtyMissing
        })

        if (error) {
            console.error("Error fetching suggestions:", error)
            toast.error("Không thể tải gợi ý thùng: " + error.message)
        } else {
            setSuggestions(data || [])
            // Auto select first best option
            if (data && data.length > 0) setSelectedBoxId(data[0].box_id)
        }
        setIsLoadingSuggestions(false)
    }

    const handleApproveReplacement = async () => {
        if (!replacingId || !selectedBoxId) return
        try {
            const { data, error } = await supabase.rpc('admin_approve_replacement', {
                p_exception_id: replacingId,
                p_new_box_id: selectedBoxId, // Use ID directly
                p_admin_id: (await supabase.auth.getUser()).data.user?.id
            })
            if (error) throw error
            if (!data.success) throw new Error(data.error)

            toast.success("Đã duyệt chuyển thùng!")
            setReplacingId(null)
            fetchExceptions()
        } catch (e: any) {
            toast.error(e.message)
        }
    }

    const fetchExceptions = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('view_picking_exceptions')
            .select('*')
            .eq('status', filterStatus)
            .order('created_at', { ascending: false })
            .limit(100)

        if (error) toast.error("Lỗi tải dữ liệu: " + error.message)
        else setExceptions(data || [])
        setLoading(false)
    }

    // Actions
    const handleReject = async (id: string) => {
        if (!confirm("Xác nhận: TỪ CHỐI thiếu (Hàng vẫn còn)? Nhân viên sẽ phải lấy tiếp.")) return
        try {
            const { data, error } = await supabase.rpc('admin_reject_shortage', {
                p_exception_id: id,
                p_admin_id: (await supabase.auth.getUser()).data.user?.id
            })
            if (error) throw error
            if (!data.success) throw new Error(data.error)
            toast.success("Đã từ chối báo cáo!")
            fetchExceptions()
        } catch (e: any) {
            toast.error(e.message)
        }
    }

    const handleConfirmShortage = async (id: string) => {
        if (!confirm("Xác nhận: DUYỆT THIẾU (Hàng mất thật)? Hệ thống sẽ cắt giảm số lượng đơn hàng.")) return
        try {
            const { data, error } = await supabase.rpc('admin_confirm_shortage', {
                p_exception_id: id,
                p_admin_id: (await supabase.auth.getUser()).data.user?.id
            })
            if (error) throw error
            if (!data.success) throw new Error(data.error)
            toast.success("Đã xác nhận thiếu!")
            fetchExceptions()
        } catch (e: any) {
            toast.error(e.message)
        }
    }



    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-3 rounded-lg border shadow-sm">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-400" />
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg bg-white text-sm"
                    >
                        <option value="OPEN">Chờ xử lý</option>
                        <option value="RESOLVED">Đã giải quyết</option>
                        <option value="IGNORED">Đã bỏ qua</option>
                    </select>
                </div>
                <button onClick={fetchExceptions} className="text-sm text-blue-600 font-bold hover:underline">
                    Làm mới
                </button>
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Mã Job / Đơn</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Sản phẩm</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Vị trí</th>
                            <th className="px-4 py-3 text-center font-medium text-gray-500">Yêu cầu</th>
                            <th className="px-4 py-3 text-center font-medium text-gray-500">Thực tế</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-500">Thiếu</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Lý do</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Người tác/TG</th>
                            <th className="px-4 py-3 text-center font-medium text-gray-500">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr><td colSpan={10} className="p-8 text-center text-gray-500">Đang tải...</td></tr>
                        ) : exceptions.length === 0 ? (
                            <tr><td colSpan={10} className="p-8 text-center text-gray-500">Không có dữ liệu</td></tr>
                        ) : (
                            exceptions.map(ex => (
                                <tr key={ex.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-blue-600">{ex.order_code}</div>
                                        <div className="text-xs text-gray-400">{ex.job_code}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-gray-800">{ex.product_sku}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{ex.product_name}</div>
                                    </td>
                                    <td className="px-4 py-3 font-mono font-bold text-purple-600">
                                        {ex.box_code}
                                    </td>
                                    <td className="px-4 py-3 text-center font-medium">{ex.quantity_expected}</td>
                                    <td className="px-4 py-3 text-center font-medium">{ex.quantity_actual}</td>
                                    <td className="px-4 py-3 text-right font-black text-red-600">
                                        -{ex.quantity_expected - ex.quantity_actual}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 italic">
                                        <span className={`px-2 py-0.5 rounded text-xs border ${ex.exception_type === 'SHORTAGE' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                            {ex.exception_type === 'SHORTAGE' ? 'Thiếu Hàng' : ex.exception_type}
                                        </span>
                                        <div className="mt-1">{ex.note}</div>
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        <div className="font-bold text-gray-700">{ex.user_name}</div>
                                        <div className="text-gray-400">{format(new Date(ex.created_at), 'dd/MM HH:mm')}</div>
                                    </td>
                                    <td className="px-4 py-3 text-center space-x-2">
                                        {ex.status === 'OPEN' ? (
                                            <div className="flex flex-col gap-1 items-start w-[140px]">
                                                <button
                                                    onClick={() => handleReject(ex.id)}
                                                    className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 border w-full text-left flex items-center gap-1"
                                                >
                                                    ❌ Từ chối
                                                </button>
                                                <button
                                                    onClick={() => setReplacingId(ex.id)}
                                                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 border border-blue-200 w-full text-left flex items-center gap-1"
                                                >
                                                    🔄 Đổi Thùng
                                                </button>
                                                <button
                                                    onClick={() => handleConfirmShortage(ex.id)}
                                                    className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold hover:bg-red-200 border border-red-200 w-full text-left flex items-center gap-1"
                                                >
                                                    ⚠️ Duyệt Thiếu
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs font-bold text-gray-400 px-2 py-1 bg-gray-100 rounded">{ex.status}</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Replacement Modal */}
            {replacingId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm space-y-4">
                        <div>
                            <h3 className="font-bold text-lg">Chọn Thùng Thay Thế</h3>
                            {currentExpertionDetail && (
                                <div className="text-sm text-gray-500 mt-1">
                                    Cần bù: <span className="font-bold text-red-600">{(currentExpertionDetail.quantity_expected - currentExpertionDetail.quantity_actual)}</span> sp
                                    <br />
                                    Sản phẩm: {currentExpertionDetail.product_sku}
                                </div>
                            )}
                        </div>

                        {isLoadingSuggestions ? (
                            <div className="py-4 text-center text-gray-500">Đang tìm thùng phù hợp...</div>
                        ) : suggestions.length === 0 ? (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded border border-red-200">
                                Không tìm thấy thùng nào có sẵn hàng này!
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-700">Gợi ý thùng (Ưu tiên gần nhất):</label>
                                <select
                                    className="w-full p-2 border rounded bg-slate-50 font-mono text-sm"
                                    value={selectedBoxId}
                                    onChange={e => setSelectedBoxId(e.target.value)}
                                >
                                    {suggestions.map((ug, idx) => (
                                        <option key={ug.box_id} value={ug.box_id}>
                                            {idx + 1}. {ug.box_code} (SL: {ug.available_qty})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setReplacingId(null)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
                            <button
                                onClick={handleApproveReplacement}
                                disabled={!selectedBoxId || isLoadingSuggestions}
                                className="px-3 py-2 text-sm bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                            >
                                Xác Nhận Đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
