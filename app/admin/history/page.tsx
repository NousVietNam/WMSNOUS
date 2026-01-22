"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { History, ArrowRight, Filter, RefreshCw, Download, ChevronLeft, ChevronRight, Trash2 } from "lucide-react"
import * as XLSX from "xlsx"
import { toast } from "sonner"

// ... (imports remain)

// Helper to enrich raw transactions (reused logic could be extracted, but keeping inline for safety)
const enrichTransactions = async (rawTxs: any[]) => {
    // Collect IDs
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

    // Fetch References
    const refIds = new Set<string>()
    rawTxs.forEach(tx => {
        if (tx.reference_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.reference_id)) {
            refIds.add(tx.reference_id)
        }
    })
    const refMap: Record<string, string> = {}
    if (refIds.size > 0) {
        const { data: orders } = await supabase.from('outbound_orders').select('id, code').in('id', Array.from(refIds))
        orders?.forEach(o => refMap[o.id] = o.code)

        const missingRefs = Array.from(refIds).filter(id => !refMap[id])
        if (missingRefs.length > 0) {
            const { data: shipments } = await supabase.from('outbound_shipments').select('id, code').in('id', missingRefs)
            shipments?.forEach(s => refMap[s.id] = s.code)
        }
    }

    // Fetch Product Names by SKU
    const skus = new Set<string>()
    rawTxs.forEach(tx => {
        if (tx.sku) skus.add(tx.sku)
    })
    const skuMap: Record<string, string> = {}
    if (skus.size > 0) {
        const { data: products } = await supabase.from('products').select('sku, name').in('sku', Array.from(skus))
        products?.forEach(p => skuMap[p.sku] = p.name)
    }

    return rawTxs.map((tx: any) => {
        const code = tx.sku || (tx.entity_type === 'ITEM' && itemMap[tx.entity_id!]?.sku) || (tx.entity_type === 'BOX' && boxMap[tx.entity_id!] || 'N/A')
        const name = tx.sku ? skuMap[tx.sku] : (tx.entity_type === 'ITEM' && itemMap[tx.entity_id!]?.name) || ''
        const refCode = refMap[tx.reference_id] || tx.reference_id || '-'

        return {
            ...tx,
            computed_entity_code: code,
            computed_entity_name: name,
            computed_user_name: userMap[tx.user_id] || 'Unknown',
            computed_ref_code: refCode
        }
    })
}

const handleExportAll = async () => {
    toast.info("Đang tải toàn bộ dữ liệu... Vui lòng chờ")
    try {
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

        // NO RANGE LIMIT

        // Apply Filters (Same as main fetch)
        if (dateFrom) query = query.gte('created_at', dateFrom)
        if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
        if (filterType !== 'ALL') query = query.eq('type', filterType)
        if (filterUser !== 'ALL') query = query.eq('user_id', filterUser)

        // Server-side Search
        if (filterSearch) {
            const term = `%${filterSearch}%`
            query = query.or(`sku.ilike.${term},type.ilike.${term}`)
        }

        const { data: rawData, error } = await query
        if (error) throw error
        if (!rawData || rawData.length === 0) {
            toast.warning("Không có dữ liệu để xuất")
            return
        }

        // Client-side generic text filter (Simulating the frontend filter)
        let filteredData = rawData
        if (filterSearch) {
            const lower = filterSearch.toLowerCase()
            // Note: We can't easily filter on computed fields before computing them.
            // So we must enrich first, OR filter strictly on what we have. 
            // To match UI exactly, we should enrich all 1000+ records? Yes, essential for Export.
        }

        toast.info(`Đang xử lý ${rawData.length} dòng dữ liệu...`)
        const enrichedData = await enrichTransactions(rawData)

        // Apply final search filter on computed fields if needed
        let finalData = enrichedData
        if (filterSearch) {
            const lower = filterSearch.toLowerCase()
            finalData = enrichedData.filter(tx =>
                tx.computed_entity_code?.toLowerCase().includes(lower) ||
                tx.sku?.toLowerCase().includes(lower) ||
                tx.from_box?.code?.toLowerCase().includes(lower) ||
                tx.to_box?.code?.toLowerCase().includes(lower)
            )
        }

        const excelRows = finalData.map(tx => ({
            'Thời Gian': new Date(tx.created_at).toLocaleString('vi-VN'),
            'Người Dùng': tx.computed_user_name || (tx.user_id ? 'Staff' : 'Unknown'),
            'Loại': tx.type,
            'Mã SKU': tx.sku || tx.computed_entity_code || '-',
            'Tên Hàng': tx.computed_entity_name || (tx.entity_type === 'BOX' ? 'Thùng Hàng' : '-'),
            'Số Lượng': tx.quantity || 1,
            'Tham Chiếu': tx.computed_ref_code,
            'Thùng Đi': tx.from_box?.code || '-',
            'Vị Trí Đi': tx.from_loc?.code || '-',
            'Thùng Đến': tx.to_box?.code || '-',
            'Vị Trí Đến': tx.to_loc?.code || '-'
        }))

        const ws = XLSX.utils.json_to_sheet(excelRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "FullHistory")
        XLSX.writeFile(wb, `LichSu_FULL_${new Date().toISOString().split('T')[0]}.xlsx`)
        toast.success("Xuất file thành công!")

    } catch (e: any) {
        toast.error("Lỗi xuất file: " + e.message)
    }
}
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
    computed_ref_code?: string
    reference_id?: string
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
    const [filterUser, setFilterUser] = useState("ALL")
    const [filterSearch, setFilterSearch] = useState("") // Searches Box, SKU, Location
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const pageSize = 200
    const [users, setUsers] = useState<{ id: string, name: string }[]>([])

    useEffect(() => {
        fetchUsers()
        fetchHistory()
    }, [])

    const fetchUsers = async () => {
        const { data } = await supabase.from('users').select('id, name').order('name')
        if (data) setUsers(data)
    }

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
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1)

        // Apply Filters
        if (dateFrom) query = query.gte('created_at', dateFrom)
        if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
        if (filterType !== 'ALL') query = query.eq('type', filterType)
        if (filterUser !== 'ALL') query = query.eq('user_id', filterUser)

        // Server-side Search (Limited to columns now)
        if (filterSearch) {
            const term = `%${filterSearch}%`
            // Search mostly on sku or type, logic simplified due to no details column
            query = query.or(`sku.ilike.${term},type.ilike.${term}`)
        }

        const { data: txData, count, error } = await query

        if (error) {
            console.error(error)
            setLoading(false)
            return
        }

        if (count !== null) setTotal(count)

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

        // Fetch References (Order Codes)
        const refIds = new Set<string>()
        rawTxs.forEach(tx => {
            if (tx.reference_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.reference_id)) {
                refIds.add(tx.reference_id)
            }
        })
        const refMap: Record<string, string> = {}
        if (refIds.size > 0) {
            const { data: orders } = await supabase.from('outbound_orders').select('id, code').in('id', Array.from(refIds))
            orders?.forEach(o => refMap[o.id] = o.code)

            // Also check shipments if not found in orders
            const missingRefs = Array.from(refIds).filter(id => !refMap[id])
            if (missingRefs.length > 0) {
                const { data: shipments } = await supabase.from('outbound_shipments').select('id, code').in('id', missingRefs)
                shipments?.forEach(s => refMap[s.id] = s.code)
            }
        }

        // Fetch Product Names by SKU (for transactions that have SKU but no entity_id)
        const skus = new Set<string>()
        rawTxs.forEach(tx => {
            if (tx.sku) skus.add(tx.sku)
        })

        const skuMap: Record<string, string> = {}
        if (skus.size > 0) {
            const { data: products } = await supabase.from('products').select('sku, name').in('sku', Array.from(skus))
            products?.forEach(p => skuMap[p.sku] = p.name)
        }

        const enriched = rawTxs.map((tx: any) => {
            const code = tx.sku || (tx.entity_type === 'ITEM' && itemMap[tx.entity_id!]?.sku) || (tx.entity_type === 'BOX' && boxMap[tx.entity_id!] || 'N/A')
            const name = tx.sku ? skuMap[tx.sku] : (tx.entity_type === 'ITEM' && itemMap[tx.entity_id!]?.name) || ''

            const refCode = refMap[tx.reference_id] || tx.reference_id || '-'

            return {
                ...tx,
                computed_entity_code: code,
                computed_entity_name: name,
                computed_user_name: userMap[tx.user_id] || 'Unknown',
                computed_ref_code: refCode
            }
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

    const handleDelete = async (id: string) => {
        if (!confirm("Bạn có chắc chắn muốn xóa giao dịch này? Hành động này không thể hoàn tác.")) return

        try {
            const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('id', id)

            if (error) throw error

            setTransactions(prev => prev.filter(tx => tx.id !== id))
            setTotal(prev => prev - 1)
        } catch (e: any) {
            console.error(e)
            alert("Lỗi khi xóa giao dịch: " + e.message)
        }
    }

    const handleExportAll = async () => {
        toast.info("Đang tải toàn bộ dữ liệu... Vui lòng chờ")
        try {
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

            // NO RANGE LIMIT

            // Apply Filters (Same as main fetch)
            if (dateFrom) query = query.gte('created_at', dateFrom)
            if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
            if (filterType !== 'ALL') query = query.eq('type', filterType)
            if (filterUser !== 'ALL') query = query.eq('user_id', filterUser)

            // Server-side Search
            if (filterSearch) {
                const term = `%${filterSearch}%`
                query = query.or(`sku.ilike.${term},type.ilike.${term}`)
            }

            const { data: rawData, error } = await query
            if (error) throw error
            if (!rawData || rawData.length === 0) {
                toast.warning("Không có dữ liệu để xuất")
                return
            }

            toast.info(`Đang xử lý ${rawData.length} dòng dữ liệu...`)
            const enrichedData = await enrichTransactions(rawData)

            // Apply final search filter on computed fields if needed
            let finalData = enrichedData
            if (filterSearch) {
                const lower = filterSearch.toLowerCase()
                finalData = enrichedData.filter(tx =>
                    tx.computed_entity_code?.toLowerCase().includes(lower) ||
                    tx.sku?.toLowerCase().includes(lower) ||
                    tx.from_box?.code?.toLowerCase().includes(lower) ||
                    tx.to_box?.code?.toLowerCase().includes(lower)
                )
            }

            const excelRows = finalData.map(tx => ({
                'Thời Gian': new Date(tx.created_at).toLocaleString('vi-VN'),
                'Người Dùng': tx.computed_user_name || (tx.user_id ? 'Staff' : 'Unknown'),
                'Loại': tx.type,
                'Mã SKU': tx.sku || tx.computed_entity_code || '-',
                'Tên Hàng': tx.computed_entity_name || (tx.entity_type === 'BOX' ? 'Thùng Hàng' : '-'),
                'Số Lượng': tx.quantity || 1,
                'Tham Chiếu': tx.computed_ref_code,
                'Thùng Đi': tx.from_box?.code || '-',
                'Vị Trí Đi': tx.from_loc?.code || '-',
                'Thùng Đến': tx.to_box?.code || '-',
                'Vị Trí Đến': tx.to_loc?.code || '-'
            }))

            const ws = XLSX.utils.json_to_sheet(excelRows)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "FullHistory")
            XLSX.writeFile(wb, `LichSu_FULL_${new Date().toISOString().split('T')[0]}.xlsx`)
            toast.success("Xuất file thành công!")

        } catch (e: any) {
            toast.error("Lỗi xuất file: " + e.message)
        }
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

        // Direct XLSX export (most compatible)
        XLSX.writeFile(wb, `LichSu_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">            <main className="flex-1 p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <History className="h-8 w-8 text-primary" />
                    Lịch Sử Giao Dịch
                </h1>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white border rounded-md px-2 py-1 h-10 shadow-sm">
                        <div className="text-xs text-muted-foreground mr-2 whitespace-nowrap hidden sm:block">
                            {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} / {total}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => { setPage(p => Math.max(1, p - 1)); fetchHistory(); }}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="text-xs font-medium px-1">{page}</div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page * pageSize >= total} onClick={() => { setPage(p => p + 1); fetchHistory(); }}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Button variant="outline" onClick={handleExportAll} className="gap-2">
                        <Download className="h-4 w-4" /> Xuất Excel (All)
                    </Button>
                </div>
            </div>

            {/* FILTERS */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap gap-2 items-end">
                <div className="space-y-1 min-w-[140px]">
                    <label className="text-xs font-bold text-slate-500">Từ Ngày</label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1 min-w-[140px]">
                    <label className="text-xs font-bold text-slate-500">Đến Ngày</label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <div className="space-y-1 min-w-[160px]">
                    <label className="text-xs font-bold text-slate-500">Loại GD</label>
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">ALL</SelectItem>
                            <SelectItem value="IMPORT">IMPORT</SelectItem>
                            <SelectItem value="EXPORT">EXPORT</SelectItem>
                            <SelectItem value="MOVE">MOVE</SelectItem>
                            <SelectItem value="MOVE_BOX">MOVE_BOX</SelectItem>
                            <SelectItem value="AUDIT">AUDIT</SelectItem>
                            <SelectItem value="RESERVE">RESERVE</SelectItem>
                            <SelectItem value="RELEASE">RELEASE</SelectItem>
                            <SelectItem value="SHIP">SHIP</SelectItem>
                            <SelectItem value="INBOUND_BULK">INBOUND_BULK</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1 min-w-[160px]">
                    <label className="text-xs font-bold text-slate-500">Người Dùng</label>
                    <Select value={filterUser} onValueChange={setFilterUser}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tất Cả</SelectItem>
                            {users.map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[140px]">
                    <label className="text-xs font-bold text-slate-500">Tìm Kiếm</label>
                    <Input
                        placeholder="Mã, SKU..."
                        value={filterSearch}
                        onChange={e => setFilterSearch(e.target.value)}
                    />
                </div>
                <Button onClick={() => { setPage(1); fetchHistory(); }} className="min-w-[100px]">
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
                                <th className="p-4">Tên Hàng / Nội Dung</th>
                                <th className="p-4 w-[80px] text-center">SL</th>
                                <th className="p-4">Tham Chiếu</th>
                                <th className="p-4">Thùng Đi (From Box)</th>
                                <th className="p-4">Vị trí Đi (From Loc)</th>
                                <th className="p-4">Thùng Đến (To Box)</th>
                                <th className="p-4">Vị trí Đến (To Loc)</th>
                                <th className="p-4 w-[60px] text-center"></th>

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
                                            <td className="p-4 text-slate-600">
                                                {name}
                                            </td>
                                            {/* Qty */}
                                            <td className="p-4 text-center font-bold">
                                                {qty !== '-' ? qty : '-'}
                                            </td>
                                            {/* Reference */}
                                            <td className="p-4 font-medium text-slate-800">
                                                {tx.computed_ref_code !== '-' ? (
                                                    <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                                                        {tx.computed_ref_code}
                                                    </span>
                                                ) : '-'}
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
                                            <td className="p-4 text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                    onClick={() => handleDelete(tx.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
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
