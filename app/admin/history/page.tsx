"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { History, ArrowRight, Filter, RefreshCw } from "lucide-react"

interface Transaction {
    id: string
    type: string
    created_at: string
    entity_type: 'BOX' | 'ITEM' | null
    entity_id: string | null
    details: any
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
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
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

        // Server-side Search for better results
        if (filterSearch) {
            const term = `%${filterSearch}%`
            query = query.ilike('details::text', term)
        }

        const { data: txData, error } = await query

        if (error) {
            console.error(error)
            setLoading(false)
            return
        }

        const rawTxs = txData as any[]

        // Collect IDs to fetch details
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
                code = boxMap[tx.entity_id] || tx.details?.box_code || 'Deleted Box'
                name = 'Thùng hàng'
            } else if (tx.entity_type === 'ITEM' && tx.entity_id) {
                const item = itemMap[tx.entity_id]
                code = item?.sku || tx.details?.sku || 'Deleted Item'
                name = item?.name || tx.details?.product_name || ''
            }
            return { ...tx, computed_entity_code: code, computed_entity_name: name, computed_user_name: userMap[tx.user_id] || 'Unknown' }
        })

        // Client-side Filter for "Search" term if DB search is too complex for 'details' JSONB without index
        // If filterSearch exists, filter the enriched list
        let finalDisplay = enriched
        if (filterSearch) {
            const lower = filterSearch.toLowerCase()
            finalDisplay = enriched.filter(tx =>
                tx.computed_entity_code?.toLowerCase().includes(lower) ||
                tx.details?.box_code?.toLowerCase().includes(lower) ||
                JSON.stringify(tx.details).toLowerCase().includes(lower)
            )
        }

        setTransactions(finalDisplay)
        setLoading(false)
    }

    const renderEntity = (tx: Transaction) => {
        // Quantity Logic
        const qty = tx.details?.quantity || (tx.entity_type === 'BOX' ? '-' : 1)

        // 1. Try to read from detailed JSON log first (Rich info)
        if (tx.details?.product_sku || tx.details?.sku) {
            return (
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="font-bold text-green-600">🌭 {tx.details.product_sku || tx.details.sku}</span>
                        <span className="text-xs text-muted-foreground">{tx.details.product_name || tx.computed_entity_name || 'Item'}</span>
                    </div>
                    {qty !== '-' && <span className="font-bold bg-slate-100 px-2 rounded">x{qty}</span>}
                </div>
            )
        }
        if (tx.details?.box_code || tx.details?.box) {
            return <div className="font-bold text-blue-600">📦 {tx.details.box_code || tx.details.box}</div>
        }

        // 2. Fallback to Entity ID lookup
        if (tx.entity_type === 'BOX') {
            return <div className="font-bold text-blue-600">📦 {tx.computed_entity_code}</div>
        }
        if (tx.entity_type === 'ITEM') {
            return (
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="font-bold text-green-600">🌭 {tx.computed_entity_code}</span>
                        <span className="text-xs text-muted-foreground">{tx.computed_entity_name}</span>
                    </div>
                    <span className="font-bold bg-slate-100 px-2 rounded">x{qty}</span>
                </div>
            )
        }
        return <span className="italic text-gray-400">N/A</span>
    }

    const renderFrom = (tx: Transaction) => {
        if (tx.details?.from) return <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold">{tx.details.from}</span>
        if (tx.from_box) return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">Box {tx.from_box.code}</span>
        if (tx.from_loc) return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">Loc {tx.from_loc.code}</span>
        return <span className="text-gray-400 text-xs">-</span>
    }

    const renderTo = (tx: Transaction) => {
        if (tx.details?.to || tx.details?.location_code || tx.details?.box_code) {
            // Smart display based on context
            if (tx.details.to) return <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold">{tx.details.to}</span>
            // If Import:
            if (tx.type === 'IMPORT' && tx.details.box_code) return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">Box {tx.details.box_code}</span>
        }

        if (tx.to_box) return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">Box {tx.to_box.code}</span>
        if (tx.to_loc) return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">Loc {tx.to_loc.code}</span>
        return <span className="text-gray-400 text-xs">-</span>
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">            <main className="flex-1 p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <History className="h-8 w-8 text-primary" />
                    Lịch Sử Giao Dịch
                </h1>
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
                            <SelectItem value="MOVE">Di Chuyển (Move)</SelectItem>
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
                                <th className="p-4">Đối Tượng</th>
                                <th className="p-4">Nơi Đi (From)</th>
                                <th className="p-4">Nơi Đến (To)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Đang tải dữ liệu...</td></tr>
                            ) : transactions.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Không tìm thấy giao dịch nào.</td></tr>
                            ) : (
                                transactions.map(tx => (
                                    <tr key={tx.id} className="border-t hover:bg-slate-50">
                                        <td className="p-4 text-muted-foreground text-xs">
                                            {new Date(tx.created_at).toLocaleString('vi-VN')}
                                        </td>
                                        <td className="p-4 font-medium text-sm">
                                            {/* Staff1 Logic: Checking both users relation and direct user_id/details */}
                                            {tx.computed_user_name || tx.details?.user_name || tx.details?.staff || (tx.user_id ? 'Staff' : 'Unknown')}
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold
                                                        ${tx.type === 'IMPORT' ? 'bg-green-100 text-green-700' :
                                                    tx.type === 'EXPORT' ? 'bg-red-100 text-red-700' :
                                                        tx.type === 'AUDIT' ? 'bg-purple-100 text-purple-700' :
                                                            tx.type === 'MOVE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                {tx.type}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm">
                                            {renderEntity(tx)}
                                        </td>
                                        <td className="p-4">
                                            {renderFrom(tx)}
                                        </td>
                                        <td className="p-4">
                                            {renderTo(tx)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
        </div >
    )
}
