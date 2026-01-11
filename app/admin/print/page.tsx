import { PrintLabel } from "@/components/admin/PrintLabel"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function PrintPage() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-white px-6 shadow-sm">
                <Link href="/">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Quay lại Dashboard
                    </Button>
                </Link>
            </header>
            <main className="flex-1 p-8 flex items-center justify-center">
                <PrintLabel />
            </main>
        </div>
    )
}
