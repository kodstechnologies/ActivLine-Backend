import puppeteer from "puppeteer";
import {
  generateCustomerCAFHTML,
  generateCustomerDetailsHTML,
} from "../../utils/customerDetailsTemplate.js";

let browserPromise = null;

const getBrowser = async () => {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser.isConnected()) return browser;
    } catch {
      browserPromise = null;
    }
  }

  browserPromise = puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  return browserPromise;
};

/**
 * Renders HTML to a multi-page PDF. Page height grows with content (A4 auto-pagination).
 */
export const renderCustomerDetailsPdf = async (htmlContent) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(htmlContent, { waitUntil: "load", timeout: 60000 });

    const pdfUint8Array = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });

    return Buffer.from(pdfUint8Array);
  } finally {
    await page.close().catch(() => {});
  }
};
export const buildCustomerDetailsHtml = (payload) =>
  generateCustomerCAFHTML(payload);
// export const buildCustomerDetailsHtml = (payload) => generateCustomerDetailsHTML(payload);
