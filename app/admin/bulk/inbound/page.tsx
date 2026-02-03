'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Package, Search, Plus, Loader2, Box, Truck, Calendar, Hash, Factory, CheckCircle, CircleAlert } from 'lucide-react'
import Link from 'next/link'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Product {
    id: string
    name: string
    sku: string
    barcode?: string
}

interface BulkInventoryItem {
    id: string
    product_id: string
    quantity: number
    pallet_code: string | null
    batch_number: string | null
    factory_source: string | null
    received_at: string
    expiry_date: string | null
    products?: Product
}

export default function BulkInboundPage() {
    const [inventory, setInventory] = useState<BulkInventoryItem[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [summary, setSummary] = useState({ total_pallets: 0, total_quantity: 0 })
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null)

    // Form State
    const [formData, setFormData] = useState({
        product_id: '',
        quantity: '',
        pallet_code: '',
        batch_number: '',
        factory_source: '',
        expiry_date: ''
    })

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch Bulk Inventory
            const res = await fetch('/api/bulk/inbound')
            const json = await res.json()
            setInventory(json.data || [])
            setSummary(json.summary || { total_pallets: 0, total_quantity: 0 })

            // Fetch Products for dropdown
            const { data: productData } = await supabase
                .from('products')
                .select('id, name, sku, barcode')
                .order('name')
            setProducts(productData || [])
        } catch (error) {
            console.error('Fetch error:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.product_id || !formData.quantity) {
            setFeedback({ type: 'error', message: 'Vui lòng chọn Sản Phẩm và nhập Số Lượng!' })
            return
        }

        setSubmitting(true)
        setFeedback(null)

        try {
            const res = await fetch('/api/bulk/inbound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
            const json = await res.json()

            if (!res.ok) {
                setFeedback({ type: 'error', message: json.error || 'Lỗi nhập kho' })
                return
            }

            setFeedback({ type: 'success', message: json.message })
            setFormData({
                product_id: '',
                quantity: '',
                pallet_code: '',
                batch_number: '',
                factory_source: '',
                expiry_date: ''
            })
            setShowForm(false)
            fetchData()
        } catch (error) {
            setFeedback({ type: 'error', message: 'Lỗi kết nối server' })
        } finally {
            setSubmitting(false)
        }
    }

    const filteredInventory = inventory.filter(item => {
        const term = searchTerm.toLowerCase()
        return (
            item.products?.name?.toLowerCase().includes(term) ||
            item.products?.sku?.toLowerCase().includes(term) ||
            item.pallet_code?.toLowerCase().includes(term) ||
            item.batch_number?.toLowerCase().includes(term)
        )
    })

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Truck className="text-emerald-400" />
                        Nhập Kho Sỉ (Bulk Inbound)
                    </h1>
                    <p className="text-slate-400 mt-1">Nhập hàng từ Nhà Máy vào Kho Sỉ</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/admin">
                        <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800">
                            ← Quay lại
                        </Button>
                    </Link>
                    <Button
                        onClick={() => setShowForm(true)}
                        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                    >
                        <Plus size={18} className="mr-2" /> Nhập Pallet
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-lg">
                        <Box className="text-indigo-400" size={28} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">Tổng Pallet</p>
                        <p className="text-2xl font-bold">{summary.total_pallets.toLocaleString()}</p>
                    </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/20 rounded-lg">
                        <Package className="text-emerald-400" size={28} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">Tổng Số Lượng</p>
                        <p className="text-2xl font-bold">{summary.total_quantity.toLocaleString()}</p>
                    </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-3 bg-amber-500/20 rounded-lg">
                        <Factory className="text-amber-400" size={28} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">Sản Phẩm Trong Kho Sỉ</p>
                        <p className="text-2xl font-bold">{new Set(inventory.map(i => i.product_id)).size}</p>
                    </div>
                </div>
            </div>

            {/* Feedback Toast */}
            {feedback && (
                <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${feedback.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                    : 'bg-red-500/20 border border-red-500/50 text-red-300'
                    }`}>
                    {feedback.type === 'success' ? <CheckCircle size={20} /> : <CircleAlert size={20} />}
                    {feedback.message}
                </div>
            )}

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                    placeholder="Tìm theo tên, SKU, mã Pallet..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                />
            </div>

            {/* Table */}
            <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="animate-spin text-indigo-400" size={32} />
                    </div>
                ) : filteredInventory.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <Package size={48} className="mx-auto mb-4 opacity-30" />
                        <p>Chưa có hàng trong Kho Sỉ</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-900/50">
                            <tr className="text-left text-slate-400 text-sm">
                                <th className="p-4">Sản Phẩm</th>
                                <th className="p-4">Mã Pallet</th>
                                <th className="p-4">Batch</th>
                                <th className="p-4 text-right">Số Lượng</th>
                                <th className="p-4">Nguồn</th>
                                <th className="p-4">Ngày Nhập</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInventory.map((item) => (
                                <tr key={item.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                                    <td className="p-4">
                                        <div>
                                            <p className="font-semibold">{item.products?.name || 'N/A'}</p>
                                            <p className="text-xs text-slate-400">{item.products?.sku}</p>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <code className="bg-slate-700 px-2 py-1 rounded text-sm">
                                            {item.pallet_code || '-'}
                                        </code>
                                    </td>
                                    <td className="p-4 text-slate-300">{item.batch_number || '-'}</td>
                                    <td className="p-4 text-right font-bold text-lg text-emerald-400">
                                        {item.quantity.toLocaleString()}
                                    </td>
                                    <td className="p-4 text-slate-300">{item.factory_source || '-'}</td>
                                    <td className="p-4 text-slate-400 text-sm">
                                        {new Date(item.received_at).toLocaleDateString('vi-VN')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Inbound Form Dialog */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Truck className="text-emerald-400" /> Nhập Pallet Mới
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Nhập thông tin Pallet từ Nhà Máy
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div>
                            <Label htmlFor="product_id">Sản Phẩm *</Label>
                            <select
                                id="product_id"
                                value={formData.product_id}
                                onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                                className="w-full mt-1 p-2 bg-slate-800 border border-slate-700 rounded-md text-white"
                                required
                            >
                                <option value="">-- Chọn sản phẩm --</option>
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="quantity">Số Lượng *</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                    placeholder="1000"
                                    className="mt-1 bg-slate-800 border-slate-700"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="pallet_code">Mã Pallet</Label>
                                <Input
                                    id="pallet_code"
                                    value={formData.pallet_code}
                                    onChange={(e) => setFormData({ ...formData, pallet_code: e.target.value })}
                                    placeholder="P-2026-001"
                                    className="mt-1 bg-slate-800 border-slate-700"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="batch_number">Số Lô (Batch)</Label>
                                <Input
                                    id="batch_number"
                                    value={formData.batch_number}
                                    onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                                    placeholder="LOT-2026-01"
                                    className="mt-1 bg-slate-800 border-slate-700"
                                />
                            </div>
                            <div>
                                <Label htmlFor="factory_source">Nhà Máy</Label>
                                <Input
                                    id="factory_source"
                                    value={formData.factory_source}
                                    onChange={(e) => setFormData({ ...formData, factory_source: e.target.value })}
                                    placeholder="Nhà máy A"
                                    className="mt-1 bg-slate-800 border-slate-700"
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="expiry_date">Hạn Sử Dụng</Label>
                            <Input
                                id="expiry_date"
                                type="date"
                                value={formData.expiry_date}
                                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                                className="mt-1 bg-slate-800 border-slate-700"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="border-slate-600">
                                Hủy
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitting}
                                className="bg-gradient-to-r from-emerald-500 to-teal-600"
                            >
                                {submitting ? <Loader2 className="animate-spin mr-2" size={16} /> : <Plus className="mr-2" size={16} />}
                                Nhập Kho
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
