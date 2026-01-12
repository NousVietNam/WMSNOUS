"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { History, ArrowRight, Filter, RefreshCw, Download } from "lucide-react"
import * as XLSX from "xlsx"

interface Transaction {
    id: string
    type: string
    created_at: string
    entity_type: 'BOX' | 'ITEM' | null
    entity_id: string | null
    // details removed
    quantity: number | null
    sku: string | null
    user_id: string | null
    from_loc: { code: string } | null
    to_loc: { code: string } | null
    from_box: { code: string } | null
    to_box: { code: string } | null

    // Computed fields
    computed_entity_code?: string
    computed_entity_name?: string
    computed_user_name?: string
}

export default function HistoryPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)

    // Filters
    // Use local date for default filter instead of UTC
    const getLocalDate = () => {
        const d = new Date()
        const offset = d.getTimezoneOffset() * 60000
        return new Date(d.getTime() - offset).toISOString().split('T')[0]
    }

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        const offset = d.getTimezoneOffset() * 60000
        return new Date(d.getTime() - offset).toISOString().split('T')[0]
    }

    const [dateFrom, setDateFrom] = useState(getPastDate(30))
    const [dateTo, setDateTo] = useState(getLocalDate())
    const [filterType, setFilterType] = useState("ALL")
    const [filterSearch, setFilterSearch] = useState("") // Searches Box, SKU, Location

    useEffect(() => {
        fetchHistory()
    }, [])

    const fetchHistory = async () => {
        setLoading(true)
        let query = supabase
            .from('transactions')
            .select(`
                *,
                from_loc:from_location_id (code),
                to_loc:to_location_id (code),
                from_box:from_box_id (code),
                to_box:to_box_id (code)
            `)
            .order('created_at', { ascending: false })
            .limit(100) // Page size

        // Apply Filters
        if (dateFrom) query = query.gte('created_at', dateFrom)
        if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
        if (filterType !== 'ALL') query = query.eq('type', filterType)

        // Server-side Search (Limited to columns now)
        if (filterSearch) {
            const term = `%${filterSearch}%`
            // Search mostly on sku or type, logic simplified due to no details column
            query = query.or(`sku.ilike.${term},type.ilike.${term}`)
        }

        const { data: txData, error } = await query

        if (error) {
            console.error(error)
            setLoading(false)
            return
        }

        const rawTxs = txData as any[]

        // Collect IDs to fetch extra info (product name for entity_id if needed)
        const boxIds = new Set<string>()
        const itemIds = new Set<string>()
        const userIds = new Set<string>()

        rawTxs.forEach(tx => {
            if (tx.entity_type === 'BOX' && tx.entity_id) boxIds.add(tx.entity_id)
            if (tx.entity_type === 'ITEM' && tx.entity_id) itemIds.add(tx.entity_id)
            if (tx.user_id) userIds.add(tx.user_id)
        })

        const boxMap: Record<string, string> = {}
        const itemMap: Record<string, { sku: string, name: string }> = {}
        const userMap: Record<string, string> = {}

        if (boxIds.size > 0) {
            const { data: boxes } = await supabase.from('boxes').select('id, code').in('id', Array.from(boxIds))
            boxes?.forEach(b => boxMap[b.id] = b.code)
        }

        if (itemIds.size > 0) {
            const { data: items } = await supabase.from('inventory_items').select('id, products(sku, name)').in('id', Array.from(itemIds))
            items?.forEach((i: any) => {
                if (i.products) itemMap[i.id] = i.products
            })
        }

        if (userIds.size > 0) {
            const { data: users } = await supabase.from('users').select('id, name').in('id', Array.from(userIds))
            users?.forEach(u => userMap[u.id] = u.name)
        }

        const enriched = rawTxs.map(tx => {
            let code = 'N/A'
            let name = ''
            if (tx.entity_type === 'BOX' && tx.entity_id) {
                code = boxMap[tx.entity_id] || 'Deleted Box'
                name = 'Thùng hàng'
            } else if (tx.entity_type === 'ITEM' && tx.entity_id) {
                const item = itemMap[tx.entity_id]
                code = item?.sku || 'Deleted Item'
                name = item?.name || ''
            }
            return { ...tx, computed_entity_code: code, computed_entity_name: name, computed_user_name: userMap[tx.user_id] || 'Unknown' }
        })

        // Client-side Filter
        let finalDisplay = enriched
        if (filterSearch) {
            const lower = filterSearch.toLowerCase()
            finalDisplay = enriched.filter(tx =>
                tx.computed_entity_code?.toLowerCase().includes(lower) ||
                tx.sku?.toLowerCase().includes(lower) ||
                tx.from_box?.code?.toLowerCase().includes(lower) ||
                tx.to_box?.code?.toLowerCase().includes(lower)
            )
        }

        setTransactions(finalDisplay)
        setLoading(false)
    }



    const handleExport = () => {
        const data = transactions.map(tx => ({
            'Thời Gian': new Date(tx.created_at).toLocaleString('vi-VN'),
            'Người Dùng': tx.computed_user_name || (tx.user_id ? 'Staff' : 'Unknown'),
            'Loại': tx.type,
            'Mã SKU': tx.sku || tx.computed_entity_code || '-',
            'Tên Hàng': tx.computed_entity_name || (tx.entity_type === 'BOX' ? 'Thùng Hàng' : '-'),
            'Số Lượng': tx.quantity || 1,
            'Thùng Đi': tx.from_box?.code || '-',
            'Vị Trí Đi': tx.from_loc?.code || '-',
            'Thùng Đến': tx.to_box?.code || '-',
            'Vị Trí Đến': tx.to_loc?.code || '-'
        }))

        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "History")
        XLSX.writeFile(wb, `LichSu_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">            <main className="flex-1 p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <History className="h-8 w-8 text-primary" />
                    Lịch Sử Giao Dịch
                </h1>
                <Button variant="outline" onClick={handleExport} className="gap-2">
                    <Download className="h-4 w-4" /> Xuất Excel
                </Button>
            </div>

            {/* FILTERS */}
            <div className="bg-white p-4 rounded-xl border shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Từ Ngày</label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Đến Ngày</label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Loại Giao Dịch</label>
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tất Cả</SelectItem>
                            <SelectItem value="IMPORT">Nhập (Import)</SelectItem>
                            <SelectItem value="EXPORT">Xuất (Export)</SelectItem>
                            <SelectItem value="MOVE_BOX">Di Chuyển Thùng (Move Box)</SelectItem>
                            <SelectItem value="AUDIT">Kiểm Kê (Audit)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1 md:col-span-1">
                    <label className="text-xs font-bold text-slate-500">Tìm Kiếm</label>
                    <Input
                        placeholder="Mã, SKU..."
                        value={filterSearch}
                        onChange={e => setFilterSearch(e.target.value)}
                    />
                </div>
                <Button onClick={fetchHistory} className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" /> Lọc
                </Button>
            </div>

            <div className="bg-white p-4 rounded-md border shadow-sm flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Kết quả ({transactions.length})</h2>
                </div>
                <div className="rounded-md border overflow-auto relative flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 font-medium text-slate-700 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-[160px]">Thời Gian</th>
                                <th className="p-4 w-[120px]">Người Dùng</th>
                                <th className="p-4 w-[100px]">Loại</th>
                                <th className="p-4 w-[120px]">Mã SKU</th>
                                <th className="p-4 w-[120px]">Mã Box</th>
                                <th className="p-4">Tên Hàng / Nội Dung</th>
                                <th className="p-4 w-[80px] text-center">SL</th>
                                <th className="p-4">Thùng Đi (From Box)</th>
                                <th className="p-4">Vị trí Đi (From Loc)</th>
                                <th className="p-4">Thùng Đến (To Box)</th>
                                <th className="p-4">Vị trí Đến (To Loc)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Đang tải dữ liệu...</td></tr>
                            ) : transactions.length === 0 ? (
                                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Không tìm thấy giao dịch nào.</td></tr>
                            ) : (
                                transactions.map(tx => {
                                    // Extract data
                                    let sku = '-'
                                    let boxCode = '-'
                                    let name = '-'
                                    let qty: any = '-'

                                    // SKU Logic (Column Priority)
                                    if (tx.sku) {
                                        sku = tx.sku
                                        name = tx.computed_entity_name || '-'
                                        qty = tx.quantity || 1
                                    } else if (tx.entity_type === 'ITEM') {
                                        // Fallback to computed if sku column null but linked to item
                                        sku = tx.computed_entity_code || '-'
                                        name = tx.computed_entity_name || '-'
                                        qty = tx.quantity || 1
                                    }

                                    // Box Logic
                                    if (tx.entity_type === 'BOX') {
                                        boxCode = tx.computed_entity_code || '-'
                                        name = 'Thùng Hàng'
                                    }

                                    // Resolve Location/Box Displays
                                    const fromBox = tx.from_box?.code || '-'
                                    const fromLoc = tx.from_loc?.code || '-'
                                    const toBox = tx.to_box?.code || '-'
                                    const toLoc = tx.to_loc?.code || '-'

                                    return (
                                        <tr key={tx.id} className="border-t hover:bg-slate-50">
                                            <td className="p-4 text-muted-foreground text-xs">
                                                {new Date(tx.created_at).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="p-4 font-medium text-sm">
                                                {tx.computed_user_name || (tx.user_id ? 'Staff' : 'Unknown')}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold
                                                            ${tx.type === 'IMPORT' ? 'bg-green-100 text-green-700' :
                                                        tx.type === 'EXPORT' ? 'bg-red-100 text-red-700' :
                                                            tx.type === 'AUDIT' ? 'bg-purple-100 text-purple-700' :
                                                                tx.type === 'MOVE_BOX' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                    {tx.type}
                                                </span>
                                            </td>
                                            {/* SKU */}
                                            <td className="p-4 font-mono font-bold text-slate-700">
                                                {sku !== '-' ? sku : ''}
                                            </td>
                                            {/* Box */}
                                            <td className="p-4 font-mono font-bold text-blue-600">
                                                {boxCode !== '-' ? `📦 ${boxCode}` : ''}
                                            </td>
                                            {/* Name */}
                                            <td className="p-4 text-slate-600">
                                                {name}
                                            </td>
                                            {/* Qty */}
                                            <td className="p-4 text-center font-bold">
                                                {qty !== '-' ? `x${qty}` : '-'}
                                            </td>
                                            {/* From Box */}
                                            <td className="p-4 text-blue-700 font-medium text-sm">
                                                {fromBox !== '-' ? `📦 ${fromBox}` : '-'}
                                            </td>
                                            {/* From Loc */}
                                            <td className="p-4 text-green-700 font-medium text-sm">
                                                {fromLoc !== '-' ? `📍 ${fromLoc}` : '-'}
                                            </td>
                                            {/* To Box */}
                                            <td className="p-4 text-blue-700 font-medium text-sm">
                                                {toBox !== '-' ? `📦 ${toBox}` : '-'}
                                            </td>
                                            {/* To Loc */}
                                            <td className="p-4 text-green-700 font-medium text-sm">
                                                {toLoc !== '-' ? `📍 ${toLoc}` : '-'}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
        </div >
    )
}
