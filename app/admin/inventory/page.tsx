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
import { saveAs } from 'file-saver'

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
    const [filterWarehouse, setFilterWarehouse] = useState<string>("all") // New Filter
    const [filterLocation, setFilterLocation] = useState<string>("all")
    const [filterBox, setFilterBox] = useState<string>("all")
    const [filterBrand, setFilterBrand] = useState<string>("all")
    const [filterTarget, setFilterTarget] = useState<string>("all")
    const [filterProductGroup, setFilterProductGroup] = useState<string>("all")
    const [filterSeason, setFilterSeason] = useState<string>("all")
    const [filterMonth, setFilterMonth] = useState<string>("all")

    // Options for filters
    const [warehouses, setWarehouses] = useState<any[]>([]) // New
    const [locations, setLocations] = useState<string[]>([])
    const [boxes, setBoxes] = useState<string[]>([])
    const [brands, setBrands] = useState<string[]>([])
    const [targets, setTargets] = useState<string[]>([])
    const [productGroups, setProductGroups] = useState<string[]>([])
    const [seasons, setSeasons] = useState<string[]>([])
    const [months, setMonths] = useState<number[]>([])

    // New State for Details
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailType, setDetailType] = useState<'APPROVED' | 'ALLOCATED'>('APPROVED')
    const [detailData, setDetailData] = useState<any[]>([])
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailTitle, setDetailTitle] = useState("")

    // Summary View State
    const [viewMode, setViewMode] = useState<'DETAILED' | 'SUMMARY'>('DETAILED')
    const [locationDetailOpen, setLocationDetailOpen] = useState(false)
    const [locationDetailData, setLocationDetailData] = useState<any[]>([])
    const [locationDetailTitle, setLocationDetailTitle] = useState("")

    const showLocationDetails = (summaryItem: any) => {
        setLocationDetailTitle(`Chi tiết vị trí - ${summaryItem.sku}`)
        setLocationDetailData(summaryItem.items)
        setLocationDetailOpen(true)
    }

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
        const boxId = (item as any).box_id
        const locationId = (item as any).location_id

        if (!item.products?.id) return

        console.log('🔍 Querying picking_tasks for:', {
            productId: item.products.id,
            boxId,
            locationId
        })

        let query = supabase
            .from('picking_tasks')
            .select(`
                quantity, 
                status,
                job_id,
                picking_jobs!job_id(
                    order_id,
                    user_id,
                    orders(code),
                    users(name)
                )
            `)
            .eq('product_id', item.products.id)
            .neq('status', 'COMPLETED')

        if (boxId) {
            query = query.eq('box_id', boxId)
            setDetailTitle(`Hàng Giữ Ở Thùng ${item.boxes?.code || 'Unknown'} - ${item.products.sku}`)
        } else if (locationId) {
            query = query.eq('location_id', locationId)
            setDetailTitle(`Hàng Giữ Ở Vị Trí ${item.locations?.code || 'Unknown'} - ${item.products.sku}`)
        } else {
            toast.error("Không xác định được nơi lưu trữ")
            return
        }

        setDetailOpen(true)
        setDetailLoading(true)

        const { data, error } = await query

        if (error) {
            console.error('❌ Query error:', error)
            toast.error(`Lỗi: ${error.message}`)
        } else {
            console.log('✅ Query success:', data)
        }

        setDetailData(data || [])
        setDetailLoading(false)
    }

    useEffect(() => {
        fetchFilterOptions()
        fetchWarehouses()
    }, [])

    useEffect(() => {
        // Reset to page 0 when filters change
        if (page !== 0) setPage(0)
        else fetchInventory()

        // Calculate global totals whenever filters change
        fetchGlobalTotals()

        updateAvailableFilterOptions()
    }, [searchTerm, filterWarehouse, filterLocation, filterBox, filterBrand, filterTarget, filterProductGroup, filterSeason, filterMonth])

    const fetchWarehouses = async () => {
        const { data } = await supabase.from('warehouses').select('id, name, code').order('name')
        if (data) setWarehouses(data)
    }

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

    const updateAvailableFilterOptions = async () => {
        // Fetch DISTINCT values from DB based on currently selected filters
        // This creates cascading dependencies between filters

        let query = supabase
            .from('inventory_items')
            .select(`
                products!inner (brand, target_audience, product_group, season, launch_month),
                boxes (code, locations (code)),
                locations (code)
            `)
            .gt('quantity', 0)

        // Apply currently selected filters to narrow down options
        if (filterWarehouse !== "all") {
            query = query.eq('warehouse_id', filterWarehouse)
        }
        if (filterLocation !== "all") {
            // Need to filter by location - complex because location can be in boxes.locations OR direct locations
            // This requires client-side filtering after fetch, OR we skip this optimization
            // For simplicity, we'll fetch all and filter client-side
        }
        if (filterBox !== "all") {
            query = query.eq('boxes.code', filterBox)
        }

        const { data: allData } = await query

        if (!allData || allData.length === 0) {
            // No data matching current filters - clear dependent options
            setBrands([])
            setTargets([])
            setProductGroups([])
            setSeasons([])
            return
        }

        // Client-side filter for complex conditions
        const filtered = allData.filter((item: any) => {
            if (filterLocation !== "all") {
                const loc = (item as any).boxes?.locations?.code || (item as any).locations?.code
                if (loc !== filterLocation) return false
            }
            if (filterBrand !== "all" && (item as any).products?.brand !== filterBrand) return false
            if (filterTarget !== "all" && (item as any).products?.target_audience !== filterTarget) return false
            if (filterProductGroup !== "all" && (item as any).products?.product_group !== filterProductGroup) return false
            if (filterSeason !== "all" && (item as any).products?.season !== filterSeason) return false
            if (filterMonth !== "all" && Number((item as any).products?.launch_month) !== Number(filterMonth)) return false
            return true
        })

        // Extract unique values for each filter from filtered data
        const uniqueBrands = [...new Set(filtered.map((i: any) => i.products?.brand).filter(Boolean))] as string[]
        const uniqueTargets = [...new Set(filtered.map((i: any) => i.products?.target_audience).filter(Boolean))] as string[]
        const uniqueGroups = [...new Set(filtered.map((i: any) => i.products?.product_group).filter(Boolean))] as string[]
        const uniqueSeasons = [...new Set(filtered.map((i: any) => i.products?.season).filter(Boolean))] as string[]

        // Normalize months to numbers to handle "05" vs 5 matches and sorting
        const uniqueMonths = [...new Set(filtered.map((i: any) => {
            const m = (i as any).products?.launch_month
            return m
        }).filter((m): m is any => m != null && m !== ''))]

        setBrands(uniqueBrands.sort())
        setTargets(uniqueTargets.sort())
        setProductGroups(uniqueGroups.sort())
        setSeasons(uniqueSeasons.sort())
        // Sort mixed types (numbers and strings like "05") safely
        setMonths(uniqueMonths.sort((a, b) => Number(a) - Number(b)))
    }

    // New State for View Data
    const [viewDataMap, setViewDataMap] = useState<Record<string, any>>({})

    const fetchAvailabilityView = async (productIds: string[]) => {
        if (productIds.length === 0) return

        const { data } = await supabase
            .from('view_product_availability')
            .select('*')
            .in('product_id', productIds)

        if (data) {
            const map: Record<string, any> = {}
            data.forEach((row: any) => {
                // Sanitize BigInts to Numbers to prevent React crash
                map[row.product_id] = {
                    ...row,
                    soft_booked_orders: Number(row.soft_booked_orders || 0),
                    soft_booked_transfers: Number(row.soft_booked_transfers || 0)
                }
            })
            setViewDataMap(prev => ({ ...prev, ...map }))
        }
    }

    const fetchInventory = async () => {
        setLoading(true)

        let query = supabase
            .from('inventory_items')
            .select(`
                id, quantity, allocated_quantity, created_at, box_id, location_id, warehouse_id,
                products!inner (id, sku, name, barcode, image_url, brand, target_audience, product_group, season, launch_month),
                boxes (code, locations (code)),
                locations (code)
            `, { count: 'exact' })
            .gt('quantity', 0)

        // SERVER-SIDE FILTERS (Keep existing logic)
        if (filterWarehouse !== "all") query = query.eq('warehouse_id', filterWarehouse)
        if (filterBrand !== "all") query = query.eq('products.brand', filterBrand)
        if (filterTarget !== "all") query = query.eq('products.target_audience', filterTarget)
        if (filterProductGroup !== "all") query = query.eq('products.product_group', filterProductGroup)
        if (filterSeason !== "all") query = query.eq('products.season', filterSeason)
        if (filterMonth !== "all") query = query.eq('products.launch_month', filterMonth)
        if (filterBox !== "all") query = query.eq('boxes.code', filterBox)

        const isGlobalSearch = searchTerm.length > 0;
        if (!isGlobalSearch) {
            const from = page * ITEMS_PER_PAGE
            const to = from + ITEMS_PER_PAGE - 1
            query = query.range(from, to)
        }

        const { data, count, error } = await query.order('created_at', { ascending: false })

        if (error) {
            console.error(error)
        } else {
            let inventoryItems = data as any || []

            if (isGlobalSearch) {
                const s = searchTerm.toLowerCase()
                inventoryItems = inventoryItems.filter((item: any) => (
                    item.products?.name?.toLowerCase().includes(s) ||
                    item.products?.sku?.toLowerCase().includes(s) ||
                    item.boxes?.code?.toLowerCase().includes(s) ||
                    item.locations?.code?.toLowerCase().includes(s) ||
                    item.products?.barcode?.toLowerCase().includes(s)
                ))
                setTotal(inventoryItems.length)
            } else {
                setTotal(count || 0)
            }

            setItems(inventoryItems)

            // Fetch View Data for these items
            const productIds = Array.from(new Set(inventoryItems.map((i: any) => i.products?.id).filter(Boolean))) as string[]
            if (productIds.length > 0) {
                await fetchAvailabilityView(productIds)
            }
        }
        setLoading(false)
    }

    const fetchGlobalTotals = async () => {
        setCalculatingTotals(true)

        try {
            // Updated optimization: Call Database RPC
            // Passes current filters to server for calculation
            const { data, error } = await supabase.rpc('get_inventory_summary', {
                p_warehouse_id: filterWarehouse !== "all" ? filterWarehouse : null,
                p_location_code: filterLocation !== "all" ? filterLocation : null,
                p_box_code: filterBox !== "all" ? filterBox : null,
                p_brand: filterBrand !== "all" ? filterBrand : null,
                p_target_audience: filterTarget !== "all" ? filterTarget : null,
                p_product_group: filterProductGroup !== "all" ? filterProductGroup : null,
                p_season: filterSeason !== "all" ? filterSeason : null,
                p_launch_month: filterMonth !== "all" ? filterMonth : null,
                p_search: searchTerm || null
            })

            if (error) {
                console.error("RPC Error (falling back to client-side calc):", error)
                // Fallback Logic (Old Client-Side Calculation)
                // Keep this for backward compatibility if RPC not run yet
                await fetchGlobalTotalsClientSide()
            } else if (data && data.length > 0) {
                const result = data[0]
                setTotals({
                    quantity: result.total_quantity || 0,
                    allocated: result.total_allocated || 0,
                    approved: result.total_approved || 0,
                    available: Math.max(0, (result.total_quantity || 0) - (result.total_allocated || 0) - (result.total_approved || 0))
                })
            } else {
                // If RPC returns no data (e.g., no items match filters), set totals to zero
                setTotals({
                    quantity: 0,
                    allocated: 0,
                    approved: 0,
                    available: 0
                })
            }
        } catch (err) {
            console.error(err)
            // Fallback
            await fetchGlobalTotalsClientSide()
        }
        setCalculatingTotals(false)
    }

    const fetchGlobalTotalsClientSide = async () => {
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
            .gt('quantity', 0) // Filter out 0 quantity items

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
                if (filterWarehouse !== "all" && (item as any).warehouse_id !== filterWarehouse) return false
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
            // 1. From Orders
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

                // 2. From Transfers (Pending Approval/Approved) -> effectively "Approved" state
                // Note: We used 'status = approved' in transfers table.
                const { data: transferData } = await supabase
                    .from('transfer_order_items')
                    .select('quantity, transfer_orders!inner(status)')
                    .in('product_id', Array.from(productIds))
                    .eq('transfer_orders.status', 'approved')

                transferData?.forEach((r: any) => sumApproved += r.quantity)
            }

            setTotals({
                quantity: sumQty,
                allocated: sumAllocated,
                available: Math.max(0, sumQty - sumAllocated - sumApproved),
                approved: sumApproved
            })
        } else {
            setTotals({
                quantity: 0,
                allocated: 0,
                approved: 0,
                available: 0
            })
        }

        setCalculatingTotals(false)
    }

    // (Totals logic remains for global dashboard header, can be updated later to use View agg if needed)
    // For now we focus on the Table/Summary View integration.

    // ... (filters logic) ...

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
        if (filterWarehouse !== "all" && (item as any).warehouse_id !== filterWarehouse) return false
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

    // Summary View Aggregation (Updated to use View Data)
    const summaryItems = (() => {
        try {
            if (viewMode !== 'SUMMARY') return []

            const map: Record<string, any> = {}

            filteredItems.forEach(item => {
                if (!item.products?.sku) return
                const sku = item.products.sku
                if (!map[sku]) {
                    const viewInfo = item.products.id ? viewDataMap[item.products.id] : null
                    map[sku] = {
                        ...item.products,
                        totalQty: 0,
                        totalAllocated: 0,

                        // Use View Data if available for Soft Allocation
                        softOrders: viewInfo ? (viewInfo.soft_booked_orders || 0) : 0,
                        softTransfers: viewInfo ? (viewInfo.soft_booked_transfers || 0) : 0,

                        locations: new Set(),
                        items: []
                    }
                }
                // We still sum "totalQty" and "totalAllocated" from the filtered items 
                // because "Summary" view might be showing a SUBSET (filtered by warehouse).
                // The VIEW data is GLOBAL.
                // CAUTION: The User might want GLOBAL availability or FILTERED availability.
                // Usually "Available" is Global for Selling.
                // Let's rely on the View for "Available" column logic if possible, 
                // OR stick to manual sum for Qty but View for Soft?
                // "Soft Allocation" (Orders) is usually Global (not assigned to warehouse yet).
                // So View is correct for Soft.

                map[sku].totalQty += item.quantity
                map[sku].totalAllocated += (item.allocated_quantity || 0)

                const locCode = item.boxes?.locations?.code || item.locations?.code
                if (locCode) map[sku].locations.add(locCode)

                map[sku].items.push(item)
            })

            return Object.values(map).map(i => {
                // Real Available Calculation
                // If we are viewing specific warehouse, Qty is local.
                // But Demand is Global.
                // Available = Local Qty - Local Hard - Global Soft (Risk of negative?).
                // Usually Available is calculated Globally.
                // Let's display: Local Qty, Local Hard, Global Soft Orders, Global Soft Transfers.

                return {
                    ...i,
                    locationStr: Array.from(i.locations).sort().join(', '),
                    available: Math.max(0, i.totalQty - i.totalAllocated - i.softOrders - i.softTransfers)
                }
            })
        } catch (e) {
            console.error("Summary Calc Error:", e)
            return []
        }
    })()

    // Calculate totals for Summary mode (from summaryItems)
    const summaryTotals = (() => {
        if (viewMode !== 'SUMMARY' || summaryItems.length === 0) return { softOrders: 0, softTransfers: 0, totalQty: 0, totalAllocated: 0, available: 0 }
        return summaryItems.reduce((acc, item) => ({
            softOrders: acc.softOrders + (item.softOrders || 0),
            softTransfers: acc.softTransfers + (item.softTransfers || 0),
            totalQty: acc.totalQty + (item.totalQty || 0),
            totalAllocated: acc.totalAllocated + (item.totalAllocated || 0),
            available: acc.available + (item.available || 0)
        }), { softOrders: 0, softTransfers: 0, totalQty: 0, totalAllocated: 0, available: 0 })
    })()

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

            // Direct XLSX export (most compatible)
            XLSX.writeFile(wb, `Inventory_Full_${new Date().toISOString().slice(0, 10)}.xlsx`)

            toast.success("Xuất dữ liệu thành công!")
        } catch (error: any) {
            console.error(error)
            toast.error("Lỗi xuất dữ liệu: " + error.message)
        }
    }

    const clearFilters = () => {
        setFilterWarehouse("all")
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
        filterWarehouse !== "all",
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

                    {/* WAREHOUSE FILTER UI HERE */}
                    <div className="w-[180px]">
                        <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
                            <SelectTrigger className="h-10 bg-white border-2 border-primary/20 hover:border-primary/50 text-slate-900 font-medium">
                                <SelectValue placeholder="Chọn Kho hàng" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="font-bold">Tất cả kho</SelectItem>
                                {warehouses.map(wh => (
                                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

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

                        {activeFiltersCount > 0 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={clearFilters}
                                className="h-10 w-10 text-slate-500 hover:text-red-500 hover:bg-red-50"
                                title="Xóa bộ lọc"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}

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
                        <div className="border rounded-md p-1 bg-slate-100 flex">
                            <button
                                onClick={() => setViewMode('DETAILED')}
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'DETAILED' ? 'bg-white shadow text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Chi Tiết
                            </button>
                            <button
                                onClick={() => setViewMode('SUMMARY')}
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'SUMMARY' ? 'bg-white shadow text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Tổng Hợp
                            </button>
                        </div>
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
                                {months.map(month => (
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
                                    <th className="p-3 w-[70px] text-center text-orange-600">Đang Lấy</th>
                                    {viewMode === 'SUMMARY' && (
                                        <>
                                            <th className="p-3 w-[80px] text-center text-primary">Đơn Đặt Hàng</th>
                                            <th className="p-3 w-[80px] text-center text-orange-500">Đơn Điều Chuyển</th>
                                        </>
                                    )}
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
                                    {/* Empty cells to align with columns: Sản Phẩm, Thương Hiệu, Đối Tượng, Nhóm Hàng, Mùa, Tháng */}
                                    <td></td><td></td><td></td><td></td><td></td><td></td>
                                    <td className="p-3 text-center text-slate-800 text-base">
                                        {viewMode === 'SUMMARY' ? summaryTotals.totalQty : (calculatingTotals ? '...' : totals.quantity)}
                                    </td>
                                    <td className="p-3 text-center text-orange-700 text-base">
                                        {viewMode === 'SUMMARY' ? summaryTotals.totalAllocated : (calculatingTotals ? '...' : totals.allocated)}
                                    </td>
                                    {viewMode === 'SUMMARY' && (
                                        <>
                                            <td className="p-3 text-center text-primary text-base font-bold">{summaryTotals.softOrders}</td>
                                            <td className="p-3 text-center text-orange-500 text-base font-bold">{summaryTotals.softTransfers}</td>
                                        </>
                                    )}
                                    <td className="p-3 text-center text-green-700 text-base bg-green-50 font-bold">
                                        {viewMode === 'SUMMARY' ? summaryTotals.available : (calculatingTotals ? '...' : Math.max(0, totals.quantity - totals.allocated))}
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>


                                {loading ? (
                                    <tr><td colSpan={15} className="p-8 text-center">Đang tải...</td></tr>
                                ) : viewMode === 'SUMMARY' ? (
                                    summaryItems.map((item, idx) => (
                                        <tr key={idx} className="border-b hover:bg-slate-50 transition-colors text-sm">
                                            <td className="py-3 px-4">{item.barcode || '-'}</td>
                                            <td className="py-3 px-4 font-mono text-slate-600">{item.sku}</td>
                                            <td className="py-3 px-4 font-medium text-slate-800">{item.name}</td>
                                            <td className="py-3 px-4">{item.brand || '-'}</td>
                                            <td className="py-3 px-4">{item.target_audience || '-'}</td>
                                            <td className="py-3 px-4">{item.product_group || '-'}</td>
                                            <td className="py-3 px-4 text-center">{item.season || '-'}</td>
                                            <td className="py-3 px-4 text-center">{item.launch_month || '-'}</td>

                                            <td className="py-3 px-4 text-center font-bold text-slate-700">{item.totalQty}</td>
                                            <td className="py-3 px-4 text-center font-bold text-slate-600" title="Đã cấp phát cứng">
                                                {item.totalAllocated > 0 ? item.totalAllocated : '-'}
                                            </td>
                                            {/* New Cols: Soft Orders & Soft Transfers */}
                                            <td className="py-3 px-4 text-center font-bold text-primary">
                                                {item.softOrders > 0 ? item.softOrders : '-'}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-orange-600">
                                                {item.softTransfers > 0 ? item.softTransfers : '-'}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-green-600 bg-green-50">
                                                {item.available}
                                            </td>

                                            <td className="py-3 px-4 text-center text-slate-400">-</td>
                                            <td className="py-3 px-4 text-sm text-slate-600 max-w-[150px] truncate" title={item.locationStr}>
                                                {item.locationStr || 'Chưa xếp'}
                                                <Button variant="ghost" size="sm" className="h-6 w-6 ml-1 p-0" onClick={() => showLocationDetails(item)}>
                                                    <Search className="h-3 w-3" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                ) : filteredItems.length === 0 ? (
                                    <tr><td colSpan={15} className="p-8 text-center text-muted-foreground">Không tìm thấy.</td></tr>
                                ) : (
                                    filteredItems.map(item => {
                                        const allocated = item.allocated_quantity || 0
                                        const approved = item.products?.id ? (approvedDemand[item.products.id] || 0) : 0
                                        const available = Math.max(0, item.quantity - allocated - approved)

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
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {detailLoading ? (
                                            <tr><td colSpan={3} className="p-4 text-center">Đang tải...</td></tr>
                                        ) : detailData.length === 0 ? (
                                            <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Không có dữ liệu chi tiết</td></tr>
                                        ) : detailData.map((row, idx) => {
                                            const order = row.picking_jobs?.orders
                                            const user = row.picking_jobs?.users
                                            return (
                                                <tr key={idx}>
                                                    <td className="p-2 font-medium">{order?.code || 'Job #' + row.job_id}</td>
                                                    <td className="p-2">{user?.name || '-'}</td>
                                                    <td className="p-2 text-right font-bold text-orange-600">{row.quantity}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* LOCATION DETAIL DIALOG */}
                <Dialog open={locationDetailOpen} onOpenChange={setLocationDetailOpen}>
                    <DialogContent className="max-w-md">
                        <h3 className="text-lg font-bold mb-4">{locationDetailTitle}</h3>
                        <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 font-bold sticky top-0">
                                    <tr>
                                        <th className="p-3 text-left">Mã Thùng</th>
                                        <th className="p-3 text-left">Vị Trí</th>
                                        <th className="p-3 text-right">Số Lượng</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {locationDetailData.map((item, idx) => {
                                        const boxCode = item.boxes?.code || 'Không có'
                                        const locCode = item.boxes?.locations?.code || item.locations?.code || 'Không có'
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-3 font-medium text-blue-700">{boxCode}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${locCode === 'RECEIVING' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                                                        }`}>
                                                        {locCode}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right font-bold text-slate-800">{item.quantity}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </DialogContent>
                </Dialog>
            </main >
        </div >
    )
}
