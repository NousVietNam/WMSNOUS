"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Download, Package, Search, ChevronLeft, ChevronRight, Filter, X } from "lucide-react"
import Barcode from 'react-barcode'
import * as XLSX from 'xlsx'
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface InventoryItem {
    id: string
    quantity: number
    allocated_quantity: number
    created_at: string
    products: {
        id: string
        sku: string
        name: string
        barcode: string | null
        image_url: string | null
        brand?: string | null
        product_group?: string | null
        target_audience?: string | null
        season?: string | null
        launch_month?: number | null
    } | null
    boxes: { code: string; locations: { code: string } | null } | null
    locations: { code: string } | null
}

const ITEMS_PER_PAGE = 200

export default function InventoryPage() {
    const [items, setItems] = useState<InventoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)

    // New State
    const [viewImage, setViewImage] = useState<string | null>(null)
    const [approvedDemand, setApprovedDemand] = useState<Record<string, number>>({})

    // Global Totals State
    const [totals, setTotals] = useState({
        quantity: 0,
        allocated: 0,
        available: 0,
        approved: 0
    })
    const [calculatingTotals, setCalculatingTotals] = useState(false)

    // Filters
    const [filterLocation, setFilterLocation] = useState<string>("all")
    const [filterBox, setFilterBox] = useState<string>("all")
    const [filterBrand, setFilterBrand] = useState<string>("all")
    const [filterTarget, setFilterTarget] = useState<string>("all")
    const [filterProductGroup, setFilterProductGroup] = useState<string>("all")
    const [filterSeason, setFilterSeason] = useState<string>("all")
    const [filterMonth, setFilterMonth] = useState<string>("all")

    // Options for filters
    const [locations, setLocations] = useState<string[]>([])
    const [boxes, setBoxes] = useState<string[]>([])
    const [brands, setBrands] = useState<string[]>([])
    const [targets, setTargets] = useState<string[]>([])
    const [productGroups, setProductGroups] = useState<string[]>([])
    const [seasons, setSeasons] = useState<string[]>([])

    // New State for Details
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailType, setDetailType] = useState<'APPROVED' | 'ALLOCATED'>('APPROVED')
    const [detailData, setDetailData] = useState<any[]>([])
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailTitle, setDetailTitle] = useState("")

    const showApprovedDetails = async (item: InventoryItem) => {
        if (!item.products?.id) return
        setDetailType('APPROVED')
        setDetailTitle(`Nhu Cầu Đã Duyệt - ${item.products.sku}`)
        setDetailOpen(true)
        setDetailLoading(true)

        const { data } = await supabase
            .from('order_items')
            .select('quantity, orders!inner(id, code, status, created_at, users(name))')
            .eq('product_id', item.products.id)
            .eq('orders.is_approved', true)
            .neq('orders.status', 'SHIPPED')
            .neq('orders.status', 'COMPLETED')
        //.order('orders(created_at)', { ascending: true }) // Syntax might be tricky, let's sort client side or trust default

        setDetailData(data || [])
        setDetailLoading(false)
    }

    const showAllocatedDetails = async (item: InventoryItem) => {
        // We need box_id or location_id.
        const boxId = (item as any).box_id
        const locationId = (item as any).location_id

        if (!item.products?.id) return

        let query = supabase
            .from('picking_tasks')
            .select('quantity, status, created_at, picking_jobs!inner(orders(code), users(name))')
            .eq('product_id', item.products.id)
            .neq('status', 'COMPLETED')

        if (boxId) {
            query = query.eq('box_id', boxId)
            setDetailTitle(`Items Giữ Ở Thùng ${item.boxes?.code || 'Unknown'} - ${item.products.sku}`)
        } else if (locationId) {
            query = query.eq('location_id', locationId)
            setDetailTitle(`Items Giữ Ở Vị Trí ${item.locations?.code || 'Unknown'} - ${item.products.sku}`)
        } else {
            toast.error("Không xác định được nơi lưu trữ (Thùng/Vị trí) để tra cứu")
            return
        }

        setDetailType('ALLOCATED')
        setDetailOpen(true)
        setDetailLoading(true)

        const { data } = await query

        setDetailData(data || [])
        setDetailLoading(false)
    }

    useEffect(() => {
        fetchFilterOptions()
    }, [])

    useEffect(() => {
        // Reset to page 0 when filters change
        if (page !== 0) setPage(0)
        else fetchInventory()

        // Calculate global totals whenever filters change
        fetchGlobalTotals()

        updateAvailableFilterOptions()
    }, [searchTerm, filterLocation, filterBox, filterBrand, filterTarget, filterProductGroup, filterSeason, filterMonth])

    // Fetch pagination when page changes (skip if triggered by filter change above)
    useEffect(() => {
        if (items.length > 0 || page > 0) { // Avoid double fetch on init
            fetchInventory()
        }
    }, [page])

    const fetchFilterOptions = async () => {
        const { data: locsData } = await supabase.from('locations').select('code').order('code')
        if (locsData) setLocations(locsData.map(l => l.code))

        const { data: boxesData } = await supabase.from('boxes').select('code').limit(100).order('code')
        if (boxesData) setBoxes(boxesData.map(b => b.code))
    }

    const updateAvailableFilterOptions = () => {
        // Note: Ideally this should fetch from unique values in DB based on current filters.
        // For now, using the fetched items (current page) + all cached items approach would be better,
        // but since we only have current page, this is a limitation unless we fetch ALL metadata.
        // To maintain previous behavior, we'll just populate from current items which is imperfect but safe.
        // Or better: Fetch distinct values from DB? That's heavy.
        // I'll stick to populating from `items` which is what the previous code did (effectively).
        // Actually, previous code used `items` (which was page-limited).
        if (items.length === 0) return

        const availableBrands = [...new Set(items.map(i => i.products?.brand).filter(Boolean))] as string[]
        const availableTargets = [...new Set(items.map(i => i.products?.target_audience).filter(Boolean))] as string[]
        const availableGroups = [...new Set(items.map(i => i.products?.product_group).filter(Boolean))] as string[]
        const availableSeasons = [...new Set(items.map(i => i.products?.season).filter(Boolean))] as string[]

        setBrands(prev => Array.from(new Set([...prev, ...availableBrands])).sort())
        setTargets(prev => Array.from(new Set([...prev, ...availableTargets])).sort())
        setProductGroups(prev => Array.from(new Set([...prev, ...availableGroups])).sort())
        setSeasons(prev => Array.from(new Set([...prev, ...availableSeasons])).sort())
    }

    const fetchInventory = async () => {
        setLoading(true)

        let query = supabase
            .from('inventory_items')
            .select(`
                id, quantity, allocated_quantity, created_at, box_id, location_id,
                products!inner (id, sku, name, barcode, image_url, brand, target_audience, product_group, season, launch_month),
                boxes (code, locations (code)),
                locations (code)
            `, { count: 'exact' })

        // GLOBAL SEARCH LOGIC:
        // If searching, we skip server-side pagination to search across the entire dataset in-memory.
        // This is necessary because Supabase PostgREST cross-table OR search is limited.
        const isGlobalSearch = searchTerm.length > 0;

        if (!isGlobalSearch) {
            const from = page * ITEMS_PER_PAGE
            const to = from + ITEMS_PER_PAGE - 1
            query = query.range(from, to)
        }

        // If global search, we might want to limit to prevent crash if DB is massive, 
        // but for <10k items, fetching all is faster than complex queries.
        // Let's rely on standard order.

        const { data, count, error } = await query.order('created_at', { ascending: false })

        if (error) {
            console.error(error)
        } else {
            let inventoryItems = data as any || []

            if (isGlobalSearch) {
                // Client-side Filter for Search Term
                // We do this here (and not just relies on filteredItems) because 
                // we want 'items' state to ONLY contain matches, effectively "replacing" the page content.
                const s = searchTerm.toLowerCase()
                inventoryItems = inventoryItems.filter((item: any) => (
                    item.products?.name?.toLowerCase().includes(s) ||
                    item.products?.sku?.toLowerCase().includes(s) ||
                    item.boxes?.code?.toLowerCase().includes(s) ||
                    item.locations?.code?.toLowerCase().includes(s) ||
                    item.products?.barcode?.toLowerCase().includes(s)
                ))

                // Update total to match the SEARCH RESULT count, not DB total
                setTotal(inventoryItems.length)
            } else {
                setTotal(count || 0)
            }

            setItems(inventoryItems)

            // Approved Demand for Current Page Items
            const productIds = Array.from(new Set(inventoryItems.map((i: any) => i.products?.id).filter(Boolean)))
            if (productIds.length > 0) {
                const { data: demandRows } = await supabase
                    .from('order_items')
                    .select('product_id, quantity, orders!inner(status, is_approved)')
                    .in('product_id', productIds)
                    .eq('orders.is_approved', true)
                    .neq('orders.status', 'SHIPPED')
                    .neq('orders.status', 'COMPLETED')

                const demandMap: Record<string, number> = {}
                demandRows?.forEach((row: any) => {
                    const pid = row.product_id
                    demandMap[pid] = (demandMap[pid] || 0) + row.quantity
                })
                setApprovedDemand(demandMap)
            } else {
                setApprovedDemand({})
            }
        }
        setLoading(false)
    }

    const fetchGlobalTotals = async () => {
        setCalculatingTotals(true)
        // Fetches ALL items (no paging) to calculate sums. 
        // Warning: Heavy if dataset is huge. 490 items is fine.
        const { data: allItems } = await supabase
            .from('inventory_items')
            .select(`
                quantity, allocated_quantity,
                products!inner (id, sku, name, barcode, brand, target_audience, product_group, season, launch_month),
                boxes (code, locations (code)),
                locations (code)
            `)

        if (allItems) {
            // Client-side filtering for totals
            const filtered = allItems.filter((item: any) => {
                if (searchTerm) {
                    const s = searchTerm.toLowerCase()
                    const match = (
                        item.products?.name?.toLowerCase().includes(s) ||
                        item.products?.sku?.toLowerCase().includes(s) ||
                        item.boxes?.code?.toLowerCase().includes(s) ||
                        item.locations?.code?.toLowerCase().includes(s) ||
                        item.products?.barcode?.toLowerCase().includes(s)
                    )
                    if (!match) return false
                }
                if (filterLocation !== "all") {
                    const loc = item.boxes?.locations?.code || item.locations?.code
                    if (loc !== filterLocation) return false
                }
                if (filterBox !== "all" && item.boxes?.code !== filterBox) return false
                if (filterBrand !== "all" && item.products?.brand !== filterBrand) return false
                if (filterTarget !== "all" && item.products?.target_audience !== filterTarget) return false
                if (filterProductGroup !== "all" && item.products?.product_group !== filterProductGroup) return false
                if (filterSeason !== "all" && item.products?.season !== filterSeason) return false
                if (filterMonth !== "all" && item.products?.launch_month?.toString() !== filterMonth) return false
                return true
            })

            // Sum quantities
            let sumQty = 0
            let sumAllocated = 0
            const productIds = new Set<string>()

            filtered.forEach((i: any) => {
                sumQty += i.quantity || 0
                sumAllocated += i.allocated_quantity || 0
                if (i.products?.id) productIds.add(i.products.id)
            })

            // Sum Approved Demand (Fetch for ALL matching products)
            let sumApproved = 0
            if (productIds.size > 0) {
                const { data: demandData } = await supabase
                    .from('order_items')
                    .select('quantity, orders!inner(status, is_approved)')
                    .in('product_id', Array.from(productIds))
                    .eq('orders.is_approved', true)
                    .neq('orders.status', 'SHIPPED')
                    .neq('orders.status', 'COMPLETED')

                demandData?.forEach((r: any) => sumApproved += r.quantity)
            }

            setTotals({
                quantity: sumQty,
                allocated: sumAllocated,
                available: Math.max(0, sumQty - sumAllocated),
                approved: sumApproved
            })
        }
        setCalculatingTotals(false)
    }

    // Client-side filtering for display (duplicates server paging logic matching? 
    // Actually `items` is paginated by server. 
    // We only filter `items` locally if we want to search WITHIN the page.
    // The previous implementation used client-side filtering on server-side paginated data.
    // We will keep that behavior for consistency with previous "Filtering" block.)
    const filteredItems = items.filter(item => {
        if (searchTerm) {
            const s = searchTerm.toLowerCase()
            const matchSearch = (
                item.products?.name.toLowerCase().includes(s) ||
                item.products?.sku.toLowerCase().includes(s) ||
                item.boxes?.code.toLowerCase().includes(s) ||
                item.locations?.code.toLowerCase().includes(s) ||
                item.products?.barcode?.toLowerCase().includes(s)
            )
            if (!matchSearch) return false
        }
        if (filterLocation !== "all") {
            const loc = item.boxes?.locations?.code || item.locations?.code
            if (loc !== filterLocation) return false
        }
        if (filterBox !== "all" && item.boxes?.code !== filterBox) return false
        if (filterBrand !== "all" && item.products?.brand !== filterBrand) return false
        if (filterTarget !== "all" && item.products?.target_audience !== filterTarget) return false
        if (filterProductGroup !== "all" && item.products?.product_group !== filterProductGroup) return false
        if (filterSeason !== "all" && item.products?.season !== filterSeason) return false
        if (filterMonth !== "all" && item.products?.launch_month?.toString() !== filterMonth) return false
        return true
    })

    const handleExport = async () => {
        try {
            toast.info("Đang tải dữ liệu toàn hệ thống...")
            const { data, error } = await supabase
                .from('inventory_items')
                .select(`
                    id, quantity, allocated_quantity, created_at,
                    products!inner (sku, name, barcode, brand, target_audience, product_group, season, launch_month),
                    boxes (code, locations (code)),
                    locations (code)
                `)
                .order('created_at', { ascending: false })

            if (error) throw error
            if (!data) return

            const exportData = data.map((item: any) => ({
                SKU: item.products?.sku,
                'Sản Phẩm': item.products?.name,
                'Barcode': item.products?.barcode || '-',
                'Thương Hiệu': item.products?.brand || '-',
                'Đối Tượng': item.products?.target_audience || '-',
                'Nhóm Hàng': item.products?.product_group || '-',
                'Mùa': item.products?.season || '-',
                'Tháng MB': item.products?.launch_month || '-',
                'Tổng Tồn': item.quantity,
                'Hàng Giữ': item.allocated_quantity || 0,
                'Khả Dụng': Math.max(0, item.quantity - (item.allocated_quantity || 0)),
                'Thùng': item.boxes?.code || '-',
                'Vị Trí': item.boxes?.locations?.code || item.locations?.code || '-'
            }))

            const ws = XLSX.utils.json_to_sheet(exportData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Ton_Kho_Full")
            XLSX.writeFile(wb, `Inventory_Full_${new Date().toISOString().slice(0, 10)}.xlsx`)
            toast.success("Xuất dữ liệu thành công!")
        } catch (error: any) {
            console.error(error)
            toast.error("Lỗi xuất dữ liệu: " + error.message)
        }
    }

    const clearFilters = () => {
        setFilterLocation("all")
        setFilterBox("all")
        setFilterBrand("all")
        setFilterTarget("all")
        setFilterProductGroup("all")
        setFilterSeason("all")
        setFilterMonth("all")
        setSearchTerm("")
    }

    const activeFiltersCount = [
        filterLocation !== "all",
        filterBox !== "all",
        filterBrand !== "all",
        filterTarget !== "all",
        filterProductGroup !== "all",
        filterSeason !== "all",
        filterMonth !== "all",
        searchTerm !== ""
    ].filter(Boolean).length

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <main className="flex-1 p-6 space-y-6">

                {/* HEAD & PAGINATION & SEARCH */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="h-8 w-8 text-primary" />
                        Tồn Kho ({total})
                    </h1>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        {/* Search Input */}
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm SKU, tên, barcode..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Updated Pagination UI (Next to Search) */}
                        <div className="flex items-center gap-1 bg-white border rounded-md px-2 py-1 h-10 shadow-sm">
                            <div className="text-xs text-muted-foreground mr-2 whitespace-nowrap hidden sm:block">
                                {page * ITEMS_PER_PAGE + 1}-{Math.min((page + 1) * ITEMS_PER_PAGE, total)} / {total}
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="text-xs font-medium px-1">{page + 1}</div>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={(page + 1) * ITEMS_PER_PAGE >= total} onClick={() => setPage(page + 1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button variant="outline" onClick={handleExport}>
                            <Download className="mr-2 h-4 w-4" /> Xuất Excel
                        </Button>
                    </div>
                </div>

                {/* FILTERS - Compact (Removed 'Bộ Lọc' header) */}
                <div className="bg-white p-3 rounded-md border shadow-sm">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                        <Select value={filterLocation} onValueChange={setFilterLocation}>
                            <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Vị trí" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả vị trí</SelectItem>
                                {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={filterBox} onValueChange={setFilterBox}>
                            <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Thùng" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả thùng</SelectItem>
                                {boxes.map(box => <SelectItem key={box} value={box}>{box}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={filterBrand} onValueChange={setFilterBrand}>
                            <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Thương hiệu" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả thương hiệu</SelectItem>
                                {brands.map(brand => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={filterTarget} onValueChange={setFilterTarget}>
                            <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Đối tượng" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả đối tượng</SelectItem>
                                {targets.map(target => <SelectItem key={target} value={target}>{target}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={filterProductGroup} onValueChange={setFilterProductGroup}>
                            <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Nhóm hàng" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả nhóm</SelectItem>
                                {productGroups.map(group => <SelectItem key={group} value={group}>{group}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={filterSeason} onValueChange={setFilterSeason}>
                            <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Mùa" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả mùa</SelectItem>
                                {seasons.map(season => <SelectItem key={season} value={season}>{season}</SelectItem>)}
                            </SelectContent>
                        </Select>

                        <Select value={filterMonth} onValueChange={setFilterMonth}>
                            <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Tháng MB" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả tháng</SelectItem>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                                    <SelectItem key={month} value={month.toString()}>Tháng {month}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-md border shadow-sm flex-1 flex flex-col min-h-0">
                    <div className="rounded-md border overflow-auto relative flex-1">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 font-medium text-slate-700 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 w-[140px]">Barcode</th>
                                    <th className="p-3 w-[100px]">SKU</th>
                                    <th className="p-3 w-[250px]">Sản Phẩm</th>
                                    <th className="p-3 w-[110px]">Thương Hiệu</th>
                                    <th className="p-3 w-[100px]">Đối Tượng</th>
                                    <th className="p-3 w-[100px]">Nhóm Hàng</th>
                                    <th className="p-3 w-[80px] text-center">Mùa</th>
                                    <th className="p-3 w-[70px] text-center">Tháng</th>
                                    <th className="p-3 w-[70px] text-center">Tổng Tồn</th>
                                    <th className="p-3 w-[70px] text-center text-orange-600">Hàng Giữ</th>
                                    <th className="p-3 w-[70px] text-center text-green-600">Khả Dụng</th>
                                    <th className="p-3 w-[110px]">Thùng</th>
                                    <th className="p-3 w-[110px]">Vị Trí</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* GLOBAL TOTALS ROW (Top of body) */}
                                <tr className="bg-slate-50 font-bold border-b-2 border-slate-200">
                                    <td colSpan={2} className="p-3 text-left pl-4 text-slate-600 uppercase text-xs tracking-wider">
                                        Tổng tất cả:
                                    </td>
                                    {/* Empty cells to align */}
                                    <td></td><td></td><td></td><td></td><td></td><td></td>

                                    <td className="p-3 text-center text-slate-800 text-base">{calculatingTotals ? '...' : totals.quantity}</td>
                                    <td className="p-3 text-center text-orange-700 text-base">{calculatingTotals ? '...' : totals.allocated}</td>
                                    <td className="p-3 text-center text-green-700 text-base">{calculatingTotals ? '...' : totals.available}</td>
                                    <td colSpan={2}></td>
                                </tr>

                                {loading ? (
                                    <tr><td colSpan={13} className="p-8 text-center">Đang tải...</td></tr>
                                ) : filteredItems.length === 0 ? (
                                    <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">Không tìm thấy.</td></tr>
                                ) : (
                                    filteredItems.map(item => {
                                        const allocated = item.allocated_quantity || 0
                                        const available = Math.max(0, item.quantity - allocated)

                                        return (
                                            <tr key={item.id} className="border-t hover:bg-slate-50 text-xs">
                                                <td className="p-2">
                                                    {item.products?.barcode ? (
                                                        <div className="bg-white p-1 rounded border border-slate-100">
                                                            <Barcode value={item.products.barcode} height={20} width={0.8} displayValue={false} margin={0} background="transparent" />
                                                            <div className="text-[9px] text-center font-mono mt-0.5 text-slate-500">{item.products.barcode}</div>
                                                        </div>
                                                    ) : <span className="text-xs text-slate-400 italic">--</span>}
                                                </td>
                                                <td className="p-2">
                                                    <button
                                                        className="font-bold text-xs text-blue-600 hover:underline hover:text-blue-800 text-left"
                                                        onClick={() => {
                                                            if (item.products?.image_url) {
                                                                setViewImage(item.products.image_url)
                                                            } else {
                                                                toast.error("Sản phẩm chưa có hình ảnh")
                                                            }
                                                        }}
                                                        title="Xem ảnh sản phẩm"
                                                    >
                                                        {item.products?.sku}
                                                    </button>
                                                </td>
                                                <td className="p-2">
                                                    <div className="font-medium text-sm line-clamp-2 leading-relaxed" title={item.products?.name}>
                                                        {item.products?.name}
                                                    </div>
                                                </td>
                                                <td className="p-2 text-xs">{item.products?.brand || '-'}</td>
                                                <td className="p-2 text-xs">{item.products?.target_audience || '-'}</td>
                                                <td className="p-2 text-xs">{item.products?.product_group || '-'}</td>
                                                <td className="p-2 text-center text-xs">{item.products?.season || '-'}</td>
                                                <td className="p-2 text-center text-xs">{item.products?.launch_month || '-'}</td>
                                                <td className="p-2 text-center font-bold text-base text-slate-700">{item.quantity}</td>
                                                <td className="p-2 text-center font-bold text-base text-orange-600">
                                                    {allocated > 0 ? (
                                                        <button className="hover:underline hover:bg-orange-50 px-2 rounded" onClick={() => showAllocatedDetails(item)}>
                                                            {allocated}
                                                        </button>
                                                    ) : '-'}
                                                </td>
                                                <td className="p-2 text-center font-bold text-base text-green-600">{available}</td>
                                                <td className="p-2">
                                                    {item.boxes ? (
                                                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold">{item.boxes.code}</span>
                                                    ) : <span className="text-slate-300">-</span>}
                                                </td>
                                                <td className="p-2">
                                                    {item.boxes?.locations ? (
                                                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold">{item.boxes.locations.code}</span>
                                                    ) : item.locations ? (
                                                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-semibold">{item.locations.code}</span>
                                                    ) : <span className="text-slate-300">-</span>}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* IMAGE PREVIEW DIALOG */}
                <Dialog open={!!viewImage} onOpenChange={(open) => !open && setViewImage(null)}>
                    <DialogContent className="max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none text-center flex justify-center items-center [&>button]:hidden">
                        {viewImage && (
                            <div className="relative inline-block bg-white p-2 rounded-xl shadow-2xl">
                                <img
                                    src={viewImage}
                                    alt="Product Preview"
                                    className="w-[450px] h-[450px] object-cover rounded-lg aspect-square"
                                />
                                <button
                                    onClick={() => setViewImage(null)}
                                    className="absolute top-4 right-4 bg-white/90 hover:bg-white text-slate-800 rounded-full w-9 h-9 flex items-center justify-center shadow-sm backdrop-blur-sm transition-all border border-white/20"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
                {/* DETAILS DIALOG */}
                <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                    <DialogContent className="max-w-xl">
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-bold">{detailTitle}</h3>
                            <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 font-bold">
                                        <tr>
                                            <th className="p-2 text-left">Đơn Hàng</th>
                                            <th className="p-2 text-left">Người Xử Lý</th>
                                            <th className="p-2 text-right">Số Lượng</th>
                                            <th className="p-2 text-right text-slate-500">Ngày Tạo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {detailLoading ? (
                                            <tr><td colSpan={4} className="p-4 text-center">Đang tải...</td></tr>
                                        ) : detailData.length === 0 ? (
                                            <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Không có dữ liệu chi tiết</td></tr>
                                        ) : detailData.map((row, idx) => {
                                            const order = row.picking_jobs?.orders
                                            const user = row.picking_jobs?.users
                                            return (
                                                <tr key={idx}>
                                                    <td className="p-2 font-medium">{order?.code || 'Job #' + row.picking_jobs?.id}</td>
                                                    <td className="p-2">{user?.name || '-'}</td>
                                                    <td className="p-2 text-right font-bold text-orange-600">{row.quantity}</td>
                                                    <td className="p-2 text-right text-xs text-slate-400">{new Date(row.created_at).toLocaleDateString()}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </main>
        </div >
    )
}
