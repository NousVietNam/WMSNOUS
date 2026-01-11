"use client"

import { useEffect, useState } from "react"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { Box, CheckCircle, Clock, MapPin, Package, ShoppingCart, Truck } from "lucide-react"

export default function DashboardPage() {
  const [stats, setStats] = useState({
    ordersTotal: 0,
    ordersPicking: 0,
    ordersCompleted: 0,
    locationsTotal: 0,
    capacityUsed: 0, // Mock or calculated
    boxesTotal: 0,
    itemsTotal: 0
  })

  useEffect(() => {
    const fetchStats = async () => {
      // Parallel fetching
      const [
        { count: ordersTotal },
        { count: ordersPicking },
        { count: ordersCompleted },
        { count: locationsTotal },
        { count: boxesTotal },
        { data: itemsData }
      ] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['PICKING', 'ALLOCATED']),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
        supabase.from('locations').select('*', { count: 'exact', head: true }),
        supabase.from('boxes').select('*', { count: 'exact', head: true }),
        supabase.from('inventory_items').select('quantity') // Sum needed
      ])

      const itemsTotal = itemsData?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0

      setStats({
        ordersTotal: ordersTotal || 0,
        ordersPicking: ordersPicking || 0,
        ordersCompleted: ordersCompleted || 0,
        locationsTotal: locationsTotal || 0,
        capacityUsed: 0, // Requires complex calculation or view
        boxesTotal: boxesTotal || 0,
        itemsTotal
      })
    }
    fetchStats()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AdminHeader />
      <main className="flex-1 p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Tổng quan hoạt động kho hàng</p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Orders Stats */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Đơn Hàng (Orders)</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.ordersTotal}</div>
              <div className="flex gap-4 mt-2 text-xs">
                <div className="flex items-center text-blue-600">
                  <Clock className="mr-1 h-3 w-3" />
                  {stats.ordersPicking} Đang xử lý
                </div>
                <div className="flex items-center text-green-600">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  {stats.ordersCompleted} Hoàn thành
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Stats */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hàng Hoá (Inventory)</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.itemsTotal.toLocaleString()} SP</div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center">
                  <Box className="mr-1 h-3 w-3" />
                  {stats.boxesTotal} Thùng hàng
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location Stats */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vị Trí (Storage)</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.locationsTotal}</div>
              <p className="text-xs text-muted-foreground mt-2">Tổng số vị trí lưu trữ</p>
            </CardContent>
          </Card>
        </div>

        {/* Additional sections like charts can go here */}
      </main>
    </div>
  )
}
