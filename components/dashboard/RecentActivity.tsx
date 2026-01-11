import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

export function RecentActivity({ transactions }: { transactions: any[] }) {
    if (!transactions) return null

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'IMPORT': return 'bg-green-100 text-green-800'
            case 'MOVE': return 'bg-blue-100 text-blue-800'
            case 'PACK': return 'bg-purple-100 text-purple-800'
            case 'SHIP': return 'bg-orange-100 text-orange-800'
            case 'ADJUST': return 'bg-red-100 text-red-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    return (
        <Card className="col-span-1 lg:col-span-3">
            <CardHeader>
                <CardTitle>Hoạt Động Gần Đây</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Thời Gian</TableHead>
                            <TableHead>Loại</TableHead>
                            <TableHead>Chi Tiết</TableHead>
                            <TableHead className="text-right">SL</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.map((tx) => (
                            <TableRow key={tx.id}>
                                <TableCell className="whitespace-nowrap font-medium text-xs text-muted-foreground">
                                    {format(new Date(tx.timestamp), 'dd/MM HH:mm')}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className={getTypeColor(tx.type)}>
                                        {tx.type}
                                    </Badge>
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate text-sm">
                                    {tx.details?.product_sku}
                                    <span className="text-xs text-muted-foreground ml-1">
                                        ({tx.details?.from_box_code || 'External'} &rarr; {tx.details?.to_box_code || 'External'})
                                    </span>
                                </TableCell>
                                <TableCell className="text-right font-bold">
                                    {tx.details?.quantity || 0}
                                </TableCell>
                            </TableRow>
                        ))}
                        {transactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Chưa có hoạt động nào</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
