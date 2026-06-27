$ErrorActionPreference = "Stop"
$base = "C:\dev\SteelBuild-Pro-Rev.2\exports\app"
$src  = Join-Path $base "SteelBuild-Pro-App.xlsx"
$out  = Join-Path $base "SteelBuild-Pro.xlsm"
$vba  = Join-Path $base "vba"

Get-Process EXCEL -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 300
if (Test-Path $out) { Remove-Item $out -Force }

function RGBval([int]$r,[int]$g,[int]$b){ return ($r + $g*256 + $b*65536) }

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($src)
  $proj = $wb.VBProject

  # import all standard modules
  Get-ChildItem (Join-Path $vba "*.bas") | Where-Object { $_.Name -ne 'mTest.bas' } | ForEach-Object {
    $proj.VBComponents.Import($_.FullName) | Out-Null
    Write-Host ("imported " + $_.Name)
  }

  # ThisWorkbook open handler
  $twCode = @"
Private Sub Workbook_Open()
    On Error Resume Next
    ThisWorkbook.Worksheets("Home").Activate
End Sub
"@
  $tw = $proj.VBComponents.Item("ThisWorkbook")
  $tw.CodeModule.AddFromString($twCode)

  # add action buttons on Home
  $hs = $wb.Worksheets.Item("Home")
  $anchor1 = $hs.Range("B16")
  $anchor2 = $hs.Range("B18")
  $w = 120; $h = 24; $gap = 10
  $accent = RGBval 31 41 55      # PANEL2
  $blue   = RGBval 59 130 246
  $green  = RGBval 34 197 94
  $slate  = RGBval 100 116 139
  $white  = RGBval 255 255 255

  function AddBtn($sheet,$left,$top,$text,$macro,$fill){
    $s = $sheet.Shapes.AddShape(5, $left, $top, $w, $h)  # 5 = rounded rectangle
    $s.TextFrame2.TextRange.Text = $text
    $s.TextFrame2.TextRange.Font.Size = 10
    $s.TextFrame2.TextRange.Font.Bold = $true
    $s.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = $white
    $s.Fill.ForeColor.RGB = $fill
    $s.Line.ForeColor.RGB = (RGBval 59 130 246)
    $s.OnAction = $macro
    return $s
  }

  $L = $anchor1.Left; $T = $anchor1.Top
  AddBtn $hs ($L)            $T "Sign In"  "DoSignIn"  $blue  | Out-Null
  AddBtn $hs ($L+$w+$gap)    $T "Refresh"  "DoRefresh" $green | Out-Null
  AddBtn $hs ($L+2*($w+$gap)) $T "Sign Out" "DoSignOut" $slate | Out-Null

  $T2 = $anchor2.Top
  AddBtn $hs ($L)             $T2 "Create RFI"        "DoCreateRFI"        $accent | Out-Null
  AddBtn $hs ($L+$w+$gap)     $T2 "Add Submittal"     "DoAddSubmittal"     $accent | Out-Null
  AddBtn $hs ($L+2*($w+$gap)) $T2 "Advance Submittal" "DoAdvanceSubmittal" $accent | Out-Null

  # force a full compile by running a harmless macro
  $compileOk = $true; $compileErr = ""
  try { $xl.Run("GoHome") } catch { $compileOk = $false; $compileErr = $_.Exception.Message }

  $wb.SaveAs($out, 52)   # 52 = xlOpenXMLWorkbookMacroEnabled (.xlsm)
  $wb.Close($false)
  Write-Host ("COMPILE_OK: " + $compileOk)
  if (-not $compileOk) { Write-Host ("COMPILE_ERR: " + $compileErr) }
  Write-Host ("SAVED: " + (Test-Path $out))
}
finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
