import { AdminHeader } from "@/components/admin/AdminHeader"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50">
            <AdminHeader />
            {children}
        </div>
    )
}
