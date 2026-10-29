"""Private illustrative application packets; no credential templates or seals."""
import hashlib
import json
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent.parent
PLAN = json.loads((ROOT / "tmp/team-activity/plan.json").read_text(encoding="utf-8"))
OUT = ROOT / "output/pdf/team-activity"
OUT.mkdir(parents=True, exist_ok=True)
LABELS = {
    "LICENCE_FRONT": "Licence reference - front", "LICENCE_BACK": "Licence reference - reverse",
    "NBI": "Clearance reference", "OR": "Vehicle receipt reference", "CR": "Vehicle registration reference",
    "OWNER_AUTH": "Vehicle owner authorization reference", "OWNER_ID": "Vehicle owner identity reference",
    "PASSENGER_PERMIT": "Passenger permit reference", "PASSENGER_INSURANCE": "Passenger insurance reference",
}
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="PacketTitle", fontName="Helvetica-Bold", fontSize=23, leading=29, textColor=colors.HexColor("#193c34"), spaceAfter=8))
styles.add(ParagraphStyle(name="PacketBody", fontName="Helvetica", fontSize=10, leading=15, textColor=colors.HexColor("#344b43"), alignment=TA_LEFT))
styles.add(ParagraphStyle(name="PacketLabel", parent=styles["PacketBody"], fontSize=9, textColor=colors.HexColor("#60716a")))

def para(text, label=False):
    return Paragraph(escape(str(text)), styles["PacketLabel" if label else "PacketBody"])

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#dfe7e2"))
    canvas.line(44, 61, 551, 61)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#60716a"))
    canvas.drawString(44, 46, "Illustrative workflow record. Not an issued identity or government credential.")
    canvas.drawString(44, 33, "Fetch-It Staff Portal | Private application attachment")
    canvas.drawRightString(551, 33, str(doc.page))
    canvas.restoreState()

applications = {app["id"]: app for app in PLAN["applications"]}
assets = []
for item in PLAN["documents"]:
    app = applications[item["applicationId"]]
    fields = app["fields"]
    name = fields["legalName"]
    file = OUT / item["originalName"]
    if item["kind"] != "PROFILE":
        label = LABELS.get(item["kind"], item["kind"].replace("_", " ").title())
        doc = SimpleDocTemplate(str(file), pagesize=(595, 842), rightMargin=44, leftMargin=44, topMargin=44, bottomMargin=82)
        story = [Paragraph("FETCH-IT / RIDER ONBOARDING", styles["PacketLabel"]), Spacer(1, 15), Paragraph(label, styles["PacketTitle"]), Paragraph(escape(name), styles["Heading2"]), Spacer(1, 15)]
        rows = [[para("Application reference", True), para(app["id"])], [para("Applicant", True), para(name)], [para("Vehicle", True), para(f"{fields['vehicleMake']} {fields['vehicleModel']} ({fields['vehicleYear']})")], [para("Plate reference", True), para(fields["plateNumber"])], [para("Requested services", True), para(" / ".join(app["services"]))]]
        if item["kind"].startswith("LICENCE"):
            rows.extend([[para("Licence reference", True), para(fields["licenceNumber"])], [para("Declared class", True), para(fields["licenceCodes"])], [para("Validity reference", True), para(fields["licenceExpiry"])]])
        elif item["kind"] == "NBI":
            rows.append([para("Validity reference", True), para(fields["nbiExpiry"])])
        elif item["kind"] in ["OR", "CR"]:
            rows.extend([[para("Registration validity", True), para(fields["registrationExpiry"])], [para("Ownership declaration", True), para(fields["ownership"])]])
        elif item["kind"] in ["PASSENGER_PERMIT", "PASSENGER_INSURANCE"]:
            rows.extend([[para("Permit reference", True), para(fields["permitNumber"])], [para("Declared operating area", True), para(fields["operatingArea"])]])
        else:
            rows.append([para("Ownership declaration", True), para(fields["ownership"])])
        table = Table(rows, colWidths=[142, 365], hAlign="LEFT")
        table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 11), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("LINEBELOW", (0, 0), (-1, -1), .5, colors.HexColor("#e0e7e3")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f6f4"))]))
        story.extend([table, Spacer(1, 23), Paragraph("Review notes", styles["Heading3"]), para(item.get("reason", "Reference packet retained with the application checklist. Review the supplied information before recording a service decision.")), Spacer(1, 13), para("This attachment illustrates a review record. It does not establish identity, licensing, registration, insurance, or service eligibility.")])
        doc.build(story, onFirstPage=footer, onLaterPages=footer)
        reader = PdfReader(str(file))
        assert len(reader.pages) == 1, f"Unexpected page count: {file.name}"
        text = reader.pages[0].extract_text()
        assert name in text and "Not an issued identity" in text
    assert file.exists(), f"Missing profile attachment: {file.name}"
    assets.append({"id": item["id"], "file": file.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})

(ROOT / "tmp/team-activity/assets.json").write_text(json.dumps({"batch": PLAN["batch"], "documents": assets}, indent=2), encoding="utf-8")
print(json.dumps({"pdfAttachments": sum(doc["kind"] != "PROFILE" for doc in PLAN["documents"]), "profileAttachments": sum(doc["kind"] == "PROFILE" for doc in PLAN["documents"]), "allSinglePage": True, "allTextVerified": True}))
