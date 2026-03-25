$files = @(
    'src\pages\LoginPage.jsx',
    'src\pages\Dashboard.jsx',
    'src\modules\orders\OrdersPage.jsx',
    'src\modules\orders\OrderForm.jsx',
    'src\modules\enquiry\EnquiryForm.jsx',
    'src\modules\calculator\CalculatorPage.jsx',
    'src\modules\masters\CustomersPage.jsx',
    'src\modules\masters\ProductsPage.jsx',
    'src\modules\masters\MaterialsPage.jsx',
    'src\modules\masters\MachinesPage.jsx',
    'src\modules\masters\ColorsPage.jsx',
    'src\modules\masters\SuppliersPage.jsx'
)

foreach ($file in $files) {
    $path = "C:\Users\RPK\saras-deploy\saras-erp-v2\$file"
    if (Test-Path $path) {
        $content = Get-Content $path -Raw
        Write-Host "Checking $file..."
        
        # Check if it has export const or export function
        if ($content -match 'export\s+(const|function)\s+(\w+)') {
            $componentName = $matches[2]
            Write-Host "  Found: export const/function $componentName"
            
            # Check if it has export default
            if ($content -match 'export\s+default') {
                Write-Host "  Already has default export"
            } else {
                Write-Host "  MISSING default export - needs to be fixed"
            }
        } elseif ($content -match 'export\s+default') {
            Write-Host "  Already has default export"
        } else {
            Write-Host "  No export found"
        }
    }
}
