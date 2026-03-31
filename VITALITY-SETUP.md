# Vitality ModCo Chat Widget — Setup Guide v3.0

## Files in this package

| File | What it does |
|------|-------------|
| `vitality-widget.html` | Complete chat widget + landing page preview — paste widget section into vitalitymodco.com |
| `google-sheets-script.js` | Google Apps Script — auto-logs orders, sends 8-stage branded customer emails |
| `VITALITY-SETUP.md` | This guide |

---

## How it works

1. Customer visits vitalitymodco.com and clicks the gold chat bubble
2. They ask questions — Claude answers using everything scraped from your site (pricing, process, FFL rules, etc.)
3. When ready to order, Claude walks them through **12 guided questions** (name, email, firearm, service, colors, parts, slide cut, turnaround, shipping, etc.)
4. Customer reviews a branded summary card and hits **"Submit Order Request"**
5. Order is automatically logged to your **Google Sheet** AND emailed to your team
6. Your team gets an **8-stage email system** to notify the customer at each production step

---

## Step 1 — Anthropic API Key

1. Go to **https://console.anthropic.com** and sign in (or create a free account)
2. Left sidebar → **"API Keys"** → **"Create Key"**
3. Name it `Vitality Widget` and **copy it now** — it's shown only once
4. Add a payment method under **Billing** (pay-as-you-go, no monthly fee)
   - `claude-sonnet-4-5` costs roughly **$0.003–$0.006 per customer conversation**
5. Open `vitality-widget.html`, find `VM_CONFIG`, and paste your key:
   ```js
   apiKey: "sk-ant-api03-YOUR_REAL_KEY_HERE",
   ```

---

## Step 2 — Google Sheets (auto-logs every order + emails your team)

1. Go to **https://sheets.google.com** → create a new blank spreadsheet
2. Name it `Vitality ModCo Orders`
3. Click **Extensions → Apps Script**
4. Delete all existing code in the editor
5. Paste the entire contents of `google-sheets-script.js`
6. Update the email addresses at the top:
   ```js
   const TEAM_EMAILS = [
     "orders@vitalitymodco.com",
     "manager@vitalitymodco.com",
   ];
   ```
7. Click **Save** (floppy disk icon or Ctrl+S)
8. Click **Deploy → New Deployment**
9. Set:
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
10. Click **Deploy** → authorize when prompted → copy the Web App URL
    (it looks like: `https://script.google.com/macros/s/AKfycb.../exec`)
11. Paste that URL into `vitality-widget.html`:
    ```js
    googleSheetsUrl: "https://script.google.com/macros/s/YOUR_ID/exec",
    ```

Every submitted order → new row in the sheet + instant email to your team.

---

## Step 3 — Customer Email Notifications (from your Google Sheet)

After deploying the Apps Script, open your Google Sheet and you'll see a new menu:
**📦 Vitality Order Emails**

Use it to send branded HTML emails to customers at each production stage:

| Menu Item | When to use |
|-----------|-------------|
| ✅ Resend: Order Received | Customer didn't get confirmation |
| 💰 Send: Quote Approved + Deposit | After you receive the $99 deposit |
| 🔧 Send: Disassembly & Prep | After you receive and disassemble the firearm |
| 🎨 Send: Cerakote Applied | After coating is done, during cure |
| 🔍 Send: Quality Control | Final inspection in progress |
| 🏁 Send: Ready for Pickup | Job done — customer drops by |
| 📬 Send: Ready to Ship | Job done — shipping out |
| 🚚 Send: Shipped | After handing to carrier — prompts for tracking number |
| 🔄 Refresh Row Colors | Recolor rows by status if they get out of sync |
| 📊 View Order Stats | Quick count of orders by status |

**How to use:** Click any order row in the sheet → open the menu → click the stage you want to send.

---

## Step 4 — EmailJS (optional, browser-based backup)

EmailJS lets the widget send a second email notification directly from the browser — useful as a backup if the Google Sheets script ever has downtime.

1. Go to **https://www.emailjs.com** → create free account
2. Add an **Email Service** (connect Gmail or custom email)
3. Create an **Email Template** with these variables:
   ```
   To: {{to_email}}
   Subject: New Order — {{customer_name}} — {{order_summary}}
   Body:
   New order from {{customer_name}}
   Email: {{customer_email}}
   Phone: {{customer_phone}}
   
   {{order_summary}}
   
   Submitted: {{timestamp}}
   ```
4. Copy your Service ID, Template ID, and Public Key
5. Paste into `vitality-widget.html`:
   ```js
   emailjsServiceId:  "service_xxxxxxx",
   emailjsTemplateId: "template_xxxxxxx",
   emailjsPublicKey:  "xxxxxxxxxxxxxxx",
   ```

---

## Step 5 — Add the Widget to vitalitymodco.com

### Option A: GoDaddy Website Builder (copy-paste)

1. Open `vitality-widget.html` in any text editor (Notepad, VS Code, etc.)
2. Find this comment:
   ```html
   <!-- ═══════════════════════════════════════════
        VITALITY MODCO CHAT WIDGET v3.0
        Paste everything from here to END WIDGET into your site
   ═══════════════════════════════════════════ -->
   ```
3. Copy everything from that comment down to:
   ```html
   <!-- ═══ END VITALITY WIDGET v3.0 ═══ -->
   ```
4. In GoDaddy Website Builder:
   - Open your site editor
   - Find or add an **"HTML" / "Embed Code"** block
   - Paste the widget code
   - Save and publish

### Option B: Direct HTML access

Paste the launcher button, popup div, and `<script>` block just before the closing `</body>` tag on every page where you want the widget.

---

## Customizing the Widget

Open `vitality-widget.html` and edit `VM_CONFIG` at the top of the script:

```js
const VM_CONFIG = {
  apiKey:        "sk-ant-...",                    // Your Anthropic key
  model:         "claude-sonnet-4-5",             // Model to use
  notifyEmails:  ["orders@vitalitymodco.com"],    // Who gets notified
  googleSheetsUrl: "https://script.google.com/...", // Your web app URL
  emailjsServiceId:  "...",
  emailjsTemplateId: "...",
  emailjsPublicKey:  "...",
};
```

---

## Google Sheet Columns Reference

| Column | Description |
|--------|-------------|
| Timestamp | When order was submitted |
| Order ID | Auto-generated (e.g., VM-260331-4821) |
| Full Name | Customer's name |
| Email | For your team to reply to |
| Phone | For follow-up calls |
| Firearm Type | Pistol / Rifle / Shotgun |
| Make & Model | e.g., Glock 19, AR-15 |
| Service | Package or à la carte |
| Color / Pattern | Customer's color description |
| Specific Parts | Slide, frame, barrel, etc. |
| Slide Cut | DPP / MOS / RMR / None |
| Turnaround | Standard or Priority Bench |
| Shipping Method | Drop-off / FFL / Direct ship |
| Additional Notes | Customer's extra requests |
| Status | **Auto-updated by menu:** New → Quoted → In Progress → Complete |
| Assigned To | Which team member owns it |
| Quote Amount | Final price you quote |
| Tracking # | Carrier tracking number (auto-filled when you send Shipped email) |
| Last Email Sent | What email was last sent and when |
| Internal Notes | Private team comments |

---

## Security: Protect Your API Key in Production

The widget currently calls the Anthropic API directly from the browser.
This means your API key is visible in the page source. For a live public site, use a proxy.

### Option: Cloudflare Worker (free tier — recommended)

1. Go to **https://workers.cloudflare.com** → create a free account
2. Create a new Worker and paste this code:

```js
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Only allow POST from your domain
  const origin = request.headers.get("Origin") || "";
  if (!origin.includes("vitalitymodco.com")) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.json();
  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_KEY,  // stored as Worker secret
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": origin,
    },
  });
}
```

3. In your Worker settings → **Variables** → add a secret named `ANTHROPIC_KEY` with your API key
4. Deploy the Worker — you get a URL like `https://vitality-proxy.YOUR_USERNAME.workers.dev`
5. In `vitality-widget.html`, change the API endpoint from:
   ```js
   "https://api.anthropic.com/v1/messages"
   ```
   to:
   ```js
   "https://vitality-proxy.YOUR_USERNAME.workers.dev"
   ```
   And remove the `"x-api-key"` header from the fetch call (the Worker handles it).

---

## Support & Resources

| Resource | Link |
|----------|------|
| Anthropic API docs | https://docs.claude.com |
| API console / keys | https://console.anthropic.com |
| Cloudflare Workers | https://workers.cloudflare.com |
| EmailJS | https://emailjs.com |
| Google Apps Script | https://developers.google.com/apps-script |
| Cerakote color catalog | https://cerakote.com/shop/cerakote-coating |
| Vitality ModCo | (360)-839-6679 · vitalitymodco.com |
