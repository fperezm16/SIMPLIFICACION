$ErrorActionPreference = 'Stop'
$docx = Join-Path $PSScriptRoot 'Manual_de_Usuario_Externo_DGAC.docx'
$pdf = Join-Path $PSScriptRoot 'Manual_de_Usuario_Externo_DGAC.pdf'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null
try {
    $doc = $word.Documents.Open($docx, $false, $true)
    $doc.ExportAsFixedFormat($pdf, 17)
    Write-Output $pdf
}
finally {
    if ($doc) { $doc.Close($false) }
    $word.Quit()
    if ($doc) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
