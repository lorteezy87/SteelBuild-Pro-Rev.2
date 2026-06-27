Attribute VB_Name = "mHttp"
Option Explicit
' Thin WinHTTP wrapper. Always sends the public anon apikey; adds the user
' bearer token when supplied. Returns response text; sets status byref.

Public Function Send(ByVal method As String, ByVal url As String, ByVal body As String, _
                     ByVal token As String, ByVal prefer As String, ByRef status As Long) As String
    Dim h As Object, bearer As String
    On Error GoTo fail
    Set h = CreateObject("WinHttp.WinHttpRequest.5.1")
    h.Open method, url, False
    h.SetRequestHeader "apikey", SB_ANON
    ' Supabase requires an Authorization bearer on every call: the user token
    ' when signed in, otherwise the public anon key (RLS still applies).
    If Len(token) > 0 Then bearer = token Else bearer = SB_ANON
    h.SetRequestHeader "Authorization", "Bearer " & bearer
    h.SetRequestHeader "Accept", "application/json"
    If Len(body) > 0 Then h.SetRequestHeader "Content-Type", "application/json"
    If Len(prefer) > 0 Then h.SetRequestHeader "Prefer", prefer
    h.SetTimeouts 0, 20000, 20000, 60000
    h.Send body
    status = h.status
    Send = h.responseText
    Exit Function
fail:
    status = -1
    Send = "{""error_description"":""" & JsonStr(Err.Description) & """}"
End Function
