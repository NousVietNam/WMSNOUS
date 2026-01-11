"use client"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html>
            <body>
                <div className="p-8 text-center font-sans">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Critical System Error</h2>
                    <p className="mb-4 text-slate-700">Ứng dụng gặp lỗi nghiêm trọng cấp hệ thống.</p>
                    <pre className="bg-slate-100 p-4 rounded text-left overflow-auto mb-4 text-sm text-red-800 border border-red-200">
                        {error.message}
                        {error.digest && <div>Hashes: {error.digest}</div>}
                    </pre>
                    <button
                        className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700"
                        onClick={() => reset()}
                    >
                        Khởi động lại (Reload)
                    </button>
                    <button
                        className="px-6 py-2 ml-4 border border-slate-300 rounded font-bold"
                        onClick={() => window.location.href = '/login'}
                    >
                        Về trang đăng nhập
                    </button>
                </div>
            </body>
        </html>
    )
}
