import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import PDFDocument from "pdfkit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate PDF buffer using Puppeteer (HTML -> PDF)
 */
export const generateInvoicePdfWithPuppeteer = async (htmlContent) => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0", timeout: 30000 });

    const pdfUint8Array = await page.pdf({
      width: "595px",
      height: "986px",
      printBackground: true,
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      pageRanges: "1",
    });

    return Buffer.from(pdfUint8Array);
  } finally {
    await browser.close().catch(() => {});
  }
};

/**
 * Generate PDF buffer using PDFKit (Pure JS fallback - no browser required)
 */
export const generateInvoicePdfWithPdfKit = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 36 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const rawAmount = parseFloat(data.amount || 0);
      const taxRate = data.taxRate || 0.09;
      const baseAmount = rawAmount / (1 + taxRate * 2);
      const taxAmount = baseAmount * taxRate;

      const formattedDate = data.date
        ? new Date(data.date).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "-";

      const planExpiry = data.planEndDate
        ? new Date(data.planEndDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "-";

      // Try loading logo
      const logoPath = path.join(__dirname, "..", "..", "logo", "invoice_logo.png");
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 36, 36, { width: 110 });
        } catch {
          // Ignore image rendering error
        }
      }

      // Top Title (TAX INVOICE)
      doc
        .fontSize(16)
        .fillColor("#E91E63")
        .text("ACTIVLINE FIBERNET PRIVATE LIMITED", 160, 36, { align: "right" });
      doc
        .fontSize(12)
        .fillColor("#111111")
        .text("TAX INVOICE", 160, 56, { align: "right" });
      doc
        .fontSize(8)
        .fillColor("#666666")
        .text("Original for Recipient", 160, 72, { align: "right" });

      doc.moveDown(2);
      const separatorY = 96;
      doc
        .strokeColor("#E91E63")
        .lineWidth(1.5)
        .moveTo(36, separatorY)
        .lineTo(559, separatorY)
        .stroke();

      // Invoice Details & Customer Info
      const startY = separatorY + 12;
      doc.fontSize(9).fillColor("#333333");

      // Left Column: Invoice Details
      doc.fontSize(10).fillColor("#0288D1").text("Invoice Details", 36, startY, { underline: true });
      doc.fontSize(8.5).fillColor("#222222");
      const invY = startY + 16;
      doc.text(`Invoice No: ${data.paymentId?.substring(0, 10).toUpperCase() || "INV-001"}`, 36, invY);
      doc.text(`Circuit ID: ATPL_${data.customer?.activlineUserId || "N/A"}`, 36, invY + 14);
      doc.text(`Username: ${data.customer?.userName || "N/A"}`, 36, invY + 28);
      doc.text(`Invoice Date: ${formattedDate}`, 36, invY + 42);
      doc.text(`Billing Period: ${formattedDate} to ${planExpiry}`, 36, invY + 56);

      // Right Column: Customer Info
      doc.fontSize(10).fillColor("#E91E63").text("Customer & Billing Details", 310, startY, { underline: true });
      doc.fontSize(8.5).fillColor("#222222");
      doc.text(`Billed To: ${data.customer?.name || data.customer?.userName || "-"}`, 310, invY);
      doc.text(`Contact No: ${data.customer?.phoneNumber || "-"}`, 310, invY + 14);
      doc.text(`Email: ${data.customer?.email || data.customer?.emailId || "-"}`, 310, invY + 28);
      doc.text(`Address: ${data.customer?.address || "Bangalore, Karnataka, India"}`, 310, invY + 42, { width: 240 });

      // Table of Charges
      const tableY = invY + 80;
      doc.rect(36, tableY, 523, 20).fill("#0288D1");
      doc.fontSize(9).fillColor("#FFFFFF");
      doc.text("Plan / Description", 46, tableY + 5);
      doc.text("Amount (INR)", 430, tableY + 5, { align: "right", width: 120 });

      let currentY = tableY + 24;
      doc.fillColor("#222222");
      doc.text(data.planName || "Broadband Internet Service", 46, currentY);
      doc.text(baseAmount.toFixed(2), 430, currentY, { align: "right", width: 120 });

      currentY += 18;
      doc.text("CGST @ 9.0%", 46, currentY);
      doc.text(taxAmount.toFixed(2), 430, currentY, { align: "right", width: 120 });

      currentY += 18;
      doc.text("SGST @ 9.0%", 46, currentY);
      doc.text(taxAmount.toFixed(2), 430, currentY, { align: "right", width: 120 });

      currentY += 22;
      doc.rect(36, currentY - 4, 523, 22).fill("#F3F4F6");
      doc.fontSize(10).fillColor("#E91E63").text("Total Amount Paid", 46, currentY + 2);
      doc.text(`Rs. ${rawAmount.toFixed(2)}`, 430, currentY + 2, { align: "right", width: 120 });

      // Amount in words
      currentY += 26;
      doc.fontSize(8).fillColor("#555555");
      doc.text(`Total in Words: Rs. ${Math.floor(rawAmount)} Rupees and ${Math.round((rawAmount - Math.floor(rawAmount)) * 100)} Paise Only`, 36, currentY);

      // Company Bank Account Box
      currentY += 24;
      doc.rect(36, currentY, 523, 56).strokeColor("#E91E63").lineWidth(0.8).stroke();
      doc.fontSize(9).fillColor("#E91E63").text("Company's Bank Account Details", 46, currentY + 6);
      doc.fontSize(8).fillColor("#333333");
      doc.text("Account Name: ACTIVLINE FIBERNET PRIVATE LIMITED   |   Bank: KOTAK MAHINDRA BANK", 46, currentY + 20);
      doc.text("A/C No: 8002586488   |   IFSC Code: KKBK0008083   |   Branch: Bangalore", 46, currentY + 32);
      doc.text("** DD/CHQ need to be in favour of ACTIVLINE FIBERNET PRIVATE LIMITED", 46, currentY + 44);

      // Footer / Declaration
      currentY += 70;
      doc.fontSize(8).fillColor("#444444");
      doc.text("Declaration:", 36, currentY, { bold: true });
      doc.fontSize(7.5).fillColor("#666666").text(
        "We declare that this invoice shows the actual price of the goods/services described and all particulars are true and correct.",
        36,
        currentY + 12
      );

      // Company Identification
      currentY += 34;
      doc.rect(36, currentY, 523, 30).fill("#FDF2F8");
      doc.fontSize(7.5).fillColor("#333333");
      doc.text(
        "CIN: U61201KA2024PTC193927  |  GSTIN: 29ABBCA5129P1Z8  |  PAN: ABBCA5129P  |  Web: www.activline.in  |  Mail: info@activline.in",
        42,
        currentY + 10,
        { align: "center", width: 510 }
      );

      doc.moveDown(2);
      doc
        .fontSize(7)
        .fillColor("#999999")
        .text("Note: This is a Computer Generated Invoice. No signature required.", 36, doc.page.height - 40, {
          align: "center",
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * High-level helper: tries Puppeteer first, falls back to PDFKit if browser fails
 */
export const generateInvoicePdf = async (invoiceData, htmlContent) => {
  try {
    const buffer = await generateInvoicePdfWithPuppeteer(htmlContent);
    return buffer;
  } catch (puppeteerError) {
    console.warn(
      `⚠️ Puppeteer PDF generation failed (${puppeteerError.message}). Using PDFKit fallback...`
    );
    return await generateInvoicePdfWithPdfKit(invoiceData);
  }
};
