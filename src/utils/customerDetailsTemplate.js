import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedLogoBase64 = null;
const getLogoBase64 = () => {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const logoPath = path.join(__dirname, "..", "logo", "invoice_logo.png");
    if (fs.existsSync(logoPath)) {
      cachedLogoBase64 = Buffer.from(fs.readFileSync(logoPath)).toString(
        "base64",
      );
      return cachedLogoBase64;
    }
  } catch {
    // optional logo
  }
  return null;
};

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

const formatCurrency = (amount, currency = "INR") => {
  const value = Number(amount || 0);
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const statusBadge = (status) => {
  const normalized = String(status || "").toUpperCase();
  const cls =
    normalized === "SUCCESS"
      ? "badge-success"
      : normalized === "PENDING"
        ? "badge-pending"
        : normalized === "FAILED"
          ? "badge-failed"
          : "badge-neutral";
  return `<span class="badge ${cls}">${esc(status || "—")}</span>`;
};

/**
 * Premium multi-page customer dossier HTML (Puppeteer → PDF).
 * Content height is dynamic; PDF uses A4 with automatic page breaks.
 */
export const generateCustomerDetailsHTML = (data) => {
  // console.log(data)
  const {
    customer = {},
    currentPlan = null,
    payments = [],
    documents = [],
    generatedAt = new Date(),
    paymentsTruncated = false,
    maxPayments,
  } = data;

  const fullName = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = fullName || customer.userName || "Customer";
  const installParts = [
    customer.installationAddress?.line2,
    customer.installationAddress?.city,
    customer.installationAddress?.state,
    customer.installationAddress?.country,
  ].filter(Boolean);
  const installPin = customer.installationAddress?.pin;
  const installAddress =
    installParts.length > 0
      ? installParts.join(", ") + (installPin ? ` - ${installPin}` : "")
      : "—";

  const logoBase64 = getLogoBase64();
  const logoHtml = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" alt="Activline" class="logo-img" />`
    : `<span class="logo-text">activline</span>`;

  const planName =
    currentPlan?.planName ||
    customer.userType ||
    customer.planName ||
    "No active plan";
  const planAmount = currentPlan
    ? formatCurrency(currentPlan.amount, currentPlan.currency)
    : "—";
  const planPaidAt = currentPlan
    ? formatDate(currentPlan.paidAt || currentPlan.createdAt)
    : "—";
  const planEndDate = currentPlan ? formatDate(currentPlan.planEndDate) : "—";

  const paymentRows =
    payments.length > 0
      ? payments
          .map(
            (row, idx) => `
        <tr>
          <td class="col-num">${idx + 1}</td>
          <td>
            <strong>${esc(row.planName || "—")}</strong>
            <span class="sub">Profile: ${esc(row.profileId || "—")}</span>
          </td>
          <td class="col-amount">${formatCurrency(row.amount, row.currency)}</td>
          <td class="col-status">${statusBadge(row.status)}</td>
          <td class="col-date">${formatDate(row.paidAt || row.createdAt)}</td>
          <td class="col-mono">${esc(row.orderId || row.razorpayPaymentId || "—")}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="empty-row">No payment history found.</td></tr>`;

  const imageDocs = documents.filter((doc) => doc.dataUri);
  const nonImageDocs = documents.filter((doc) => !doc.dataUri);

  const nonImageBlocks =
    nonImageDocs.length > 0
      ? nonImageDocs
          .map(
            (doc) => `
              <div class="doc-card doc-card-muted">
                <span class="doc-label">${esc(doc.label)}</span>
                <span class="doc-placeholder">Non-image file — not embedded</span>
                ${doc.url ? `<span class="doc-url">${esc(doc.url)}</span>` : ""}
              </div>`,
          )
          .join("")
      : "";

  const imageBlocks =
    imageDocs.length > 0
      ? imageDocs
          .map(
            (doc) => `
    <div class="doc-page-wrapper">
      <h2 class="section-title">Document: ${esc(doc.label)}</h2>
      <img src="${doc.dataUri}" alt="${esc(doc.label)}" class="doc-image-full" />
    </div>`,
          )
          .join("")
      : "";

  const successCount = payments.filter(
    (p) => String(p.status).toUpperCase() === "SUCCESS",
  ).length;
  const totalPaid = payments
    .filter((p) => String(p.status).toUpperCase() === "SUCCESS")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const truncatedNote = paymentsTruncated
    ? `<p class="truncate-note">Showing latest ${maxPayments} payments. Additional records exist in the system.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Customer Details — ${esc(displayName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 14mm 12mm; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Roboto', Arial, sans-serif;
      color: #1f2937;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .wrap { width: 100%; max-width: 820px; margin: 0 auto; padding: 8px 4px 32px; }
    .hero {
      background: linear-gradient(135deg, #5b21b6 0%, #7c3aed 45%, #a855f7 100%);
      border-radius: 16px;
      padding: 22px 24px;
      color: #fff;
      position: relative;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .hero::after {
      content: '';
      position: absolute;
      right: -30px;
      top: -30px;
      width: 140px;
      height: 140px;
      background: rgba(255,255,255,0.12);
      border-radius: 50%;
    }
    .hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; position: relative; z-index: 1; }
    .logo-img { height: 44px; object-fit: contain; filter: brightness(0) invert(1); }
    .logo-text { font-size: 28px; font-weight: 900; letter-spacing: -0.04em; }
    .hero h1 { margin: 12px 0 4px; font-size: 26px; font-weight: 900; }
    .hero .meta { font-size: 11px; opacity: 0.9; margin: 0; }
    .status-pill {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.35);
    }
    .section { margin-bottom: 18px; break-inside: avoid-page; }
    .section-title {
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6d28d9;
      margin: 0 0 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::before {
      content: '';
      width: 4px;
      height: 16px;
      background: linear-gradient(180deg, #7c3aed, #ec4899);
      border-radius: 4px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 4px 14px rgba(124, 58, 237, 0.06);
    }
    .card-head {
      background: linear-gradient(90deg, #0288D1, #7c3aed);
      color: #fff;
      padding: 8px 14px;
      font-size: 11px;
      font-weight: 700;
    }
    .card-body { padding: 12px 14px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
    .field { font-size: 10px; margin: 0 0 6px; }
    .field .lbl { color: #6b7280; display: inline-block; min-width: 88px; }
    .field .val { font-weight: 600; color: #111827; }
    .plan-highlight {
      border: 2px solid #c4b5fd;
      border-radius: 14px;
      background: linear-gradient(180deg, #faf5ff 0%, #fff 100%);
      padding: 14px 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .plan-name { grid-column: 1 / -1; font-size: 18px; font-weight: 900; color: #5b21b6; margin: 0; }
    .stat-box { background: #f5f3ff; border-radius: 10px; padding: 10px 12px; border: 1px solid #ede9fe; }
    .stat-box .lbl { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; display: block; }
    .stat-box .val { font-size: 14px; font-weight: 800; color: #4c1d95; margin-top: 4px; display: block; }
    .summary-bar { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
    .summary-chip { background: #f3f4f6; border-radius: 8px; padding: 6px 12px; font-size: 10px; font-weight: 600; }
    .summary-chip strong { color: #5b21b6; }
    table.payments { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.payments thead { display: table-header-group; }
    table.payments th {
      background: #424242;
      color: #fff;
      padding: 8px 6px;
      text-align: left;
      font-weight: 700;
    }
    table.payments td { border-bottom: 1px solid #e5e7eb; padding: 7px 6px; vertical-align: top; }
    table.payments tbody tr:nth-child(even) { background: #fafafa; }
    table.payments tbody tr { break-inside: avoid; page-break-inside: avoid; }
    .col-num { width: 28px; text-align: center; color: #6b7280; }
    .col-amount { font-weight: 700; white-space: nowrap; }
    .col-date { white-space: nowrap; font-size: 8px; }
    .col-mono { font-family: ui-monospace, monospace; font-size: 8px; color: #4b5563; word-break: break-all; }
    .sub { font-size: 8px; color: #6b7280; margin-top: 2px; display: block; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 8px; font-weight: 700; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-failed { background: #fee2e2; color: #991b1b; }
    .badge-neutral { background: #f3f4f6; color: #374151; }
    .empty-row, .empty-docs { text-align: center; color: #6b7280; padding: 20px; font-size: 11px; }
    .docs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .doc-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px; break-inside: avoid; page-break-inside: avoid; }
    .doc-card-muted { background: #f9fafb; }
    .doc-label { font-size: 10px; font-weight: 700; color: #5b21b6; margin-bottom: 6px; display: block; }
    .doc-image { width: 100%; max-height: 120px; object-fit: contain; border-radius: 6px; background: #f3f4f6; }
    .doc-placeholder { font-size: 9px; color: #6b7280; display: block; }
    .doc-url { font-size: 7px; color: #9ca3af; word-break: break-all; margin-top: 4px; display: block; }
    .doc-page-wrapper {
      break-before: page;
      page-break-before: always;
      padding-top: 10px;
    }
    .doc-image-full {
      width: 100%;
      height: auto;
      max-height: 240mm;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      box-shadow: 0 4px 14px rgba(124, 58, 237, 0.06);
    }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 2px solid #E91E63; font-size: 9px; color: #4b5563; text-align: center; }
    .footer strong { color: #E91E63; }
    .truncate-note {
      font-size: 9px;
      color: #b45309;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 6px 10px;
      margin: 0 0 8px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="hero-top">
        <div>
          ${logoHtml}
          <h1>${esc(displayName)}</h1>
          <p class="meta">Customer ID: ${esc(customer.userName || "—")} · Generated ${formatDate(generatedAt)}</p>
        </div>
        <span class="status-pill">${esc(customer.status || "ACTIVE")}</span>
      </div>
    </header>

    <section class="section">
      <h2 class="section-title">Customer Information</h2>
      <article class="card">
        <header class="card-head">Profile &amp; Contact</header>
        <div class="card-body grid-2">
          <p class="field"><span class="lbl">Full Name</span><span class="val">${esc(fullName || "—")}</span></p>
          <p class="field"><span class="lbl">Username</span><span class="val">${esc(customer.userName || "—")}</span></p>
          <p class="field"><span class="lbl">Email</span><span class="val">${esc(customer.emailId || "—")}</span></p>
          <p class="field"><span class="lbl">Phone</span><span class="val">${esc(customer.phoneNumber || "—")}</span></p>
          <p class="field"><span class="lbl">Account ID</span><span class="val">${esc(customer.accountId || "—")}</span></p>
          <p class="field"><span class="lbl">User Type</span><span class="val">${esc(customer.userType || "—")}</span></p>
          <p class="field" style="grid-column: 1 / -1;"><span class="lbl">Installation</span><span class="val">${esc(installAddress)}</span></p>
        </div>
      </article>
    </section>

    <section class="section">
      <h2 class="section-title">Current Plan</h2>
      <article class="plan-highlight">
        <p class="plan-name">${esc(planName)}</p>
        <article class="stat-box"><span class="lbl">Amount</span><span class="val">${planAmount}</span></article>
        <article class="stat-box"><span class="lbl">Last Paid</span><span class="val">${planPaidAt}</span></article>
        <article class="stat-box"><span class="lbl">Plan End</span><span class="val">${planEndDate}</span></article>
        <article class="stat-box"><span class="lbl">Profile ID</span><span class="val">${esc(currentPlan?.profileId || "—")}</span></article>
        <article class="stat-box"><span class="lbl">Order ID</span><span class="val" style="font-size:10px;">${esc(currentPlan?.orderId || currentPlan?.razorpayPaymentId || "—")}</span></article>
        <article class="stat-box"><span class="lbl">Payment Status</span><span class="val">${currentPlan ? statusBadge(currentPlan.status) : "—"}</span></article>
      </article>
    </section>

    <section class="section">
      <h2 class="section-title">Payment History</h2>
      ${truncatedNote}
      <div class="summary-bar">
        <span class="summary-chip">Total records: <strong>${payments.length}</strong></span>
        <span class="summary-chip">Successful: <strong>${successCount}</strong></span>
        <span class="summary-chip">Successful total: <strong>${formatCurrency(totalPaid)}</strong></span>
      </div>
      <article class="card">
        <table class="payments">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Paid At</th>
              <th>Order ID</th>
            </tr>
          </thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </article>
    </section>

    ${
      nonImageDocs.length > 0 || documents.length === 0
        ? `
    <section class="section">
      <h2 class="section-title">Documents</h2>
      ${
        documents.length === 0
          ? `<p class="empty-docs">No documents uploaded.</p>`
          : `<div class="docs-grid">${nonImageBlocks}</div>`
      }
    </section>
    `
        : ""
    }

    ${imageBlocks}

    <footer class="footer">
      <strong>ACTIVLINE FIBERNET PRIVATE LIMITED</strong><br />
      Computer-generated customer report · No signature required<br />
      CIN: U61201KA2024PTC193927 · GSTIN: 29ABBCA5129P1Z8
    </footer>
  </div>
</body>
</html>`;
};

export const generateCustomerCAFHTML = (data) => {
  const { customer = {}, currentPlan = null, documents = [], bandwidth: planBandwidth = "" } = data || {};

  const imageDocs = Array.isArray(documents)
    ? documents.filter((doc) => doc.dataUri)
    : [];
  const imageBlocks =
    imageDocs.length > 0
      ? imageDocs
          .map(
            (doc) => `
    <div class="doc-page-wrapper">
      <h2 class="section-title">Document: ${esc(doc.label)}</h2>
      <img src="${doc.dataUri}" alt="${esc(doc.label)}" class="doc-image-full" />
    </div>`,
          )
          .join("")
      : "";

  const fullName = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = fullName || customer.userName || "Customer";

  const installParts = [
    customer.installationAddress?.line2,
    customer.installationAddress?.city,
    customer.installationAddress?.state,
    customer.installationAddress?.country,
  ].filter(Boolean);
  const installPin = customer.installationAddress?.pin;
  const installAddress =
    installParts.length > 0
      ? installParts.join(", ") + (installPin ? ` - ${installPin}` : "")
      : "—";

  // Map backend variables to CAF fields
  const customerNameAndAddress = `
   ${displayName} ,
   ${installAddress}`;
  const contactPersonName = displayName;
  const contactNo = customer.phoneNumber || "";
  const emailId = customer.emailId || "";
  const installationAddress = installAddress;
  const billingAddress = installAddress;

  const planName =
    currentPlan?.planName ||
    customer.userType ||
    customer.planName ||
    "No active plan";
  const product = planName;
  const bandwidth = planBandwidth || "";
  const orderNoFromActivLine =
    currentPlan?.orderId || currentPlan?.razorpayPaymentId || "";

  // Missing fields can default to empty string or false
  const locationBForP2P = "";
  const numberOfIpRequired = "";
  const lastMileProvider = "";
  const interfaceType = "";
  const requestForServiceDate = "";
  const poNumberOfCustomer = "";

  // Checklists (defaulting to false unless mapped from DB)
  const signedSAF = false;
  const companyIdProof = false;
  const companyAddressProof = false;
  const authorisedSignatoryProof = false;
  const otc = false;
  const ipDeclarationForm = false;
  const poCopy = false;
  const ispCallCentre = false;
  const ospLicense = false;

  const networkDiagramAttached = false;
  const networkDiagramQty = "";
  const supplyOfHardware = false;
  const hardwareQty = "";
  const routerRequired = false;
  const modemRequired = false;

  // Payment terms
  const otcBillingCycle = "";
  const refundableAmount = "";
  const annualRecurringCharges = "";
  const chequeNoBankDetails = "";
  const amtPaid = currentPlan?.amount
    ? formatCurrency(currentPlan.amount, currentPlan.currency)
    : "";

  // Signatures & Remarks
  const submittedByAcctManager = "";
  const approvedBy = "";
  const accountManagerSign = "";
  const technicalHead = "";
  const commercialApproved = "";
  const remarks = "";

  const logoBase64 = getLogoBase64();
  const logoHtml = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" alt="Activline" class="logo-img" />`
    : `<h2 class="logo-text" style="color:#6d28d9; margin:0;">activline<br/><span style="font-size:10px;color:#888;">FIBERNET</span></h2>`;

  const checkbox = (isChecked) =>
    isChecked
      ? `<div class="cb-box checked">✔</div>`
      : `<div class="cb-box"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Submission of CAF</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 12mm; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Roboto', Arial, sans-serif;
      color: #111827;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 11px;
    }
    .wrap { width: 100%; max-width: 820px; margin: 0 auto; }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #5b21b6;
    }
    .header-title {
      font-size: 18px;
      font-weight: 900;
      text-transform: uppercase;
      text-decoration: underline;
      letter-spacing: 0.05em;
      color: #111827;
      margin-left: 20px;
    }
    .logo-img { height: 45px; object-fit: contain; }

    table.form-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    table.form-table th, table.form-table td {
      border: 1px solid #111827;
      padding: 6px 8px;
      vertical-align: middle;
    }
    .lbl-col {
      font-weight: 700;
      background-color: #f9fafb;
      width: 25%;
    }
    .val-col {
      background-color: #f4f6f8;
      color: #111;
      width: 25%;
    }
    .val-col-wide {
      background-color: #f4f6f8;
      width: 75%;
    }
    
    .section-title {
      font-size: 12px;
      font-weight: 800;
      text-decoration: underline;
      margin: 15px 0 10px;
    }

    .checklist-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      margin-bottom: 15px;
    }
    .check-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-right: 40px;
    }
    .check-label {
      font-size: 10px;
      line-height: 1.4;
    }
    .cb-box {
      width: 16px;
      height: 16px;
      border: 1px solid #e77a22;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #e77a22;
      font-weight: bold;
      background: #fff;
    }

    .tech-grid {
      margin-top: 10px;
      margin-bottom: 20px;
    }
    .tech-item {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 8px;
    }
    .sub-item {
      margin-left: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 10px;
      margin-bottom: 6px;
    }
    .input-line {
      border-bottom: 1px solid #111;
      display: inline-block;
      min-width: 40px;
      text-align: center;
      font-weight: 600;
    }

    table.payment-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      border: 2px solid #111;
    }
    table.payment-table td {
      border: 1px solid #111;
      padding: 8px;
      width: 50%;
      vertical-align: top;
    }
    .pmt-lbl { font-weight: 700; margin-right: 5px; }

    .sign-box {
      border: 2px solid #111;
      padding: 10px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 15px;
    }
    .sign-row {
      margin-bottom: 15px;
    }

    .remarks-box {
      border: 2px solid #111;
      padding: 8px;
      min-height: 60px;
    }
    .remarks-title {
      font-weight: 700;
      margin-bottom: 4px;
    }
    .doc-page-wrapper {
      break-before: page;
      page-break-before: always;
      padding-top: 10px;
    }
    .doc-image-full {
      width: 100%;
      height: auto;
      max-height: 240mm;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      box-shadow: 0 4px 14px rgba(124, 58, 237, 0.06);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <!-- Header -->
    <div class="header">
      <div class="header-title">SUBMISSION OF CAF</div>
      <div class="header-logo">${logoHtml}</div>
    </div>

    <!-- Main Table -->
    <table class="form-table">
      <tr>
        <td class="lbl-col" rowspan="2" style="height: 65px;">Customer Name and address:</td>
        <td class="val-col" rowspan="2">${esc(customerNameAndAddress)}</td>
        <td class="lbl-col">Contact Person name:</td>
        <td class="val-col">${esc(contactPersonName)}</td>
      </tr>
      <tr>
        <td class="lbl-col">Contact No</td>
        <td class="val-col">${esc(contactNo)}</td>
      </tr>
      <tr>
        <td class="lbl-col" rowspan="2" style="height: 65px;">Installation Address:</td>
        <td class="val-col" rowspan="2">${esc(installationAddress)}</td>
        <td class="lbl-col">Email ID</td>
        <td class="val-col">${esc(emailId)}</td>
      </tr>
      <tr>
        <td class="lbl-col" rowspan="2" style="height: 65px;">Billing Address:</td>
        <td class="val-col" rowspan="2">${esc(billingAddress)}</td>
      </tr>
      <tr>
        <td class="lbl-col">Product: ILL/P2P/IBB</td>
        <td class="val-col">${esc(product)}</td>
      </tr>
      <tr>
        <td class="lbl-col">Location B for P2P:</td>
        <td class="val-col-wide" colspan="3">${esc(locationBForP2P)}</td>
      </tr>
      <tr>
        <td class="lbl-col">Number of IP address required:</td>
        <td class="val-col-wide" colspan="3">${esc(numberOfIpRequired)}</td>
      </tr>
      <tr>
        <td class="lbl-col">Last Mile provider:</td>
        <td class="val-col-wide" colspan="3">${esc(lastMileProvider)}</td>
      </tr>
      <tr>
        <td class="lbl-col">Bandwidth:</td>
        <td class="val-col">${esc(bandwidth)}</td>
        <td class="lbl-col">Interface:</td>
        <td class="val-col">${esc(interfaceType)}</td>
      </tr>
      <tr>
        <td class="lbl-col">Request for service date:</td>
        <td class="val-col">${esc(requestForServiceDate)}</td>
        <td class="lbl-col">Order No from ActivLine:</td>
        <td class="val-col">${esc(orderNoFromActivLine)}</td>
      </tr>
      <tr>
        <td class="lbl-col">PO Number of Customer:</td>
        <td class="val-col-wide" colspan="3">${esc(poNumberOfCustomer)}</td>
      </tr>
    </table>

    <!-- Sales Checklist -->
    <div class="section-title" style="margin-bottom: 5px;">Sales Documents checklist</div>
    <div class="checklist-grid">
      <div class="check-item">
        <span class="check-label">a. Signed SAF (Subscribers Application Form)</span>
        ${checkbox(signedSAF)}
      </div>
      <div class="check-item">
        <span class="check-label">b. Company ID Proof - Copy of any one (Incorporation Certificate, Pan Card)</span>
        ${checkbox(companyIdProof)}
      </div>
      <div class="check-item">
        <span class="check-label">c. Company Address Proof - Copy of any one (Telephone Bill, Leased Agreement)</span>
        ${checkbox(companyAddressProof)}
      </div>
      <div class="check-item">
        <span class="check-label">d. Authorised Signatory Proof - Copy of any one (Power of attorney, Board Resolution) i.e. Authorised Signatory ID proof - Copy of any one (Pan Card, Passport, Driving License) / Authorised Signatory one passport size photo</span>
        ${checkbox(authorisedSignatoryProof)}
      </div>
      <div class="check-item">
        <span class="check-label">g. OTC (One Time Charges)</span>
        ${checkbox(otc)}
      </div>
      <div class="check-item">
        <span class="check-label">h. IP Declaration Form</span>
        ${checkbox(ipDeclarationForm)}
      </div>
      <div class="check-item">
        <span class="check-label">i. PO copy</span>
       ${checkbox(poCopy)}
      </div>
      <div class="check-item">
        <span class="check-label">j. ISP/ Call Centre</span>
       ${checkbox(ispCallCentre)}
      </div>
      <div class="check-item">
        <span class="check-label">k. OSP License registration copy</span>
        ${checkbox(ospLicense)}
      </div>
    </div>

    <!-- Technical Checklist -->
    <div class="section-title">Technical Dept document checklist</div>
    <div class="tech-grid">
      <div class="check-item" style="justify-content: flex-start; gap: 50px; margin-bottom:10px;">
        <span class="check-label">a. Network diagram attached</span>
        ${checkbox(networkDiagramAttached)}
        <span class="check-label">If yes; Qty: <span class="input-line" style="width:40px;">${esc(networkDiagramQty)}</span> No's</span>
      </div>
      <div class="check-item" style="justify-content: flex-start; gap: 50px;">
        <span class="check-label">b. Supply of hardware:</span>
        <span class="check-label">yes; Qty: <span class="input-line" style="width:40px;">${esc(hardwareQty)}</span> No's</span>
      </div>
      <div class="sub-item" style="margin-top: 5px;">
        <span>→ Router</span>
        <span style="margin-left:20px; font-weight:700;">${routerRequired ? "Yes" : "No"}</span>
      </div>
      <div class="sub-item">
        <span>→ Modem</span>
        <span style="margin-left:20px; font-weight:700;">${modemRequired ? "Yes" : "No"}</span>
      </div>
    </div>

    <!-- Payment Terms -->
    <table class="payment-table">
      <tr>
        <td>
          <div style="margin-bottom:10px;">
            <span class="pmt-lbl">Payment Terms:</span><br/>
            <span class="pmt-lbl">OTC (one time charges) / Billing cycle:</span> ${esc(otcBillingCycle)}
          </div>
          <div>
            <span class="pmt-lbl">Cheque no / Bank Details:</span> ${esc(chequeNoBankDetails)}
          </div>
        </td>
        <td>
          <div style="margin-bottom:10px;">
            <span class="pmt-lbl">Refundable amount:</span> ${esc(refundableAmount)}
          </div>
          <div>
            <span class="pmt-lbl">Annual Recurring Charges Total Amt paid:</span> ${esc(annualRecurringCharges || amtPaid)}
          </div>
        </td>
      </tr>
    </table>

    <!-- Signatures -->
    <div class="sign-box">
      <div>
        <div class="sign-row"><span class="pmt-lbl">Submitted by Acct Manager:</span> ${esc(submittedByAcctManager)}</div>
        <div class="sign-row"><span class="pmt-lbl">Account Manager Sign:</span> ${esc(accountManagerSign)}</div>
        <div class="sign-row" style="margin-bottom:0;"><span class="pmt-lbl">Commercial approved:</span> ${esc(commercialApproved)}</div>
      </div>
      <div>
        <div class="sign-row"><span class="pmt-lbl">Approved by:</span> ${esc(approvedBy)}</div>
        <div class="sign-row"><span class="pmt-lbl">Technical Head:</span> ${esc(technicalHead)}</div>
      </div>
    </div>

    <!-- Remarks -->
    <div class="remarks-box">
      <div class="remarks-title">Remarks:</div>
      <div>${esc(remarks)}</div>
    </div>

    ${imageBlocks}
  </div>
</body>
</html>`;
};
