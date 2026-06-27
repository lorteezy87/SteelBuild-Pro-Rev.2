Attribute VB_Name = "mAuth"
Option Explicit

Public Function SignIn(ByVal email As String, ByVal pwd As String) As Boolean
    Dim url As String, body As String, resp As String
    Dim st As Long
    Dim d As Object, msg As String
    url = SB_URL & "/auth/v1/token?grant_type=password"
    body = "{""email"":""" & JsonStr(email) & """,""password"":""" & JsonStr(pwd) & """}"
    resp = mHttp.Send("POST", url, body, "", "", st)
    If st = 200 Then
        Set d = mJson.Parse(resp)
        gToken = CStr(GV(d, "access_token"))
        gEmail = email
        SignIn = (Len(gToken) > 0)
    Else
        Set d = mJson.Parse(resp)
        msg = CStr(GV(d, "error_description"))
        If Len(msg) = 0 Then msg = CStr(GV(d, "msg"))
        If Len(msg) = 0 Then msg = CStr(GV(d, "error"))
        If Len(msg) = 0 Then msg = "HTTP " & st
        MsgBox "Sign-in failed: " & msg, vbExclamation, "SteelBuild Pro"
        SignIn = False
    End If
End Function
