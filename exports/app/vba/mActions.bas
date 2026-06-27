Attribute VB_Name = "mActions"
Option Explicit

Private Function ProjId() As String
    ProjId = CStr(Range("cfgProjId").Value)
End Function
Private Function ProjNum() As String
    ProjNum = CStr(Range("cfgProjNum").Value)
End Function

Private Function Guard() As Boolean
    If Len(gToken) = 0 Then
        MsgBox "Sign in on the Home tab first.", vbExclamation, "SteelBuild Pro"
        Guard = False
        Exit Function
    End If
    If Len(ProjId()) = 0 Then
        MsgBox "Select a project and Refresh first.", vbExclamation, "SteelBuild Pro"
        Guard = False
        Exit Function
    End If
    Guard = True
End Function

Public Sub DoCreateRFI()
    Dim num As String, title As String, q As String, body As String, resp As String
    Dim st As Long
    If Not Guard() Then Exit Sub
    num = Trim$(InputBox("RFI number (e.g. RFI #061):", "Create RFI"))
    If Len(num) = 0 Then Exit Sub
    title = Trim$(InputBox("Subject:", "Create RFI"))
    If Len(title) = 0 Then Exit Sub
    q = InputBox("Question / detail:", "Create RFI")
    If MsgBox("Create " & num & " on project " & ProjNum() & "?" & vbCrLf & vbCrLf & title, _
              vbYesNo + vbQuestion, "Confirm write to live database") <> vbYes Then Exit Sub
    body = "{""project_id"":""" & ProjId() & """,""rfi_number"":""" & JsonStr(num) & _
           """,""title"":""" & JsonStr(title) & """,""question"":""" & JsonStr(q) & _
           """,""status"":""Open"",""priority"":""Medium"",""ball_in_court"":""GC""}"
    resp = mApi.InsertRow("rfis", body, st)
    If st >= 200 And st < 300 Then
        Audit "rfis", "create", "Created " & num, num & " " & title
        MsgBox "RFI " & num & " created.", vbInformation, "SteelBuild Pro"
        mUI.DoRefresh
    Else
        MsgBox "Create failed (HTTP " & st & ")." & vbCrLf & resp, vbExclamation, "SteelBuild Pro"
    End If
End Sub

Public Sub DoAddSubmittal()
    Dim num As String, title As String, body As String, resp As String
    Dim st As Long
    If Not Guard() Then Exit Sub
    num = Trim$(InputBox("Submittal number (e.g. S-016):", "Add Submittal"))
    If Len(num) = 0 Then Exit Sub
    title = Trim$(InputBox("Title:", "Add Submittal"))
    If Len(title) = 0 Then Exit Sub
    If MsgBox("Add submittal " & num & " on project " & ProjNum() & "?" & vbCrLf & vbCrLf & title, _
              vbYesNo + vbQuestion, "Confirm write to live database") <> vbYes Then Exit Sub
    body = "{""project_id"":""" & ProjId() & """,""submittal_number"":""" & JsonStr(num) & _
           """,""title"":""" & JsonStr(title) & """,""submittal_type"":""Shop Drawing""," & _
           """status"":""Submitted"",""ball_in_court"":""EOR"",""round_number"":1}"
    resp = mApi.InsertRow("submittals", body, st)
    If st >= 200 And st < 300 Then
        Audit "submittals", "create", "Added " & num, num & " " & title
        MsgBox "Submittal " & num & " added.", vbInformation, "SteelBuild Pro"
        mUI.DoRefresh
    Else
        MsgBox "Add failed (HTTP " & st & ")." & vbCrLf & resp, vbExclamation, "SteelBuild Pro"
    End If
End Sub

Public Sub DoAdvanceSubmittal()
    Dim num As String, newst As String, body As String, resp As String, sid As String
    Dim st As Long
    Dim c As Variant
    If Not Guard() Then Exit Sub
    num = Trim$(InputBox("Submittal number to advance:", "Advance Submittal"))
    If Len(num) = 0 Then Exit Sub
    newst = Trim$(InputBox("New status:" & vbCrLf & _
        "Submitted / Approved as Noted / Released for Fabrication / Revise and Resubmit", "Advance Submittal"))
    If Len(newst) = 0 Then Exit Sub
    If MsgBox("Set " & num & "  ->  " & newst & " ?", vbYesNo + vbQuestion, "Confirm write to live database") <> vbYes Then Exit Sub
    Set c = mApi.Rest("submittals", "select=id&project_id=eq." & ProjId() & "&submittal_number=eq." & EncURL(num), st)
    If c.Count = 0 Then
        MsgBox "Submittal '" & num & "' not found on this project.", vbExclamation, "SteelBuild Pro"
        Exit Sub
    End If
    sid = ToStr(GV(c(1), "id"))
    body = "{""status"":""" & JsonStr(newst) & """}"
    resp = mApi.PatchRow("submittals", "id", sid, body, st)
    If st >= 200 And st < 300 Then
        Audit "submittals", "status_change", "Set " & num & " -> " & newst, num
        MsgBox "Submittal " & num & " updated.", vbInformation, "SteelBuild Pro"
        mUI.DoRefresh
    Else
        MsgBox "Update failed (HTTP " & st & ")." & vbCrLf & resp, vbExclamation, "SteelBuild Pro"
    End If
End Sub

Private Sub Audit(ByVal entity As String, ByVal action As String, ByVal descr As String, ByVal entname As String)
    Dim body As String, st As Long
    On Error Resume Next
    body = "{""project_id"":""" & ProjId() & """,""entity_type"":""" & JsonStr(entity) & _
           """,""action"":""" & JsonStr(action) & """,""description"":""" & JsonStr("Excel app: " & descr) & _
           """,""entity_name"":""" & JsonStr(entname) & """,""performed_by"":""" & JsonStr(gEmail) & """}"
    mApi.InsertRow "activities", body, st
End Sub

Private Function EncURL(ByVal s As String) As String
    Dim r As String
    r = s
    r = Replace(r, "%", "%25")
    r = Replace(r, "#", "%23")
    r = Replace(r, " ", "%20")
    r = Replace(r, "&", "%26")
    EncURL = r
End Function
