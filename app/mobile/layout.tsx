import { BottomNav } from "@/components/mobile/BottomNav"

export default function MobileLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="bg-slate-50 min-h-screen pb-20">
            {children}
            <BottomNav />
        </div>
    )
}
