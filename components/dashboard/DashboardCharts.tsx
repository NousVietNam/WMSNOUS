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
                            <Bar dataKey="inbound" name="Lượt Nhập" fill="#dcfce7" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="outbound" name="Lượt Xuất" fill="#dbeafe" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="inboundQty" name="SL Nhập (Qty)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="outboundQty" name="SL Xuất (Qty)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
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

            {/* Trend Table (Full Width) */}
            <Card className="col-span-full">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <span>Chi Tiết Nhập Xuất 7 Ngày</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="text-left py-3 px-4 font-bold text-slate-700">Ngày</th>
                                    <th className="text-right py-3 px-4 font-bold text-emerald-600">Tổng Số Lượng Nhập</th>
                                    <th className="text-right py-3 px-4 font-bold text-blue-600">Tổng Số Lượng Xuất</th>
                                    <th className="text-right py-3 px-4 font-bold text-slate-500">Số Lượt Giao Dịch</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...trends].reverse().map((day, i) => (
                                    <tr key={i} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-medium text-slate-600">
                                            {day.date}
                                            <span className="text-[10px] text-slate-400 ml-2">({day.fullDate})</span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-emerald-600">
                                            {day.inboundQty?.toLocaleString() || 0}
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-blue-600">
                                            {day.outboundQty?.toLocaleString() || 0}
                                        </td>
                                        <td className="py-3 px-4 text-right text-slate-500 font-mono">
                                            <span className="text-emerald-500">↓{day.inbound}</span>
                                            <span className="mx-2">/</span>
                                            <span className="text-blue-500">↑{day.outbound}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
