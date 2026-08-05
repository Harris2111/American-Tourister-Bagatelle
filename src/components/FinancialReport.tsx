import React, { useState } from 'react';
import { format, parseISO, endOfMonth, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import { MonthlyReport, SaleEntry } from '../types';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Download, Calendar, Loader2 } from 'lucide-react';

interface FinancialReportProps {
  allReports: Record<string, MonthlyReport>;
}

export const FinancialReport: React.FC<FinancialReportProps> = ({ allReports }) => {
  const [includeHighlighted, setIncludeHighlighted] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const sortedMonths = Object.keys(allReports).sort();

      if (sortedMonths.length === 0) {
        alert('No data available to export.');
        setIsExporting(false);
        return;
      }

      for (const monthStr of sortedMonths) {
        const report = allReports[monthStr];
        const monthDate = parseISO(`${monthStr}-01`);
        if (isNaN(monthDate.getTime())) continue;

        const sheetName = format(monthDate, 'MMM yyyy');
        const worksheet = workbook.addWorksheet(sheetName);

        // Define columns
        worksheet.columns = [
          { header: 'Date', key: 'date', width: 15 },
          { header: 'Day', key: 'day', width: 15 },
          { header: 'Pcs', key: 'pcs', width: 10 },
          { header: 'POS Sales', key: 'posSales', width: 15 },
          { header: 'Manual Sales', key: 'manualSales', width: 15 },
          { header: 'Total Sales', key: 'totalSales', width: 15 },
          { header: 'Cash', key: 'cash', width: 15 },
          { header: 'Card', key: 'card', width: 15 },
          { header: 'JUICE', key: 'juice', width: 15 },
          { header: 'NEFT / RTGS', key: 'neft', width: 15 },
          { header: 'G.Voucher', key: 'voucher', width: 15 },
          { header: 'Total', key: 'total', width: 15 },
          { header: 'Cash Deposit', key: 'cashDeposit', width: 15 },
          { header: 'Cash In Hand', key: 'cashInHand', width: 15 },
          { header: 'Daily Bank Coll.', key: 'dailyBankColl', width: 15 },
          { header: 'VAT Amount', key: 'vatAmount', width: 15 },
          { header: 'Total without VAT', key: 'totalWithoutVat', width: 15 },
          { header: 'Cash Deposite & Other Details', key: 'details', width: 30 },
        ];

        // Format headers
        worksheet.getRow(1).eachCell(cell => {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' } // Yellow background
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });

        // Colors for groups
        const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }; // Light Green
        const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; // Light Yellow
        const redFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } }; // Light Red

        // Opening Balance Row
        const opBalRow = worksheet.addRow({
          date: 'Op. Balance',
          cash: 0, 
        });
        opBalRow.getCell('L').value = { formula: 'SUM(G2:K2)' }; // Total
        opBalRow.getCell('M').value = 0; // Cash Deposit
        opBalRow.getCell('N').value = { formula: 'G2' }; // Cash in hand
        opBalRow.getCell('O').value = { formula: 'SUM(H2:J2)' }; // Daily Bank Coll.

        // Get days data
        const days = eachDayOfInterval({ start: monthDate, end: endOfMonth(monthDate) });
        
        days.forEach((day, index) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayData = report?.days?.[dateStr];
          const sales: SaleEntry[] = dayData?.sales || [];
          
          const filteredSales = includeHighlighted 
            ? sales 
            : sales.filter(s => !s.highlighted);

          let pcs = 0;
          let posSales = 0;
          let manualSales = 0;
          let cash = 0;
          let card = 0;
          let juice = 0;
          let neft = 0; 
          let voucher = 0; 

          filteredSales.forEach(sale => {
            pcs += sale.quantity;
            const total = sale.price * sale.quantity;
            posSales += total; 

            if (sale.paymentMethod === 'split' && sale.splitPayments) {
              sale.splitPayments.forEach(p => {
                if (p.method === 'cash') cash += p.amount;
                if (p.method === 'card') card += p.amount;
                if (p.method === 'juice') juice += p.amount;
              });
            } else {
              if (sale.paymentMethod === 'cash') cash += total;
              if (sale.paymentMethod === 'card') card += total;
              if (sale.paymentMethod === 'juice') juice += total;
            }
          });

          const rowNum = index + 3; // Starts from 3 (1 is header, 2 is Op Bal)
          
          const excelRow = worksheet.addRow({
            date: new Date(dateStr),
            day: format(day, 'EEEE'),
            pcs: pcs || 0,
            posSales: posSales || 0,
            manualSales: manualSales || 0,
            cash: cash || 0,
            card: card || 0,
            juice: juice || 0,
            neft: neft || 0,
            voucher: voucher || 0,
          });

          // Add formulas
          excelRow.getCell('F').value = { formula: `SUM(D${rowNum}:E${rowNum})` }; // Total Sales
          excelRow.getCell('L').value = { formula: `SUM(G${rowNum}:K${rowNum})` }; // Total
          excelRow.getCell('Q').value = { formula: `L${rowNum}/1.15` }; // Total without VAT
          excelRow.getCell('P').value = { formula: `L${rowNum}-Q${rowNum}` }; // VAT Amount (15% VAT extracted from inclusive total)
          
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          if (dateStr < todayStr) {
            excelRow.getCell('M').value = { formula: `N${rowNum - 1}` }; // Cash deposit is the cash in hand from the previous day
          }

          excelRow.getCell('N').value = { formula: `N${rowNum - 1}+G${rowNum}-M${rowNum}` }; // Cash in hand
          excelRow.getCell('O').value = { formula: `SUM(H${rowNum}:J${rowNum})` }; // Daily Bank Coll.

          // Add conditional formatting / coloring
          excelRow.getCell('D').fill = greenFill as any;
          excelRow.getCell('F').fill = greenFill as any;
          excelRow.getCell('G').fill = yellowFill as any;
          excelRow.getCell('L').fill = yellowFill as any;
          excelRow.getCell('N').fill = redFill as any;

          // Add borders
          excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber <= 18) {
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            }
          });
          
          // Format date column
          excelRow.getCell('A').numFmt = 'm/d/yyyy';
          
          // Number formats for currency columns
          ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].forEach(col => {
              excelRow.getCell(col).numFmt = '#,##0.00_ ;-#,##0.00_ ;"-"??_ ;_@_ ';
          });
          excelRow.getCell('D').numFmt = '#,##0.00';
        });

        const lastRow = days.length + 2;

        worksheet.addConditionalFormatting({
          ref: `C3:C${lastRow}`,
          rules: [
            {
              type: 'cellIs',
              priority: 1,
              operator: 'equal',
              formulae: ['0'],
              style: {
                fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
                font: { color: { argb: 'FF9C0006' }, bold: false }
              }
            }
          ]
        });

        worksheet.addConditionalFormatting({
          ref: `D3:D${lastRow}`,
          rules: [
            {
              type: 'cellIs',
              priority: 2,
              operator: 'equal',
              formulae: ['0'],
              style: {
                fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
                font: { color: { argb: 'FF9C0006' }, bold: false }
              }
            }
          ]
        });

        worksheet.addRow({}); // Add empty row to match screenshot (e.g. row 34)
        const totalRow = worksheet.addRow({}); // Total row (e.g. row 35)
        const totalRowNum = lastRow + 2;
        totalRow.getCell('A').value = 'Total';
        
        // Totals using SUBTOTAL
        totalRow.getCell('C').value = { formula: `SUBTOTAL(9,C3:C${lastRow})` };
        totalRow.getCell('D').value = { formula: `SUBTOTAL(9,D3:D${lastRow})` };
        totalRow.getCell('E').value = { formula: `SUBTOTAL(9,E3:E${lastRow})` };
        totalRow.getCell('F').value = { formula: `SUBTOTAL(9,F3:F${lastRow})` };
        totalRow.getCell('G').value = { formula: `SUBTOTAL(9,G3:G${lastRow})` };
        totalRow.getCell('H').value = { formula: `SUBTOTAL(9,H3:H${lastRow})` };
        totalRow.getCell('I').value = { formula: `SUBTOTAL(9,I3:I${lastRow})` };
        totalRow.getCell('J').value = { formula: `SUBTOTAL(9,J3:J${lastRow})` };
        totalRow.getCell('K').value = { formula: `SUBTOTAL(9,K3:K${lastRow})` };
        totalRow.getCell('L').value = { formula: `SUBTOTAL(9,L3:L${lastRow})` };
        totalRow.getCell('M').value = { formula: `SUBTOTAL(9,M3:M${lastRow})` };
        totalRow.getCell('N').value = { formula: `N2+G${totalRowNum}-M${totalRowNum}` };
        totalRow.getCell('O').value = { formula: `SUBTOTAL(9,O3:O${lastRow})` };
        totalRow.getCell('P').value = { formula: `SUBTOTAL(9,P3:P${lastRow})` };
        totalRow.getCell('Q').value = { formula: `SUBTOTAL(9,Q3:Q${lastRow})` };
        
        // Formatting total row
        totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber <= 18) {
                cell.font = { bold: true };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
        });
        
        // Number formats for total row
        ['C', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].forEach(col => {
            totalRow.getCell(col).numFmt = '#,##0.00_ ;-#,##0.00_ ;"-"??_ ;_@_ ';
        });
        totalRow.getCell('D').numFmt = '#,##0.00';

        // Averages row
        const avgRow = worksheet.addRow({});
        avgRow.getCell('C').value = { formula: `C${totalRowNum}/COUNT(C3:C${lastRow})` };
        avgRow.getCell('D').value = { formula: `D${totalRowNum}/COUNT(D3:D${lastRow})` };
        
        // Formatting avg row
        avgRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= 18) {
              cell.font = { bold: true };
              cell.border = {
                  top: { style: 'thin' },
                  left: { style: 'thin' },
                  bottom: { style: 'thin' },
                  right: { style: 'thin' }
              };
          }
        });
        avgRow.getCell('C').numFmt = '0.0';
        avgRow.getCell('D').numFmt = '#,##0.00';
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Financial_Report_All_Months${!includeHighlighted ? '_NoHighlights' : ''}.xlsx`);
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Failed to generate Excel file');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
        <Calendar size={32} />
      </div>
      
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Financial Report Export</h2>
      <p className="text-gray-500 mb-8 max-w-md text-center">
        Download the detailed financial report containing all months (each month as a different sheet). It includes POS Sales, Manual Sales, Cash, Card, JUICE, and Bank Collections with excel formulas included. Cash deposits reflect the previous day's cash.
      </p>

      <div className="bg-gray-50 rounded-xl p-6 w-full max-w-md mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Include Highlighted Sales</h3>
            <p className="text-xs text-gray-500 mt-1">Include items marked as highlighted in the app.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={includeHighlighted}
              onChange={(e) => setIncludeHighlighted(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={isExporting || Object.keys(allReports).length === 0}
        className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-sm disabled:opacity-70"
      >
        {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
        {isExporting ? 'Generating Excel...' : 'Download Excel Report'}
      </button>
    </div>
  );
};
