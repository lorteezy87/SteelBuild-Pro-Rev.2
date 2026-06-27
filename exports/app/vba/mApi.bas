Attribute VB_Name = "mApi"
Option Explicit

Public Function Rest(ByVal table As String, ByVal query As String, ByRef status As Long) As Variant
    Dim url As String, resp As String
    url = SB_URL & "/rest/v1/" & table & "?" & query
    resp = mHttp.Send("GET", url, "", gToken, "", status)
    If status >= 200 And status < 300 Then
        Set Rest = mJson.Parse(resp)
    Else
        Set Rest = New Collection
    End If
End Function

Public Function FetchProjects(ByRef status As Long) As Variant
    Set FetchProjects = Rest("projects", _
        "select=id,project_number,name,phase,health_status&order=project_number.asc", status)
End Function

Public Function FetchModule(ByVal table As String, ByVal cols As String, ByVal pf As Boolean, _
                            ByVal order As String, ByVal projId As String, ByRef status As Long) As Variant
    Dim q As String
    q = "select=" & cols & "&order=" & order
    If pf Then q = q & "&project_id=eq." & projId
    Set FetchModule = Rest(table, q, status)
End Function

Public Function FetchProjectMeta(ByVal projId As String, ByRef status As Long) As Object
    Dim c As Variant
    Set c = Rest("projects", "select=original_contract_value,retainage_percent&id=eq." & projId, status)
    If c.Count > 0 Then
        Set FetchProjectMeta = c(1)
    Else
        Set FetchProjectMeta = CreateObject("Scripting.Dictionary")
    End If
End Function

Public Function InsertRow(ByVal table As String, ByVal jsonBody As String, ByRef status As Long) As String
    InsertRow = mHttp.Send("POST", SB_URL & "/rest/v1/" & table, jsonBody, gToken, "return=representation", status)
End Function

Public Function PatchRow(ByVal table As String, ByVal idCol As String, ByVal idVal As String, _
                         ByVal jsonBody As String, ByRef status As Long) As String
    PatchRow = mHttp.Send("PATCH", SB_URL & "/rest/v1/" & table & "?" & idCol & "=eq." & idVal, _
                          jsonBody, gToken, "return=representation", status)
End Function
