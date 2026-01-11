"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"

export function DashboardCharts({ data }: { data: any }) {
    if (!data) return null
    const { orders, trends } = data

    // Pie Data
    const pieData = [
        { name: 'Pending', value: orders.pending, color: '#f97316' }, // Orange
        { name: 'Picking', value: orders.picking, color: '#4f46e5' }, // Indigo
        { name: 'Packed', value: orders.packed, color: '#10b981' }, // Green
        { name: 'Shipped', value: orders.shipped, color: '#3b82f6' }, // Blue
        { name: 'Completed', value: orders.completed, color: '#64748b' } // Slate
    ].filter(d => d.value > 0)

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            {/* Trend Chart (4 cols) */}
            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Xu Hướng 7 Ngày Qua</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={trends}>
                            <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend />
                            <Bar dataKey="inbound" name="Nhập Kho" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="outbound" name="Xuất Kho" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Pie Chart (3 cols) */}
            <Card className="col-span-3">
                <CardHeader>
                    <CardTitle>Trạng Thái Đơn Hàng</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                    {pieData.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground mt-[-150px]">Chưa có dữ liệu đơn hàng</div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
