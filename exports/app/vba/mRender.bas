Attribute VB_Name = "mRender"
Option Explicit

Public Sub RenderTable(ByVal sheetName As String, ByVal headerRow As Long, _
                       ByVal keys As Variant, ByVal types As Variant, ByVal rows As Variant)
    Dim ws As Worksheet
    Dim nc As Long, i As Long, j As Long, rr As Long
    Dim base As Long, ink As Long
    Dim d As Object, cell As Range
    Dim typ As String, key As String, raw As Variant
    Dim wrapMode As Boolean

    Set ws = ThisWorkbook.Worksheets(sheetName)
    nc = UBound(keys) - LBound(keys) + 1
    wrapMode = HasWrap(types)
    ink = HexRGB("C9D1D9")

    Application.ScreenUpdating = False
    ClearBand ws, headerRow, nc

    For i = 1 To rows.Count
        Set d = rows(i)
        rr = headerRow + i
        If (i Mod 2) = 1 Then base = HexRGB("11161C") Else base = HexRGB("161B22")
        For j = 0 To nc - 1
            Set cell = ws.Cells(rr, 2 + j)
            typ = CStr(types(j))
            key = CStr(keys(j))
            raw = GV(d, key)
            cell.Font.Name = "Arial": cell.Font.Size = 9: cell.Font.Bold = False: cell.Font.Color = ink
            cell.Interior.Color = base
            ApplyCell cell, typ, raw
        Next j
        If wrapMode Then ws.rows(rr).RowHeight = 30 Else ws.rows(rr).RowHeight = 15
    Next i

    For j = 0 To nc - 1
        If CStr(types(j)) = "pct" Then AddBars ws, headerRow, rows.Count, 2 + j
    Next j

    On Error Resume Next
    ws.AutoFilterMode = False
    If rows.Count > 0 Then
        ws.Range(ws.Cells(headerRow, 2), ws.Cells(headerRow + rows.Count, 1 + nc)).AutoFilter
    End If
    On Error GoTo 0
    Application.ScreenUpdating = True
End Sub

Private Function HasWrap(ByVal types As Variant) As Boolean
    Dim j As Long
    For j = LBound(types) To UBound(types)
        If CStr(types(j)) = "wrap" Then
            HasWrap = True
            Exit Function
        End If
    Next j
End Function

Public Sub ClearBand(ByVal ws As Worksheet, ByVal headerRow As Long, ByVal nc As Long)
    Dim rng As Range
    On Error Resume Next
    ws.AutoFilterMode = False
    On Error GoTo 0
    Set rng = ws.Range(ws.Cells(headerRow + 1, 2), ws.Cells(headerRow + 800, 1 + nc))
    rng.Clear
    rng.Interior.Color = HexRGB("0D1117")
End Sub

Private Sub ApplyCell(ByVal cell As Range, ByVal typ As String, ByVal raw As Variant)
    Dim sval As String, cc As Variant, dt As Variant
    If Left$(typ, 5) = "chip:" Then
        sval = ToStr(raw)
        cell.Value = sval
        cell.HorizontalAlignment = xlCenter
        If Len(sval) > 0 Then
            cc = Chip(Mid$(typ, 6), sval)
            cell.Interior.Color = cc(0)
            cell.Font.Color = cc(1)
            cell.Font.Bold = True
        End If
    ElseIf typ = "date" Then
        dt = ToDate(raw)
        cell.HorizontalAlignment = xlCenter
        If IsEmpty(dt) Then
            cell.Value = ToStr(raw)
        Else
            cell.Value = dt
            cell.NumberFormat = "yyyy-mm-dd"
        End If
    ElseIf typ = "money" Then
        cell.Value = ToNum(raw): cell.NumberFormat = "$#,##0;($#,##0)": cell.HorizontalAlignment = xlRight
    ElseIf typ = "tons" Then
        cell.Value = ToNum(raw): cell.NumberFormat = "#,##0.00": cell.HorizontalAlignment = xlRight
    ElseIf typ = "num" Then
        If IsNumeric(raw) Then cell.Value = CDbl(raw) Else cell.Value = ToStr(raw)
        cell.HorizontalAlignment = xlRight
    ElseIf typ = "pct" Then
        cell.Value = ToNum(raw): cell.NumberFormat = "0""%""": cell.HorizontalAlignment = xlCenter
    ElseIf typ = "check" Then
        cell.HorizontalAlignment = xlCenter
        If Truthy(raw) Then
            cell.Value = ChrW$(10003)
            cell.Font.Color = HexRGB("22C55E")
            cell.Font.Bold = True
        Else
            cell.Value = ""
        End If
    ElseIf typ = "wrap" Then
        cell.Value = ToStr(raw)
        cell.Font.Size = 8: cell.Font.Color = HexRGB("8B949E")
        cell.WrapText = True: cell.VerticalAlignment = xlTop: cell.HorizontalAlignment = xlLeft
    Else
        cell.Value = ToStr(raw): cell.HorizontalAlignment = xlLeft
    End If
End Sub

Public Sub AddBars(ByVal ws As Worksheet, ByVal headerRow As Long, ByVal nrows As Long, ByVal col As Long)
    Dim rng As Range, db As Databar
    If nrows < 1 Then Exit Sub
    Set rng = ws.Range(ws.Cells(headerRow + 1, col), ws.Cells(headerRow + nrows, col))
    rng.FormatConditions.Delete
    Set db = rng.FormatConditions.AddDatabar
    db.MinPoint.Modify newtype:=xlConditionValueNumber, newvalue:=0
    db.MaxPoint.Modify newtype:=xlConditionValueNumber, newvalue:=100
    db.BarColor.Color = HexRGB("3B82F6")
    On Error Resume Next
    db.BarFillType = xlDataBarFillSolid
    db.ShowValue = True
    On Error GoTo 0
End Sub

' ---- value coercion helpers ----
Public Function ToStr(ByVal v As Variant) As String
    If IsObject(v) Then
        ToStr = ""
    ElseIf IsEmpty(v) Then
        ToStr = ""
    ElseIf IsNull(v) Then
        ToStr = ""
    Else
        ToStr = CStr(v)
    End If
End Function

Public Function ToNum(ByVal v As Variant) As Double
    If IsObject(v) Then
        ToNum = 0
    ElseIf IsNumeric(v) Then
        ToNum = CDbl(v)
    Else
        ToNum = 0
    End If
End Function

Public Function ToDate(ByVal v As Variant) As Variant
    Dim s As String, y As Long, m As Long, d As Long
    s = ToStr(v)
    If Len(s) < 10 Then ToDate = Empty: Exit Function
    If Mid$(s, 5, 1) <> "-" Then ToDate = Empty: Exit Function
    y = Val(Left$(s, 4)): m = Val(Mid$(s, 6, 2)): d = Val(Mid$(s, 9, 2))
    If y >= 1900 And y <= 2100 And m >= 1 And m <= 12 And d >= 1 And d <= 31 Then
        On Error Resume Next
        ToDate = DateSerial(y, m, d)
        If Err.Number <> 0 Then ToDate = Empty
        On Error GoTo 0
    Else
        ToDate = Empty
    End If
End Function

Public Function Truthy(ByVal v As Variant) As Boolean
    Dim s As String
    If VarType(v) = vbBoolean Then
        Truthy = v
        Exit Function
    End If
    s = LCase$(ToStr(v))
    Truthy = (s = "true" Or s = "t" Or s = "1" Or s = "yes")
End Function
