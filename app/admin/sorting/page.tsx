
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { ArrowRight, Layers, LayoutGrid } from "lucide-react"

export default function SortingListPage() {
    const router = useRouter()
    const [waves, setWaves] = useState<any[]>([])

    useEffect(() => {
        const fetch = async () => {
            const { data } = await supabase
                .from('pick_waves')
                .select(`*, picking_jobs(status)`)
                .order('created_at', { ascending: false })
                .limit(50)
            if (data) setWaves(data)
        }
        fetch()
    }, [])

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-8 flex items-center gap-3 text-slate-800">
                <LayoutGrid className="h-8 w-8 text-indigo-600" />
                Danh Sách Sorting Wave
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {waves.map((wave) => {
                    const total = wave.picking_jobs?.length || 0
                    const done = wave.picking_jobs?.filter((j: any) => j.status === 'COMPLETED').length || 0

                    return (
                        <Card key={wave.id} className="hover:shadow-lg transition-all border-l-4 border-l-indigo-500 cursor-pointer group" onClick={() => router.push(`/admin/sorting/${wave.id}`)}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <Badge variant="outline" className="font-mono text-lg">{wave.code}</Badge>
                                    <Badge className={wave.sorting_status === 'COMPLETED' ? 'bg-green-600' : 'bg-blue-600'}>
                                        {wave.sorting_status || 'PENDING'}
                                    </Badge>
                                </div>
                                <CardTitle className="pt-2 text-base text-slate-600">
                                    {wave.description || 'Wave Picking'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex justify-between items-center mt-4">
                                    <div className="text-sm text-slate-500">Pick: {done}/{total} Jobs</div>
                                    <Button variant="ghost" className="group-hover:translate-x-1 transition-transform p-0 text-indigo-600">
                                        Chi tiết Flow <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
