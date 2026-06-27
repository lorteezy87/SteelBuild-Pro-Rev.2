Attribute VB_Name = "mConfig"
Option Explicit

' Session state (in-memory only; never written to disk)
Public gToken As String
Public gEmail As String
Public gData As Object   ' Dictionary: module key -> Collection of row dicts

Public Sub SetStatus(ByVal s As String)
    On Error Resume Next
    Range("cfgStatus").Value = s
    Range("home_status").Value = s
End Sub

Public Function CfgGet(ByVal nm As String) As String
    On Error Resume Next
    CfgGet = CStr(Range(nm).Value)
End Function

Public Sub CfgSet(ByVal nm As String, ByVal v As String)
    On Error Resume Next
    Range(nm).Value = v
End Sub
