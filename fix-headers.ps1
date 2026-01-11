# Remove AdminHeader from all admin pages

$files = @(
    "boxes/page.tsx",
    "boxes/[id]/page.tsx",
    "bulk-print/page.tsx",
    "history/page.tsx", 
    "inventory/page.tsx",
    "locations/page.tsx",
    "orders/page.tsx",
    "orders/[id]/page.tsx",
    "orders/create/page.tsx"
)

$basePath = "c:\Onedrive\OneDrive - NU Viet Nam\New folder\App hangle\wms-app\app\admin"

foreach ($file in $files) {
    $fullPath = Join-Path $basePath $file
    if (Test-Path $fullPath) {
        $content = Get-Content $fullPath -Raw
        
        # Remove import line
        $content = $content -replace 'import \{ AdminHeader \} from "@/components/admin/AdminHeader"\r?\n', ''
        
        # Remove JSX element
        $content = $content -replace '\s*<AdminHeader />\r?\n', ''
        
        Set-Content $fullPath $content -NoNewline
        Write-Host "Fixed: $file"
    }
}

Write-Host "Done!"
