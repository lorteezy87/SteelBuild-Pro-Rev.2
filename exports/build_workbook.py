"""Build 'SteelBuild Pro' as a multi-sheet Excel workbook (SteelBuild Dark theme),
populated with a real-data snapshot of project 25531 — Skyport at Redfield.
Run: python build_workbook.py
"""
import json, datetime, re
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import DataBarRule
from openpyxl.workbook.properties import CalcProperties

BASE = Path(r"C:\dev\SteelBuild-Pro-Rev.2\exports")
DATA = BASE / "data"
OUT = BASE / "SteelBuild-Pro-Skyport-Redfield.xlsx"
SNAPSHOT = "June 22, 2026"

core = json.loads((DATA / "skyport_core.json").read_text(encoding="utf-8"))
drawings = json.loads((DATA / "skyport_drawings.json").read_text(encoding="utf-8"))
rfis = json.loads((DATA / "skyport_rfis.json").read_text(encoding="utf-8"))
schedule = json.loads((DATA / "skyport_schedule.json").read_text(encoding="utf-8"))
proj = core["project"]
sets = core["drawing_sets"]
submittals = core["submittals"]
deliveries = core["deliveries"]
changes = core["change_orders"]
wps = core["work_packages"]
vendors = core["vendors"]

_PRETTY={"approved":"Approved","pending_review":"Pending review"}
for _s in sets:
    if _s.get("set_approval_status") in _PRETTY:
        _s["set_approval_status"]=_PRETTY[_s["set_approval_status"]]

# ---------------------------------------------------------------- palette
CANVAS="0D1117"; PANEL="161B22"; PANEL2="1F2937"; BAND="11161C"; ROW2="161B22"
INK="E6EDF3"; SUB="C9D1D9"; MUTE="8B949E"; LINE="30363D"
BLUE="3B82F6"; CYAN="38BDF8"; GREEN="22C55E"; AMBER="F59E0B"; RED="EF4444"
PURPLE="A78BFA"; TEAL="2DD4BF"; SLATE="64748B"; ORANGE="FB923C"

def F(size=10, bold=False, color=INK, italic=False):
    return Font(name="Arial", size=size, bold=bold, color=color, italic=italic)
def fill(hexc): return PatternFill("solid", fgColor=hexc)
def side(color=LINE, style="thin"): return Side(style=style, color=color)
LEFT=Alignment(horizontal="left", vertical="center")
CTR=Alignment(horizontal="center", vertical="center")
RIGHT=Alignment(horizontal="right", vertical="center")
WRAP=Alignment(horizontal="left", vertical="top", wrap_text=True)

START=2  # content begins at column B; column A is a dark margin

def pdate(s):
    if not isinstance(s, str): return None
    try:
        y,m,d = (int(x) for x in s[:10].split("-"))
        if 1900 <= y <= 2100: return datetime.date(y,m,d)
    except Exception: pass
    return None

def rfi_count(v):
    if v is None: return 0
    if isinstance(v, list): return len([x for x in v if x])
    s=str(v).strip()
    return 0 if not s else len([x for x in s.split(",") if x.strip()])

# status -> (fill, font) chips -------------------------------------------
def chip(domain, val):
    v=(str(val) if val is not None else "").strip().lower()
    g=(GREEN,"06210F"); teal=(TEAL,"06251F"); blu=(BLUE,"06122E"); amb=(AMBER,"2A1A00")
    red=(RED,"2A0606"); gray=(SLATE,"0B0F14"); pur=(PURPLE,"1A1030"); org=(ORANGE,"2A1400")
    if domain=="health":
        return g if "track" in v else (amb if "watch" in v else red if v else gray)
    if domain=="set_approval":
        return g if "approv" in v else amb if "pend" in v else gray
    if domain in ("sub_status","dwg_stage","sched_status","wp_status","co_status","rfi_status"):
        if v in ("released for fabrication","released","ifc","issued for construction","complete","approved","closed","delivered","active"):
            return g
        if v in ("approved as noted","approved as-noted","aan","received"): return teal
        if v in ("in progress","submitted","under review","out for approval","ofa","in for approval","ifa","scheduled"):
            return amb if domain!="sched_status" else blu
        if v in ("revise and resubmit","r&r","rejected","delayed","incomplete response","not approved","void"):
            return red
        if v in ("not started","draft","on hold"): return gray
        if v in ("bfa","back from approval","ofs","out for scrub","pending_review"): return blu
        return gray
    if domain=="priority":
        if v in ("critical","urgent","high"): return red if "crit" in v or "urg" in v else org
        if v in ("normal","medium","low"): return gray
        return gray
    return gray

def C(ws,r,c,val=None,*,font=None,fillc=None,align=LEFT,fmt=None,border=True,bcolor=LINE):
    cell=ws.cell(r,c)
    if val is not None: cell.value=val
    cell.font=font or F(color=SUB)
    if fillc: cell.fill=fill(fillc)
    cell.alignment=align
    if fmt: cell.number_format=fmt
    if border:
        cell.border=Border(bottom=side(bcolor), top=side(bcolor), left=side(bcolor), right=side(bcolor))
    return cell

def block(ws,r1,c1,r2,c2,fillc):
    for r in range(r1,r2+1):
        for c in range(c1,c2+1):
            ws.cell(r,c).fill=fill(fillc)
    if (r1,c1)!=(r2,c2): ws.merge_cells(start_row=r1,start_column=c1,end_row=r2,end_column=c2)

def panelfill(ws,r1,c1,r2,c2,fillc):
    for r in range(r1,r2+1):
        for c in range(c1,c2+1):
            ws.cell(r,c).fill=fill(fillc)

def finalize(ws, max_col, max_row):
    ws.sheet_view.showGridLines=False
    ws.sheet_properties.tabColor=PANEL2
    for r in range(1, max_row+3):
        for c in range(1, max_col+3):
            cc=ws.cell(r,c)
            if cc.fill.patternType is None:
                cc.fill=fill(CANVAS)
                if cc.font is None or cc.font.name!="Arial":
                    cc.font=F(color=INK)
    ws.column_dimensions[get_column_letter(1)].width=2.4
    ws.column_dimensions[get_column_letter(max_col+1)].width=2.4
    ws.column_dimensions[get_column_letter(max_col+2)].width=2.4

def banner(ws, last_col, title, subtitle):
    block(ws,1,1,1,last_col+2,CANVAS)
    block(ws,2,START,2,last_col, PANEL2)
    block(ws,3,START,3,last_col, PANEL2)
    t=ws.cell(2,START,title); t.font=F(20,True,"FFFFFF"); t.alignment=Alignment(horizontal="left",vertical="center")
    s=ws.cell(3,START,subtitle); s.font=F(10,False,CYAN); s.alignment=Alignment(horizontal="left",vertical="center")
    block(ws,4,START,4,last_col, BLUE)  # accent rule
    ws.row_dimensions[2].height=30; ws.row_dimensions[3].height=18; ws.row_dimensions[4].height=3

def kpi(ws,r,c,w,label,value,accent,sub=None):
    block(ws,r,c,r,c+w-1, PANEL)
    block(ws,r+1,c,r+1,c+w-1, PANEL)
    block(ws,r+2,c,r+2,c+w-1, PANEL)
    block(ws,r+3,c,r+3,c+w-1, accent)  # bottom accent strip
    v=ws.cell(r,c,value); v.font=F(16,True,INK); v.alignment=Alignment(horizontal="left",vertical="center",indent=1)
    l=ws.cell(r+1,c,label.upper()); l.font=F(8,True,MUTE); l.alignment=Alignment(horizontal="left",vertical="center",indent=1)
    sc=ws.cell(r+2,c,sub or ""); sc.font=F(8,False,CYAN); sc.alignment=Alignment(horizontal="left",vertical="top",indent=1)
    ws.row_dimensions[r].height=26; ws.row_dimensions[r+1].height=13; ws.row_dimensions[r+2].height=14; ws.row_dimensions[r+3].height=3

def section(ws,r,last_col,text):
    block(ws,r,START,r,last_col, BAND)
    t=ws.cell(r,START,text); t.font=F(11,True,CYAN); t.alignment=Alignment(horizontal="left",vertical="center",indent=1)
    ws.row_dimensions[r].height=22

def fmt_val(kind, val):
    if kind=="date":
        d=pdate(val); return d if d else (val if val else "")
    if kind=="bool":
        return "Yes" if val in (True,"true","t",1) else ("" if val in (None,"") else "No")
    if kind=="check":
        return "✓" if val in (True,"true","t",1) else ""
    if kind=="rficount":
        n=rfi_count(val); return n
    return "" if val is None else val

def render_table(ws, top, columns, records, *, totals=None, freeze=True):
    nc=len(columns); last_col=START+nc-1
    for j,col in enumerate(columns):
        c=ws.cell(top, START+j, col["label"])
        c.font=F(9,True,CYAN); c.fill=fill(PANEL2)
        c.alignment=Alignment(horizontal=col.get("align","left"),vertical="center",wrap_text=True)
        c.border=Border(bottom=side(BLUE,"medium"),top=side(LINE),left=side(LINE),right=side(LINE))
        ws.column_dimensions[get_column_letter(START+j)].width=col["width"]
    ws.row_dimensions[top].height=26
    r=top+1
    pct_cols=[]
    for i,rec in enumerate(records):
        base=BAND if i%2==0 else ROW2
        rowh=15
        for j,col in enumerate(columns):
            kind=col.get("kind","text"); val=rec.get(col["key"])
            align=col.get("align","left")
            al=LEFT if align=="left" else (RIGHT if align=="right" else CTR)
            cellfill=base; font=F(9,color=SUB)
            disp=fmt_val(kind, val)
            fmt=None
            if kind.startswith("chip:"):
                fc,ftc=chip(kind.split(":",1)[1], val)
                cellfill=fc; font=F(9,True,ftc); al=CTR; disp="" if val in (None,"") else val
            elif kind=="money":
                disp=val if isinstance(val,(int,float)) else 0; fmt='$#,##0;($#,##0)'; al=RIGHT
            elif kind=="num":
                disp=val if isinstance(val,(int,float)) else (val or ""); al=RIGHT
            elif kind=="tons":
                disp=val if isinstance(val,(int,float)) else 0; fmt='#,##0.00'; al=RIGHT
            elif kind=="pct":
                disp=val if isinstance(val,(int,float)) else 0; fmt='0"%"'; al=CTR; pct_cols.append(get_column_letter(START+j))
            elif kind=="wrap":
                font=F(8,color=MUTE); al=WRAP; rowh=max(rowh,30)
            elif kind=="check":
                font=F(10,True,GREEN); al=CTR
            cell=C(ws,r,START+j,disp,font=font,fillc=cellfill,align=al,fmt=fmt)
            if kind=="date" and not pdate(val) and val: cell.number_format="@"
        ws.row_dimensions[r].height=rowh
        r+=1
    # totals row
    if totals:
        for j,col in enumerate(columns):
            spec=totals.get(col["key"])
            cf=PANEL2
            if spec is None:
                C(ws,r,START+j,"",font=F(9,True,INK),fillc=cf)
            elif spec=="label":
                C(ws,r,START+j,"TOTAL",font=F(9,True,INK),fillc=cf,align=RIGHT)
            else:
                colL=get_column_letter(START+j)
                formula=f"=SUM({colL}{top+1}:{colL}{r-1})"
                fmt='#,##0.00' if spec=="tons" else ('$#,##0;($#,##0)' if spec=="money" else '#,##0')
                C(ws,r,START+j,formula,font=F(9,True,INK),fillc=cf,align=RIGHT,fmt=fmt)
        ws.row_dimensions[r].height=18
        r+=1
    # autofilter + freeze
    ws.auto_filter.ref=f"{get_column_letter(START)}{top}:{get_column_letter(last_col)}{r-1 if not totals else r-2}"
    if freeze: ws.freeze_panes=ws.cell(top+1, START)
    # data bars on percent columns
    for colL in set(pct_cols):
        rule=DataBarRule(start_type="num",start_value=0,end_type="num",end_value=100,
                         color=BLUE, showValue=True)
        ws.conditional_formatting.add(f"{colL}{top+1}:{colL}{r-1}", rule)
    return r, last_col

# ================================================================ workbook
wb=Workbook()
wb.calculation=CalcProperties(fullCalcOnLoad=True)
SHEETS=["Cover","Command Center","Detailing Hub","Drawing Sets","Drawings",
        "Submittals","RFIs","Schedule","Work Packages","Deliveries","Fabrication",
        "Change Orders","Financials","Vendors","About"]
DESC={
 "Cover":"Project brief, headline metrics & navigation",
 "Command Center":"Portfolio KPIs, ball-in-court & exceptions",
 "Detailing Hub":"The moat — drawing sets ↔ submittals ↔ RFIs",
 "Drawing Sets":"13 packages tracked to set-level approval",
 "Drawings":"162 sheets with stage & revision",
 "Submittals":"Shop-drawing workflow (IFA→OFA→BFA→OFS→IFC→RFF)",
 "RFIs":"59 requests for information w/ cost & schedule impact",
 "Schedule":"72 WBS tasks across the project phases",
 "Work Packages":"Released work scoped by area & crew",
 "Deliveries":"Truckloads, pieces & tonnage",
 "Fabrication":"Fab-release control (module structure)",
 "Change Orders":"Contract changes & margin",
 "Financials":"Contract value, change orders & AIA pay-app",
 "Vendors":"Subs, suppliers & service providers",
 "About":"What SteelBuild Pro is + legends & data dictionary",
}
ws0=wb.active; ws0.title=SHEETS[0]
for nm in SHEETS[1:]: wb.create_sheet(nm)
def S(n): return wb[n]

# ---------------------------------------------------------------- COVER
ws=S("Cover"); LC=13
block(ws,1,1,1,LC+2,CANVAS)
block(ws,2,START,2,LC, PANEL2)
block(ws,3,START,3,LC, PANEL2)
ws.cell(2,START,"STEELBUILD  PRO").font=F(26,True,"FFFFFF")
ws.cell(2,START).alignment=Alignment(horizontal="left",vertical="center")
ws.cell(3,START,"Structural Steel Project Management  ·  Excel Edition").font=F(11,False,CYAN)
ws.cell(3,START).alignment=Alignment(horizontal="left",vertical="center")
block(ws,4,START,4,LC,BLUE); ws.row_dimensions[2].height=38; ws.row_dimensions[3].height=20; ws.row_dimensions[4].height=4

# project identity card
block(ws,6,START,6,LC,BAND)
ws.cell(6,START,f"  JOB {proj['project_number']}   ·   {proj['name']}").font=F(14,True,INK)
ws.row_dimensions[6].height=26
ident=[("Client",proj["client"]),("General Contractor",proj["general_contractor"]),
       ("Engineer of Record",proj["engineer_of_record"]),("Project Manager",proj["project_manager"]),
       ("Superintendent",proj["superintendent"]),("Job Type",proj["job_type"]),
       ("Contract Type",proj["contract_type"]),("Address",proj["address"])]
r=7
for i,(k,v) in enumerate(ident):
    col=START if i%2==0 else START+6
    block(ws,r,col,r,col+1,PANEL)
    ws.cell(r,col,f" {k.upper()}").font=F(8,True,MUTE)
    block(ws,r,col+2,r,col+ (4 if i%2==0 else 4),PANEL)
    cc=ws.cell(r,col+2,v or "—"); cc.font=F(10,True,INK); cc.alignment=LEFT
    if i%2==1: r+=1
r+=1

# status strip KPIs
released=sum(1 for d in drawings if str(d.get("stage","")).lower() in ("released","ifc"))
open_rfi=sum(1 for x in rfis if str(x.get("status","")).lower()!="closed")
tons=sum((d.get("weight_tons") or 0) for d in deliveries)
sched_avg=round(sum((t.get("percent_complete") or 0) for t in schedule)/len(schedule)) if schedule else 0
net_co=sum((c.get("co_amount") or 0) for c in changes)
section(ws,r,LC,"SNAPSHOT AT A GLANCE"); r+=1
tiles=[("Phase",proj["phase"],BLUE,proj["health_status"]),
       ("Contract Value",f"${proj['original_contract_value']:,.0f}",GREEN,f"Retainage {proj['retainage_percent']}%"),
       ("Forecast Finish",proj["forecast_completion_date"],TEAL,f"Target {proj['target_completion_date']}"),
       ("Drawing Sheets",f"{len(drawings)}",CYAN,f"{released} released"),
       ("Open RFIs",f"{open_rfi}",AMBER,f"of {len(rfis)} total"),
       ("Tons Delivered",f"{tons:,.1f}",PURPLE,f"{len(deliveries)} loads")]
c=START
for lab,val,acc,sub in tiles:
    kpi(ws,r,c,2,lab,val,acc,sub); c+=2
r+=5

# table of contents
section(ws,r,LC,"WORKBOOK CONTENTS  ·  click to open"); r+=1
for nm in SHEETS[1:]:
    block(ws,r,START,r,START+2,PANEL)
    link=ws.cell(r,START,f"  ▸  {nm}")
    link.font=F(10,True,CYAN); link.alignment=LEFT
    link.hyperlink=f"#'{nm}'!A1"
    block(ws,r,START+3,r,LC,PANEL)
    d=ws.cell(r,START+3,DESC[nm]); d.font=F(9,False,MUTE); d.alignment=LEFT
    ws.row_dimensions[r].height=17; r+=1
r+=1
foot=ws.cell(r,START,f"Real-data snapshot generated {SNAPSHOT}  ·  Source: SteelBuild Pro (live Supabase database)  ·  Read-only demonstration workbook")
foot.font=F(8,True,MUTE); r+=1
foot2=ws.cell(r,START,"SteelBuild Pro is a SaaS platform for structural steel fabricators & erectors. This workbook recreates its modules, one sheet per screen.")
foot2.font=F(8,False,SLATE)
for cc in range(START,LC+1): ws.column_dimensions[get_column_letter(cc)].width=11.5
finalize(ws,LC,r+1)

# ---------------------------------------------------------------- COMMAND CENTER
ws=S("Command Center"); LC=11
banner(ws,LC,"Command Center",f"Job {proj['project_number']} · {proj['name']} · live operational rollups")
# aggregates
sub_by={}; bic={}
for s in submittals:
    sub_by[s["status"]]=sub_by.get(s["status"],0)+1
    k=s.get("ball_in_court") or "—"; bic[k]=bic.get(k,0)+1
for x in rfis:
    if str(x.get("status","")).lower()!="closed":
        k=x.get("ball_in_court") or "—"; bic[k]=bic.get(k,0)+1
cost_imp=sum(1 for x in rfis if x.get("cost_impact"))
sched_imp=sum(1 for x in rfis if x.get("schedule_impact"))
rff=sum(1 for s in submittals if str(s.get("status","")).lower()=="released for fabrication")
delayed=sum(1 for t in schedule if str(t.get("status","")).lower()=="delayed")
wp_avg=round(sum((w.get("percent_complete") or 0) for w in wps)/len(wps)) if wps else 0
r=6
section(ws,r,LC,"KEY PERFORMANCE INDICATORS"); r+=1
grid=[("Drawing Sheets",str(len(drawings)),CYAN,f"{released} released"),
      ("Drawing Sets",str(len(sets)),BLUE,f"{sum(1 for s in sets if s.get('set_approval_status')=='approved')} approved"),
      ("Submittals",str(len(submittals)),TEAL,f"{rff} released to fab"),
      ("Open RFIs",str(open_rfi),AMBER,f"{len(rfis)} total"),
      ("RFIs · Cost Impact",str(cost_imp),RED,"flagged $"),
      ("RFIs · Sched Impact",str(sched_imp),ORANGE,"flagged days"),
      ("Tons Delivered",f"{tons:,.1f}",PURPLE,f"{len(deliveries)} loads"),
      ("Schedule % Complete",f"{sched_avg}%",GREEN,f"{len(schedule)} tasks"),
      ("Work Packages",str(len(wps)),BLUE,f"{wp_avg}% avg"),
      ("Delayed Tasks",str(delayed),RED if delayed else SLATE,"need attention")]
c=START
for i,(lab,val,acc,sub) in enumerate(grid):
    kpi(ws,r,c,2,lab,val,acc,sub); c+=2
    if i==4: r+=5; c=START
r+=5

# submittal stage funnel
section(ws,r,LC,"SUBMITTAL STATUS  ·  shop-drawing workflow"); r+=1
flow=[("Submitted / In For Approval","Submitted",AMBER),
      ("Approved as Noted","Approved as Noted",TEAL),
      ("Released for Fabrication","Released for Fabrication",GREEN)]
maxc=max([sum(1 for s in submittals if s["status"]==st) for _,st,_ in flow]+[1])
for label,st,acc in flow:
    n=sum(1 for s in submittals if s["status"]==st)
    block(ws,r,START,r,START+3,PANEL); ws.cell(r,START,f"  {label}").font=F(9,True,INK)
    barw=max(1,round(n/maxc*6))
    block(ws,r,START+4,r,START+4+barw-1,acc)
    ws.cell(r,START+4+barw,f"  {n}").font=F(10,True,acc)
    ws.row_dimensions[r].height=16; r+=1
r+=1

# ball in court + exceptions side by side
# build exceptions list first
ex=[]
for s in submittals:
    if str(s.get("status","")).lower() in ("submitted","under review"):
        ex.append(("In review", f"{s['submittal_number']} {s['title']}", s.get("ball_in_court") or "—"))
for st in sets:
    if st.get("set_approval_status")=="pending_review":
        ex.append(("Set pending review", st["set_name"], "EOR"))
for x in rfis:
    if str(x.get("status","")).lower()!="closed":
        tag="Open RFI"+(" · sched" if x.get("schedule_impact") else "")
        ex.append((tag, f"{x['rfi_number']} {x['title']}", x.get("ball_in_court") or "—"))
for t in schedule:
    if str(t.get("status","")).lower()=="delayed":
        ex.append(("Delayed task", t["task_name"], t.get("phase") or "—"))
# two half-width headers on one row
hdr=r
block(ws,hdr,START,hdr,START+3,BAND); ws.cell(hdr,START,"  BALL IN COURT  (open items)").font=F(11,True,CYAN)
block(ws,hdr,START+5,hdr,LC,BAND); ws.cell(hdr,START+5,"  EXCEPTIONS  ·  what needs attention").font=F(11,True,AMBER)
ws.row_dimensions[hdr].height=20
br=hdr+1
r=br
for k,v in sorted(bic.items(), key=lambda x:-x[1]):
    block(ws,r,START,r,START+2,PANEL); ws.cell(r,START,f"  {k}").font=F(9,True,SUB)
    block(ws,r,START+3,r,START+3,PANEL); cc=ws.cell(r,START+3,v); cc.font=F(10,True,CYAN); cc.alignment=CTR
    ws.row_dimensions[r].height=15; r+=1
exrr=br
for cat,item,owner in ex[:16]:
    fc,ftc=( (AMBER,"2A1A00") if "review" in cat or "pending" in cat else (RED,"2A0606") if "Delayed" in cat or "sched" in cat else (BLUE,"06122E"))
    block(ws,exrr,START+5,exrr,START+6,fc); ws.cell(exrr,START+5,f" {cat}").font=F(8,True,ftc)
    block(ws,exrr,START+7,exrr,LC,PANEL); cc=ws.cell(exrr,START+7,f" {item}  →  {owner}"); cc.font=F(8,False,SUB); cc.alignment=LEFT
    ws.row_dimensions[exrr].height=15; exrr+=1
finalize(ws,LC,max(r,exrr)+1)

# ---------------------------------------------------------------- DETAILING HUB
ws=S("Detailing Hub"); LC=10
banner(ws,LC,"Detailing Control Center",
       "The moat — drawing sets ↔ submittals ↔ RFIs, the way the real Hub links them")
# join sets to submittals by parsing locked_reason
sub_by_num={s["submittal_number"]:s for s in submittals}
hub=[]
for st in sets:
    m=re.search(r"(S-?\d+)", st.get("locked_reason") or "")
    sm=None
    if m:
        key=m.group(1); sm=sub_by_num.get(key) or sub_by_num.get(key.replace("S","S-"))
    hub.append({
        "set_name":st["set_name"],"discipline":st["discipline"],"revision":st["revision"],
        "sheet_count":st["sheet_count"],"set_approval_status":st["set_approval_status"],
        "is_locked":st["is_locked"],
        "linked_submittal":(sm["submittal_number"] if sm else (m.group(1) if m else "")),
        "submittal_status":(sm["status"] if sm else ("" )),
        "ball_in_court":(sm["ball_in_court"] if sm else "")})
cols=[{"key":"set_name","label":"Drawing Set","width":26},
      {"key":"discipline","label":"Discipline","width":13},
      {"key":"revision","label":"Rev","width":6,"align":"center"},
      {"key":"sheet_count","label":"Sheets","width":8,"kind":"num","align":"center"},
      {"key":"set_approval_status","label":"Set Approval","width":16,"kind":"chip:set_approval"},
      {"key":"is_locked","label":"Locked","width":8,"kind":"check","align":"center"},
      {"key":"linked_submittal","label":"Submittal","width":11,"align":"center"},
      {"key":"submittal_status","label":"Submittal Status","width":20,"kind":"chip:sub_status"},
      {"key":"ball_in_court","label":"Ball in Court","width":13,"align":"center"}]
r=6; section(ws,r,LC,"SET ↔ SUBMITTAL LINKAGE  (auto-lock fires when the submittal is approved)"); r+=1
nr,_=render_table(ws,r,cols,hub,freeze=False)
r=nr+1
section(ws,r,LC,"OPEN RFIs AFFECTING DETAILING"); r+=1
openr=[x for x in rfis if str(x.get("status","")).lower()!="closed"]
rcols=[{"key":"rfi_number","label":"RFI #","width":11},
       {"key":"title","label":"Subject","width":48},
       {"key":"status","label":"Status","width":16,"kind":"chip:rfi_status"},
       {"key":"ball_in_court","label":"Ball in Court","width":13,"align":"center"},
       {"key":"schedule_impact","label":"Sched","width":7,"kind":"check","align":"center"},
       {"key":"assigned_to","label":"Assigned","width":12}]
nr,_=render_table(ws,r,rcols,openr if openr else [{"rfi_number":"—","title":"No open RFIs — all closed","status":"Closed"}],freeze=False)
finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- DRAWING SETS
ws=S("Drawing Sets"); LC=11
banner(ws,LC,"Drawing Sets",f"{len(sets)} packages · tracked at the set level, not the sheet")
cols=[{"key":"set_name","label":"Set Name","width":26},
      {"key":"discipline","label":"Discipline","width":13},
      {"key":"revision","label":"Rev","width":6,"align":"center"},
      {"key":"status","label":"Status","width":10,"kind":"chip:sub_status"},
      {"key":"set_approval_status","label":"Approval","width":16,"kind":"chip:set_approval"},
      {"key":"is_locked","label":"Locked","width":8,"kind":"check","align":"center"},
      {"key":"sheet_count","label":"Sheets","width":8,"kind":"num","align":"center"},
      {"key":"issued_date","label":"Issued","width":12,"kind":"date","align":"center"},
      {"key":"locked_reason","label":"Lock Reason","width":42}]
nr,_=render_table(ws,6,cols,sets); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- DRAWINGS
ws=S("Drawings"); LC=13
banner(ws,LC,"Drawings",f"{len(drawings)} sheets · {released} released for fabrication")
cols=[{"key":"sheet_number","label":"Sheet #","width":13},
      {"key":"title","label":"Title","width":36},
      {"key":"discipline","label":"Discipline","width":13},
      {"key":"revision_number","label":"Rev","width":6,"align":"center"},
      {"key":"stage","label":"Stage","width":12,"kind":"chip:dwg_stage"},
      {"key":"drawing_set_name","label":"Drawing Set","width":22},
      {"key":"submitted_date","label":"Submitted","width":11,"kind":"date","align":"center"},
      {"key":"return_date","label":"Returned","width":11,"kind":"date","align":"center"},
      {"key":"is_superseded","label":"Superseded","width":11,"kind":"bool","align":"center"},
      {"key":"linked_rfi_ids","label":"RFIs","width":6,"kind":"rficount","align":"center"}]
nr,_=render_table(ws,6,cols,drawings); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- SUBMITTALS
ws=S("Submittals"); LC=14
banner(ws,LC,"Submittals",
       "Shop-drawing workflow — Not Started → IFA → OFA → BFA → OFS → IFC → Released for Fab")
# stage legend
block(ws,6,START,6,LC,BAND); ws.cell(6,START,"  STAGE LEGEND").font=F(10,True,CYAN); ws.row_dimensions[6].height=18
legend=[("IFA","In For Approval"),("OFA","Out For Approval"),("BFA","Back From Approval"),
        ("OFS","Out For Scrub"),("IFC","Issued For Construction"),("R&R","Revise & Resubmit"),
        ("RFF","Released for Fabrication")]
c=START
for ab,full in legend:
    block(ws,7,c,7,c,PANEL2); ws.cell(7,c,ab).font=F(9,True,CYAN); ws.cell(7,c).alignment=CTR
    block(ws,7,c+1,7,c+1,PANEL); fc=ws.cell(7,c+1,full); fc.font=F(7,False,MUTE); fc.alignment=LEFT
    c+=2
ws.row_dimensions[7].height=16
cols=[{"key":"submittal_number","label":"Sub #","width":9},
      {"key":"title","label":"Title","width":26},
      {"key":"spec_section","label":"Spec","width":10,"align":"center"},
      {"key":"discipline","label":"Discipline","width":13},
      {"key":"revision","label":"Rev","width":6,"align":"center"},
      {"key":"round_number","label":"Rnd","width":6,"kind":"num","align":"center"},
      {"key":"status","label":"Status","width":20,"kind":"chip:sub_status"},
      {"key":"ball_in_court","label":"Ball in Court","width":12,"align":"center"},
      {"key":"reviewer","label":"Reviewer","width":18},
      {"key":"submitted_date","label":"Submitted","width":11,"kind":"date","align":"center"},
      {"key":"required_date","label":"Required","width":11,"kind":"date","align":"center"},
      {"key":"returned_date","label":"Returned","width":11,"kind":"date","align":"center"}]
nr,_=render_table(ws,9,cols,submittals); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- RFIs
ws=S("RFIs"); LC=16
banner(ws,LC,"RFIs",f"{len(rfis)} requests · {open_rfi} open · {cost_imp} cost-impact · {sched_imp} schedule-impact")
cols=[{"key":"rfi_number","label":"RFI #","width":10},
      {"key":"title","label":"Subject","width":34},
      {"key":"discipline","label":"Discipline","width":11},
      {"key":"status","label":"Status","width":17,"kind":"chip:rfi_status"},
      {"key":"priority","label":"Priority","width":9,"kind":"chip:priority"},
      {"key":"ball_in_court","label":"Ball","width":8,"align":"center"},
      {"key":"assigned_to","label":"Assigned","width":11},
      {"key":"submitted_date","label":"Submitted","width":11,"kind":"date","align":"center"},
      {"key":"date_answered","label":"Answered","width":11,"kind":"date","align":"center"},
      {"key":"cost_impact","label":"Cost","width":6,"kind":"check","align":"center"},
      {"key":"schedule_impact","label":"Sched","width":6,"kind":"check","align":"center"},
      {"key":"question","label":"Question","width":40,"kind":"wrap"},
      {"key":"answer","label":"Answer","width":40,"kind":"wrap"}]
nr,_=render_table(ws,6,cols,rfis); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- SCHEDULE
ws=S("Schedule"); LC=12
banner(ws,LC,"Schedule",f"{len(schedule)} tasks · {sched_avg}% complete · {delayed} delayed")
cols=[{"key":"wbs_code","label":"WBS","width":7,"align":"center"},
      {"key":"task_name","label":"Task","width":34},
      {"key":"task_type","label":"Type","width":12},
      {"key":"phase","label":"Phase","width":15},
      {"key":"status","label":"Status","width":13,"kind":"chip:sched_status"},
      {"key":"priority","label":"Priority","width":9,"kind":"chip:priority"},
      {"key":"percent_complete","label":"% Complete","width":14,"kind":"pct"},
      {"key":"start_date","label":"Start","width":11,"kind":"date","align":"center"},
      {"key":"end_date","label":"Finish","width":11,"kind":"date","align":"center"},
      {"key":"crew_name","label":"Crew","width":12},
      {"key":"is_milestone","label":"Milestone","width":9,"kind":"check","align":"center"}]
nr,_=render_table(ws,6,cols,schedule); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- WORK PACKAGES
ws=S("Work Packages"); LC=11
banner(ws,LC,"Work Packages",f"{len(wps)} packages · scoped by area & crew · {wp_avg}% avg complete")
cols=[{"key":"wp_number","label":"WP #","width":9,"align":"center"},
      {"key":"name","label":"Package","width":28},
      {"key":"phase","label":"Phase","width":13},
      {"key":"status","label":"Status","width":13,"kind":"chip:wp_status"},
      {"key":"percent_complete","label":"% Complete","width":14,"kind":"pct"},
      {"key":"area","label":"Area","width":15},
      {"key":"crew","label":"Crew","width":12},
      {"key":"released_date","label":"Released","width":12,"kind":"date","align":"center"},
      {"key":"scheduled_start_date","label":"Start","width":11,"kind":"date","align":"center"},
      {"key":"scheduled_end_date","label":"Finish","width":11,"kind":"date","align":"center"}]
nr,_=render_table(ws,6,cols,wps); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- DELIVERIES
ws=S("Deliveries"); LC=11
deliv_tons=sum((d.get('weight_tons') or 0) for d in deliveries)
deliv_pcs=sum((d.get('pieces') or 0) for d in deliveries)
banner(ws,LC,"Deliveries",f"{len(deliveries)} loads · {deliv_pcs:,} pieces · {deliv_tons:,.2f} tons")
cols=[{"key":"load_number","label":"Load","width":8,"align":"center"},
      {"key":"description","label":"Description","width":26},
      {"key":"vendor","label":"Vendor","width":10},
      {"key":"status","label":"Status","width":11,"kind":"chip:sub_status"},
      {"key":"priority","label":"Priority","width":9,"kind":"chip:priority"},
      {"key":"pieces","label":"Pieces","width":9,"kind":"num","align":"right"},
      {"key":"weight_tons","label":"Tons","width":9,"kind":"tons","align":"right"},
      {"key":"area","label":"Area","width":12},
      {"key":"scheduled_date","label":"Scheduled","width":12,"kind":"date","align":"center"},
      {"key":"actual_date","label":"Delivered","width":12,"kind":"date","align":"center"}]
totals={"load_number":"label","pieces":"num","weight_tons":"tons"}
nr,_=render_table(ws,6,cols,deliveries,totals=totals); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- FABRICATION
ws=S("Fabrication"); LC=10
banner(ws,LC,"Fabrication & Production",
       "Fab-release control — module structure + production rollup from the schedule")
r=6
panelfill(ws,r,START,r+2,LC,PANEL)
ws.cell(r,START,"   No fab-release records logged yet for this project.").font=F(12,True,AMBER)
ws.cell(r+1,START,"   SteelBuild Pro gates fabrication behind a server-side check (open RFIs / unapproved sets block release).").font=F(9,False,MUTE)
ws.cell(r+2,START,"   When releases are logged, each row carries: release #, work package, piece marks, piece count, tonnage, release & required dates.").font=F(9,False,MUTE)
for rr in range(r,r+3): ws.row_dimensions[rr].height=18
r+=4
# production rollup from schedule fabrication-phase tasks
section(ws,r,LC,"FABRICATION PROGRESS  ·  derived from schedule (Fabrication phase)"); r+=1
fabtasks=[t for t in schedule if str(t.get("phase","")).lower()=="fabrication"]
fcols=[{"key":"task_name","label":"Fabrication Activity","width":34},
       {"key":"status","label":"Status","width":13,"kind":"chip:sched_status"},
       {"key":"percent_complete","label":"% Complete","width":14,"kind":"pct"},
       {"key":"start_date","label":"Start","width":11,"kind":"date","align":"center"},
       {"key":"end_date","label":"Finish","width":11,"kind":"date","align":"center"}]
nr,_=render_table(ws,r,fcols,fabtasks if fabtasks else [{"task_name":"No fabrication-phase tasks","status":"Not Started"}],freeze=False)
r=nr+1
section(ws,r,LC,"SHIPPED TO DATE"); r+=1
panelfill(ws,r,START,r+2,START+2,PANEL); ws.cell(r,START,f"  {deliv_tons:,.2f}").font=F(18,True,PURPLE)
ws.cell(r+1,START,"  TONS DELIVERED").font=F(8,True,MUTE)
panelfill(ws,r,START+3,r+2,START+5,PANEL); ws.cell(r,START+3,f"  {deliv_pcs:,}").font=F(18,True,CYAN)
ws.cell(r+1,START+3,"  PIECES SHIPPED").font=F(8,True,MUTE)
panelfill(ws,r,START+6,r+2,START+8,PANEL); ws.cell(r,START+6,f"  {len([d for d in deliveries if d.get('status')=='Delivered'])}").font=F(18,True,GREEN)
ws.cell(r+1,START+6,"  LOADS DELIVERED").font=F(8,True,MUTE)
finalize(ws,LC,r+4)

# ---------------------------------------------------------------- CHANGE ORDERS
ws=S("Change Orders"); LC=10
banner(ws,LC,"Change Orders",f"{len(changes)} approved · net ${net_co:,.0f} to contract")
cols=[{"key":"co_number","label":"CO #","width":9,"align":"center"},
      {"key":"title","label":"Title","width":28},
      {"key":"status","label":"Status","width":12,"kind":"chip:co_status"},
      {"key":"co_amount","label":"Amount","width":13,"kind":"money"},
      {"key":"reason_code","label":"Reason","width":15},
      {"key":"schedule_impact_days","label":"Sched Days","width":11,"kind":"num","align":"center"},
      {"key":"submitted_date","label":"Submitted","width":12,"kind":"date","align":"center"},
      {"key":"approved_date","label":"Approved","width":12,"kind":"date","align":"center"}]
totals={"co_number":"label","co_amount":"money"}
nr,_=render_table(ws,6,cols,changes,totals=totals)
r=nr+1
section(ws,r,LC,"CHANGE NARRATIVE"); r+=1
for c_ in changes:
    block(ws,r,START,r,START+1,PANEL2); ws.cell(r,START,f" {c_['co_number']}").font=F(10,True,CYAN)
    block(ws,r,START+2,r,LC,PANEL); d=ws.cell(r,START+2,c_.get("description") or ""); d.font=F(8,False,SUB); d.alignment=WRAP
    ws.row_dimensions[r].height=42; r+=1
finalize(ws,LC,r+1)

# ---------------------------------------------------------------- FINANCIALS
ws=S("Financials"); LC=9
banner(ws,LC,"Financials",
       "Lump-sum contract value, change-order adjustments & the AIA G702/G703 pay-app structure")
r=6; section(ws,r,LC,"CONTRACT SUMMARY"); r+=1
oc=proj["original_contract_value"]; ret=proj["retainage_percent"]
# values + simple live formulas for the arithmetic
rows=[("Original Contract Value", oc, "value", GREEN),
      ("Net Approved Change Orders", net_co, "value", AMBER if net_co<0 else GREEN),
      ("Adjusted Contract Value", None, "=C{a}+C{b}", CYAN),
      (f"Retainage ({ret}%)", None, "=-C{c}*{r}", SLATE),
      ("Contract Less Retainage", None, "=C{c}+C{d}", BLUE)]
firstrow=r
addr={}
for i,(label,val,kind,acc) in enumerate(rows):
    block(ws,r,START,r,START+3,PANEL); ws.cell(r,START,f"  {label}").font=F(10,True,INK)
    block(ws,r,START+4,r,START+5,PANEL)
    cell=ws.cell(r,START+4)
    cell.font=F(11,True,acc); cell.alignment=RIGHT; cell.number_format='$#,##0;($#,##0)'
    addr[i]=r
    if kind=="value": cell.value=val
    r+=1
# wire formulas referencing the value cells (column START+4 == 'F')
colL=get_column_letter(START+4)
ws.cell(addr[2],START+4).value=f"={colL}{addr[0]}+{colL}{addr[1]}"
ws.cell(addr[3],START+4).value=f"=-{colL}{addr[2]}*{ret/100}"
ws.cell(addr[4],START+4).value=f"={colL}{addr[2]}+{colL}{addr[3]}"
r+=1
section(ws,r,LC,"AIA G702 / G703 PAY APPLICATION"); r+=1
panelfill(ws,r,START,r+1,LC,PANEL)
ws.cell(r,START,"   No pay applications submitted yet for this project.").font=F(11,True,AMBER)
ws.cell(r+1,START,"   SteelBuild Pro generates AIA G702/G703 applications from the Schedule of Values; figures use an integer-cents money model.").font=F(9,False,MUTE)
ws.row_dimensions[r].height=18; ws.row_dimensions[r+1].height=18; r+=3
g702=[("1","Original Contract Sum", oc),
      ("2","Net change by Change Orders", net_co),
      ("3","Contract Sum to Date (Line 1 ± 2)", None),
      ("4","Total Completed & Stored to Date", 0),
      ("5","Retainage", 0),
      ("6","Total Earned Less Retainage", 0),
      ("7","Less Previous Certificates for Payment", 0),
      ("8","Current Payment Due", 0),
      ("9","Balance to Finish (Line 3 less Line 6)", None)]
gr=r
for ln,label,val in g702:
    block(ws,r,START,r,START,PANEL2); ws.cell(r,START,ln).font=F(9,True,CYAN); ws.cell(r,START).alignment=CTR
    block(ws,r,START+1,r,START+5,PANEL); ws.cell(r,START+1,f" {label}").font=F(9,False,SUB)
    block(ws,r,START+6,r,START+7,BAND)
    cell=ws.cell(r,START+6); cell.font=F(9,True,INK); cell.alignment=RIGHT; cell.number_format='$#,##0;($#,##0)'
    if val is not None: cell.value=val
    r+=1
mc=get_column_letter(START+6)
ws.cell(gr+2,START+6).value=f"={mc}{gr}+{mc}{gr+1}"     # line 3
ws.cell(gr+8,START+6).value=f"={mc}{gr+2}-{mc}{gr+5}"   # line 9
finalize(ws,LC,r+1)

# ---------------------------------------------------------------- VENDORS
ws=S("Vendors"); LC=11
banner(ws,LC,"Vendors",f"{len(vendors)} subcontractors, suppliers & service providers")
cols=[{"key":"company_name","label":"Company","width":20},
      {"key":"vendor_type","label":"Type","width":15},
      {"key":"contact_person","label":"Contact","width":18},
      {"key":"title","label":"Title","width":14},
      {"key":"phone","label":"Phone","width":15},
      {"key":"email","label":"Email","width":30},
      {"key":"state","label":"State","width":7,"align":"center"},
      {"key":"is_preferred","label":"Preferred","width":10,"kind":"check","align":"center"},
      {"key":"payment_terms","label":"Terms","width":10,"align":"center"},
      {"key":"status","label":"Status","width":9,"kind":"chip:sub_status"}]
nr,_=render_table(ws,6,cols,vendors); finalize(ws,LC,nr+1)

# ---------------------------------------------------------------- ABOUT
ws=S("About"); LC=10
banner(ws,LC,"About this Workbook",
       "What SteelBuild Pro is · module map · legends · data dictionary")
r=6
para=[
 ("WHAT IS STEELBUILD PRO?",CYAN,[
   "SteelBuild Pro is a multi-tenant SaaS platform for structural-steel fabricators and erectors.",
   "It runs the full project lifecycle: drawings → submittals → RFIs → work packages → fabrication →",
   "delivery → erection, with cost, schedule and change-order control wrapped around the workflow.",
   "Its moat is the Detailing Control Center: AI revision-diff, set-level approval, and an auto-lock that",
   "releases drawing sets to fabrication the moment their submittal is approved."]),
 ("THIS WORKBOOK",GREEN,[
   f"A read-only, presentation snapshot of one real project — Job {proj['project_number']}, {proj['name']} —",
   f"pulled live from the SteelBuild Pro database on {SNAPSHOT}. Each tab recreates one app screen.",
   "Figures are a point-in-time snapshot; the live app is the system of record."]),
 ("SUBMITTAL STAGE FLOW",AMBER,[
   "Not Started → IFA (In For Approval) → OFA (Out For Approval) → BFA (Back From Approval) →",
   "OFS (Out For Scrub) → IFC (Issued For Construction) → Released for Fabrication.",
   "R&R = Revise & Resubmit.  Ball-in-court tracks who owns the next action (Detailer / EOR / GC / S&H / Owner)."]),
 ("STATUS COLOR LEGEND",PURPLE,[
   "Green = approved / released / complete / delivered.   Teal = approved as noted.",
   "Amber = in review / in progress / scheduled.   Blue = active workflow stage.",
   "Red = delayed / revise & resubmit / cost-or-schedule impact.   Gray = not started / inactive."]),
 ("DATA DICTIONARY  ·  what each tab holds",TEAL,[
   "Drawing Sets — packages tracked at set level (the unit of work), not individual sheets.",
   "Drawings — individual sheets with stage & revision; partial revision uploads keep unlisted sheets current.",
   "Submittals — the workflow authority; drawings.stage is deprecated for rollups.",
   "RFIs — drawing_reference + cost/schedule impact flags; open RFIs can gate fab release.",
   "Work Packages — released scope by area/crew; the bridge from detailing to the field.",
   "Deliveries — truckloads with piece counts & tonnage.   Change Orders — contract deltas with margin.",
   "Fabrication & Financials — module structure shown; no records logged for this project yet."]),
]
for title,acc,lines in para:
    section(ws,r,LC,title); r+=1
    for ln in lines:
        block(ws,r,START,r,LC,PANEL); ws.cell(r,START,f"   {ln}").font=F(9,False,SUB); ws.row_dimensions[r].height=15; r+=1
    r+=1
foot=ws.cell(r,START,"Generated by Claude (Anthropic) from the SteelBuild Pro Supabase database · read-only demonstration · not the system of record.")
foot.font=F(8,True,MUTE)
finalize(ws,LC,r+2)

wb.save(OUT)
print("SAVED", OUT)
for nm in SHEETS:
    wsx=wb[nm]
    print(f"  {nm:16s} dims={wsx.dimensions}")
