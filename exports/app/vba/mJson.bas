Attribute VB_Name = "mJson"
Option Explicit
' Minimal, dependency-free JSON parser sized for PostgREST responses.
' Arrays -> Collection ; Objects -> Scripting.Dictionary ; null -> Empty.

Private s As String
Private p As Long
Private n As Long

Public Function Parse(ByVal text As String) As Variant
    s = text: p = 1: n = Len(text)
    SkipWs
    If p > n Then
        Set Parse = New Collection
        Exit Function
    End If
    If NextIsContainer() Then
        Set Parse = ParseValue()
    Else
        Parse = ParseValue()
    End If
End Function

Private Function NextIsContainer() As Boolean
    SkipWs
    Dim ch As String
    ch = Mid$(s, p, 1)
    NextIsContainer = (ch = "{" Or ch = "[")
End Function

Private Sub SkipWs()
    Do While p <= n
        Select Case Mid$(s, p, 1)
            Case " ", vbTab, vbCr, vbLf
                p = p + 1
            Case Else
                Exit Do
        End Select
    Loop
End Sub

Private Function ParseValue() As Variant
    SkipWs
    Dim ch As String
    ch = Mid$(s, p, 1)
    Select Case ch
        Case "{"
            Set ParseValue = ParseObject()
        Case "["
            Set ParseValue = ParseArray()
        Case """"
            ParseValue = ParseString()
        Case "t"
            p = p + 4: ParseValue = True
        Case "f"
            p = p + 5: ParseValue = False
        Case "n"
            p = p + 4: ParseValue = Empty
        Case Else
            ParseValue = ParseNumber()
    End Select
End Function

Private Function ParseObject() As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    p = p + 1
    SkipWs
    If Mid$(s, p, 1) = "}" Then
        p = p + 1
        Set ParseObject = d
        Exit Function
    End If
    Dim k As String
    Dim v As Variant
    Do
        SkipWs
        k = ParseString()
        SkipWs
        p = p + 1            ' skip colon
        If NextIsContainer() Then
            Set v = ParseValue()
            Set d(k) = v
        Else
            v = ParseValue()
            d(k) = v
        End If
        SkipWs
        If Mid$(s, p, 1) = "," Then
            p = p + 1
        Else
            Exit Do
        End If
    Loop
    p = p + 1                ' skip }
    Set ParseObject = d
End Function

Private Function ParseArray() As Collection
    Dim c As Collection
    Set c = New Collection
    p = p + 1
    SkipWs
    If Mid$(s, p, 1) = "]" Then
        p = p + 1
        Set ParseArray = c
        Exit Function
    End If
    Dim v As Variant
    Do
        SkipWs
        If NextIsContainer() Then
            Set v = ParseValue()
            c.Add v
        Else
            v = ParseValue()
            c.Add v
        End If
        SkipWs
        If Mid$(s, p, 1) = "," Then
            p = p + 1
        Else
            Exit Do
        End If
    Loop
    p = p + 1                ' skip ]
    Set ParseArray = c
End Function

Private Function ParseString() As String
    Dim sb As String, ch As String, e As String
    p = p + 1                ' opening quote
    Do While p <= n
        ch = Mid$(s, p, 1)
        If ch = """" Then
            p = p + 1
            Exit Do
        ElseIf ch = "\" Then
            p = p + 1
            e = Mid$(s, p, 1)
            Select Case e
                Case """": sb = sb & """"
                Case "\": sb = sb & "\"
                Case "/": sb = sb & "/"
                Case "n": sb = sb & vbLf
                Case "r": sb = sb & vbCr
                Case "t": sb = sb & vbTab
                Case "b": sb = sb & Chr$(8)
                Case "f": sb = sb & Chr$(12)
                Case "u": sb = sb & ChrW$(CLng("&H" & Mid$(s, p + 1, 4))): p = p + 4
                Case Else: sb = sb & e
            End Select
            p = p + 1
        Else
            sb = sb & ch
            p = p + 1
        End If
    Loop
    ParseString = sb
End Function

Private Function ParseNumber() As Variant
    Dim st As Long
    st = p
    Do While p <= n
        Select Case Mid$(s, p, 1)
            Case "0" To "9", "-", "+", ".", "e", "E"
                p = p + 1
            Case Else
                Exit Do
        End Select
    Loop
    ParseNumber = Val(Mid$(s, st, p - st))   ' Val is locale-independent
End Function

' ----- helpers used across modules -----
Public Function GV(ByVal d As Object, ByVal k As String) As Variant
    If d Is Nothing Then
        GV = ""
        Exit Function
    End If
    If d.Exists(k) Then
        If IsObject(d(k)) Then
            Set GV = d(k)
        Else
            GV = d(k)
        End If
    Else
        GV = ""
    End If
End Function

Public Function JsonStr(ByVal v As String) As String
    Dim r As String
    r = v
    r = Replace(r, "\", "\\")
    r = Replace(r, """", "\""")
    r = Replace(r, vbCrLf, "\n")
    r = Replace(r, vbCr, "\n")
    r = Replace(r, vbLf, "\n")
    r = Replace(r, vbTab, "\t")
    JsonStr = r
End Function
