Attribute VB_Name = "mStyle"
Option Explicit

Public Function HexRGB(ByVal h As String) As Long
    HexRGB = RGB(CLng("&H" & Mid$(h, 1, 2)), CLng("&H" & Mid$(h, 3, 2)), CLng("&H" & Mid$(h, 5, 2)))
End Function

' Returns Array(fillLong, fontLong) for a status chip.
Public Function Chip(ByVal domain As String, ByVal val As String) As Variant
    Dim v As String
    Dim fillHex As String, fontHex As String
    v = LCase$(Trim$(val))
    fillHex = "64748B": fontHex = "0B0F14"   ' default gray

    If domain = "health" Then
        If InStr(v, "track") > 0 Then
            fillHex = "22C55E": fontHex = "06210F"
        ElseIf InStr(v, "watch") > 0 Then
            fillHex = "F59E0B": fontHex = "2A1A00"
        ElseIf Len(v) > 0 Then
            fillHex = "EF4444": fontHex = "2A0606"
        End If
    ElseIf domain = "set_approval" Then
        If InStr(v, "approv") > 0 Then
            fillHex = "22C55E": fontHex = "06210F"
        ElseIf InStr(v, "pend") > 0 Then
            fillHex = "F59E0B": fontHex = "2A1A00"
        End If
    ElseIf domain = "priority" Then
        If v = "critical" Or v = "urgent" Then
            fillHex = "EF4444": fontHex = "2A0606"
        ElseIf v = "high" Then
            fillHex = "FB923C": fontHex = "2A1400"
        End If
    Else
        Select Case v
            Case "released for fabrication", "released", "ifc", "issued for construction", "complete", "approved", "closed", "delivered", "active"
                fillHex = "22C55E": fontHex = "06210F"
            Case "approved as noted", "aan", "received"
                fillHex = "2DD4BF": fontHex = "06251F"
            Case "in progress", "submitted", "under review", "out for approval", "ofa", "in for approval", "ifa", "scheduled", "open"
                If domain = "sched_status" Then
                    fillHex = "3B82F6": fontHex = "06122E"
                Else
                    fillHex = "F59E0B": fontHex = "2A1A00"
                End If
            Case "revise and resubmit", "r&r", "rejected", "delayed", "incomplete response", "not approved", "void"
                fillHex = "EF4444": fontHex = "2A0606"
            Case "not started", "draft", "on hold"
                fillHex = "64748B": fontHex = "0B0F14"
            Case "bfa", "back from approval", "ofs", "out for scrub", "pending_review"
                fillHex = "3B82F6": fontHex = "06122E"
        End Select
    End If
    Chip = Array(HexRGB(fillHex), HexRGB(fontHex))
End Function
