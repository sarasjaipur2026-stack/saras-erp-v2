$filesToFix = @(
    @{Path = 'src\modules\orders\OrdersPage.jsx'; ComponentName = 'OrdersPage'},
    @{Path = 'src\modules\orders\OrderForm.jsx'; ComponentName = 'OrderForm'},
    @{Path = 'src\modules\enquiry\EnquiryForm.jsx'; ComponentName = 'EnquiryForm'},
    @{Path = 'src\modules\calculator\CalculatorPage.jsx'; ComponentName = 'CalculatorPage'},
    @{Path = 'src\modules\masters\CustomersPage.jsx'; ComponentName = 'CustomersPage'},
    @{Path = 'src\modules\masters\ColorsPage.jsx'; ComponentName = 'ColorsPage'}
)

$basePath = 'C:\Users\RPK\saras-deploy\saras-erp-v2'

foreach ($file in $filesToFix) {
    $fullPath = Join-Path $basePath $file.Path
    $componentName = $file.ComponentName
    
    if (Test-Path $fullPath) {
        Write-Host "Fixing $($file.Path)..."
        
        $content = Get-Content $fullPath -Raw
        
        # Replace "export const ComponentName" with "const ComponentName"
        $content = $content -replace "export\s+const\s+$componentName\s*=", "const $componentName ="
        
        # Add default export at the end if not already there
        if ($content -notmatch 'export\s+default') {
            # Remove trailing semicolon and newlines, then add the export
            $content = $content -replace '};\s*$', "};`n`nexport default $componentName;"
        }
        
        Set-Content $fullPath -Value $content -Encoding UTF8
        Write-Host "  Fixed!"
    } else {
        Write-Host "File not found: $fullPath"
    }
}

Write-Host "All exports have been fixed!"
