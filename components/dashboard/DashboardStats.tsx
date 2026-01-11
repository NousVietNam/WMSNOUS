import { Package, ShoppingCart, Truck, Layers, Box, Clock } from "lucide-react"

export function DashboardStats({ data }: { data: any }) {
    if (!data) return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse h-32 glass rounded-xl"></div>
            ))}
        </div>
    )

    const { orders, inventory } = data

    const stats = [
        {
            title: "Đơn Mới Hôm Nay",
            value: orders.today,
            icon: ShoppingCart,
            gradient: "from-blue-500 to-cyan-500"
        },
        {
            title: "Chờ Xử Lý",
            value: orders.pending,
            desc: "Pending / Allocated",
            icon: Clock,
            gradient: "from-orange-500 to-amber-500"
        },
        {
            title: "Đang Nhặt Hàng",
            value: orders.picking,
            icon: Layers,
            gradient: "from-indigo-500 to-purple-500"
        },
        {
            title: "Đã Đóng Gói / Ship",
            value: orders.packed + orders.shipped,
            desc: `${orders.shipped} đã ship`,
            icon: Truck,
            gradient: "from-emerald-500 to-green-500"
        },
        {
            title: "Tổng Mã Hàng (SKU)",
            value: inventory.skus,
            icon: Package,
            gradient: "from-slate-500 to-slate-600"
        },
        {
            title: "Tổng Tồn Kho",
            value: inventory.totalItems.toLocaleString(),
            desc: "Items",
            icon: Layers,
            gradient: "from-slate-600 to-slate-700"
        },
        {
            title: "Thùng Lưu Trữ",
            value: inventory.storageBoxes,
            desc: "Storage Boxes",
            icon: Box,
            gradient: "from-violet-500 to-purple-500"
        },
        {
            title: "Outbox Đang Dùng",
            value: inventory.outboxes,
            desc: "Active Outboxes",
            icon: Box,
            gradient: "from-fuchsia-500 to-pink-500"
        }
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, i) => (
                <div
                    key={i}
                    className="glass-strong rounded-xl p-6 hover:scale-105 hover:elevation-lg transition-all duration-200 animate-fade-in-up"
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
                        <p className="text-xs text-slate-600 font-medium mt-2">
                            {stat.desc}
                        </p>
                    )}
                </div>
            ))}
        </div>
    )
}
