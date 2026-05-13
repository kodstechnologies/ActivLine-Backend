import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedLogoBase64 = null;
const getLogoBase64 = () => {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const logoPath = path.join(__dirname, '..', 'logo', 'invoice_logo.png');
    if (fs.existsSync(logoPath)) {
      const bitmap = fs.readFileSync(logoPath);
      cachedLogoBase64 = Buffer.from(bitmap).toString('base64');
      return cachedLogoBase64;
    }
  } catch (e) {
    console.error('Error loading logo:', e);
  }
  return null;
}

export const generateInvoiceHTML = (data) => {
  const { paymentId, date, planName, amount, customer, plan, previousBalance = 0, taxRate = 0.09 } = data;

  // Calculate tax parts
  const rawAmount = parseFloat(amount || 0);
  // Assuming the `amount` is the total including tax, let's reverse calculate the base amount.
  // Or if `amount` is base, add tax. Based on the image: 
  // Base: 899, CGST 9%: 80.91, SGST 9%: 80.91. Total: 1060.82
  // So amount is Total. Let's compute base.
  const totalTaxRate = taxRate * 2; // CGST + SGST
  const baseAmount = rawAmount / (1 + totalTaxRate);
  const taxAmount = baseAmount * taxRate;
  
  const formattedDate = date ? new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  }) : '-';
  
  const dueDate = formattedDate; // In image, due date is same as invoice date or 'Immediate'
  
  const numToWords = (num) => {
    // simplified for template, a full production app would use a library
    return `Rs. ${num.toFixed(2)} only`;
  };

  const amountDue = Math.max(0, rawAmount - previousBalance).toFixed(2);
  const totalPayable = amountDue;

  const logoBase64 = getLogoBase64();
  const logoHtml = logoBase64 
    ? `<img src="data:image/png;base64,${logoBase64}" alt="Activline" style="height: 50px; object-fit: contain;" />`
    : `<div class="text-[#1A237E] font-black text-3xl tracking-tighter flex items-center">activline</div>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tax Invoice</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
        @media print {
          @page { size: 595px 986px; margin: 0; }
        }
        html, body {
          height: 986px;
          overflow: hidden;
        }
        body {
          font-family: 'Roboto', sans-serif;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          width: 595px;
          background: white;
          color: #333;
          position: relative;
        }
        .page-container {
          padding: 30px;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        /* Top Decor */
        .decor-circle-1 { position: absolute; top: -50px; left: 100px; width: 150px; height: 150px; background-color: #E91E63; border-radius: 50%; z-index: 1; }
        .decor-circle-2 { position: absolute; top: -20px; left: 200px; width: 100px; height: 100px; background-color: #E0E0E0; border-radius: 50%; z-index: 0; }
        .decor-circle-3 { position: absolute; top: 40px; left: 60px; width: 80px; height: 80px; background-color: #333333; border-radius: 50%; z-index: 2; }
        .decor-circle-4 { position: absolute; top: -10px; left: -10px; width: 120px; height: 120px; background-color: #F8BBD0; border-radius: 50%; z-index: 0; }

        /* Bottom Decor */
        .decor-circle-bottom-1 { position: absolute; bottom: 20px; left: 50px; width: 60px; height: 30px; background-color: #FFEB3B; border-radius: 15px; z-index: 1; }
        .decor-circle-bottom-2 { position: absolute; bottom: 100px; right: -50px; width: 150px; height: 150px; background-color: #FFEB3B; border-radius: 50%; z-index: 1; }
        .decor-circle-bottom-3 { position: absolute; bottom: 30px; left: 130px; width: 20px; height: 20px; background-color: #E91E63; border-radius: 50%; z-index: 1; }
        .decor-circle-bottom-4 { position: absolute; bottom: 40px; left: 20px; width: 15px; height: 15px; background-color: #BDBDBD; border-radius: 50%; z-index: 1; }

        .table-border {
          border: 1px solid #BDBDBD;
          border-radius: 8px;
          overflow: hidden;
        }
        .header-blue { background-color: #0288D1; color: white; padding: 4px 8px; font-weight: bold; font-size: 11px; }
        .header-pink { background-color: #E91E63; color: white; padding: 4px 8px; font-weight: bold; font-size: 11px; }
        .header-dark { background-color: #424242; color: white; padding: 4px 8px; font-weight: bold; font-size: 11px; }
        
        .teardrop-container {
          width: 85px;
          height: 85px;
          border-radius: 50% 0 50% 50%;
          transform: rotate(45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .teardrop-inner {
          width: 73px;
          height: 73px;
          background: white;
          border-radius: 50%;
          transform: rotate(-45deg);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          z-index: 2;
        }
        .bg-red-brown { background: linear-gradient(45deg, #E53935 50%, #4E342E 50%); }
        .bg-orange-brown { background: linear-gradient(45deg, #FB8C00 50%, #4E342E 50%); }
        
        .item-row { display: flex; font-size: 10px; padding: 3px 8px; }
        .item-label { width: 35%; color: #555; }
        .item-value { width: 65%; font-weight: 500; }
        
        .product-table th, .product-table td {
          border: 1px solid #E0E0E0;
          padding: 4px 8px;
          font-size: 10px;
        }
        .product-table th { background-color: #F5F5F5; font-weight: normal; color: #555; text-align: left; }
      </style>
    </head>
    <body>
      <!-- Decorations -->
      <div class="decor-circle-1"></div>
      <div class="decor-circle-2"></div>
      <div class="decor-circle-3"></div>
      <div class="decor-circle-4"></div>
      <div class="decor-circle-bottom-1"></div>
      <div class="decor-circle-bottom-2"></div>
      <div class="decor-circle-bottom-3"></div>
      <div class="decor-circle-bottom-4"></div>

      <div class="page-container relative z-10">
        
        <!-- Header Section -->
        <div class="flex justify-between items-start mt-24 mb-6">
          <!-- Logo -->
          <div class="flex flex-col items-center ml-10">
            ${logoHtml}
          </div>
          
          <div class="text-right">
            <h1 class="text-3xl font-black text-black m-0 leading-tight">TAX INVOICE</h1>
            <div class="text-[10px] font-bold text-gray-800">Original for Recipient</div>
          </div>
        </div>

        <!-- Invoice Details Box -->
        <div class="flex justify-end mb-4">
          <div class="table-border w-2/3">
            <div class="header-blue w-1/2">Invoice Details</div>
            <div class="flex p-2">
              <div class="w-1/2">
                <div class="item-row"><div class="item-label">Invoice No.</div><div class="item-value">: ${paymentId?.substring(0,10).toUpperCase() || 'INV-001'}</div></div>
                <div class="item-row"><div class="item-label">Circuit Id</div><div class="item-value">: ATPL_${customer?.activlineUserId || 'N/A'}</div></div>
                <div class="item-row"><div class="item-label">Username</div><div class="item-value">: ${customer?.userName || 'N/A'}</div></div>
                <div class="item-row"><div class="item-label">Due Date</div><div class="item-value">: ${dueDate}</div></div>
                <div class="item-row"><div class="item-label">Billing Period</div><div class="item-value">: ${formattedDate} to -</div></div>
              </div>
              <div class="w-1/2">
                <div class="item-row"><div class="item-label">Dated</div><div class="item-value">: ${formattedDate}</div></div>
                <div class="item-row"><div class="item-label">Billing Cycle</div><div class="item-value">: Recurring</div></div>
                <div class="item-row"><div class="item-label">Account Manager</div><div class="item-value">: </div></div>
                <div class="item-row"><div class="item-label">Order Date</div><div class="item-value">: ${date ? new Date(date).toISOString().replace('T',' ').substring(0,19) : '-'}</div></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Address Boxes -->
        <div class="flex justify-between mb-8 gap-4">
          <!-- Installation Address -->
          <div class="table-border w-[48%]">
            <div class="header-pink">Installation Address</div>
            <div class="p-2">
              <div class="item-row"><div class="item-label">Address</div><div class="item-value leading-tight">: ${customer?.address || 'Bangalore, Karnataka, India,'}</div></div>
              <div class="item-row mt-1"><div class="item-label">GSTIN</div><div class="item-value">: </div></div>
              <div class="item-row"><div class="item-label">Bill Name</div><div class="item-value">: ${customer?.name || customer?.userName || '-'}</div></div>
              <div class="item-row"><div class="item-label">Contact No</div><div class="item-value">: ${customer?.phoneNumber || '-'}</div></div>
              <div class="item-row"><div class="item-label">Mail</div><div class="item-value" style="word-break: break-all;">: ${customer?.email || '-'}</div></div>
            </div>
          </div>

          <!-- Billing Address -->
          <div class="table-border w-[48%]">
            <div class="header-dark">Billing Address</div>
            <div class="flex p-2">
              <div class="w-1/2">
                <div class="item-row"><div class="item-label">State Name</div><div class="item-value">: </div></div>
                <div class="item-row"><div class="item-label">GSTIN</div><div class="item-value">: </div></div>
                <div class="item-row"><div class="item-label">Bill Name</div><div class="item-value">: ${customer?.name || customer?.userName || '-'}</div></div>
                <div class="item-row"><div class="item-label">Contact No</div><div class="item-value">: ${customer?.phoneNumber || '-'}</div></div>
                <div class="item-row"><div class="item-label">Mail</div><div class="item-value" style="word-break: break-all;">: ${customer?.email || '-'}</div></div>
              </div>
              <div class="w-1/2">
                <div class="item-row"><div class="item-label">Code</div><div class="item-value">: </div></div>
                <div class="item-row"><div class="item-label">LUT No</div><div class="item-value">: </div></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bubbles -->
        <div class="flex justify-between items-center mb-8 px-2 relative">
          
          <div class="teardrop-container bg-red-brown">
            <div class="teardrop-inner">
              <div class="text-[8px] font-bold leading-tight text-black">Previous<br/>Balance</div>
              <div class="mt-1 text-[9px] font-bold text-black">Rs. ${parseFloat(previousBalance).toFixed(2)}</div>
            </div>
          </div>

          <div class="teardrop-container bg-red-brown">
            <div class="teardrop-inner">
              <div class="text-[8px] font-bold leading-tight text-black">Payment</div>
              <div class="mt-1 text-[9px] font-bold text-black">Rs. ${parseFloat(amount).toFixed(2)}</div>
            </div>
          </div>
          
          <div class="text-xl font-bold text-gray-500">=</div>

          <div class="teardrop-container bg-orange-brown">
            <div class="teardrop-inner">
              <div class="text-[9px] font-bold leading-tight text-black">Amount Due</div>
              <div class="mt-1 font-bold text-[9px] text-black">Rs. ${amountDue}</div>
              <div class="text-[7px] mt-0.5 border-t border-gray-400 pt-0.5 w-3/4 mx-auto leading-tight text-black font-bold">Due Date<br/>Immediate</div>
            </div>
          </div>

          <div class="teardrop-container bg-orange-brown">
            <div class="teardrop-inner">
              <div class="text-[8px] font-bold leading-tight text-black">Total<br/>Amount<br/>Payable After<br/>${formattedDate}</div>
              <div class="mt-0.5 text-[9px] font-bold text-black">Rs. ${totalPayable}</div>
            </div>
          </div>

        </div>

        <!-- Bottom Layout -->
        <div class="flex justify-between gap-4 flex-1">
          
          <!-- Bank Details -->
          <div class="table-border w-[45%] flex flex-col justify-between" style="border-color: #E91E63; background: #fff;">
            <div>
              <div class="bg-[#E91E63] text-white text-center font-bold text-xs py-1">Company's Bank Account Details</div>
              <div class="bg-[#F06292] text-white p-2">
                <div class="item-row"><div class="item-label text-pink-100">Account Name</div><div class="item-value">: ACTIVLINE FIBERNET PRIVATE LIMITED</div></div>
                <div class="item-row"><div class="item-label text-pink-100">Bank Name</div><div class="item-value">: KOTAK MAHINDRA BANK</div></div>
                <div class="item-row"><div class="item-label text-pink-100">A/C No.</div><div class="item-value">: 8002586488</div></div>
                <div class="item-row"><div class="item-label text-pink-100">IFSC Code</div><div class="item-value">: KKBK0008083</div></div>
                <div class="item-row"><div class="item-label text-pink-100">Branch</div><div class="item-value">: Monarch Serenity, R. K. Hedge Nagar</div></div>
              </div>
              <div class="bg-[#D81B60] text-white text-[8px] p-2 text-center leading-tight">
                **DD/CHQ need to be in favour of ACTIVLINE FIBERNET PRIVATE LIMITED
              </div>
            </div>
            
            <div class="p-2 text-center">
              <div class="font-bold text-[#012B72] text-xl tracking-tight mb-1">Paytm <span class="text-xs font-normal">Accepted Here</span></div>
              <div class="flex justify-center items-center text-[8px] text-gray-500 mb-2 gap-1">
                Scan in Paytm App for <span class="font-bold text-blue-800">Wallet</span> <span class="font-bold text-blue-400">UPI</span>
              </div>
              <!-- Fake QR -->
              <div class="border border-blue-400 rounded p-1 inline-block bg-blue-50">
                <div class="text-[8px] font-bold text-center mb-1">ACTIVLINE FIBERNET<br/>PRIVATE LIMITED</div>
                <div class="bg-white p-1 border border-gray-300 w-24 h-24 mx-auto flex items-center justify-center text-gray-300 text-xs">[QR CODE]</div>
              </div>
              <div class="text-[9px] mt-2 font-bold text-gray-700">Pay via number also</div>
              
              <div class="flex justify-between items-center mt-3 text-[7px] text-white font-bold">
                <div class="text-gray-700 w-1/3 text-left">Payment Method</div>
                <div class="w-2/3 flex justify-end gap-1">
                  <span class="bg-[#E91E63] px-1 py-0.5 rounded-sm">NEFT</span>
                  <span class="bg-[#E91E63] px-1 py-0.5 rounded-sm">RTGS</span>
                  <span class="bg-[#E91E63] px-1 py-0.5 rounded-sm">CARD</span>
                  <span class="bg-[#E91E63] px-1 py-0.5 rounded-sm">CHEQ</span>
                  <span class="bg-[#E91E63] px-1 py-0.5 rounded-sm">CASH</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Product Table and Company Info -->
          <div class="w-[55%] flex flex-col">
            <table class="product-table w-full border-collapse mb-4">
              <thead>
                <tr>
                  <th>Product Name (HSN/SAC)</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${planName || 'ATPL_300Mbps_UL_1M'} (null)</td>
                  <td class="text-right">${baseAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>CGST @ ${(taxRate * 100).toFixed(1)}%</td>
                  <td class="text-right">${taxAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>SGST @ ${(taxRate * 100).toFixed(1)}%</td>
                  <td class="text-right">${taxAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td class="font-bold text-right border-t border-gray-400">Total</td>
                  <td class="font-bold text-right border-t border-gray-400">Rs. ${rawAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="2" class="text-[9px]">Total Amount in Words : <span class="font-bold ml-2">Rs. ${Math.floor(rawAmount)} Rupees And ${Math.round((rawAmount - Math.floor(rawAmount))*100)} Paise only</span></td>
                </tr>
              </tbody>
            </table>

            <div class="mt-auto border border-[#E91E63] rounded-lg overflow-hidden">
              <div class="bg-[#E91E63] text-white text-center font-bold text-sm py-2">
                ACTIVLINE FIBERNET PRIVATE LIMITED
              </div>
              <div class="p-3 text-[9px] bg-[#fdfdfd] relative">
                <div class="flex items-start mb-2">
                  <div class="text-red-500 mr-1">📍</div>
                  <div>Bangalore, -</div>
                </div>
                <div class="flex justify-between mb-3 text-[8px] text-gray-600">
                  <div>📞 Accounts : 9535996488 / 9972316488<br/>Technical Desk : 1800 274 6488</div>
                  <div>✉️ info@activline.in</div>
                  <div>🌐 www.activline.in</div>
                </div>
                <div class="border-t border-gray-300 pt-2 text-[8px] text-gray-800">
                  CIN : <strong>U61201KA2024PTC193927</strong> | GSTIN : <strong>29ABBCA5129P1Z8</strong> | PAN : <strong>ABBCA5129P</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-4 text-[9px] flex justify-between font-bold text-[#E91E63]">
          <div>Payment Terms</div>
          <div>Thanks for choosing ACTIVLINE FIBERNET PRIVATE LIMITED</div>
        </div>

        <div class="mt-6 flex justify-between items-end">
          <div class="w-2/3">
            <div class="font-bold text-[#E91E63] text-sm mb-1">Declaration:</div>
            <div class="text-[8px] text-gray-700 leading-tight">
              We declare that this invoice shows the actual price of the goods described and that all<br/>
              particulars are true and correct. Please Check Your GSTIN No. has been Correctly<br/>
              entered on our invoice after 7 Days we will be not responsible.
            </div>
          </div>
          <div class="w-1/3 text-right">
            <div class="font-bold text-[10px] mb-6">For - ACTIVLINE FIBERNET PRIVATE LIMITED</div>
            <div class="font-bold text-[9px]">Authorised Signatory</div>
          </div>
        </div>

        <div class="mt-4 text-center text-[8px] font-bold text-gray-600">
          Note : This is Computer Generated Invoice No signature Required
        </div>

      </div>
    </body>
    </html>
  `;
};
