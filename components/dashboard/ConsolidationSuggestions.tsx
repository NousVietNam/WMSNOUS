"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Box } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"

interface Suggestion {
    id: string
    fromBox: string
    fromLocation: string
    // For demo, we just show "Move to Packing" or similar if we don't have complex algorithms yet
    // Or we can query boxes that are "OPEN"
    status: string
}

export function ConsolidationSuggestions() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])

    useEffect(() => {
        async function fetchBoxes() {
            // Find boxes that are 'OPEN' and maybe not full (logic to be refined)
            const { data, error } = await supabase
                .from('boxes')
                .select(`
            id,
            code,
            status,
            locations (code)
        `)
                .eq('status', 'OPEN')
                .limit(5)

            if (error) {
                console.error("Error fetching boxes:", error)
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped = data?.map((box: any) => ({
                id: box.id,
                fromBox: box.code,
                fromLocation: box.locations?.code || 'Unknown',
                status: box.status
            })) || []

            setSuggestions(mapped)
        }

        fetchBoxes()
    }, [])

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gợi Ý Xử Lý Thùng (Open)</CardTitle>
                <CardDescription>Các thùng đang mở cần kiểm tra hoặc gộp</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                {suggestions.length === 0 && <p className="text-sm text-muted-foreground">Không có gợi ý nào.</p>}
                {suggestions.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border p-4"
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-2 font-medium">
                                    <Box className="h-4 w-4" />
                                    {item.fromBox}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Location: {item.fromLocation}
                                </span>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium">Đề xuất gộp/kiểm tra</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                {item.status}
                            </span>
                            <Button size="sm" variant="outline">
                                Xử lý
                            </Button>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
