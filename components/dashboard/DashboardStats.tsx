import { Package, ShoppingCart, Truck, Layers, Box, Clock, ClipboardList, TrendingUp } from "lucide-react"
import Link from "next/link"

export function DashboardStats({ data }: { data: any }) {
    if (!data) return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse h-32 glass rounded-xl"></div>
            ))}
        </div>
    )

    const { orders, inventory, jobs } = data

    const stats = [
        {
            title: "Đơn Mới Hôm Nay",
            value: orders.today,
            desc: `${orders.total} tổng đơn`,
            icon: ShoppingCart,
            gradient: "from-blue-500 to-cyan-500",
            href: "/admin/outbound"
        },
        {
            title: "Chờ Xử Lý",
            value: orders.pending,
            desc: `${orders.allocated} đã phân bổ`,
            icon: Clock,
            gradient: "from-orange-500 to-amber-500",
            href: "/admin/outbound"
        },
        {
            title: "Picking Jobs",
            value: jobs?.active || 0,
            desc: `${jobs?.completed || 0} đã xong`,
            icon: ClipboardList,
            gradient: "from-indigo-500 to-purple-500",
            href: "/admin/jobs"
        },
        {
            title: "Giao Hàng (Ship)",
            value: orders.shipped,
            desc: `${orders.packed} chờ xuất`,
            icon: Truck,
            gradient: "from-emerald-500 to-green-500",
            href: "/admin/shipping"
        },
        {
            title: "Kho Hàng Lẻ (Piece)",
            value: inventory.totalPieceItems.toLocaleString(),
            desc: "Items",
            icon: Package,
            gradient: "from-blue-600 to-indigo-600",
            href: "/admin/inventory?tab=piece"
        },
        {
            title: "Kho Hàng Sỉ (Bulk)",
            value: inventory.totalBulkItems.toLocaleString(),
            desc: "Items",
            icon: Layers,
            gradient: "from-amber-600 to-orange-600",
            href: "/admin/inventory?tab=bulk"
        },
        {
            title: "Tổng Mã Hàng (SKU)",
            value: inventory.skus,
            icon: Package,
            gradient: "from-slate-500 to-slate-600",
            href: "/admin/products"
        },
        {
            title: "Thùng Lưu Trữ",
            value: inventory.storageBoxes,
            desc: "Storage Boxes",
            icon: Box,
            gradient: "from-violet-500 to-purple-500",
            href: "/admin/boxes"
        },
        {
            title: "Outbox Đang Dùng",
            value: inventory.outboxes,
            desc: "Active Outboxes",
            icon: Box,
            gradient: "from-fuchsia-500 to-pink-500",
            href: "/admin/outboxes"
        }
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, i) => (
                <Link
                    href={stat.href || "#"}
                    key={i}
                    className="block group"
                >
                    <div
                        className="glass-strong rounded-xl p-6 group-hover:scale-105 group-hover:elevation-lg transition-all duration-200 animate-fade-in-up h-full"
                        style={{ animationDelay: `${i * 50}ms` }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-slate-700">{stat.title}</h3>
                            <div className={`p-2.5 rounded-lg bg-gradient-to-br ${stat.gradient} elevation-md`}>
                                <stat.icon className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold gradient-text">{stat.value}</div>
                        {stat.desc && (
                            <p className="text-xs text-slate-600 font-medium mt-2 group-hover:text-indigo-600 transition-colors">
                                {stat.desc}
                            </p>
                        )}
                    </div>
                </Link>
            ))}
        </div>
    )
}
