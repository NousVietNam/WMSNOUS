"use client"

import { useEffect } from "react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div className="p-8 text-center h-screen flex flex-col items-center justify-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">Đã xảy ra lỗi</h2>
            <p className="text-slate-500 mb-6">Xin lỗi, có sự cố khi tải trang này.</p>
            <pre className="bg-slate-50 p-4 rounded mb-6 text-xs text-red-500 max-w-md overflow-auto text-left w-full">
                {error.message}
            </pre>
            <div className="flex gap-4">
                <button
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold shadow hover:bg-indigo-700"
                    onClick={() => reset()}
                >
                    Thử lại
                </button>
                <button
                    className="px-6 py-3 border border-slate-300 rounded-lg font-bold"
                    onClick={() => window.location.href = '/mobile'}
                >
                    Về Home Mobile
                </button>
            </div>
        </div>
    )
}
