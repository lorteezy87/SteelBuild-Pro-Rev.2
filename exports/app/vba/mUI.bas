Attribute VB_Name = "mUI"
Option Explicit

Public Sub DoSignIn()
    Dim email As String, pwd As String
    email = InputBox("SteelBuild Pro email:", "Sign In", _
                     IIf(Len(gEmail) > 0, gEmail, CStr(Range("cfgEmail").Value)))
    If Len(email) = 0 Then Exit Sub
    pwd = InputBox("Password (used once, never saved to the file):", "Sign In")
    If Len(pwd) = 0 Then Exit Sub
    SetStatus "Signing in..."
    If mAuth.SignIn(email, pwd) Then
        Range("cfgEmail").Value = email
        Range("home_user").Value = email
        SetStatus "Signed in"
        LoadProjects
        MsgBox "Signed in as " & email & "." & vbCrLf & "Pick a project from the dropdown and press Refresh.", _
               vbInformation, "SteelBuild Pro"
    Else
        SetStatus "Not signed in"
    End If
End Sub

Public Sub DoSignOut()
    gToken = ""
    SetStatus "Not signed in"
    On Error Resume Next
    Range("home_user").Value = "-"
End Sub

Public Sub LoadProjects()
    Dim st As Long, c As Variant, cfg As Worksheet, i As Long, d As Object
    Set c = mApi.FetchProjects(st)
    Set cfg = ThisWorkbook.Worksheets("_config")
    cfg.Range("A21:D200").ClearContents
    For i = 1 To c.Count
        Set d = c(i)
        cfg.Cells(20 + i, 1).Value = ToStr(GV(d, "id"))
        cfg.Cells(20 + i, 2).Value = ToStr(GV(d, "project_number"))
        cfg.Cells(20 + i, 3).Value = ToStr(GV(d, "name"))
        cfg.Cells(20 + i, 4).Value = ToStr(GV(d, "project_number")) & "  -  " & ToStr(GV(d, "name"))
    Next i
    If c.Count = 0 Then MsgBox "No projects are visible to your account.", vbExclamation, "SteelBuild Pro"
End Sub

Public Sub DoRefresh()
    Dim disp As String, cfg As Worksheet
    Dim projId As String, projNum As String, projName As String, i As Long
    Dim mods As Variant, md As Variant, st As Long
    Dim key As String, table As String, sheet As String, order As String, pf As Boolean
    Dim cols As Variant, types As Variant, rows As Variant

    If Len(gToken) = 0 Then
        MsgBox "Please Sign In first.", vbExclamation, "SteelBuild Pro"
        Exit Sub
    End If
    disp = CStr(Range("home_project").Value)
    If Len(disp) = 0 Then
        MsgBox "Pick a project from the dropdown first.", vbExclamation, "SteelBuild Pro"
        Exit Sub
    End If
    Set cfg = ThisWorkbook.Worksheets("_config")
    For i = 21 To 200
        If CStr(cfg.Cells(i, 4).Value) = disp Then
            projId = CStr(cfg.Cells(i, 1).Value)
            projNum = CStr(cfg.Cells(i, 2).Value)
            projName = CStr(cfg.Cells(i, 3).Value)
            Exit For
        End If
    Next i
    If Len(projId) = 0 Then
        MsgBox "Could not resolve the selected project.", vbExclamation, "SteelBuild Pro"
        Exit Sub
    End If

    Range("cfgProjId").Value = projId
    Range("cfgProjNum").Value = projNum
    Range("cfgProjName").Value = projName
    SetStatus "Refreshing " & projNum & "..."
    Application.ScreenUpdating = False
    Application.Cursor = xlWait

    Set gData = CreateObject("Scripting.Dictionary")
    mods = mSchema.Modules()
    For i = LBound(mods) To UBound(mods)
        md = mods(i)
        key = CStr(md(0)): table = CStr(md(1)): sheet = CStr(md(2))
        pf = CBool(md(3)): order = CStr(md(4))
        cols = Split(CStr(md(5)), ",")
        types = Split(CStr(md(6)), ",")
        Set rows = mApi.FetchModule(table, CStr(md(5)), pf, order, projId, st)
        Set gData(key) = rows
        mRender.RenderTable sheet, HEADER_ROW, cols, types, rows
    Next i

    mDash.BuildAll projId

    Range("cfgLast").Value = Format$(Now, "yyyy-mm-dd  hh:nn")
    Range("home_last").Value = Range("cfgLast").Value
    SetStatus "Loaded " & projNum & "  -  " & projName
    Application.Cursor = xlDefault
    Application.ScreenUpdating = True
    MsgBox "Loaded project " & projNum & " - " & projName & ".", vbInformation, "SteelBuild Pro"
End Sub

Public Sub GoHome()
    ThisWorkbook.Worksheets("Home").Activate
End Sub
