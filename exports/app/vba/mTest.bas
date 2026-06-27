Attribute VB_Name = "mTest"
Option Explicit
' Temporary self-test harness (not shipped). Returns a one-line diagnostic.

Public Function RunSelfTest() As String
    Dim r As String, st As Long, resp As String
    Dim arr As Variant, c As Variant, d As Object
    Dim rows As Collection, x As Object, ws As Worksheet
    Dim keys As Variant, types As Variant

    ' 1) JSON parse
    Set arr = mJson.Parse("[{""a"":""x"",""n"":12,""b"":true,""z"":null},{""a"":""y""}]")
    r = "json.count=" & arr.Count & " a0=" & GV(arr(1), "a") & " n0=" & GV(arr(1), "n") & " b0=" & GV(arr(1), "b") & " null0=[" & ToStr(GV(arr(1), "z")) & "]"

    ' 2) REST connectivity (anon key only, no user token)
    gToken = ""
    Set c = mApi.Rest("projects", "select=id&limit=1", st)
    r = r & " | rest.status=" & st & " rest.count=" & c.Count

    ' 3) Auth round-trip with bad credentials
    resp = mHttp.Send("POST", SB_URL & "/auth/v1/token?grant_type=password", _
                      "{""email"":""nobody@example.com"",""password"":""wrong""}", "", "", st)
    Set d = mJson.Parse(resp)
    r = r & " | auth.status=" & st & " auth.msg=[" & Left$(ToStr(GV(d, "error_description")) & ToStr(GV(d, "msg")) & ToStr(GV(d, "error")), 45) & "]"

    ' 4) Render pipeline into a real sheet, then clear
    Set rows = New Collection
    Set x = CreateObject("Scripting.Dictionary")
    x("sheet_number") = "TEST-1": x("title") = "Render check": x("stage") = "Released": x("submitted_date") = "2026-06-22": x("is_superseded") = False
    rows.Add x
    Set x = CreateObject("Scripting.Dictionary")
    x("sheet_number") = "TEST-2": x("title") = "Second": x("stage") = "OFA": x("is_superseded") = True
    rows.Add x
    keys = Array("sheet_number", "title", "discipline", "revision_number", "stage", "drawing_set_name", "submitted_date", "return_date", "is_superseded")
    types = Array("text", "text", "text", "text", "chip:dwg_stage", "text", "date", "date", "check")
    mRender.RenderTable "Drawings", HEADER_ROW, keys, types, rows
    Set ws = ThisWorkbook.Worksheets("Drawings")
    r = r & " | render.b7=[" & ws.Cells(HEADER_ROW + 1, 2).Value & "]"
    r = r & " chipApplied=" & (ws.Cells(HEADER_ROW + 1, 6).Interior.Color <> RGB(13, 23, 23))
    r = r & " checkMark=[" & ws.Cells(HEADER_ROW + 2, 10).Value & "]"
    mRender.ClearBand ws, HEADER_ROW, 9
    RunSelfTest = r
End Function
