"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Download, Package, Search, ChevronLeft, ChevronRight, Filter } from "lucide-react"
import Barcode from 'react-barcode'
import * as XLSX from 'xlsx'
import { toast } from "sonner"

interface InventoryItem {
    id: string
    quantity: number
    allocated_quantity: number
    created_at: string
    products: {
        sku: string
        name: string
        barcode: string | null
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

    useEffect(() => {
        fetchFilterOptions()
        fetchInventory()
    }, [page])

    useEffect(() => {
        // Reset to page 0 when filters change
        if (page !== 0) setPage(0)
        else fetchInventory()
    }, [searchTerm, filterLocation, filterBox, filterBrand, filterTarget, filterProductGroup, filterSeason, filterMonth])

    // Recalculate available filter options when items change or filters change
    useEffect(() => {
        updateAvailableFilterOptions()
    }, [items, filterLocation, filterBox, filterBrand, filterTarget, filterProductGroup, filterSeason, filterMonth])

    const fetchFilterOptions = async () => {
        // Locations and boxes are static - not dependent on product filters
        const { data: locsData } = await supabase.from('locations').select('code').order('code')
        if (locsData) setLocations(locsData.map(l => l.code))

        const { data: boxesData } = await supabase.from('boxes').select('code').limit(100).order('code')
        if (boxesData) setBoxes(boxesData.map(b => b.code))
    }

    // Dynamic cascading filter options
    const updateAvailableFilterOptions = () => {
        // Start with current inventory items
        let availableItems = [...items]

        // Apply ONLY the filters that are NOT the one we're calculating options for
        // This creates the cascading effect

        // For Brand filter options: apply all filters EXCEPT brand
        let itemsForBrands = availableItems
        if (filterLocation !== "all") {
            itemsForBrands = itemsForBrands.filter(item => {
                const loc = item.boxes?.locations?.code || item.locations?.code
                return loc === filterLocation
            })
        }
        if (filterBox !== "all") {
            itemsForBrands = itemsForBrands.filter(item => item.boxes?.code === filterBox)
        }
        if (filterTarget !== "all") {
            itemsForBrands = itemsForBrands.filter(item => item.products?.target_audience === filterTarget)
        }
        if (filterProductGroup !== "all") {
            itemsForBrands = itemsForBrands.filter(item => item.products?.product_group === filterProductGroup)
        }
        if (filterSeason !== "all") {
            itemsForBrands = itemsForBrands.filter(item => item.products?.season === filterSeason)
        }
        if (filterMonth !== "all") {
            itemsForBrands = itemsForBrands.filter(item => item.products?.launch_month?.toString() === filterMonth)
        }

        // For Target filter options: apply all filters EXCEPT target
        let itemsForTargets = availableItems
        if (filterLocation !== "all") {
            itemsForTargets = itemsForTargets.filter(item => {
                const loc = item.boxes?.locations?.code || item.locations?.code
                return loc === filterLocation
            })
        }
        if (filterBox !== "all") {
            itemsForTargets = itemsForTargets.filter(item => item.boxes?.code === filterBox)
        }
        if (filterBrand !== "all") {
            itemsForTargets = itemsForTargets.filter(item => item.products?.brand === filterBrand)
        }
        if (filterProductGroup !== "all") {
            itemsForTargets = itemsForTargets.filter(item => item.products?.product_group === filterProductGroup)
        }
        if (filterSeason !== "all") {
            itemsForTargets = itemsForTargets.filter(item => item.products?.season === filterSeason)
        }
        if (filterMonth !== "all") {
            itemsForTargets = itemsForTargets.filter(item => item.products?.launch_month?.toString() === filterMonth)
        }

        // For Product Group filter options: apply all filters EXCEPT product_group
        let itemsForGroups = availableItems
        if (filterLocation !== "all") {
            itemsForGroups = itemsForGroups.filter(item => {
                const loc = item.boxes?.locations?.code || item.locations?.code
                return loc === filterLocation
            })
        }
        if (filterBox !== "all") {
            itemsForGroups = itemsForGroups.filter(item => item.boxes?.code === filterBox)
        }
        if (filterBrand !== "all") {
            itemsForGroups = itemsForGroups.filter(item => item.products?.brand === filterBrand)
        }
        if (filterTarget !== "all") {
            itemsForGroups = itemsForGroups.filter(item => item.products?.target_audience === filterTarget)
        }
        if (filterSeason !== "all") {
            itemsForGroups = itemsForGroups.filter(item => item.products?.season === filterSeason)
        }
        if (filterMonth !== "all") {
            itemsForGroups = itemsForGroups.filter(item => item.products?.launch_month?.toString() === filterMonth)
        }

        // For Season filter options: apply all filters EXCEPT season
        let itemsForSeasons = availableItems
        if (filterLocation !== "all") {
            itemsForSeasons = itemsForSeasons.filter(item => {
                const loc = item.boxes?.locations?.code || item.locations?.code
                return loc === filterLocation
            })
        }
        if (filterBox !== "all") {
            itemsForSeasons = itemsForSeasons.filter(item => item.boxes?.code === filterBox)
        }
        if (filterBrand !== "all") {
            itemsForSeasons = itemsForSeasons.filter(item => item.products?.brand === filterBrand)
        }
        if (filterTarget !== "all") {
            itemsForSeasons = itemsForSeasons.filter(item => item.products?.target_audience === filterTarget)
        }
        if (filterProductGroup !== "all") {
            itemsForSeasons = itemsForSeasons.filter(item => item.products?.product_group === filterProductGroup)
        }
        if (filterMonth !== "all") {
            itemsForSeasons = itemsForSeasons.filter(item => item.products?.launch_month?.toString() === filterMonth)
        }

        // Extract unique values from filtered items
        const availableBrands = [...new Set(itemsForBrands.map(i => i.products?.brand).filter(Boolean))] as string[]
        const availableTargets = [...new Set(itemsForTargets.map(i => i.products?.target_audience).filter(Boolean))] as string[]
        const availableGroups = [...new Set(itemsForGroups.map(i => i.products?.product_group).filter(Boolean))] as string[]
        const availableSeasons = [...new Set(itemsForSeasons.map(i => i.products?.season).filter(Boolean))] as string[]

        // Update state with cascaded options
        setBrands(availableBrands.sort())
        setTargets(availableTargets.sort())
        setProductGroups(availableGroups.sort())
        setSeasons(availableSeasons.sort())
    }

    const fetchInventory = async () => {
        setLoading(true)

        let query = supabase
            .from('inventory_items')
            .select(`
                id, quantity, allocated_quantity, created_at,
                products!inner (sku, name, barcode, brand, target_audience, product_group, season, launch_month),
                boxes (code, locations (code)),
                locations (code)
            `, { count: 'exact' })

        const from = page * ITEMS_PER_PAGE
        const to = from + ITEMS_PER_PAGE - 1

        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to)

        if (error) {
            console.error(error)
        } else {
            setItems(data as any || [])
            setTotal(count || 0)
        }
        setLoading(false)
    }

    // Client-side filtering
    const filteredItems = items.filter(item => {
        // Search filter
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

        // Location filter
        if (filterLocation !== "all") {
            const loc = item.boxes?.locations?.code || item.locations?.code
            if (loc !== filterLocation) return false
        }

        // Box filter
        if (filterBox !== "all" && item.boxes?.code !== filterBox) return false

        // Brand filter
        if (filterBrand !== "all" && item.products?.brand !== filterBrand) return false

        // Target filter
        if (filterTarget !== "all" && item.products?.target_audience !== filterTarget) return false

        // Product Group filter
        if (filterProductGroup !== "all" && item.products?.product_group !== filterProductGroup) return false

        // Season filter
        if (filterSeason !== "all" && item.products?.season !== filterSeason) return false

        // Month filter
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
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="h-8 w-8 text-primary" />
                        Tồn Kho ({total})
                    </h1>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm SKU, tên, barcode..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" onClick={handleExport}>
                            <Download className="mr-2 h-4 w-4" /> Xuất Excel
                        </Button>
                    </div>
                </div>

                {/* Pagination - Top */}
                <div className="bg-white p-3 rounded-md border shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            Hiển thị {filteredItems.length} / {total} sản phẩm
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                                <ChevronLeft className="h-4 w-4" /> Trước
                            </Button>
                            <div className="flex items-center px-3 text-sm font-medium">
                                Trang {page + 1}
                            </div>
                            <Button variant="outline" size="sm" disabled={(page + 1) * ITEMS_PER_PAGE >= total} onClick={() => setPage(page + 1)}>
                                Tiếp <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-md border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-sm">Bộ Lọc</span>
                            {activeFiltersCount > 0 && (
                                <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full">
                                    {activeFiltersCount}
                                </span>
                            )}
                        </div>
                        {activeFiltersCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={clearFilters}>
                                Xóa tất cả
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        <Select value={filterLocation} onValueChange={setFilterLocation}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Vị trí" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả vị trí</SelectItem>
                                {locations.map(loc => (
                                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterBox} onValueChange={setFilterBox}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Thùng" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả thùng</SelectItem>
                                {boxes.map(box => (
                                    <SelectItem key={box} value={box}>{box}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterBrand} onValueChange={setFilterBrand}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Thương hiệu" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả thương hiệu</SelectItem>
                                {brands.map(brand => (
                                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterTarget} onValueChange={setFilterTarget}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Đối tượng" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả đối tượng</SelectItem>
                                {targets.map(target => (
                                    <SelectItem key={target} value={target}>{target}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterProductGroup} onValueChange={setFilterProductGroup}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Nhóm hàng" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả nhóm</SelectItem>
                                {productGroups.map(group => (
                                    <SelectItem key={group} value={group}>{group}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterSeason} onValueChange={setFilterSeason}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Mùa" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả mùa</SelectItem>
                                {seasons.map(season => (
                                    <SelectItem key={season} value={season}>{season}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterMonth} onValueChange={setFilterMonth}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Tháng MB" />
                            </SelectTrigger>
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
                                                {/* Barcode column */}
                                                <td className="p-2">
                                                    {item.products?.barcode ? (
                                                        <div className="bg-white p-1 rounded border border-slate-100">
                                                            <Barcode value={item.products.barcode} height={20} width={0.8} displayValue={false} margin={0} background="transparent" />
                                                            <div className="text-[9px] text-center font-mono mt-0.5 text-slate-500">{item.products.barcode}</div>
                                                        </div>
                                                    ) : <span className="text-xs text-slate-400 italic">--</span>}
                                                </td>
                                                {/* SKU column */}
                                                <td className="p-2">
                                                    <span className="font-bold text-xs text-slate-900">{item.products?.sku}</span>
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
                                                <td className="p-2 text-center font-bold text-base text-orange-600">{allocated > 0 ? allocated : '-'}</td>
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

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-4 border-t">
                        <div className="text-xs text-muted-foreground">
                            Hiển thị {filteredItems.length} / {total} sản phẩm
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                                <ChevronLeft className="h-4 w-4" /> Trước
                            </Button>
                            <Button variant="outline" size="sm" disabled={(page + 1) * ITEMS_PER_PAGE >= total} onClick={() => setPage(page + 1)}>
                                Tiếp <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </main>
        </div >
    )
}
