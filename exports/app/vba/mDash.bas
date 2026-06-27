Attribute VB_Name = "mDash"
Option Explicit

Private Function Coll(ByVal key As String) As Variant
    If gData.Exists(key) Then
        Set Coll = gData(key)
    Else
        Set Coll = New Collection
    End If
End Function

Public Sub BuildAll(ByVal projId As String)
    CommandCenter
    DetailHub
    FabReadiness
    Financials projId
End Sub

Private Sub SetN(ByVal nm As String, ByVal v As Long)
    On Error Resume Next
    Range(nm).Value = v
End Sub
Private Sub SetV(ByVal nm As String, ByVal v As String)
    On Error Resume Next
    Range(nm).Value = v
End Sub
Private Sub AddCount(ByVal d As Object, ByVal k As String)
    If Len(k) = 0 Then k = "(unassigned)"
    If d.Exists(k) Then
        d(k) = d(k) + 1
    Else
        d(k) = 1
    End If
End Sub

Private Sub CommandCenter()
    Dim dwg As Variant, sets As Variant, subs As Variant, rfis As Variant
    Dim sch As Variant, wps As Variant, dels As Variant
    Dim released As Long, openrfi As Long, costimp As Long, schimp As Long, delayed As Long
    Dim apprSets As Long, nSub As Long, nAAN As Long, nRFF As Long
    Dim tons As Double, schsum As Double
    Dim schavg As Long, i As Long
    Dim st As String, ss As String
    Dim bic As Object, exc As Collection
    Dim ws As Worksheet

    Set dwg = Coll("drawings"): Set sets = Coll("drawing_sets"): Set subs = Coll("submittals")
    Set rfis = Coll("rfis"): Set sch = Coll("schedule_tasks"): Set wps = Coll("work_packages")
    Set dels = Coll("deliveries")

    For i = 1 To dwg.Count
        st = LCase$(ToStr(GV(dwg(i), "stage")))
        If st = "released" Or st = "ifc" Then released = released + 1
    Next i
    For i = 1 To sets.Count
        If LCase$(ToStr(GV(sets(i), "set_approval_status"))) = "approved" Then apprSets = apprSets + 1
    Next i
    For i = 1 To rfis.Count
        If LCase$(ToStr(GV(rfis(i), "status"))) <> "closed" Then openrfi = openrfi + 1
        If Truthy(GV(rfis(i), "cost_impact")) Then costimp = costimp + 1
        If Truthy(GV(rfis(i), "schedule_impact")) Then schimp = schimp + 1
    Next i
    For i = 1 To dels.Count
        tons = tons + ToNum(GV(dels(i), "weight_tons"))
    Next i
    For i = 1 To sch.Count
        schsum = schsum + ToNum(GV(sch(i), "percent_complete"))
        If LCase$(ToStr(GV(sch(i), "status"))) = "delayed" Then delayed = delayed + 1
    Next i
    If sch.Count > 0 Then schavg = Round(schsum / sch.Count)

    SetN "kc_sheets", dwg.Count
    SetN "kc_sets", sets.Count
    SetN "kc_subs", subs.Count
    SetN "kc_openrfi", openrfi
    SetN "kc_costrfi", costimp
    SetN "kc_schrfi", schimp
    SetV "kc_tons", Format$(tons, "#,##0.0")
    SetV "kc_sched", schavg & "%"
    SetN "kc_wps", wps.Count
    SetN "kc_delay", delayed

    For i = 1 To subs.Count
        ss = LCase$(ToStr(GV(subs(i), "status")))
        If ss = "submitted" Or ss = "under review" Then nSub = nSub + 1
        If InStr(ss, "noted") > 0 Then nAAN = nAAN + 1
        If InStr(ss, "released for fab") > 0 Then nRFF = nRFF + 1
    Next i
    On Error Resume Next
    Range("kc_funnel").Value = "Submitted / In Review: " & nSub & "        Approved as Noted: " & nAAN & "        Released for Fab: " & nRFF
    On Error GoTo 0

    Set bic = CreateObject("Scripting.Dictionary")
    For i = 1 To subs.Count
        ss = LCase$(ToStr(GV(subs(i), "status")))
        If InStr(ss, "released for fab") = 0 And InStr(ss, "noted") = 0 And ss <> "approved" Then
            AddCount bic, ToStr(GV(subs(i), "ball_in_court"))
        End If
    Next i
    For i = 1 To rfis.Count
        If LCase$(ToStr(GV(rfis(i), "status"))) <> "closed" Then AddCount bic, ToStr(GV(rfis(i), "ball_in_court"))
    Next i
    WriteList "kc_bic", bic

    Set exc = New Collection
    For i = 1 To subs.Count
        ss = LCase$(ToStr(GV(subs(i), "status")))
        If ss = "submitted" Or ss = "under review" Then exc.Add "In review:  " & ToStr(GV(subs(i), "submittal_number")) & " " & ToStr(GV(subs(i), "title"))
    Next i
    For i = 1 To sets.Count
        If LCase$(ToStr(GV(sets(i), "set_approval_status"))) = "pending_review" Then exc.Add "Set pending review:  " & ToStr(GV(sets(i), "set_name"))
    Next i
    For i = 1 To rfis.Count
        If LCase$(ToStr(GV(rfis(i), "status"))) <> "closed" Then exc.Add "Open RFI:  " & ToStr(GV(rfis(i), "rfi_number")) & " " & ToStr(GV(rfis(i), "title"))
    Next i
    For i = 1 To sch.Count
        If LCase$(ToStr(GV(sch(i), "status"))) = "delayed" Then exc.Add "Delayed:  " & ToStr(GV(sch(i), "task_name"))
    Next i
    WriteExc "kc_exc", exc
End Sub

Private Sub WriteList(ByVal anchorName As String, ByVal d As Object)
    Dim a As Range, ws As Worksheet, k As Variant, i As Long
    On Error Resume Next
    Set a = Range(anchorName)
    If a Is Nothing Then Exit Sub
    Set ws = a.Worksheet
    ws.Range(ws.Cells(a.Row, a.Column), ws.Cells(a.Row + 16, a.Column + 3)).ClearContents
    i = 0
    For Each k In d.Keys
        ws.Cells(a.Row + i, a.Column).Value = "  " & k
        ws.Cells(a.Row + i, a.Column).Font.Color = HexRGB("C9D1D9")
        ws.Cells(a.Row + i, a.Column + 3).Value = d(k)
        ws.Cells(a.Row + i, a.Column + 3).Font.Color = HexRGB("38BDF8")
        ws.Cells(a.Row + i, a.Column + 3).Font.Bold = True
        i = i + 1
        If i > 12 Then Exit For
    Next k
End Sub

Private Sub WriteExc(ByVal anchorName As String, ByVal c As Collection)
    Dim a As Range, ws As Worksheet, i As Long
    On Error Resume Next
    Set a = Range(anchorName)
    If a Is Nothing Then Exit Sub
    Set ws = a.Worksheet
    ws.Range(ws.Cells(a.Row, a.Column), ws.Cells(a.Row + 18, a.Column + 5)).ClearContents
    For i = 1 To c.Count
        If i > 16 Then Exit For
        ws.Cells(a.Row + i - 1, a.Column).Value = " " & c(i)
        ws.Cells(a.Row + i - 1, a.Column).Font.Color = HexRGB("C9D1D9")
        ws.Cells(a.Row + i - 1, a.Column).Font.Size = 8
    Next i
End Sub

Private Sub DetailHub()
    Dim sets As Variant, subs As Variant, byNum As Object
    Dim rows As Collection, d As Object
    Dim i As Long, si As Long, lr As String, sn As String
    Dim keys As Variant, types As Variant
    Set sets = Coll("drawing_sets"): Set subs = Coll("submittals")
    Set byNum = CreateObject("Scripting.Dictionary")
    For i = 1 To subs.Count
        byNum(UCase$(ToStr(GV(subs(i), "submittal_number")))) = i
    Next i
    Set rows = New Collection
    For i = 1 To sets.Count
        Set d = CreateObject("Scripting.Dictionary")
        d("set_name") = GV(sets(i), "set_name")
        d("discipline") = GV(sets(i), "discipline")
        d("revision") = GV(sets(i), "revision")
        d("sheet_count") = GV(sets(i), "sheet_count")
        d("set_approval_status") = GV(sets(i), "set_approval_status")
        d("is_locked") = GV(sets(i), "is_locked")
        lr = ToStr(GV(sets(i), "locked_reason"))
        sn = ExtractSub(lr)
        d("linked_submittal") = sn
        If Len(sn) > 0 And byNum.Exists(UCase$(sn)) Then
            si = byNum(UCase$(sn))
            d("submittal_status") = GV(subs(si), "status")
            d("ball_in_court") = GV(subs(si), "ball_in_court")
        Else
            d("submittal_status") = ""
            d("ball_in_court") = ""
        End If
        rows.Add d
    Next i
    keys = Array("set_name", "discipline", "revision", "sheet_count", "set_approval_status", "is_locked", "linked_submittal", "submittal_status", "ball_in_court")
    types = Array("text", "text", "text", "num", "chip:set_approval", "check", "text", "chip:sub_status", "text")
    mRender.RenderTable "Detailing Hub", 7, keys, types, rows
End Sub

Private Function ExtractSub(ByVal s As String) As String
    Dim i As Long, j As Long, st As Long, nn As Long
    nn = Len(s)
    For i = 1 To nn
        If Mid$(s, i, 1) = "S" Then
            j = i + 1
            If Mid$(s, j, 1) = "-" Then j = j + 1
            st = j
            Do While j <= nn And Mid$(s, j, 1) >= "0" And Mid$(s, j, 1) <= "9"
                j = j + 1
            Loop
            If j > st Then
                ExtractSub = "S-" & Format$(Val(Mid$(s, st, j - st)), "000")
                Exit Function
            End If
        End If
    Next i
End Function

Private Sub FabReadiness()
    Dim sch As Variant, sets As Variant, rfis As Variant
    Dim openrfi As Long, pend As Long, i As Long
    Dim rows As Collection, keys As Variant, types As Variant
    Set sch = Coll("schedule_tasks"): Set sets = Coll("drawing_sets"): Set rfis = Coll("rfis")
    For i = 1 To rfis.Count
        If LCase$(ToStr(GV(rfis(i), "status"))) <> "closed" Then openrfi = openrfi + 1
    Next i
    For i = 1 To sets.Count
        If LCase$(ToStr(GV(sets(i), "set_approval_status"))) = "pending_review" Then pend = pend + 1
    Next i
    On Error Resume Next
    If openrfi = 0 And pend = 0 Then
        Range("fab_ready").Value = "  READY  -  no open RFIs and all sets approved."
    Else
        Range("fab_ready").Value = "  REVIEW  -  " & openrfi & " open RFI(s) and " & pend & " set(s) pending approval block release."
    End If
    On Error GoTo 0
    Set rows = New Collection
    For i = 1 To sch.Count
        If LCase$(ToStr(GV(sch(i), "phase"))) = "fabrication" Then rows.Add sch(i)
    Next i
    keys = Array("task_name", "status", "percent_complete", "start_date", "end_date")
    types = Array("text", "chip:sched_status", "pct", "date", "date")
    mRender.RenderTable "Fabrication", 12, keys, types, rows
End Sub

Private Sub Financials(ByVal projId As String)
    Dim meta As Object, cos As Variant
    Dim orig As Double, retpct As Double, net As Double, adj As Double, ret As Double
    Dim i As Long, st As Long
    Dim keys As Variant, types As Variant
    Set meta = mApi.FetchProjectMeta(projId, st)
    orig = ToNum(GV(meta, "original_contract_value"))
    retpct = ToNum(GV(meta, "retainage_percent"))
    Set cos = Coll("change_orders")
    For i = 1 To cos.Count
        net = net + ToNum(GV(cos(i), "co_amount"))
    Next i
    adj = orig + net
    ret = -adj * retpct / 100
    On Error Resume Next
    Range("fin_orig").Value = orig
    Range("fin_netco").Value = net
    Range("fin_adj").Value = adj
    Range("fin_ret").Value = ret
    Range("fin_less").Value = adj + ret
    On Error GoTo 0
    keys = Array("co_number", "title", "status", "co_amount", "reason_code", "approved_date")
    types = Array("text", "text", "chip:co_status", "money", "text", "date")
    mRender.RenderTable "Financials", 14, keys, types, cos
End Sub
