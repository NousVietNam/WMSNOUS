import { ReactNode } from "react"

export function TableWrapper({ children, maxHeight = "65vh" }: { children: ReactNode, maxHeight?: string }) {
    return (
        <div className="rounded-md border overflow-auto relative" style={{ maxHeight }}>
            {children}
        </div>
    )
}
