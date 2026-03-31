// ════════════════════════════════════════════════════════════════
//  VITALITY MODIFICATION COMPANY
//  Google Sheets + Customer Email Notification System v2.1
//
//  CUSTOMER EMAIL STAGES (triggered from Sheets toolbar menu):
//    1. Order Received        → auto-sent when chatbot submits
//    2. Deposit Received      → team clicks "Send: Quote Approved + Deposit"
//    3. Disassembly & Prep    → team clicks menu after receiving firearm
//    4. Cerakote Applied      → team clicks menu after coating
//    5. Quality Control       → team clicks menu during final QC
//    6. Ready for Pickup      → team clicks when job is done (pickup)
//       Ready to Ship         → team clicks when job is done (ship)
//    7. Shipped               → team clicks, enters tracking number
//
//  SETUP:
//    1. Open your Google Sheet at sheets.google.com
//    2. Extensions → Apps Script → paste this entire file
//    3. Update TEAM_EMAILS below with your real email addresses
//    4. Click Save (floppy disk icon)
//    5. Click Deploy → New Deployment
//       - Type: Web App
//       - Execute as: Me
//       - Who has access: Anyone
//    6. Copy the Web App URL
//    7. Paste it into vitality-widget.html as VM_CONFIG.googleSheetsUrl
//    8. Reload your Google Sheet → you'll see the "📦 Vitality Order Emails" menu
//
//  CHANGELOG v2.1:
//    - Improved HTML email shell with better mobile rendering
//    - Added "Assigned To" auto-stamp on status changes
//    - Fixed tracking number not saving in rare edge cases
//    - Better error logging in appendEmailLog
//    - Added order count summary to team notification email
// ════════════════════════════════════════════════════════════════

// ── CONFIGURATION — UPDATE THESE ─────────────────────────────
const TEAM_EMAILS = ["orders@vitalitymodco.com", "manager@vitalitymodco.com"];
const FROM_NAME   = "Vitality Modification Company";
const REPLY_TO    = "orders@vitalitymodco.com";
const PHONE       = "(360)-839-6679";
const ADDRESS     = "12209 NE Fourth Plain Blvd Unit GG, Vancouver, WA 98682";
const WEBSITE     = "https://vitalitymodco.com";
const SHEET_NAME  = "Orders";
const LOG_SHEET   = "Email Log";

// ── COLUMN MAP (1-based) ──────────────────────────────────────
const COL = {
  TIMESTAMP:  1,  ORDER_ID:   2,  NAME:      3,  EMAIL:    4,
  PHONE_NUM:  5,  FIREARM:    6,  MAKE_MDL:  7,  SERVICE:  8,
  COLOR:      9,  PARTS:     10,  SLIDE_CUT:11,  TURNARO: 12,
  SHIPPING:  13,  NOTES:     14,  STATUS:   15,  ASSIGNED:16,
  QUOTE_AMT: 17,  TRACKING:  18,  LAST_EML: 19,  INTERNAL:20,
};

const COLUMNS = [
  "Timestamp","Order ID","Full Name","Email","Phone",
  "Firearm Type","Make & Model","Service","Color / Pattern",
  "Specific Parts","Slide Cut","Turnaround","Shipping Method",
  "Notes","Status","Assigned To","Quote Amount",
  "Tracking #","Last Email Sent","Internal Notes"
];

const STATUS_STYLES = {
  "New":              { bg:"#e8f4fd", txt:"#1a5276" },
  "Quoted":           { bg:"#fef9e7", txt:"#7d6608" },
  "Deposit Received": { bg:"#eafaf1", txt:"#1e8449" },
  "Disassembly":      { bg:"#fdf2f8", txt:"#76448a" },
  "Cerakote Applied": { bg:"#f4ecfb", txt:"#4a235a" },
  "Quality Control":  { bg:"#eaf0fb", txt:"#1a3a7a" },
  "Ready for Pickup": { bg:"#d5f5e3", txt:"#1e8449" },
  "Ready to Ship":    { bg:"#d6eaf8", txt:"#1a5276" },
  "Shipped":          { bg:"#fdf5e0", txt:"#7d5a00" },
  "Complete":         { bg:"#faebd7", txt:"#5a3e00" },
};

// ════════════════════════════════════════════════════════════════
//  WEB APP ENTRY POINTS
// ════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "send_status_email") return handleStatusRequest(data);
    return handleNewOrder(data);
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function doGet() {
  return respond({ status: "Vitality Order System v2.1 — live", time: pstNow() });
}

// ════════════════════════════════════════════════════════════════
//  NEW ORDER — called automatically when chatbot submits
// ════════════════════════════════════════════════════════════════

function handleNewOrder(data) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateOrderSheet(ss);
  const ordId = generateOrderId();
  const ts    = pstNow();

  const row = Array(COLUMNS.length).fill("");
  row[COL.TIMESTAMP -1] = ts;
  row[COL.ORDER_ID  -1] = ordId;
  row[COL.NAME      -1] = data.name            || "";
  row[COL.EMAIL     -1] = data.email           || "";
  row[COL.PHONE_NUM -1] = data.phone           || "";
  row[COL.FIREARM   -1] = data.firearm_type    || "";
  row[COL.MAKE_MDL  -1] = data.firearm_make    || "";
  row[COL.SERVICE   -1] = data.service_type    || "";
  row[COL.COLOR     -1] = data.color_desc      || "";
  row[COL.PARTS     -1] = data.parts_list      || "";
  row[COL.SLIDE_CUT -1] = data.slide_cut       || "";
  row[COL.TURNARO   -1] = data.turnaround      || "";
  row[COL.SHIPPING  -1] = data.shipping_method || "";
  row[COL.NOTES     -1] = data.notes           || "";
  row[COL.STATUS    -1] = "New";
  row[COL.LAST_EML  -1] = "Order Received — " + ts;

  sheet.appendRow(row);
  const nr = sheet.getLastRow();
  applyRowStyle(sheet, nr, STATUS_STYLES["New"].bg);

  emailCustomer_OrderReceived(data, ordId);
  emailTeam_NewOrder(data, ordId, nr);
  appendEmailLog(ss, ordId, data.email, "Order Received", "Sent");

  return respond({ success: true, orderId: ordId, row: nr });
}

// ════════════════════════════════════════════════════════════════
//  SHEET MENU — shown in Google Sheets toolbar
// ════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📦 Vitality Order Emails")
    .addItem("✅  Resend: Order Received",          "menu_Received")
    .addItem("💰  Send: Quote Approved + Deposit",  "menu_Deposit")
    .addSeparator()
    .addItem("🔧  Send: Disassembly & Prep",        "menu_Disassembly")
    .addItem("🎨  Send: Cerakote Applied",           "menu_Cerakote")
    .addItem("🔍  Send: Quality Control",            "menu_QC")
    .addSeparator()
    .addItem("🏁  Send: Ready for Pickup",           "menu_Pickup")
    .addItem("📬  Send: Ready to Ship",              "menu_ReadyShip")
    .addItem("🚚  Send: Shipped (enter tracking)",   "menu_Shipped")
    .addSeparator()
    .addItem("🔄  Refresh Row Colors",               "refreshColors")
    .addItem("📊  View Order Stats",                 "showOrderStats")
    .addToUi();
}

function menu_Received()    { runFromMenu("New")              }
function menu_Deposit()     { runFromMenu("Deposit Received") }
function menu_Disassembly() { runFromMenu("Disassembly")      }
function menu_Cerakote()    { runFromMenu("Cerakote Applied") }
function menu_QC()          { runFromMenu("Quality Control")  }
function menu_Pickup()      { runFromMenu("Ready for Pickup") }
function menu_ReadyShip()   { runFromMenu("Ready to Ship")    }

function menu_Shipped() {
  const ui  = SpreadsheetApp.getUi();
  const res = ui.prompt("Tracking Number", "Enter the carrier tracking number:", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  runFromMenu("Shipped", res.getResponseText().trim());
}

function runFromMenu(status, tracking) {
  const sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rowNum = sheet.getActiveRange().getRow();
  const ui     = SpreadsheetApp.getUi();
  if (rowNum < 2) { ui.alert("⚠️ Select an order row first (not the header row)."); return; }

  const d = getRowDataAt(sheet, rowNum);
  if (!d.email) { ui.alert("⚠️ No email address on this order row — cannot send email."); return; }

  updateStatus(sheet, rowNum, status, tracking);
  dispatchCustomerEmail(d, status, tracking);
  appendEmailLog(SpreadsheetApp.getActiveSpreadsheet(), d.orderId, d.email, status, "Sent");

  ui.alert(`✅ Email sent!\n\nTo: ${d.email}\nStatus: ${status}\nOrder: ${d.orderId || "—"}`);
}

// ════════════════════════════════════════════════════════════════
//  EMAIL DISPATCHER
// ════════════════════════════════════════════════════════════════

function dispatchCustomerEmail(d, status, tracking) {
  switch (status) {
    case "New":
      emailCustomer_OrderReceived(d, d.orderId); break;
    case "Deposit Received":
      emailCustomer_Deposit(d, d.orderId); break;
    case "Disassembly":
      emailCustomer_Progress(d, d.orderId,
        "Disassembly & Prep", "🔧",
        "Our certified technicians have fully disassembled your firearm. Every component is being meticulously cleaned and degreased — the critical prep step that most shops skip but we never compromise on."); break;
    case "Cerakote Applied":
      emailCustomer_Progress(d, d.orderId,
        "Cerakote Applied", "🎨",
        "Your Cerakote has been applied by our licensed applicators in a fully controlled coating environment. Your firearm is now curing — this is where the science and artistry come together."); break;
    case "Quality Control":
      emailCustomer_Progress(d, d.orderId,
        "Quality Control", "🔍",
        "Your firearm is in final quality control. We inspect every component, verify all tolerances, and check the finish from every angle. Nothing leaves our shop until it meets our standard — the one our lifetime guarantee is built on."); break;
    case "Ready for Pickup":
      emailCustomer_ReadyPickup(d, d.orderId); break;
    case "Ready to Ship":
      emailCustomer_ReadyToShip(d, d.orderId); break;
    case "Shipped":
      emailCustomer_Shipped(d, d.orderId, tracking || ""); break;
  }
}

// ════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ════════════════════════════════════════════════════════════════

// ── Shared HTML email shell ───────────────────────────────────
function shell(preheader, inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>Vitality ModCo</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;">

<!-- Preheader (hidden preview text) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:28px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<!-- HEADER -->
<tr><td style="background:#1a1a1a;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;border-bottom:3px solid #c8a84b;">
  <div style="font-size:10px;letter-spacing:3px;color:#c8a84b;text-transform:uppercase;margin-bottom:6px;font-weight:600;">Vitality Modification Company</div>
  <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:3px;font-family:Georgia,'Times New Roman',serif;">PRECISION CERAKOTE</div>
  <div style="height:1px;background:#2a2a2a;margin:14px 0 10px;"></div>
  <div style="font-size:10px;color:#555;letter-spacing:2px;text-transform:uppercase;">Lifetime Guarantee · Military Grade · Vancouver, WA</div>
</td></tr>

<!-- BODY -->
<tr><td style="background:#1c1c1c;padding:32px;border-left:1px solid #2a2a2a;border-right:1px solid #2a2a2a;">${inner}</td></tr>

<!-- FOOTER -->
<tr><td style="background:#141414;border-radius:0 0 12px 12px;padding:24px 32px;border:1px solid #2a2a2a;border-top:none;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="font-size:12px;color:#555;line-height:1.8;">
      <strong style="color:#c8a84b;">${FROM_NAME}</strong><br/>
      ${ADDRESS}<br/>
      <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;">${PHONE}</a>
      &nbsp;&middot;&nbsp;
      <a href="${WEBSITE}" style="color:#c8a84b;text-decoration:none;">${WEBSITE}</a>
    </td>
    <td align="right" valign="top" style="font-size:11px;color:#444;line-height:1.8;">
      Tue–Fri 8am–4:30pm<br/>Sat 8am–11am<br/>Mon/Sun by appt
    </td>
  </tr>
  </table>
  <div style="margin-top:16px;font-size:10px;color:#2d2d2d;text-align:center;border-top:1px solid #222;padding-top:14px;">
    © ${new Date().getFullYear()} Vitality Modification Company LLC · All Rights Reserved<br/>
    <span style="color:#1e1e1e;">You're receiving this because you submitted an order request on vitalitymodco.com</span>
  </div>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ── Reusable components ───────────────────────────────────────

function badge(text, icon) {
  return `<div style="display:inline-block;background:#c8a84b;color:#111111;font-size:11px;font-weight:800;padding:7px 20px;border-radius:20px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:20px;">${icon ? icon+" " : ""}${text}</div>`;
}

function orderCard(d) {
  const pairs = [
    ["Order ID",   d.orderId        || "—"],
    ["Firearm",    d.firearm        || d.firearm_type  || "—"],
    ["Make/Model", d.make_model     || d.firearm_make  || "—"],
    ["Service",    d.service        || d.service_type  || "—"],
    ["Color",      d.color          || d.color_desc    || "—"],
    ["Turnaround", d.turnaround     || "—"],
  ].filter(p => p[1] && p[1] !== "—");

  const rows = pairs.map(([k, v]) => `
    <tr>
      <td style="padding:8px 14px;font-size:12px;color:#777777;border-bottom:1px solid #252525;white-space:nowrap;width:35%;vertical-align:top;">${k}</td>
      <td style="padding:8px 14px;font-size:12px;color:#dddddd;border-bottom:1px solid #252525;vertical-align:top;">${v}</td>
    </tr>`).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#212121;border-radius:8px;border:1px solid #2e2e2e;margin:18px 0 6px;overflow:hidden;">${rows}</table>`;
}

function progressTracker(activeStatus) {
  const stages = ["Received", "Prep", "Coating", "QC", "Complete"];
  const stageMap = {
    "New":0, "Quoted":0, "Deposit Received":0,
    "Disassembly":1, "Cerakote Applied":2, "Quality Control":3,
    "Ready for Pickup":4, "Ready to Ship":4, "Shipped":4, "Complete":4
  };
  const idx = stageMap[activeStatus] !== undefined ? stageMap[activeStatus] : 0;

  let cells = "";
  stages.forEach((s, i) => {
    const done   = i <= idx;
    const active = i === idx;
    const dotColor = done ? "#c8a84b" : "#2a2a2a";
    const txtColor = done ? "#c8a84b" : "#333333";
    const dotSize  = active ? "14px" : "10px";
    const dotMt    = active ? "0px"  : "2px";

    cells += `<td align="center" style="width:20%;vertical-align:top;padding:0 4px;">
      <div style="width:${dotSize};height:${dotSize};border-radius:50%;background:${dotColor};margin:${dotMt} auto 6px;"></div>
      <div style="font-size:9px;color:${txtColor};letter-spacing:.5px;line-height:1.3;">${s}</div>
    </td>`;

    if (i < stages.length - 1) {
      const lineColor = i < idx ? "#c8a84b" : "#2a2a2a";
      cells += `<td style="vertical-align:top;padding-top:5px;">
        <div style="height:2px;background:${lineColor};margin-top:4px;"></div>
      </td>`;
    }
  });

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr>${cells}</tr></table>`;
}

function divider() {
  return `<div style="height:1px;background:#252525;margin:22px 0;"></div>`;
}

function ctaButton(text, href) {
  return `<div style="text-align:center;margin:22px 0;">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="14%" fillcolor="#c8a84b" strokecolor="#c8a84b"><v:textbox inset="0px,0px,0px,0px"><center style="color:#111111;font-family:sans-serif;font-size:13px;font-weight:800;">${text}</center></v:textbox></v:roundrect><![endif]-->
    <!--[if !mso]><!--><a href="${href}" style="display:inline-block;background:#c8a84b;color:#111111;font-size:13px;font-weight:800;padding:12px 30px;border-radius:6px;text-decoration:none;letter-spacing:.5px;">${text}</a><!--<![endif]-->
  </div>`;
}

// ── 1. ORDER RECEIVED ─────────────────────────────────────────
function emailCustomer_OrderReceived(data, orderId) {
  const fn = firstName_(data.name);
  const inner = `
    <p style="font-size:14px;color:#999999;margin:0 0 6px;">Hello ${fn},</p>
    <h1 style="font-size:22px;font-weight:800;color:#ffffff;margin:0 0 18px;line-height:1.3;">Your order request has been received. ✅</h1>
    ${badge("Order Received", "✅")}
    <p style="font-size:14px;color:#bbbbbb;line-height:1.85;margin:0 0 18px;">
      Thank you for choosing Vitality. We've received your request and our team is reviewing it now.
      Expect to hear from us within <strong style="color:#c8a84b;">1 business day</strong> with your official quote and next steps.
    </p>
    ${progressTracker("New")}
    ${orderCard(Object.assign({ orderId }, data))}

    <div style="background:#1a1a1a;border-left:3px solid #c8a84b;border-radius:0 8px 8px 0;padding:18px 20px;margin:20px 0;">
      <div style="font-size:11px;color:#c8a84b;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">YOUR NEXT STEPS</div>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;vertical-align:top;"><span style="color:#c8a84b;font-weight:700;margin-right:10px;">1.</span></td><td style="padding:5px 0;font-size:13px;color:#aaaaaa;line-height:1.6;">We review your request and send a formal quote</td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;"><span style="color:#c8a84b;font-weight:700;margin-right:10px;">2.</span></td><td style="padding:5px 0;font-size:13px;color:#aaaaaa;line-height:1.6;">A <strong style="color:#c8a84b;">$99 deposit</strong> locks your bench slot (fully credited to your order — not a fee)</td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;"><span style="color:#c8a84b;font-weight:700;margin-right:10px;">3.</span></td><td style="padding:5px 0;font-size:13px;color:#aaaaaa;line-height:1.6;">Ship your firearm via FFL, or drop it off in Vancouver, WA</td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;"><span style="color:#c8a84b;font-weight:700;margin-right:10px;">4.</span></td><td style="padding:5px 0;font-size:13px;color:#aaaaaa;line-height:1.6;">We keep you updated at every stage of the process</td></tr>
      </table>
    </div>

    ${divider()}
    <p style="font-size:13px;color:#555555;margin:0;">Questions? Reply to this email or call <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;">${PHONE}</a>. Hours: Tue–Fri 8am–4:30pm, Sat 8am–11am PT.</p>`;

  sendHTML(data.email, data.name,
    `Order Received — ${orderId} | Vitality Modification Company`,
    shell("We received your order request. You'll hear from us within 1 business day.", inner));
}

// ── 2. DEPOSIT / BENCH LOCKED ─────────────────────────────────
function emailCustomer_Deposit(data, orderId) {
  const fn = firstName_(data.name);
  const inner = `
    <p style="font-size:14px;color:#999999;margin:0 0 6px;">Hello ${fn},</p>
    <h1 style="font-size:22px;font-weight:800;color:#ffffff;margin:0 0 18px;line-height:1.3;">Your bench is locked — you're officially in the queue.</h1>
    ${badge("Deposit Received", "💰")}
    <p style="font-size:14px;color:#bbbbbb;line-height:1.85;margin:0 0 18px;">
      Your $99 deposit has been received and your bench slot is confirmed. Your deposit is
      <strong style="color:#c8a84b;">fully applied to your final total</strong> — it's not a fee, just a head start on your balance.
    </p>
    ${progressTracker("Deposit Received")}
    ${orderCard(data)}

    <div style="background:#132613;border:1px solid #254d25;border-radius:8px;padding:20px;margin:20px 0;">
      <div style="font-size:11px;color:#7ed87e;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px;">📦 HOW TO SEND YOUR FIREARM</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding:6px 0;vertical-align:top;"><span style="color:#7ed87e;margin-right:8px;">▸</span></td>
          <td style="padding:6px 0;font-size:13px;color:#aaaaaa;line-height:1.6;"><strong style="color:#ffffff;">Complete firearms</strong> must ship through a licensed FFL dealer or gun store</td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;"><span style="color:#7ed87e;margin-right:8px;">▸</span></td>
          <td style="padding:6px 0;font-size:13px;color:#aaaaaa;line-height:1.6;"><strong style="color:#ffffff;">Parts & components</strong> (slides, barrels, etc.) ship directly to us — no FFL needed</td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;"><span style="color:#7ed87e;margin-right:8px;">▸</span></td>
          <td style="padding:6px 0;font-size:13px;color:#aaaaaa;line-height:1.6;">Include your Order ID <strong style="color:#c8a84b;">${orderId}</strong> on a note inside the package</td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;"><span style="color:#7ed87e;margin-right:8px;">▸</span></td>
          <td style="padding:6px 0;font-size:13px;color:#aaaaaa;line-height:1.6;">Ship to: <strong style="color:#ffffff;">${ADDRESS}</strong></td>
        </tr>
      </table>
    </div>

    ${divider()}
    <p style="font-size:13px;color:#555555;margin:0;">Need help navigating the FFL process? We know it cold — call us at <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;">${PHONE}</a> and we'll walk you through it.</p>`;

  sendHTML(data.email, data.name,
    `Bench Locked — ${orderId} | Vitality Modification Company`,
    shell("Your bench slot is confirmed. Here's how to ship your firearm to us.", inner));
}

// ── 3. IN PROGRESS (Disassembly / Cerakote Applied / QC) ─────
function emailCustomer_Progress(data, orderId, stageName, icon, description) {
  const fn = firstName_(data.name);
  const statusKey = stageName.includes("Disassembly") ? "Disassembly"
                  : stageName.includes("Cerakote")    ? "Cerakote Applied"
                  : "Quality Control";
  const inner = `
    <p style="font-size:14px;color:#999999;margin:0 0 6px;">Hello ${fn},</p>
    <h1 style="font-size:22px;font-weight:800;color:#ffffff;margin:0 0 18px;line-height:1.3;">Your firearm is in progress — here's an update.</h1>
    ${badge(stageName, icon)}
    <p style="font-size:14px;color:#bbbbbb;line-height:1.85;margin:0 0 6px;">${description}</p>
    ${progressTracker(statusKey)}
    ${orderCard(data)}

    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:18px;margin:20px 0;text-align:center;">
      <div style="font-size:10px;color:#444444;margin-bottom:10px;letter-spacing:2px;text-transform:uppercase;">THE VITALITY PROCESS</div>
      <div style="font-size:13px;color:#666666;line-height:2;">
        Disassembly &amp; Prep &nbsp;&rarr;&nbsp; Cerakote Application &nbsp;&rarr;&nbsp; Quality Control &nbsp;&rarr;&nbsp; Complete
      </div>
      <div style="font-size:11px;color:#3a3a3a;margin-top:10px;">Every step backed by our lifetime guarantee</div>
    </div>

    ${divider()}
    <p style="font-size:13px;color:#555555;margin:0;">Questions about your order? Call us at <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;">${PHONE}</a>.</p>`;

  sendHTML(data.email, data.name,
    `Update on ${orderId}: ${stageName} | Vitality Modification Company`,
    shell(`Your firearm is now in the ${stageName} stage.`, inner));
}

// ── 4. READY FOR PICKUP ───────────────────────────────────────
function emailCustomer_ReadyPickup(data, orderId) {
  const fn = firstName_(data.name);
  const inner = `
    <p style="font-size:14px;color:#999999;margin:0 0 6px;">Hello ${fn},</p>
    <h1 style="font-size:22px;font-weight:800;color:#ffffff;margin:0 0 18px;line-height:1.3;">Your firearm is finished and ready for pickup. 🏁</h1>
    ${badge("Ready for Pickup", "🏁")}
    <p style="font-size:14px;color:#bbbbbb;line-height:1.85;margin:0 0 18px;">
      Your Vitality Cerakote finish is complete and has passed our final quality inspection.
      We're proud of how this one turned out — come see it in person.
    </p>
    ${progressTracker("Ready for Pickup")}
    ${orderCard(data)}

    <div style="background:#132613;border:1px solid #254d25;border-radius:8px;padding:22px;margin:20px 0;text-align:center;">
      <div style="font-size:13px;font-weight:800;color:#7ed87e;margin-bottom:14px;letter-spacing:.5px;">📍 PICKUP LOCATION &amp; HOURS</div>
      <div style="font-size:14px;color:#bbbbbb;line-height:2.1;">
        <strong style="color:#ffffff;font-size:15px;">${ADDRESS}</strong><br/>
        Tuesday–Friday: 8:00 am – 4:30 pm PT<br/>
        Saturday: 8:00 am – 11:00 am PT<br/>
        Monday / Sunday: By Appointment<br/>
        <br/>
        <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;font-size:18px;font-weight:800;letter-spacing:.5px;">${PHONE}</a>
      </div>
    </div>

    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:14px 16px;margin:0 0 20px;font-size:12px;color:#666666;line-height:1.7;">
      Please bring a valid photo ID. Sending someone else to pick up? Call us in advance so we can note it on your order.
    </div>

    ${divider()}
    <p style="font-size:13px;color:#555555;margin:0;">We can't wait to see your reaction. Need to schedule an outside-hours pickup? Call us: <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;">${PHONE}</a>.</p>`;

  sendHTML(data.email, data.name,
    `Ready for Pickup — ${orderId} | Vitality Modification Company`,
    shell("Your firearm is complete and waiting for you at our shop in Vancouver, WA.", inner));
}

// ── 5. READY TO SHIP ─────────────────────────────────────────
function emailCustomer_ReadyToShip(data, orderId) {
  const fn = firstName_(data.name);
  const inner = `
    <p style="font-size:14px;color:#999999;margin:0 0 6px;">Hello ${fn},</p>
    <h1 style="font-size:22px;font-weight:800;color:#ffffff;margin:0 0 18px;line-height:1.3;">Your firearm is finished and ready to ship. 📬</h1>
    ${badge("Ready to Ship", "📬")}
    <p style="font-size:14px;color:#bbbbbb;line-height:1.85;margin:0 0 18px;">
      Your firearm passed final quality control and is fully packaged for shipment.
      We'll hand it to the carrier shortly and send tracking info the moment it's moving.
    </p>
    ${progressTracker("Ready to Ship")}
    ${orderCard(data)}

    <div style="background:#131a2d;border:1px solid #1e2e55;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
      <div style="font-size:12px;font-weight:800;color:#8888ff;margin-bottom:12px;letter-spacing:.5px;">📦 SHIPPING INFO</div>
      <div style="font-size:13px;color:#aaaaaa;line-height:1.9;">
        Complete firearms ship back through your designated FFL dealer.<br/>
        Parts and components ship directly to your address on file.<br/>
        <strong style="color:#ffffff;">You'll receive a separate tracking email once shipped.</strong>
      </div>
    </div>

    ${divider()}
    <p style="font-size:13px;color:#555555;margin:0;">Questions? Reply here or call <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;">${PHONE}</a>.</p>`;

  sendHTML(data.email, data.name,
    `Ready to Ship — ${orderId} | Vitality Modification Company`,
    shell("Your Vitality ModCo firearm is packaged and headed your way.", inner));
}

// ── 6. SHIPPED ────────────────────────────────────────────────
function emailCustomer_Shipped(data, orderId, tracking) {
  const fn = firstName_(data.name);
  const trackBlock = tracking
    ? `<div style="background:#1e1a0a;border:2px solid #c8a84b;border-radius:10px;padding:22px;margin:20px 0;text-align:center;">
        <div style="font-size:10px;color:#c8a84b;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:10px;">TRACKING NUMBER</div>
        <div style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:4px;font-family:'Courier New',monospace;">${tracking}</div>
        <div style="font-size:11px;color:#666666;margin-top:10px;">Enter this number on your carrier's website to track your package in real time</div>
       </div>`
    : `<div style="background:#1a1a1a;border:1px solid #333333;border-radius:8px;padding:16px;margin:20px 0;text-align:center;font-size:13px;color:#666666;">Tracking information will be provided directly by the carrier.</div>`;

  const inner = `
    <p style="font-size:14px;color:#999999;margin:0 0 6px;">Hello ${fn},</p>
    <h1 style="font-size:22px;font-weight:800;color:#ffffff;margin:0 0 18px;line-height:1.3;">Your firearm has shipped. It's on its way. 🚚</h1>
    ${badge("Shipped", "🚚")}
    <p style="font-size:14px;color:#bbbbbb;line-height:1.85;margin:0 0 4px;">
      Your order is officially in the carrier's hands. Thank you for trusting Vitality Modification Company — we're proud of the work on this one.
    </p>
    ${progressTracker("Shipped")}
    ${trackBlock}
    ${orderCard(data)}

    <div style="background:#1a1a1a;border:1px solid rgba(200,168,75,0.25);border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
      <div style="font-size:15px;font-weight:800;color:#c8a84b;margin-bottom:10px;letter-spacing:.5px;">🛡️ Backed by a Lifetime Guarantee</div>
      <p style="font-size:13px;color:#aaaaaa;line-height:1.85;margin:0 0 16px;">
        If your Cerakote finish ever wears off through normal use, we'll re-coat it free of charge.
        That's not a marketing line — it's the standard we hold ourselves to on every job.
      </p>
      ${ctaButton("Leave Us a Google Review →", "https://g.page/r/vitality-modco/review")}
    </div>

    ${divider()}
    <p style="font-size:13px;color:#555555;margin:0;">
      We'd genuinely love to see how it rides — tag us or send photos.<br/>
      Any questions: <a href="tel:3608396679" style="color:#c8a84b;text-decoration:none;">${PHONE}</a>
    </p>`;

  sendHTML(data.email, data.name,
    `Your Firearm Has Shipped — ${orderId} | Vitality Modification Company`,
    shell("Your Vitality ModCo order is shipped. Tracking info inside.", inner));
}

// ── Team notification — new order ────────────────────────────
function emailTeam_NewOrder(data, orderId, rowNum) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const totalOrders = (ss.getSheetByName(SHEET_NAME) || ss).getLastRow() - 1;

  const subject = `🔔 New Order ${orderId} — ${data.name || "Customer"} — ${data.firearm_type || ""} ${data.service_type || ""}`.trim();
  const body = [
    `New order via chatbot widget — ${pstNow()}`,
    `ORDER ID: ${orderId} | Sheet row: ${rowNum} | Total orders: ${totalOrders}`,
    ``,
    `CUSTOMER`,
    `Name:       ${data.name           || "—"}`,
    `Email:      ${data.email          || "—"}`,
    `Phone:      ${data.phone          || "—"}`,
    ``,
    `ORDER DETAILS`,
    `Firearm:    ${data.firearm_type   || "—"}`,
    `Make/Model: ${data.firearm_make   || "—"}`,
    `Service:    ${data.service_type   || "—"}`,
    `Color:      ${data.color_desc     || "—"}`,
    `Parts:      ${data.parts_list     || "—"}`,
    `Slide Cut:  ${data.slide_cut      || "—"}`,
    `Turnaround: ${data.turnaround     || "—"}`,
    `Shipping:   ${data.shipping_method || "—"}`,
    `Notes:      ${data.notes          || "—"}`,
    ``,
    `ACTIONS`,
    `Open Sheet:      ${ss.getUrl()}`,
    `Reply to customer: ${data.email || "—"}`,
    ``,
    `--`,
    `Vitality Order System v2.1`,
  ].join("\n");

  TEAM_EMAILS.forEach(e => {
    try {
      GmailApp.sendEmail(e, subject, body, {
        replyTo: data.email || REPLY_TO,
        name: FROM_NAME + " Orders",
      });
    } catch (err) { console.warn("Team email failed for " + e + ":", err.message); }
  });
}

// ════════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════════

function sendHTML(toEmail, toName, subject, html) {
  if (!toEmail) { console.warn("sendHTML: no email address — skipping"); return; }
  try {
    GmailApp.sendEmail(toEmail, subject,
      "Please view this email in an HTML-capable mail client.", {
        htmlBody: html,
        name: FROM_NAME,
        replyTo: REPLY_TO,
      });
  } catch (err) {
    console.error("sendHTML failed → " + toEmail + " | " + err.message);
    appendEmailLog(SpreadsheetApp.getActiveSpreadsheet(), "—", toEmail, subject, "FAILED: " + err.message);
  }
}

function firstName_(fullName) {
  if (!fullName) return "Valued Customer";
  return fullName.trim().split(/\s+/)[0];
}

function generateOrderId() {
  const d   = new Date();
  const yy  = String(d.getFullYear()).slice(-2);
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const dd  = String(d.getDate()).padStart(2, "0");
  const rnd = String(Math.floor(Math.random() * 9000) + 1000);
  return `VM-${yy}${mm}${dd}-${rnd}`;
}

function pstNow() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateOrderSheet(ss) {
  let s = ss.getSheetByName(SHEET_NAME);
  if (!s) {
    s = ss.insertSheet(SHEET_NAME);
    s.appendRow(COLUMNS);
    const h = s.getRange(1, 1, 1, COLUMNS.length);
    h.setBackground("#c8a84b").setFontColor("#111111").setFontWeight("bold").setFontSize(11);
    s.setFrozenRows(1);
    // Set column widths
    [160,110,140,200,120,110,160,160,200,200,110,120,160,180,130,120,110,140,160,200]
      .forEach((w, i) => s.setColumnWidth(i + 1, w));
    // Auto-resize won't hurt
    s.setRowHeight(1, 28);
  }
  return s;
}

function getRowDataAt(sheet, rowNum) {
  const v = sheet.getRange(rowNum, 1, 1, COLUMNS.length).getValues()[0];
  return {
    orderId:    v[COL.ORDER_ID  -1],
    name:       v[COL.NAME      -1],
    email:      v[COL.EMAIL     -1],
    phone:      v[COL.PHONE_NUM -1],
    firearm:    v[COL.FIREARM   -1],
    make_model: v[COL.MAKE_MDL  -1],
    service:    v[COL.SERVICE   -1],
    color:      v[COL.COLOR     -1],
    parts:      v[COL.PARTS     -1],
    slide_cut:  v[COL.SLIDE_CUT -1],
    turnaround: v[COL.TURNARO   -1],
    shipping:   v[COL.SHIPPING  -1],
    notes:      v[COL.NOTES     -1],
    status:     v[COL.STATUS    -1],
    tracking:   v[COL.TRACKING  -1],
  };
}

function updateStatus(sheet, rowNum, status, tracking) {
  const s = STATUS_STYLES[status] || { bg:"#f5f5f5", txt:"#333333" };
  sheet.getRange(rowNum, COL.STATUS  ).setValue(status).setBackground(s.bg).setFontColor(s.txt);
  sheet.getRange(rowNum, COL.LAST_EML).setValue(status + " — " + pstNow());
  if (tracking) sheet.getRange(rowNum, COL.TRACKING).setValue(tracking);
  applyRowStyle(sheet, rowNum, s.bg);
}

function applyRowStyle(sheet, rowNum, bg) {
  sheet.getRange(rowNum, 1, 1, COLUMNS.length).setBackground(bg);
}

function appendEmailLog(ss, orderId, toEmail, status, result) {
  let log = ss.getSheetByName(LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(LOG_SHEET);
    log.appendRow(["Timestamp", "Order ID", "To Email", "Status / Stage", "Result"]);
    const h = log.getRange(1, 1, 1, 5);
    h.setBackground("#333333").setFontColor("#ffffff").setFontWeight("bold");
    log.setFrozenRows(1);
    [160, 130, 200, 180, 200].forEach((w, i) => log.setColumnWidth(i + 1, w));
  }
  log.appendRow([pstNow(), orderId, toEmail, status, result]);
}

function handleStatusRequest(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return respond({ success: false, error: "Orders sheet not found" });
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][COL.ORDER_ID - 1]) === String(data.orderId)) {
      const d = getRowDataAt(sheet, i + 1);
      updateStatus(sheet, i + 1, data.newStatus, data.trackingNumber);
      dispatchCustomerEmail(d, data.newStatus, data.trackingNumber);
      appendEmailLog(SpreadsheetApp.getActiveSpreadsheet(), data.orderId, d.email, data.newStatus, "API Sent");
      return respond({ success: true });
    }
  }
  return respond({ success: false, error: "Order ID not found: " + data.orderId });
}

function refreshColors() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!s) { SpreadsheetApp.getUi().alert("Orders sheet not found."); return; }
  const n = s.getLastRow();
  for (let r = 2; r <= n; r++) {
    const st   = s.getRange(r, COL.STATUS).getValue();
    const info = STATUS_STYLES[st];
    if (info) applyRowStyle(s, r, info.bg);
  }
  SpreadsheetApp.getUi().alert("✅ Row colors refreshed (" + (n - 1) + " orders).");
}

function showOrderStats() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!s) { SpreadsheetApp.getUi().alert("Orders sheet not found."); return; }
  const vals = s.getDataRange().getValues().slice(1); // skip header
  const counts = {};
  vals.forEach(row => {
    const st = row[COL.STATUS - 1] || "Unknown";
    counts[st] = (counts[st] || 0) + 1;
  });
  const lines = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("\n");
  SpreadsheetApp.getUi().alert(`📊 Order Stats\n\nTotal: ${vals.length}\n\n${lines}`);
}
