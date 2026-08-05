import React, { useMemo } from 'react';
import { format, parseISO, getDaysInMonth, startOfMonth } from 'date-fns';
import { DailyData, MonthlyReport } from '../types';
import { cn } from '../lib/utils';

interface ExcelTableProps {
  report: MonthlyReport;
  showVat?: boolean;
  showPaymentDetails?: boolean;
  showHighlights?: boolean;
}

export const ExcelTable: React.FC<ExcelTableProps> = ({ 
  report, 
  showVat = true, 
  showPaymentDetails = false,
  showHighlights = false
}) => {
  const currentMonthDate = useMemo(() => {
    try {
      const date = parseISO(`${report.month}-01`);
      return isNaN(date.getTime()) ? startOfMonth(new Date()) : date;
    } catch {
      return startOfMonth(new Date());
    }
  }, [report.month]);

  const daysInMonth = getDaysInMonth(currentMonthDate);
  const monthName = format(currentMonthDate, 'MMM yyyy');

  const tableRows = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const dateStr = format(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), dayNum), 'yyyy-MM-dd');
    const dayData = report.days[dateStr] || { visitors: 0, sales: [] };
    const allSales = Array.isArray(dayData.sales) ? dayData.sales : [];
    const sales = showHighlights ? allSales : allSales.filter(s => !s.highlighted);
    
    let totalIncl = 0;
    let quantities = 0;
    sales.forEach(s => {
      const qty = s.quantity || 1;
      totalIncl += s.price * qty;
      quantities += qty;
    });
    
    const totalExcl = totalIncl / 1.15;
    const vatAmount = totalIncl - totalExcl;
    const visitors = dayData.visitors;
    const transactions = sales.length; 
    
    const conversion = visitors > 0 ? (transactions / visitors) : 0;
    const ept = transactions > 0 ? (totalIncl / transactions) : 0;
    const upt = transactions > 0 ? (quantities / transactions) : 0;
    const aur = quantities > 0 ? (totalIncl / quantities) : 0;
    
    const productsSold = sales.map((s, idx) => {
      const qty = s.quantity || 1;
      const price = s.price || 0;
      const payment = s.paymentMethod || 'cash';
      let methodLabel = '';
      if (s.isGift) {
        methodLabel = 'GIFT';
      } else if (payment === 'split' && s.splitPayments) {
        methodLabel = s.splitPayments.map(p => `${p.method.toUpperCase()} AMOUNT: ${p.amount.toLocaleString()}`).join(' | ');
      } else {
        methodLabel = payment === 'juice' ? `J:${s.transactionId}` : payment.toUpperCase();
      }
      
      return (
        <div key={s.id || `sale-${idx}`} className={cn("mb-1 last:mb-0 px-1 rounded", s.highlighted ? "bg-green-100" : "")}>
          • {s.productName} ({price.toLocaleString()} MUR) (x{qty}) 
          {showPaymentDetails && (
            <span className="font-bold text-red-600 ml-1">
              [{methodLabel}]
            </span>
          )}
        </div>
      );
    });

    const paymentBreakdown = { cash: 0, card: 0, juice: 0 };
    if (showPaymentDetails) {
      sales.forEach(s => {
        if (s.paymentMethod === 'split' && s.splitPayments) {
          s.splitPayments.forEach(split => {
            paymentBreakdown[split.method as keyof typeof paymentBreakdown] += split.amount;
          });
        } else {
          const method = s.paymentMethod || 'cash';
          paymentBreakdown[method as keyof typeof paymentBreakdown] += s.price * (s.quantity || 1);
        }
      });
    }

    return {
      date: format(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), dayNum), 'dd/MM/yyyy'),
      day: format(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), dayNum), 'EEEE'),
      totalExcl,
      vatAmount,
      totalIncl,
      visitors,
      transactions,
      quantities,
      conversion,
      ept,
      upt,
      aur,
      productsSold,
      paymentBreakdown
    };
  });

  const totals = tableRows.reduce((acc, row) => ({
    totalExcl: acc.totalExcl + row.totalExcl,
    vatAmount: acc.vatAmount + row.vatAmount,
    totalIncl: acc.totalIncl + row.totalIncl,
    visitors: acc.visitors + row.visitors,
    transactions: acc.transactions + row.transactions,
    quantities: acc.quantities + row.quantities,
    paymentBreakdown: {
      cash: acc.paymentBreakdown.cash + row.paymentBreakdown.cash,
      card: acc.paymentBreakdown.card + row.paymentBreakdown.card,
      juice: acc.paymentBreakdown.juice + row.paymentBreakdown.juice,
    }
  }), { totalExcl: 0, vatAmount: 0, totalIncl: 0, visitors: 0, transactions: 0, quantities: 0, paymentBreakdown: { cash: 0, card: 0, juice: 0 } });

  const totalConversion = totals.visitors > 0 ? (totals.transactions / totals.visitors) : 0;
  const totalEPT = totals.transactions > 0 ? (totals.totalIncl / totals.transactions) : 0;
  const totalUPT = totals.transactions > 0 ? (totals.quantities / totals.transactions) : 0;
  const totalAUR = totals.quantities > 0 ? (totals.totalIncl / totals.quantities) : 0;

  const workingDays = useMemo(() => {
    const today = new Date();
    const reportYear = currentMonthDate.getFullYear();
    const reportMonth = currentMonthDate.getMonth();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    
    if (reportYear === todayYear && reportMonth === todayMonth) {
      return today.getDate();
    } else if (reportYear < todayYear || (reportYear === todayYear && reportMonth < todayMonth)) {
      return daysInMonth;
    } else {
      return 0; // Future month
    }
  }, [currentMonthDate, daysInMonth]);

  return (
    <div id="monthly-report-table" className="overflow-x-auto bg-white p-6 font-sans text-[13px]">
      <div className="mb-6">
        <div className="flex border border-black max-w-2xl">
          <div className="w-32 border-r border-black bg-gray-100 px-3 py-2 font-bold">Store Name</div>
          <div className="flex-1 bg-yellow-200 px-3 py-2 font-bold text-base">{report.storeName}</div>
        </div>
        <div className="flex border-x border-b border-black max-w-2xl">
          <div className="w-32 border-r border-black bg-gray-100 px-3 py-2 font-bold">Month :</div>
          <div className="flex-1 bg-yellow-200 px-3 py-2 font-bold text-base">{monthName}</div>
        </div>
      </div>

      <table className="w-full border-collapse border border-black text-center min-w-[1000px]">
        <thead>
          <tr className="bg-[#99ccff] font-bold">
            <th className="border border-black px-2 py-3">Date</th>
            <th className="border border-black px-2 py-3">Day</th>
            {showVat ? (
              <>
                <th className="border border-black px-2 py-3">Excl. VAT (MUR)</th>
                <th className="border border-black px-2 py-3">VAT 15% (MUR)</th>
                <th className="border border-black px-2 py-3">Total (Incl. VAT)</th>
              </>
            ) : (
              <th className="border border-black px-2 py-3">Net sales Value (MUR)</th>
            )}
            <th className="border border-black px-2 py-3">No. of Visitors</th>
            <th className="border border-black px-2 py-3">No. of transactions</th>
            <th className="border border-black px-2 py-3">No. of Quantities (units)</th>
            <th className="border border-black px-2 py-3">Conversion</th>
            <th className="border border-black px-2 py-3">EPT</th>
            <th className="border border-black px-2 py-3">UPT</th>
            <th className="border border-black px-2 py-3">AUR</th>
            <th className="border border-black px-2 py-3 w-64">Product sold</th>
            {showPaymentDetails && <th className="border border-black px-2 py-3">Payment Breakdown</th>}
          </tr>
          <tr className="bg-[#99ccff] text-[10px]">
            <th className="border border-black">1</th>
            <th className="border border-black">2</th>
            {showVat ? (
              <>
                <th className="border border-black">3</th>
                <th className="border border-black">4</th>
                <th className="border border-black">5</th>
              </>
            ) : (
              <th className="border border-black">3</th>
            )}
            <th className="border border-black">{showVat ? "6" : "4"}</th>
            <th className="border border-black">{showVat ? "7" : "5"}</th>
            <th className="border border-black">{showVat ? "8" : "6"}</th>
            <th className="border border-black">{showVat ? "9 = 7/6" : "7 = 5/4"}</th>
            <th className="border border-black">{showVat ? "10 = 5/7" : "8 = 3/5"}</th>
            <th className="border border-black">{showVat ? "11 = 8/7" : "9 = 6/5"}</th>
            <th className="border border-black">{showVat ? "12 = 5/8" : "10 = 3/6"}</th>
            <th className="border border-black"></th>
            {showPaymentDetails && <th className="border border-black"></th>}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, idx) => (
            <tr key={`excel-row-${row.date || idx}`} className={cn(row.totalIncl > 0 ? "bg-white" : "bg-gray-50")}>
              <td className="border border-black py-2">{row.date}</td>
              <td className="border border-black py-2">{row.day}</td>
              {showVat ? (
                <>
                  <td className="border border-black py-2">{row.totalExcl > 0 ? row.totalExcl.toFixed(2) : ""}</td>
                  <td className="border border-black py-2">{row.vatAmount > 0 ? row.vatAmount.toFixed(2) : ""}</td>
                  <td className="border border-black py-2 font-bold">{row.totalIncl > 0 ? row.totalIncl.toFixed(2) : ""}</td>
                </>
              ) : (
                <td className="border border-black py-2 font-medium">{row.totalIncl > 0 ? row.totalIncl.toFixed(2) : ""}</td>
              )}
              <td className="border border-black py-2">{row.visitors > 0 ? row.visitors : ""}</td>
              <td className="border border-black py-2">{row.transactions > 0 ? row.transactions : ""}</td>
              <td className="border border-black py-2">{row.quantities > 0 ? row.quantities : ""}</td>
              <td className="border border-black py-2">{row.conversion > 0 ? (row.conversion * 100).toFixed(2) + "%" : (row.visitors > 0 ? "0.00%" : "#DIV/0!")}</td>
              <td className="border border-black py-2">{row.ept > 0 ? Math.round(row.ept) : (row.transactions > 0 ? "0" : "#DIV/0!")}</td>
              <td className="border border-black py-2">{row.upt > 0 ? row.upt.toFixed(2) : (row.transactions > 0 ? "0.00" : "#DIV/0!")}</td>
              <td className="border border-black py-2">{row.aur > 0 ? Math.round(row.aur) : (row.quantities > 0 ? "0" : "#DIV/0!")}</td>
              <td className="border border-black py-2 text-left px-2 break-words min-w-[200px] leading-relaxed">{row.productsSold}</td>
              {showPaymentDetails && (
                <td className="border border-black py-2 text-xs text-left px-2">
                  <div className="flex flex-col">
                    <span>Cash: {row.paymentBreakdown.cash.toFixed(0)}</span>
                    <span>Card: {row.paymentBreakdown.card.toFixed(0)}</span>
                    <span>Juice: {row.paymentBreakdown.juice.toFixed(0)}</span>
                  </div>
                </td>
              )}
            </tr>
          ))}
          <tr className="bg-[#ffff00] font-bold text-base">
            <td colSpan={2} className="border border-black py-3">TOTAL</td>
            {showVat ? (
              <>
                <td className="border border-black py-3">{totals.totalExcl.toFixed(2)}</td>
                <td className="border border-black py-3">{totals.vatAmount.toFixed(2)}</td>
                <td className="border border-black py-3">{totals.totalIncl.toFixed(2)}</td>
              </>
            ) : (
              <td className="border border-black py-3">{totals.totalIncl.toFixed(2)}</td>
            )}
            <td className="border border-black py-3">{totals.visitors.toFixed(0)}</td>
            <td className="border border-black py-3">{totals.transactions.toFixed(0)}</td>
            <td className="border border-black py-3">{totals.quantities.toFixed(0)}</td>
            <td className="border border-black py-3">{(totalConversion * 100).toFixed(2)}%</td>
            <td className="border border-black py-3">{Math.round(totalEPT)}</td>
            <td className="border border-black py-3">{totalUPT.toFixed(2)}</td>
            <td className="border border-black py-3">{Math.round(totalAUR)}</td>
            <td className="border border-black py-3"></td>
            {showPaymentDetails && (
              <td className="border border-black py-3 text-xs text-left px-2">
                <div className="flex flex-col">
                  <span>Cash: {totals.paymentBreakdown.cash.toFixed(0)}</span>
                  <span>Card: {totals.paymentBreakdown.card.toFixed(0)}</span>
                  <span>Juice: {totals.paymentBreakdown.juice.toFixed(0)}</span>
                </div>
              </td>
            )}
          </tr>
        </tbody>
      </table>

      <div className="mt-10 grid grid-cols-5 gap-0 w-[750px] border border-black text-sm">
        <div className="bg-[#00b050] text-white font-bold border-r border-b border-black p-2">MONTHS</div>
        <div className="bg-[#00b050] text-white font-bold border-r border-b border-black p-2">Working Days</div>
        <div className="bg-[#00b050] text-white font-bold border-r border-b border-black p-2">QUANTITY SOLD</div>
        <div className="bg-[#00b050] text-white font-bold border-r border-b border-black p-2">TOTAL SALES</div>
        <div className="bg-[#ffc000] font-bold border-b border-black p-2">DAILY AVG</div>
        
        <div className="bg-[#92d050] border-r border-black p-3 font-bold text-base">{format(currentMonthDate, 'MMM')}</div>
        <div className="bg-[#92d050] border-r border-black p-3 text-center text-base">{workingDays}</div>
        <div className="bg-[#92d050] border-r border-black p-3 text-center text-base font-bold">{totals.quantities.toFixed(0)}</div>
        <div className="bg-[#00b0f0] border-r border-black p-3 text-center text-base font-bold">{totals.totalIncl.toFixed(2)}</div>
        <div className="bg-[#00b0f0] p-3 text-center text-base font-bold">
          {workingDays > 0 
            ? (totals.totalIncl / workingDays).toFixed(2)
            : "0.00"}
        </div>
      </div>
    </div>
  );
};
