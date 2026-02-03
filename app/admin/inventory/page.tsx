"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { Download, Package, Search, ChevronLeft, ChevronRight, Filter, X, ChevronDown, Check, Container, BoxIcon, CircleAlert } from "lucide-react"
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

interface GroupedInventoryItem {
    product_id: string
    sku: string
    name: string
    barcode: string | null
    image_url: string | null
    brand: string | null
    total_quantity: number
    total_allocated: number
    soft_sale: number
    soft_gift: number
    soft_internal: number
    soft_transfer: number
    available_quantity: number
    total_count: number
    target_audience?: string | null
    product_group?: string | null
    season?: string | null
    launch_month?: string | null
    location_details?: any[] | null
}

const ITEMS_PER_PAGE = 200

export default function InventoryPage() {
    const [items, setItems] = useState<InventoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)
    const [inventoryType, setInventoryType] = useState<'PIECE' | 'BULK' | 'LAUNCH_SOON'>('PIECE')
    const [launchSoonItems, setLaunchSoonItems] = useState<any[]>([])
    const [selectedLaunchSKUs, setSelectedLaunchSKUs] = useState<string[]>([])
    const [alerting, setAlerting] = useState(false)



    // New State
    const [groupedItems, setGroupedItems] = useState<GroupedInventoryItem[]>([])
    const [viewImage, setViewImage] = useState<string | null>(null)

    // Global Totals State
    const [totals, setTotals] = useState({
        quantity: 0,
        allocated: 0,
        available: 0,
        approved_sale: 0,
        approved_gift: 0,
        approved_internal: 0,
        approved_transfer: 0
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
    const [months, setMonths] = useState<string[]>([])

    // New State for Details
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailType, setDetailType] = useState<'BOOKED' | 'ALLOCATED'>('BOOKED')
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
        setDetailType('BOOKED')
        setDetailTitle(`Nhu Cầu Đã Duyệt - ${item.products.sku}`)
        setDetailOpen(true)
        setDetailLoading(true)

        const { data } = await supabase
            .from('outbound_order_items')
            .select('quantity, outbound_orders!inner(id, code, status, created_at, internal_staff(name))')
            .eq('product_id', item.products.id)
            .eq('outbound_orders.is_approved', true)
            .not('outbound_orders.status', 'in', '("SHIPPED", "COMPLETED", "CANCELLED")')
        //.order('orders(created_at)', { ascending: true }) // Syntax might be tricky, let's sort client side or trust default

        setDetailData(data || [])
        setDetailLoading(false)
    }

    const showAllocatedDetails = async (item: InventoryItem) => {
        const boxId = (item as any).box_id
        const locationId = (item as any).location_id

        if (!item.products?.id) return



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

            toast.error(`Lỗi: ${error.message}`)
        } else {

        }

        setDetailData(data || [])
        setDetailLoading(false)
    }

    useEffect(() => {
        fetchWarehouses()
    }, [])

    useEffect(() => {
        // Reset to page 0 when filters change
        if (page !== 0) setPage(0)
        else fetchInventory()

        // Calculate global totals whenever filters change or viewMode changes
        fetchGlobalTotals()

        updateAvailableFilterOptions()
    }, [searchTerm, filterWarehouse, filterLocation, filterBox, filterBrand, filterTarget, filterProductGroup, filterSeason, filterMonth, viewMode, inventoryType])

    // Realtime Subscription
    useEffect(() => {
        console.log("Setting up Realtime Subscription for Inventory...")

        const channel = supabase.channel('inventory-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'bulk_inventory' },
                () => {
                    console.log("Realtime: Bulk Inventory changed. Refreshing...")
                    fetchInventory()
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'inventory_items' },
                () => {
                    console.log("Realtime: Piece Inventory changed. Refreshing...")
                    fetchInventory()
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'boxes' },
                () => {
                    console.log("Realtime: Boxes changed (Move). Refreshing...")
                    fetchInventory()
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'restricted_inventory' },
                () => {
                    console.log("Realtime: Restricted flags changed. Refreshing...")
                    fetchInventory()
                }
            )
            .subscribe()

        return () => {
            console.log("Cleaning up Realtime Subscription...")
            supabase.removeChannel(channel)
        }
    }, [inventoryType, page, searchTerm, filterWarehouse, filterLocation, filterBox, filterBrand, filterTarget, filterProductGroup, filterSeason, filterMonth, viewMode])

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


    const updateAvailableFilterOptions = async () => {
        const getParams = (excludeKey: string) => ({
            p_warehouse_id: excludeKey !== 'warehouse' && filterWarehouse !== "all" ? filterWarehouse : null,
            p_location_code: excludeKey !== 'location' && filterLocation !== "all" ? filterLocation : null,
            p_box_code: excludeKey !== 'box' && filterBox !== "all" ? filterBox : null,
            p_brand: excludeKey !== 'brand' && filterBrand !== "all" ? filterBrand : null,
            p_target_audience: excludeKey !== 'target' && filterTarget !== "all" ? filterTarget : null,
            p_product_group: excludeKey !== 'group' && filterProductGroup !== "all" ? filterProductGroup : null,
            p_season: excludeKey !== 'season' && filterSeason !== "all" ? filterSeason : null,
            p_launch_month: excludeKey !== 'month' && filterMonth !== "all" ? filterMonth : null,
            p_inventory_type: inventoryType
        })

        // Parallel fetch for each filter group to ensure "Dependent" behavior works correctly (excluding self)
        // This ensures that if you select "Nike", the Brand list still shows "Adidas".

        try {
            const [
                { data: locData },
                { data: boxData },
                { data: brandData },
                { data: targetData },
                { data: groupData },
                { data: seasonData },
                { data: monthData }
            ] = await Promise.all([
                supabase.rpc('get_inventory_filter_options', getParams('location')),
                supabase.rpc('get_inventory_filter_options', getParams('box')),
                supabase.rpc('get_inventory_filter_options', getParams('brand')),
                supabase.rpc('get_inventory_filter_options', getParams('target')),
                supabase.rpc('get_inventory_filter_options', getParams('group')),
                supabase.rpc('get_inventory_filter_options', getParams('season')),
                supabase.rpc('get_inventory_filter_options', getParams('month'))
            ])

            if (locData?.[0]) setLocations((locData[0].locations || []).sort())
            if (boxData?.[0]) setBoxes((boxData[0].boxes || []).sort())
            if (brandData?.[0]) setBrands((brandData[0].brands || []).sort())
            if (targetData?.[0]) setTargets((targetData[0].targets || []).sort())
            if (groupData?.[0]) setProductGroups((groupData[0].product_groups || []).sort())
            if (seasonData?.[0]) setSeasons((seasonData[0].seasons || []).sort())

            if (monthData?.[0]) {
                const rawMonths = monthData[0].months || []
                // Keep raw strings to match database values exactly
                const uniqueMonths = rawMonths
                    .filter((m: any) => m !== null && m !== undefined && m !== '')
                    .map((m: any) => String(m)) // Ensure string

                // Sort numerically if possible, otherwise alphabetically
                setMonths(uniqueMonths.sort((a: string, b: string) => {
                    const numA = parseFloat(a)
                    const numB = parseFloat(b)
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
                    return a.localeCompare(b)
                }))
            }

        } catch (e) {
            console.error("Error fetching filter options", e)
        }
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
                    soft_booked_sale: Number(row.soft_booked_sale || 0),
                    soft_booked_gift: Number(row.soft_booked_gift || 0),
                    soft_booked_internal: Number(row.soft_booked_internal || 0),
                    soft_booked_transfer: Number(row.soft_booked_transfer || 0)
                }
            })
            setViewDataMap(prev => ({ ...prev, ...map }))
        }
    }

    const fetchInventory = async () => {
        setLoading(true)
        console.log("Fetching Inventory...", { inventoryType, viewMode, page, filters: { filterWarehouse, filterBox } })

        if (inventoryType === 'LAUNCH_SOON') {
            const { data, error } = await supabase
                .from('view_launch_soon_bulk')
                .select('*')
                .order('sku', { ascending: true })

            if (error) {
                console.error("Fetch Launch Soon Error:", error)
                setLaunchSoonItems([])
            } else {
                setLaunchSoonItems(data || [])
                setTotal(data?.length || 0)
            }
        } else if (viewMode === 'SUMMARY') {
            if (inventoryType === 'BULK') {
                // UNIFIED LOGIC: Call dedicated Bulk RPC (Identical to Piece RPC structure)
                const { data, error } = await supabase.rpc('get_inventory_bulk_grouped', {
                    p_page: page,
                    p_page_size: ITEMS_PER_PAGE,
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
                    console.error("Fetch Bulk Inventory RPC Error:", error)
                    setGroupedItems([])
                    setTotal(0)
                } else {
                    setGroupedItems(data || [])
                    setTotal(data && data.length > 0 ? Number(data[0].total_count) : 0)
                }
            } else {
                // PIECE INVENTORY (Existing RPC)
                const { data, error } = await supabase.rpc('get_inventory_grouped', {
                    p_page: page,
                    p_page_size: ITEMS_PER_PAGE,
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
                    console.error("Fetch Inventory Grouped Error:", error)
                    setGroupedItems([])
                    setTotal(0)
                } else {
                    setGroupedItems(data || [])
                    setTotal(data && data.length > 0 ? Number(data[0].total_count) : 0)
                }
            }
        } else {
            // DETAILED VIEW
            let query

            if (inventoryType === 'BULK') {
                // BULK DETAIL VIEW
                query = supabase
                    .from('bulk_inventory')
                    .select(`
                        id, quantity, allocated_quantity, created_at, box_id,
                        products!inner (id, sku, name, barcode, image_url, brand, target_audience, product_group, season, launch_month),
                        boxes!inner (code, locations (code))
                    `, { count: 'exact' })
            } else {
                // PIECE DETAIL VIEW (Existing)
                let selectQuery = `
                    id, quantity, allocated_quantity, created_at, box_id, location_id, warehouse_id,
                    products!inner (id, sku, name, barcode, image_url, brand, target_audience, product_group, season, launch_month),
                    locations (code)
                `
                if (filterBox !== "all") {
                    selectQuery += `, boxes!inner (code, locations (code))`
                } else {
                    selectQuery += `, boxes (code, locations (code))`
                }

                query = supabase
                    .from('inventory_items')
                    .select(selectQuery, { count: 'exact' })
            }

            query = query.gt('quantity', 0)

            // SERVER-SIDE FILTERS
            // Note: Field names must differ slightly between bulk_inventory and inventory_items logic?
            // Actually, products.* is same. boxes.* is same.
            // warehouse_id is direct in inventory_items, but via boxes in bulk_inventory.

            if (filterWarehouse !== "all" && inventoryType !== 'BULK') {
                query = query.eq('warehouse_id', filterWarehouse)
            }

            if (filterBrand !== "all") query = query.eq('products.brand', filterBrand)
            if (filterTarget !== "all") query = query.eq('products.target_audience', filterTarget)
            if (filterProductGroup !== "all") query = query.eq('products.product_group', filterProductGroup)
            if (filterSeason !== "all") query = query.eq('products.season', filterSeason)
            if (filterMonth !== "all") query = query.eq('products.launch_month', filterMonth)

            // Box Filter
            if (filterBox !== "all") {
                // If BULK, boxes is joined !inner above? Yes, we used !inner in Select if it was Bulk or if filterBox was set
                // Just to be safe, we use the embedding notation
                query = query.eq('boxes.code', filterBox)
            }

            // LOCATION FILTER (Server-side)
            if (filterLocation !== "all") {
                if (inventoryType === 'BULK') {
                    // Filter deep nested for Bulk
                    query = query.eq('boxes.locations.code', filterLocation)
                } else {
                    // For Piece, could be direct location OR box location
                    // However, Supabase doesn't support complex OR across different relations easily in one .or() without raw filters
                    // We will prioritize consistent behavior:
                    // If the item is directly in a location: locations.code
                    // If the item is in a box: boxes.locations.code
                    // Ideally we should use a Postgres View for detailed inventory to simplify this, but for now:

                    // Note: This might not work perfectly for Piece items in Boxes if we only filter `locations.code`
                    // But `inventory_items` usually has `location_id` populated even if in a box? 
                    // Let's assume `location_id` is the source of truth for physical location.
                    // If existing logic keeps `location_id` in sync with `box.location_id`, then:
                    query = query.eq('locations.code', filterLocation)
                }
            }

            // Search Logic (Client side mostly, or full scan? kept existing logic)
            const isGlobalSearch = searchTerm.length > 0; // Removing filterLocation from here as we moved it to server-side

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
            }
        }
        setLoading(false)
    }

    const fetchGlobalTotals = async () => {
        setCalculatingTotals(true)

        try {
            const rpcName = inventoryType === 'BULK' ? 'get_inventory_bulk_summary' : 'get_inventory_summary'

            const { data, error } = await supabase.rpc(rpcName, {
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
                console.error(`${rpcName} Error:`, error)
                setTotals({ quantity: 0, allocated: 0, available: 0, approved_sale: 0, approved_gift: 0, approved_internal: 0, approved_transfer: 0 })
            } else if (data && data.length > 0) {
                const result = data[0]
                setTotals({
                    quantity: Number(result.total_quantity || 0),
                    allocated: Number(result.total_allocated || 0),
                    approved_sale: Number(result.total_approved_sale || 0),
                    approved_gift: Number(result.total_approved_gift || 0),
                    approved_internal: Number(result.total_approved_internal || 0),
                    approved_transfer: Number(result.total_approved_transfer || 0),
                    available: Number(viewMode === 'DETAILED' ? (result.available_detail || 0) : (result.available_summary || 0))
                })
            }
        } catch (err) {
            console.error(err)
            setTotals({ quantity: 0, allocated: 0, available: 0, approved_sale: 0, approved_gift: 0, approved_internal: 0, approved_transfer: 0 })
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
    // Summary Calc Removed - Using Server Side 'groupedItems'


    const handleExport = async () => {
        try {
            toast.info(`Đang tải dữ liệu ${inventoryType === 'BULK' ? 'Kho Sỉ' : 'Kho Lẻ'}...`)

            let data: any[] | null = null
            let error: any = null

            if (inventoryType === 'BULK') {
                const { data: bulkData, error: bulkError } = await supabase
                    .from('bulk_inventory')
                    .select(`
                        id, quantity, allocated_quantity, created_at,
                        products!inner (sku, name, barcode, brand, target_audience, product_group, season, launch_month),
                        boxes (code, locations (code))
                    `)
                    .order('created_at', { ascending: false })
                data = bulkData
                error = bulkError
            } else {
                const { data: pieceData, error: pieceError } = await supabase
                    .from('inventory_items')
                    .select(`
                        id, quantity, allocated_quantity, created_at,
                        products!inner (sku, name, barcode, brand, target_audience, product_group, season, launch_month),
                        boxes (code, locations (code)),
                        locations (code)
                    `)
                    .order('created_at', { ascending: false })
                data = pieceData
                error = pieceError
            }

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
                'Vị Trí': inventoryType === 'BULK'
                    ? (item.boxes?.locations?.code || '-')
                    : (item.boxes?.locations?.code || item.locations?.code || '-')
            }))

            const ws = XLSX.utils.json_to_sheet(exportData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, inventoryType === 'BULK' ? "Kho_Si_Full" : "Kho_Le_Full")

            // Direct XLSX export (most compatible)
            const fileName = `Inventory_${inventoryType}_${new Date().toISOString().slice(0, 10)}.xlsx`
            XLSX.writeFile(wb, fileName)

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
        searchTerm !== "",
        inventoryType // Include this to confirm filter changes
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

                    {/* INVENTORY TYPE TOGGLE - Replaces Warehouse Filter */}
                    <div className="bg-slate-100 p-1 rounded-md flex border">
                        <button
                            onClick={() => {
                                setInventoryType('PIECE')
                                setPage(0)
                            }}
                            className={cn(
                                "px-4 py-2 text-sm font-medium rounded-sm transition-all flex items-center gap-2",
                                inventoryType === 'PIECE'
                                    ? "bg-white text-primary shadow-sm font-bold"
                                    : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <BoxIcon className="w-4 h-4" />
                            Kho Lẻ
                        </button>
                        <button
                            onClick={() => {
                                setInventoryType('BULK')
                                setPage(0)
                            }}
                            className={cn(
                                "px-4 py-2 text-sm font-medium rounded-sm transition-all flex items-center gap-2",
                                inventoryType === 'BULK'
                                    ? "bg-white text-purple-600 shadow-sm font-bold"
                                    : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <Container className="w-4 h-4" />
                            Kho Sỉ
                        </button>
                        <button
                            onClick={() => {
                                setInventoryType('LAUNCH_SOON')
                                setPage(0)
                            }}
                            className={cn(
                                "px-4 py-2 text-sm font-medium rounded-sm transition-all flex items-center gap-2",
                                inventoryType === 'LAUNCH_SOON'
                                    ? "bg-white text-orange-600 shadow-sm font-bold"
                                    : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <CircleAlert className="w-4 h-4" />
                            CB Mở Bán
                        </button>
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
                        <div className="flex gap-2">
                            {inventoryType === 'LAUNCH_SOON' && (
                                <>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-10"
                                        disabled={selectedLaunchSKUs.length === 0 || alerting}
                                        onClick={async () => {
                                            setAlerting(true)
                                            const { error } = await supabase.rpc('alert_launch_soon', { p_skus: selectedLaunchSKUs })
                                            if (error) toast.error(error.message)
                                            else {
                                                toast.success("Đã gửi cảnh báo!")
                                                setSelectedLaunchSKUs([])
                                                fetchInventory()
                                            }
                                            setAlerting(false)
                                        }}
                                    >
                                        <CircleAlert className="mr-2 h-4 w-4" />
                                        Cảnh báo nhân viên di chuyển ({selectedLaunchSKUs.length})
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-10 text-slate-500 hover:text-red-500 hover:bg-red-50 border-dashed"
                                        title="Làm mới cảnh báo (Reset)"
                                        onClick={async () => {
                                            if (!confirm("Xóa tất cả cảnh báo hiện tại để thông báo lại?")) return
                                            const { error } = await supabase.rpc('reset_launch_soon_alerts')
                                            if (error) toast.error(error.message)
                                            else {
                                                toast.success("Đã reset!")
                                                fetchInventory()
                                            }
                                        }}
                                    >
                                        <X className="h-4 w-4 mr-2" />
                                        Reset Cảnh Báo
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* FILTERS - Hide for LAUNCH_SOON as requested */}
                {inventoryType !== 'LAUNCH_SOON' && (
                    <div className="bg-white p-3 rounded-md border shadow-sm">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                            <SearchableFilter
                                label="Vị trí"
                                placeholder="Vị trí"
                                value={filterLocation}
                                onChange={setFilterLocation}
                                options={locations}
                            />

                            <SearchableFilter
                                label="Thùng"
                                placeholder="Thùng"
                                value={filterBox}
                                onChange={setFilterBox}
                                options={boxes}
                            />

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
                )}

                <div className="bg-white p-4 rounded-md border shadow-sm flex-1 flex flex-col min-h-0">
                    <div className="rounded-md border overflow-auto relative flex-1">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 font-medium text-slate-700 sticky top-0 z-10 shadow-sm">
                                {inventoryType === 'LAUNCH_SOON' ? (
                                    <tr>
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3">SKU</th>
                                        <th className="p-3">Barcode</th>
                                        <th className="p-3">Tên sản phẩm</th>
                                        <th className="p-3">Nhóm hàng</th>
                                        <th className="p-3">Đối tượng</th>
                                        <th className="p-3 text-center">Tồn kho</th>
                                        <th className="p-3">Thùng</th>
                                        <th className="p-3">Vị trí</th>
                                        <th className="p-3 text-center">Trạng thái</th>
                                    </tr>
                                ) : (
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
                                                <th className="p-3 w-[70px] text-center text-blue-600">Đơn Bán</th>
                                                <th className="p-3 w-[70px] text-center text-pink-600">Đơn Quà</th>
                                                <th className="p-3 w-[70px] text-center text-purple-600">Nội Bộ</th>
                                                <th className="p-3 w-[70px] text-center text-orange-500">Điều Chuyển</th>
                                            </>
                                        )}
                                        <th className="p-3 w-[70px] text-center text-green-600">Khả Dụng</th>
                                        {viewMode === 'DETAILED' && <th className="p-3 w-[110px]">Thùng</th>}
                                        <th className="p-3 w-[110px]">Vị Trí</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {/* GLOBAL TOTALS ROW (Only for Standard Inventory) */}
                                {inventoryType !== 'LAUNCH_SOON' && (
                                    <tr className="bg-slate-50 font-bold border-b-2 border-slate-200">
                                        <td colSpan={2} className="p-3 text-left pl-4 text-slate-600 uppercase text-xs tracking-wider">
                                            Tổng tất cả:
                                        </td>
                                        {/* Empty cells to align with columns */}
                                        <td></td><td></td><td></td><td></td><td></td><td></td>
                                        <td className="p-3 text-center text-slate-800 text-base">
                                            {calculatingTotals ? '...' : totals.quantity}
                                        </td>
                                        <td className="p-3 text-center text-orange-700 text-base">
                                            {calculatingTotals ? '...' : totals.allocated}
                                        </td>
                                        {viewMode === 'SUMMARY' && (
                                            <>
                                                <td className="p-3 text-center text-blue-600 text-base font-bold">{calculatingTotals ? '...' : totals.approved_sale}</td>
                                                <td className="p-3 text-center text-pink-600 text-base font-bold">{calculatingTotals ? '...' : totals.approved_gift}</td>
                                                <td className="p-3 text-center text-purple-600 text-base font-bold">{calculatingTotals ? '...' : totals.approved_internal}</td>
                                                <td className="p-3 text-center text-orange-500 text-base font-bold">{calculatingTotals ? '...' : totals.approved_transfer}</td>
                                            </>
                                        )}
                                        <td className="p-3 text-center text-green-700 text-base bg-green-50 font-bold">
                                            {calculatingTotals ? '...' : totals.available}
                                        </td>
                                        <td colSpan={viewMode === 'SUMMARY' ? 1 : 2}></td>
                                    </tr>
                                )}

                                {loading ? (
                                    <tr><td colSpan={inventoryType === 'LAUNCH_SOON' ? 10 : (viewMode === 'SUMMARY' ? 16 : 13)} className="p-8 text-center text-slate-400 font-medium">Đang tải dữ liệu...</td></tr>
                                ) : inventoryType === 'LAUNCH_SOON' ? (
                                    launchSoonItems.length === 0 ? (
                                        <tr><td colSpan={10} className="p-8 text-center text-muted-foreground italic tracking-wide">Không có mã hàng nào chuẩn bị mở bán.</td></tr>
                                    ) : (
                                        launchSoonItems.map((item, idx) => (
                                            <tr key={idx} className="border-b hover:bg-slate-50 text-sm">
                                                <td className="p-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-gray-300"
                                                        checked={selectedLaunchSKUs.includes(item.sku)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedLaunchSKUs(prev => [...prev, item.sku])
                                                            else setSelectedLaunchSKUs(prev => prev.filter(s => s !== item.sku))
                                                        }}
                                                    />
                                                </td>
                                                <td className="p-3 font-mono font-bold text-blue-600">{item.sku}</td>
                                                <td className="p-3 font-mono text-slate-600">{item.barcode || '-'}</td>
                                                <td className="p-3 font-medium text-slate-800">{item.product_name || '---'}</td>
                                                <td className="p-3 text-slate-600">{item.product_group || '-'}</td>
                                                <td className="p-3 text-slate-600">{item.target_audience || '-'}</td>
                                                <td className="p-3 text-center font-bold text-slate-900">{item.quantity}</td>
                                                <td className="p-3 font-mono text-blue-700 font-bold">{item.box_code}</td>
                                                <td className="p-3">
                                                    <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-[10px] font-bold">
                                                        {item.location_code}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {item.is_alerted && (
                                                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold w-fit flex items-center gap-1 shadow-sm border border-red-200">
                                                            <CircleAlert className="w-3 h-3" />
                                                            Đã cảnh báo
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))

                                    )
                                ) : viewMode === 'SUMMARY' ? (
                                    groupedItems.map((item, idx) => (
                                        <tr key={idx} className="border-b hover:bg-slate-50 transition-colors text-sm">
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col">
                                                    <span>{item.barcode || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 font-mono text-slate-600">
                                                <button
                                                    className="hover:underline text-blue-600 font-bold text-left"
                                                    onClick={() => item.image_url && setViewImage(item.image_url)}
                                                >
                                                    {item.sku}
                                                </button>
                                            </td>
                                            <td className="py-3 px-4 font-medium text-slate-800">{item.name}</td>
                                            <td className="py-3 px-4">{item.brand || '-'}</td>
                                            <td className="py-3 px-4">{item.target_audience || '-'}</td>
                                            <td className="py-3 px-4">{item.product_group || '-'}</td>
                                            <td className="py-3 px-4 text-center">{item.season || '-'}</td>
                                            <td className="py-3 px-4 text-center">{item.launch_month || '-'}</td>

                                            <td className="py-3 px-4 text-center font-bold text-slate-700">{item.total_quantity}</td>
                                            <td className="py-3 px-4 text-center font-bold text-slate-600" title="Đã cấp phát cứng">
                                                {item.total_allocated > 0 ? item.total_allocated : '-'}
                                            </td>
                                            {/* Soft Allocation Categories */}
                                            <td className="py-3 px-4 text-center font-bold text-blue-600">
                                                {item.soft_sale > 0 ? item.soft_sale : '-'}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-pink-600">
                                                {item.soft_gift > 0 ? item.soft_gift : '-'}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-purple-600">
                                                {item.soft_internal > 0 ? item.soft_internal : '-'}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-orange-600">
                                                {item.soft_transfer > 0 ? item.soft_transfer : '-'}
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-green-600 bg-green-50">
                                                {item.available_quantity}
                                            </td>

                                            <td className="py-3 px-4 text-center text-xs font-medium text-blue-700">
                                                {item.location_details && item.location_details.length > 0 ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-xs text-blue-600 hover:bg-blue-50"
                                                        onClick={() => {
                                                            setLocationDetailTitle(`Chi tiết vị trí - ${item.sku}`)
                                                            setLocationDetailData(item.location_details || [])
                                                            setLocationDetailOpen(true)
                                                        }}
                                                    >
                                                        Xem ({item.location_details.length}) vị trí
                                                    </Button>
                                                ) : <span className="text-slate-400">-</span>}
                                            </td>
                                        </tr>
                                    ))

                                ) : items.length === 0 ? (
                                    <tr><td colSpan={13} className="p-8 text-center text-muted-foreground italic tracking-wide">Không tìm thấy sản phẩm nào khớp với bộ lọc.</td></tr>
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

function SearchableFilter({
    value,
    onChange,
    options,
    placeholder,
    label
}: {
    value: string,
    onChange: (val: string) => void,
    options: string[],
    placeholder: string,
    label: string
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    // Filter options based on search
    const filtered = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()))

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between text-xs h-8 px-2 min-h-8 font-normal bg-white border-slate-200">
                    <span className="truncate">{value === "all" ? label : value}</span>
                    <ChevronDown className="ml-2 h-3 w-3 opacity-50 shrink-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px] p-0 bg-white" align="start">
                <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <Input
                        placeholder="Tìm kiếm..."
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-none focus-visible:ring-0 shadow-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto p-1">
                    <div
                        className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 hover:text-accent-foreground cursor-pointer transition-colors", value === "all" && "bg-slate-100 font-medium")}
                        onClick={() => { onChange("all"); setOpen(false); }}
                    >
                        Tất cả
                        {value === "all" && <Check className="ml-auto h-4 w-4" />}
                    </div>
                    {filtered.map(opt => (
                        <div
                            key={opt}
                            className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 hover:text-accent-foreground cursor-pointer transition-colors", value === opt && "bg-slate-100 font-medium")}
                            onClick={() => { onChange(opt); setOpen(false); }}
                        >
                            {opt}
                            {value === opt && <Check className="ml-auto h-4 w-4" />}
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">Không tìm thấy</div>}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
