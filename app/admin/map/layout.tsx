export default function MapLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Map page has its own toolbar, no need for AdminHeader
    return <>{children}</>
}
