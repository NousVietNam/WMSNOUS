"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"

interface ChartData {
  name: string
  total: number
}

export function PerformanceChart() {
  const [data, setData] = useState<ChartData[]>([])

  useEffect(() => {
    async function fetchData() {
      // Fetch transactions from today
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
          user_id,
          users (name)
        `)
      //.gte('timestamp', today.toISOString()) // Filter for today if needed

      if (error) {
        console.error('Error fetching performance:', error)
        return
      }

      // Aggregate by user
      const counts: Record<string, number> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transactions?.forEach((t: any) => {
        const userName = t.users?.name || 'Unknown'
        counts[userName] = (counts[userName] || 0) + 1
      })

      const chartData = Object.entries(counts).map(([name, total]) => ({
        name,
        total,
      }))

      setData(chartData)
    }

    fetchData()
  }, [])

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hiệu Suất Nhân Viên</CardTitle>
          <CardDescription>Chưa có dữ liệu giao dịch</CardDescription>
        </CardHeader>
        <CardContent className="h-[200px] flex items-center justify-center text-muted-foreground">
          No Data
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hiệu Suất Nhân Viên</CardTitle>
        <CardDescription>Số lượng giao dịch theo nhân viên</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey="name"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="total"
                fill="currentColor"
                radius={[4, 4, 0, 0]}
                className="fill-primary"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
