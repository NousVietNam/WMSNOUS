"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { Database, Play, Trash2 } from "lucide-react"

export default function SeedPage() {
    const [loading, setLoading] = useState(false)
    const [logs, setLogs] = useState<string[]>([])
    const [confirming, setConfirming] = useState(false)

    const addLog = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])

    const handleSeed = async () => {
        // Confirmation is handled by button state now
        if (!confirming) {
            setConfirming(true)
            setTimeout(() => setConfirming(false), 3000)
            return
        }
        setConfirming(false)
        setLoading(true)
        setLogs([])

        try {
            addLog("Bắt đầu giả lập Bản Đồ Random...")

            // 1. Users (Ensure basic users exist)
            await supabase.from('users').upsert([
                { name: 'Admin User', role: 'ADMIN', staff_code: 'ADM01' },
                { name: 'Staff A', role: 'STAFF', staff_code: 'STF01' }
            ], { onConflict: 'staff_code' })
            addLog("Đã kiểm tra Users.")

            // 2. Clear Old Data
            addLog("Đang xoá dữ liệu cũ...")
            await supabase.from('picking_tasks').delete().neq('status', 'X')
            await supabase.from('picking_jobs').delete().neq('status', 'X')
            await supabase.from('order_items').delete().neq('quantity', -1)
            await supabase.from('orders').delete().neq('code', 'X')
            await supabase.from('transactions').delete().neq('type', 'XXX')
            await supabase.from('inventory_items').delete().neq('quantity', -1)
            await supabase.from('boxes').delete().neq('status', 'X')
            await supabase.from('locations').delete().neq('code', 'X')

            // 3. Products
            const { data: allProds } = await supabase.from('products').select('*')
            if (!allProds || allProds.length === 0) throw new Error("Cần master data products trước!")
            addLog(`Sử dụng ${allProds.length} sản phẩm thực tế.`)

            // 4. Create 80 Locations (4 Aisles A-D, 5 Racks 1-5, 4 Levels 1-4)
            // 4 * 5 * 4 = 80
            addLog("Đang tạo 80 Vị Trí + RECEIVING...")
            const locParams = []

            // Add RECEIVING
            locParams.push({
                code: 'RECEIVING',
                type: 'SHELF', // AREA violated constraint, using SHELF
                capacity: 1000
            })

            // Layout Logic for Map:
            // Aisle A: X=0..10, Y=0
            // Aisle B: X=0..10, Y=4
            // and so on. We can reuse the auto-layout or just set Type=SHELF.
            // Map page auto-positions if pos_x is missing, but let's try to be smart if we can, or just null.
            // Let's rely on Map's auto-grid for simplicity for now, or just give them Code.

            for (const aisle of ['A', 'B', 'C', 'D']) {
                for (let rack = 1; rack <= 5; rack++) {
                    for (let level = 1; level <= 4; level++) {
                        locParams.push({
                            code: `${aisle}${rack}-0${level}`,
                            type: 'SHELF',
                            capacity: 100
                        })
                    }
                }
            }

            const { data: locs, error: locErr } = await supabase.from('locations').insert(locParams).select()
            if (locErr || !locs) throw new Error("Lỗi tạp location: " + locErr?.message)

            // 5. Create Random Boxes (0-15 per Location)
            addLog("Đang rải thùng ngẫu nhiên (0-15 thùng/kệ)...")
            const boxParams = []

            for (const loc of locs) {
                if (loc.code === 'RECEIVING') continue // Don't fill receiving yet

                // Random count 0 to 15
                const boxCount = Math.floor(Math.random() * 16)

                for (let k = 0; k < boxCount; k++) {
                    boxParams.push({
                        code: `BOX-${loc.code}-${k + 1}`, // Unique code
                        location_id: loc.id,
                        status: 'OPEN'
                    })
                }
            }

            // Insert Boxes in chunks if needed, but ~600 is fine in one go usually
            const { data: boxes, error: boxErr } = await supabase.from('boxes').insert(boxParams).select()
            if (boxErr || !boxes) throw new Error("Lỗi thùng: " + boxErr?.message)
            addLog(`Đã tạo ${boxes.length} thùng hàng.`)

            // 6. Fill Inventory (0-100 items per box)
            addLog("Đang đổ hàng vào thùng (0-100 sp/thùng)...")
            const invParams = []

            for (const box of boxes) {
                // simple logic: 1 product per box for visual clarity, or 0 items (empty box)
                // Let's say 80% boxes have items
                if (Math.random() > 0.2) {
                    const qty = Math.floor(Math.random() * 101) // 0-100
                    if (qty > 0) {
                        const prod = allProds[Math.floor(Math.random() * allProds.length)]
                        invParams.push({
                            box_id: box.id,
                            product_id: prod.id,
                            quantity: qty
                        })
                    }
                }
            }

            const { data: createdInv, error: invErr } = await supabase.from('inventory_items').insert(invParams).select()
            if (invErr) throw new Error("Lỗi tồn kho: " + invErr.message)

            addLog(`Đã thêm hàng vào ${invParams.length} thùng.`)

            // 7. Generate Test Orders (REMOVED REQUEST)
            // addLog("Skipping Order Generation in Random Seed...")
            // const createTestOrders = async () => { ... } 

            // NOTE: User requested to remove random order generation here in favor of specific test orders in Admin Order tab.

            /*
            // 7. Generate Test Orders (20 Orders, 10 Lines Each)
            addLog("Đang tạo 20 Đơn hàng Test (4 nhóm x 5 đơn/nhóm)...")

            // Helper to create multiple orders
            // Define 3 logical groups by Index for Scenario (A: Safe, B: Short, C: Empty)
            const getGroup = (idx: number) => {
                const mod = idx % 3
                if (mod === 0) return 'SAFE'
                if (mod === 1) return 'SHORT'
                return 'EMPTY'
            }
            // Use same product list logic
            const scenarioProds = allProds.length > 30 ? allProds.slice(0, 30) : allProds


            const createTestOrders = async (prefix: string, name: string, filterGroup: string | 'MIXED') => {
                for (let i = 1; i <= 5; i++) {
                    const code = `${prefix}-${i}`
                    const { data: order } = await supabase.from('orders').insert({
                        code,
                        customer_name: `${name} ${i}`,
                        status: 'PENDING'
                    }).select().single()

                    if (order) {
                        const lines = []
                        let targetProds = []
                        if (filterGroup === 'MIXED') {
                            targetProds = scenarioProds
                        } else {
                            targetProds = scenarioProds.filter((p, idx) => getGroup(idx) === filterGroup)
                        }
                        if (targetProds.length === 0) targetProds = [allProds[0]]

                        // Generate 10 lines
                        for (let k = 0; k < 10; k++) {
                            const prod = targetProds[k % targetProds.length]
                            lines.push({
                                order_id: order.id,
                                product_id: prod.id,
                                quantity: 5,
                                allocated_quantity: 0
                            })
                        }
                        await supabase.from('order_items').insert(lines)
                    }
                }
            }

            // 1. SAFE Order
            await createTestOrders('TEST-SAFE', 'KH Đủ Hàng', 'SAFE')
            // 2. EMPTY Order
            await createTestOrders('TEST-EMPTY', 'KH Thiếu Hết', 'EMPTY')
            // 3. SHORT Order
            await createTestOrders('TEST-SHORT', 'KH Thiếu Số Lượng', 'SHORT')
            // 4. MIXED Order
            await createTestOrders('TEST-MIXED', 'KH Hỗn Hợp', 'MIXED')

            addLog("Đã tạo xong 20 đơn hàng kiểm thử.")
            */

            // 8. Transactions History
            addLog("Đang tạo Lịch sử giao dịch ảo...")
            const transactions = []

            // Get RECEIVING ID properly (searching from locs we just created)
            const receivingId = locs.find(l => l.code === 'RECEIVING')?.id
            if (!receivingId) throw new Error("Không tìm thấy vị trí RECEIVING trong danh sách vừa tạo!")

            for (let i = 0; i < 50; i++) {
                const isImport = Math.random() > 0.5

                if (isImport && createdInv && createdInv.length > 0) {
                    // Simulating IMPORT of an existing item
                    const randomInv = createdInv[Math.floor(Math.random() * createdInv.length)]
                    // Find product info
                    const prod = allProds.find(p => p.id === randomInv.product_id)

                    transactions.push({
                        type: 'IMPORT',
                        entity_type: 'ITEM',
                        entity_id: randomInv.id,
                        to_box_id: randomInv.box_id,
                        to_location_id: receivingId, // Assume imported at receiving
                        quantity: randomInv.quantity, // Use actual qty
                        sku: prod?.sku,
                        created_at: new Date(Date.now() - Math.floor(Math.random() * 1000000000)).toISOString(),
                        // details: removed
                        user_id: (await supabase.auth.getUser()).data.user?.id
                    })
                } else {
                    // MOVE Box
                    const randomBox = boxes[Math.floor(Math.random() * boxes.length)]
                    const randomLoc = locs[Math.floor(Math.random() * locs.length)]

                    transactions.push({
                        type: 'MOVE_BOX',
                        entity_type: 'BOX',
                        entity_id: randomBox.id,
                        from_location_id: receivingId, // Fake move from receiving
                        to_location_id: randomLoc.id,
                        // sku: null for box move
                        created_at: new Date(Date.now() - Math.floor(Math.random() * 1000000000)).toISOString(),
                        // details: removed
                        user_id: (await supabase.auth.getUser()).data.user?.id
                    })
                }
            }
            await supabase.from('transactions').insert(transactions)

            addLog("✅ TẠO DỮ LIỆU THÀNH CÔNG (FULL SCENARIO)!")

        } catch (err: any) {
            console.error(err)
            addLog(`LỖI: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleClear = async () => {
        if (!confirm("Chỉ xoá dữ liệu Order/Inv/Task, giữ lại Users/Products. Tiếp tục?")) return
        setLoading(true)
        try {
            await supabase.from('picking_tasks').delete().neq('status', 'X')
            await supabase.from('picking_jobs').delete().neq('status', 'X')
            await supabase.from('order_items').delete().neq('quantity', -1)
            await supabase.from('orders').delete().neq('code', 'X')
            await supabase.from('transactions').delete().neq('type', 'XXX')
            await supabase.from('inventory_items').delete().neq('quantity', -1)
            await supabase.from('boxes').delete().neq('status', 'X')
            // Don't delete locations if not needed, but seed recreates them so maybe wipe? 
            // Keep it simple: Wipe logic is already in handleSeed. handleClear is just quick cleanup.
            await supabase.from('boxes').delete().neq('status', 'X')

            alert("Đã xoá sạch dữ liệu (Ngoại trừ Users & Products).")
        } catch (e: any) {
            alert(e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-6 w-6 text-primary" />
                        Giả Lập Dữ Liệu Full Scenario v3
                    </CardTitle>
                    <CardDescription>
                        Tạo Orders, Inventory, Users, Transations đa dạng.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        className={`w-full ${confirming ? 'bg-red-600 hover:bg-red-700' : ''}`}
                        size="lg"
                        onClick={handleSeed}
                        disabled={loading}
                    >
                        <Play className="mr-2 h-4 w-4" />
                        {loading ? 'Đang Xử Lý...' : confirming ? '⚠️ Bấm Lần Nữa Để Xác Nhận!' : 'Tạo Dữ Liệu Mẫu (Reset)'}
                    </Button>

                    <Button variant="destructive" className="w-full" onClick={handleClear} disabled={loading}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Xoá Sạch Dữ Liệu (Giữ Master Data)
                    </Button>

                    <div className="bg-black/90 text-green-400 font-mono text-xs p-4 rounded-md h-64 overflow-y-auto">
                        {logs.length === 0 ? '> Sẵn sàng...' : logs.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => window.open('/dashboard', '_blank')}>
                        Mở Dashboard
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
