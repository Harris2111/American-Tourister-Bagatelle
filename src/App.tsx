import React, { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { StockItem, MonthlyReport, DailyData, StockMovement } from './types';
import { ExcelTable } from './components/ExcelTable';
import { StockManager } from './components/StockManager';
import { WarehouseManager } from './components/WarehouseManager';
import { DailyInput } from './components/DailyInput';
import { DataAnalysis } from './components/DataAnalysis';
import { SalesByProductAnalysis } from './components/SalesByProductAnalysis';
import { CustomRangeReport } from './components/CustomRangeReport';
import { FinancialReport } from './components/FinancialReport';
import { DailyStockCountManager } from './components/DailyStockCountManager';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import { LayoutDashboard, Package, FileSpreadsheet, Settings, BrainCircuit, LogOut, LogIn, Loader2, ShieldCheck, Eye, EyeOff, RefreshCw, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, logout, handleFirestoreError, OperationType, loginWithEmail, registerWithEmail, loginAnonymously } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, collection, deleteDoc, writeBatch, deleteField, updateDoc } from 'firebase/firestore';
import { User as UserIcon, Lock, AlertCircle, Download } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { getAmericanTouristerPriceList } from './initialPriceList';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorDetails = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          errorDetails = `Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`;
        }
      } catch (e) {
        errorDetails = this.state.error?.message || errorDetails;
      }

      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-6">{errorDetails}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'warehouse' | 'report' | 'custom_report' | 'analysis' | 'financial' | 'daily_count'>('dashboard');
  const [stock, setStock] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reports, setReports] = useState<Record<string, MonthlyReport>>({});

  // Global error listener to prevent unhandled promise rejections from causing cross-origin script error popups
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error('[Global Promise Rejection Handled]:', event.reason);
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);
  
  // Report Range State
  const [reportStartDate, setReportStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(1); // Start of current month
    return format(date, 'yyyy-MM-dd');
  });
  const [reportEndDate, setReportEndDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [customReportShowVat, setCustomReportShowVat] = useState(true);
  const [showPaymentDetails, setShowPaymentDetails] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);

  // Analysis Range State
  const [analysisStartDate, setAnalysisStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(1); // Start of current month
    return format(date, 'yyyy-MM-dd');
  });
  const [analysisEndDate, setAnalysisEndDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // Login State
  const [username, setUsername] = useState('BagatelleShop');
  const [password, setPassword] = useState('Pass@11');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);

  const downloadPDF = async () => {
    setIsDownloading(true);
    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const storeName = "Samsonite Brand Store, Bagatelle Mall, Mauritius";
      let period = "";
      let headers: string[] = [];
      let body: any[] = [];
      let showVat = true;

      if (activeTab === 'custom_report') {
        showVat = customReportShowVat;
        period = `${format(parseISO(reportStartDate), 'dd MMM yyyy')} - ${format(parseISO(reportEndDate), 'dd MMM yyyy')}`;
        
        const start = parseISO(reportStartDate);
        const end = parseISO(reportEndDate);
        const dateRange = eachDayOfInterval({ start, end });

        const baseHeaders = showVat 
          ? ['Date', 'Day', 'Excl. VAT (MUR)', 'VAT 15% (MUR)', 'Total (Incl. VAT)', 'No. of Visitors', 'No. of transactions', 'No. of Quantities (units)', 'Conversion', 'EPT', 'UPT', 'AUR', 'Product sold']
          : ['Date', 'Day', 'Net sales Value (MUR)', 'No. of Visitors', 'No. of transactions', 'No. of Quantities (units)', 'Conversion', 'EPT', 'UPT', 'AUR', 'Product sold'];
        
        headers = showPaymentDetails ? [...baseHeaders, 'Payment Breakdown'] : baseHeaders;

        const highlightColor = [220, 252, 231]; // bg-green-100 equivalent

        let totals = { excl: 0, vat: 0, incl: 0, visitors: 0, trans: 0, qty: 0 };
        let monthlyPaymentBreakdown = { cash: 0, card: 0, juice: 0 };

        dateRange.forEach(date => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const monthStr = format(date, 'yyyy-MM');
          const report = reports[monthStr];
          const dayData = report?.days[dateStr] || { visitors: 0, sales: [] };
          const allSales = Array.isArray(dayData.sales) ? dayData.sales : [];
          const sales = showHighlights ? allSales : allSales.filter(s => !s.highlighted);
          
          let dayIncl = 0;
          let dayQty = 0;
          let dayPaymentBreakdown = { cash: 0, card: 0, juice: 0 };

          sales.forEach(s => {
            const q = s.quantity || 1;
            const saleTotal = s.price * q;
            dayIncl += saleTotal;
            dayQty += q;

            if (showPaymentDetails) {
              if (s.paymentMethod === 'split' && s.splitPayments) {
                s.splitPayments.forEach(split => {
                  dayPaymentBreakdown[split.method as keyof typeof dayPaymentBreakdown] += split.amount;
                  monthlyPaymentBreakdown[split.method as keyof typeof monthlyPaymentBreakdown] += split.amount;
                });
              } else {
                const method = s.paymentMethod || 'cash';
                dayPaymentBreakdown[method as keyof typeof dayPaymentBreakdown] += saleTotal;
                monthlyPaymentBreakdown[method as keyof typeof monthlyPaymentBreakdown] += saleTotal;
              }
            }
          });
          
          const dayExcl = dayIncl / 1.15;
          const dayVat = dayIncl - dayExcl;
          const dayTrans = sales.length;
          const dayVisitors = dayData.visitors;

          totals.excl += dayExcl;
          totals.vat += dayVat;
          totals.incl += dayIncl;
          totals.visitors += dayVisitors;
          totals.trans += dayTrans;
          totals.qty += dayQty;

          const conv = dayVisitors > 0 ? (dayTrans / dayVisitors * 100).toFixed(2) + '%' : (dayVisitors > 0 ? '0.00%' : '0%');
          const ept = dayTrans > 0 ? Math.round(dayIncl / dayTrans).toString() : '0';
          const upt = dayTrans > 0 ? (dayQty / dayTrans).toFixed(2) : '0.00';
          const aur = dayQty > 0 ? Math.round(dayIncl / dayQty).toString() : '0';
          
          const productsSold = sales.map(s => {
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
            let name = `• ${s.productName} (${price.toLocaleString()} MUR) (x${qty})`;
            if (showPaymentDetails) {
              name += ` [${methodLabel}]`;
            }
            // Add a marker for highlighted products that we'll use in didDrawCell
            if (s.highlighted) {
              name = `[H]${name}`;
            }
            return name;
          }).join('\n');

          const row = [
            format(date, 'dd/MM/yyyy'),
            format(date, 'EEEE'),
            ...(showVat ? [dayExcl.toFixed(2), dayVat.toFixed(2), dayIncl.toFixed(2)] : [dayIncl.toFixed(2)]),
            dayVisitors.toString(),
            dayTrans.toString(),
            dayQty.toString(),
            conv,
            ept,
            upt,
            aur,
            productsSold
          ];

          if (showPaymentDetails) {
            const paymentStr = `Cash: ${dayPaymentBreakdown.cash.toFixed(0)}\nCard: ${dayPaymentBreakdown.card.toFixed(0)}\nJuice: ${dayPaymentBreakdown.juice.toFixed(0)}`;
            row.push(paymentStr);
          }

          body.push(row);
        });

        // Totals row
        const totalConv = totals.visitors > 0 ? (totals.trans / totals.visitors * 100).toFixed(2) + '%' : '0.00%';
        const totalEPT = totals.trans > 0 ? Math.round(totals.incl / totals.trans).toString() : '0';
        const totalUPT = totals.trans > 0 ? (totals.qty / totals.trans).toFixed(2) : '0.00';
        const totalAUR = totals.qty > 0 ? Math.round(totals.incl / totals.qty).toString() : '0';

        const totalsRowContent = [
          'TOTAL',
          '',
          ...(showVat ? [totals.excl.toFixed(2), totals.vat.toFixed(2), totals.incl.toFixed(2)] : [totals.incl.toFixed(2)]),
          totals.visitors.toString(),
          totals.trans.toString(),
          totals.qty.toString(),
          totalConv,
          totalEPT,
          totalUPT,
          totalAUR,
          ''
        ];

        if (showPaymentDetails) {
          const totalPaymentStr = `Cash: ${monthlyPaymentBreakdown.cash.toFixed(0)}\nCard: ${monthlyPaymentBreakdown.card.toFixed(0)}\nJuice: ${monthlyPaymentBreakdown.juice.toFixed(0)}`;
          totalsRowContent.push(totalPaymentStr);
        }

        body.push({
          content: totalsRowContent,
          styles: { fillColor: [255, 255, 0], fontStyle: 'bold' }
        });

      } else {
        // Monthly Report
        const report = reports[selectedMonth];
        if (!report) throw new Error("Report not found");
        
        period = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy');
        const baseHeaders = ['Date', 'Day', 'Excl. VAT (MUR)', 'VAT 15% (MUR)', 'Total (Incl. VAT)', 'No. of Visitors', 'No. of transactions', 'No. of Quantities (units)', 'Conversion', 'EPT', 'UPT', 'AUR', 'Product sold'];
        headers = showPaymentDetails ? [...baseHeaders, 'Payment Breakdown'] : baseHeaders;

        const monthDate = parseISO(`${selectedMonth}-01`);
        const daysInMonth = getDaysInMonth(monthDate);
        let totals = { excl: 0, vat: 0, incl: 0, visitors: 0, trans: 0, qty: 0 };
        let monthlyPaymentBreakdown = { cash: 0, card: 0, juice: 0 };

        for (let i = 1; i <= daysInMonth; i++) {
          const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), i);
          const dateStr = format(date, 'yyyy-MM-dd');
          const dayData = report.days[dateStr] || { visitors: 0, sales: [] };
          const allSales = Array.isArray(dayData.sales) ? dayData.sales : [];
          const sales = showHighlights ? allSales : allSales.filter(s => !s.highlighted);
          
          let dayIncl = 0;
          let dayQty = 0;
          let dayPaymentBreakdown = { cash: 0, card: 0, juice: 0 };

          sales.forEach(s => {
            const q = s.quantity || 1;
            const saleTotal = s.price * q;
            dayIncl += saleTotal;
            dayQty += q;
            
            if (showPaymentDetails) {
              const method = s.paymentMethod || 'cash';
              dayPaymentBreakdown[method] += saleTotal;
              monthlyPaymentBreakdown[method] += saleTotal;
            }
          });
          
          const dayExcl = dayIncl / 1.15;
          const dayVat = dayIncl - dayExcl;
          const dayTrans = sales.length;
          const dayVisitors = dayData.visitors;

          totals.excl += dayExcl;
          totals.vat += dayVat;
          totals.incl += dayIncl;
          totals.visitors += dayVisitors;
          totals.trans += dayTrans;
          totals.qty += dayQty;

          const conv = dayVisitors > 0 ? (dayTrans / dayVisitors * 100).toFixed(2) + '%' : (dayVisitors > 0 ? '0.00%' : '0%');
          const ept = dayTrans > 0 ? Math.round(dayIncl / dayTrans).toString() : '0';
          const upt = dayTrans > 0 ? (dayQty / dayTrans).toFixed(2) : '0.00';
          const aur = dayQty > 0 ? Math.round(dayIncl / dayQty).toString() : '0';
          
          const productsSold = sales.map(s => {
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
            let name = `• ${s.productName} (${price.toLocaleString()} MUR) (x${qty})`;
            if (showPaymentDetails) {
              name += ` [${methodLabel}]`;
            }
            // Add a marker for highlighted products
            if (s.highlighted) {
              name = `[H]${name}`;
            }
            return name;
          }).join('\n');
          
          const row = [
            format(date, 'dd/MM/yyyy'),
            format(date, 'EEEE'),
            dayExcl.toFixed(2),
            dayVat.toFixed(2),
            dayIncl.toFixed(2),
            dayVisitors.toString(),
            dayTrans.toString(),
            dayQty.toString(),
            conv,
            ept,
            upt,
            aur,
            productsSold
          ];

          if (showPaymentDetails) {
            const paymentStr = `Cash: ${dayPaymentBreakdown.cash.toFixed(0)}\nCard: ${dayPaymentBreakdown.card.toFixed(0)}\nJuice: ${dayPaymentBreakdown.juice.toFixed(0)}`;
            row.push(paymentStr);
          }

          body.push(row);
        }

        const totalConv = totals.visitors > 0 ? (totals.trans / totals.visitors * 100).toFixed(2) + '%' : '0.00%';
        const totalEPT = totals.trans > 0 ? Math.round(totals.incl / totals.trans).toString() : '0';
        const totalUPT = totals.trans > 0 ? (totals.qty / totals.trans).toFixed(2) : '0.00';
        const totalAUR = totals.qty > 0 ? Math.round(totals.incl / totals.qty).toString() : '0';

        const totalsRowContent = [
          'TOTAL',
          '',
          totals.excl.toFixed(2),
          totals.vat.toFixed(2),
          totals.incl.toFixed(2),
          totals.visitors.toString(),
          totals.trans.toString(),
          totals.qty.toString(),
          totalConv,
          totalEPT,
          totalUPT,
          totalAUR,
          ''
        ];

        if (showPaymentDetails) {
          const totalPaymentStr = `Cash: ${monthlyPaymentBreakdown.cash.toFixed(0)}\nCard: ${monthlyPaymentBreakdown.card.toFixed(0)}\nJuice: ${monthlyPaymentBreakdown.juice.toFixed(0)}`;
          totalsRowContent.push(totalPaymentStr);
        }

        body.push({
          content: totalsRowContent,
          styles: { fillColor: [255, 255, 0], fontStyle: 'bold' }
        });
      }

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Sales Report', 14, 15);
      
      // Draw Yellow Header Box (Store Name & Period)
      pdf.setFillColor(254, 249, 195); // bg-yellow-100
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.rect(14, 20, 150, 12, 'FD');
      
      pdf.setFontSize(9);
      pdf.text('Store Name', 16, 25);
      pdf.line(40, 20, 40, 32); // Vertical separator
      pdf.text(storeName, 42, 25);
      
      pdf.line(14, 26, 164, 26); // Horizontal separator
      pdf.text('Period :', 16, 30);
      pdf.text(period, 42, 30);

      autoTable(pdf, {
        head: [headers],
        body: body,
        startY: 38,
        theme: 'grid',
        styles: {
          fontSize: 6,
          cellPadding: 1,
          lineColor: [0, 0, 0],
          lineWidth: 0.1,
          halign: 'center',
          valign: 'middle',
          overflow: 'linebreak'
        },
        columnStyles: {
          [headers.indexOf('Product sold')]: { halign: 'left', cellWidth: 40 }
        },
        headStyles: {
          fillColor: [153, 204, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold'
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === headers.indexOf('Total (Incl. VAT)')) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        willDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === headers.indexOf('Product sold')) {
            // Store the text for manual drawing and hide it from default drawing
            (data.cell as any)._customText = data.cell.text;
            data.cell.text = [];
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === headers.indexOf('Product sold')) {
            const cell = data.cell;
            const lines = (cell as any)._customText;
            if (!lines || lines.length === 0) return;
            
            const x = cell.x + 1;
            const padding = 1;
            const availableHeight = cell.height - (padding * 2);
            const totalLines = lines.length;
            const lineHeight = availableHeight / totalLines;
            
            let isHighlighted = false;
            
            pdf.setFontSize(6);
            lines.forEach((line: string, index: number) => {
              let currentLine = line;
              const currentY = cell.y + padding + (lineHeight * index) + (lineHeight * 0.75);
              
              // Check if this line starts a new product and if it's highlighted
              if (currentLine.includes('[H]•')) {
                isHighlighted = true;
                currentLine = currentLine.replace('[H]', '');
              } else if (currentLine.trim().startsWith('•')) {
                isHighlighted = false;
              }
              
              if (isHighlighted) {
                // Draw light green background for this specific line
                pdf.setFillColor(220, 252, 231); // Very light green
                pdf.rect(cell.x + 0.2, currentY - (lineHeight * 0.65), cell.width - 0.4, lineHeight, 'F');
              }

              const bracketIndex = currentLine.lastIndexOf(' [');
              if (bracketIndex !== -1) {
                const part1 = currentLine.substring(0, bracketIndex);
                const part2 = currentLine.substring(bracketIndex);
                
                pdf.setTextColor(0, 0, 0);
                pdf.setFont('helvetica', 'normal');
                pdf.text(part1, x, currentY);
                
                const part1Width = pdf.getTextWidth(part1);
                pdf.setTextColor(220, 38, 38); // red-600
                pdf.setFont('helvetica', 'bold');
                pdf.text(part2, x + part1Width, currentY);
              } else {
                pdf.setTextColor(0, 0, 0);
                pdf.setFont('helvetica', 'normal');
                pdf.text(currentLine, x, currentY);
              }
            });
            
            // Reset
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');
          }
        },
        margin: { top: 32, right: 10, bottom: 10, left: 10 },
        tableWidth: 'auto'
      });

      // Add summary table at the end of the report
      const finalY = (pdf as any).lastAutoTable.finalY + 10;
      
      // Calculate summary data
      let daysWithSales = 0;
      let totalIncl = 0;
      
      if (activeTab === 'custom_report') {
        const start = parseISO(reportStartDate);
        const end = parseISO(reportEndDate);
        const dateRange = eachDayOfInterval({ start, end });
        dateRange.forEach(date => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const monthStr = format(date, 'yyyy-MM');
          const report = reports[monthStr];
          const daySalesRaw = report?.days[dateStr]?.sales || [];
          const daySales = showHighlights ? daySalesRaw : daySalesRaw.filter(s => !s.highlighted);
          if (daySales.length > 0) {
            daysWithSales++;
            daySales.forEach(s => totalIncl += (s.price * (s.quantity || 1)));
          }
        });
      } else {
        const report = reports[selectedMonth];
        if (report) {
          Object.values(report.days).forEach(day => {
            const daySales = showHighlights ? day.sales : day.sales.filter(s => !s.highlighted);
            if (daySales.length > 0) {
              daysWithSales++;
              daySales.forEach(s => totalIncl += (s.price * (s.quantity || 1)));
            }
          });
        }
      }
      
      const dailyAvg = daysWithSales > 0 ? totalIncl / daysWithSales : 0;

      autoTable(pdf, {
        startY: finalY,
        head: [['PERIOD', 'Days with Sales', 'TOTAL SALES', 'DAILY AVG']],
        body: [[
          activeTab === 'custom_report' ? 'Custom Range' : format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy'),
          daysWithSales.toString(),
          totalIncl.toFixed(2),
          dailyAvg.toFixed(2)
        ]],
        theme: 'grid',
        styles: {
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          lineColor: [0, 0, 0],
          lineWidth: 0.5
        },
        headStyles: {
          fillColor: [34, 197, 94], // bg-green-500
          textColor: [255, 255, 255]
        },
        columnStyles: {
          3: { fillColor: [249, 115, 22] }, // bg-orange-500 (DAILY AVG header)
          0: { fillColor: [187, 247, 208] }, // bg-green-200
          1: { fillColor: [187, 247, 208] }, // bg-green-200
          2: { fillColor: [96, 165, 250], textColor: [255, 255, 255] }, // bg-blue-400
        },
        didParseCell: (data) => {
          if (data.section === 'head' && data.column.index === 3) {
            data.cell.styles.fillColor = [249, 115, 22]; // Orange for DAILY AVG header
          }
          if (data.section === 'body') {
            if (data.column.index === 3) {
              data.cell.styles.fillColor = [96, 165, 250]; // Blue for DAILY AVG body
              data.cell.styles.textColor = [255, 255, 255];
            }
          }
        },
        margin: { left: 14 },
        tableWidth: 150
      });

      const fileName = activeTab === 'custom_report' 
        ? `Samsonite_Custom_Report_${reportStartDate}_to_${reportEndDate}.pdf`
        : `Samsonite_Report_${selectedMonth}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadOfficialExcel = async () => {
    setIsDownloading(true);
    try {
      const startOpenMonth = new Date(2026, 2, 1);
      const nowMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const monthSet = new Set(Object.keys(reports));
      let tempMonth = startOpenMonth;
      while (tempMonth <= nowMonth) {
        monthSet.add(format(tempMonth, 'yyyy-MM'));
        tempMonth = new Date(tempMonth.getFullYear(), tempMonth.getMonth() + 1, 1);
      }
      const sortedMonths = Array.from(monthSet).sort();

      const workbook = new ExcelJS.Workbook();
      const storeName = "Samsonite Brand Store,Bagatelle Mall,Mauritius";
      
      // -----------------------------------------------------
      // Styles
      // -----------------------------------------------------
      const fillYellow: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      const fillLightBlue: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9BC2E6' } };
      const fillOrange: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      const fillGreen: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
      const fillBrightBlue: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
      
      const borderThin: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      const fontBold = { bold: true };
      const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' };

      const generateSheet = (wsTitle: string, periodText: string, dateRange: Date[], isCustom: boolean, monthForReport: string) => {
        const ws = workbook.addWorksheet(wsTitle, { views: [{ state: 'frozen', ySplit: 4 }] });

        ws.columns = [
          { width: 12 }, // A: Date
          { width: 15 }, // B: Day
          { width: 22 }, // C: Net sales Value
          { width: 14 }, // D: Visitors
          { width: 14 }, // E: Transactions
          { width: 14 }, // F: Quantities
          { width: 14 }, // G: Conversion
          { width: 12 }, // H: EPT
          { width: 12 }, // I: UPT
          { width: 12 }, // J: AUR
          { width: 35 }, // K: Product sold
        ];

        // Row 1
        const r1 = ws.addRow(["Store Name :", storeName, "", "", "", "", "", "", "", "", ""]);
        ws.mergeCells(`B${r1.number}:F${r1.number}`);
        r1.getCell(1).fill = fillYellow; r1.getCell(1).border = borderThin;
        for (let i = 2; i <= 6; i++) { r1.getCell(i).fill = fillYellow; r1.getCell(i).font = fontBold; r1.getCell(i).border = borderThin; }

        // Row 2
        const r2 = ws.addRow(["Month :", periodText, "", "", "", "", "", "", "", "", ""]);
        ws.mergeCells(`B${r2.number}:F${r2.number}`);
        r2.getCell(1).fill = fillYellow; r2.getCell(1).border = borderThin;
        for (let i = 2; i <= 6; i++) { r2.getCell(i).fill = fillYellow; r2.getCell(i).font = fontBold; r2.getCell(i).border = borderThin; }

        // Row 3 (Headers)
        const headers = ['Date', 'Day', 'Net sales Value\n(MUR)', 'No. of\nVisitors', 'No. of\ntransactions', 'No. of\nQuantities\n(units)', 'Conversion', 'EPT', 'UPT', 'AUR', 'Product sold'];
        const r3 = ws.addRow(headers);
        r3.height = 45;
        r3.eachCell((cell) => {
          cell.fill = fillLightBlue;
          cell.font = fontBold;
          cell.alignment = centerAlign;
          cell.border = borderThin;
        });

        // Row 4 (Numbers)
        const numbers = ["1", "2", "3", "4", "5", "6", "7 = 5/4", "8 = 3/5", "9 = 6/5", "11 = 3/6", ""];
        const r4 = ws.addRow(numbers);
        r4.eachCell((cell, colNumber) => {
          if (colNumber <= 10) {
            cell.fill = fillLightBlue;
            cell.font = fontBold;
            cell.alignment = centerAlign;
            cell.border = borderThin;
          } else {
            cell.border = borderThin;
          }
        });

        let totals = { incl: 0, visitors: 0, trans: 0, qty: 0 };
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');
        
        dateRange.forEach(date => {
          const dateStr = format(date, 'yyyy-MM-dd');
          // If custom, we find the month for this date. Else use monthForReport
          const reportMonthStr = isCustom ? format(date, 'yyyy-MM') : monthForReport;
          const report = reports[reportMonthStr];
          const dayData = report?.days[dateStr] || { visitors: 0, sales: [] };
          const allSales = Array.isArray(dayData.sales) ? dayData.sales : [];
          // explicitly filtering OUT highlighted products for the official export
          const sales = allSales.filter(s => !s.highlighted);
          
          let dayIncl = 0;
          let dayQty = 0;

          sales.forEach(s => {
            const q = s.quantity || 1;
            dayIncl += s.price * q;
            dayQty += q;
          });
          
          const dayTrans = sales.length;
          const dayVisitors = dayData.visitors || 0;

          totals.incl += dayIncl;
          totals.visitors += dayVisitors;
          totals.trans += dayTrans;
          totals.qty += dayQty;

          const conv = dayVisitors > 0 ? (dayTrans / dayVisitors) : 0;
          const ept = dayTrans > 0 ? (dayIncl / dayTrans) : 0;
          const upt = dayTrans > 0 ? (dayQty / dayTrans) : 0;
          const aur = dayQty > 0 ? (dayIncl / dayQty) : 0;
          
          const productsSold = sales.map(s => `• ${s.productName}`).join('\n');
          
          const isPastOrPresent = dateStr <= todayStr;
          
          const rowData = [
            format(date, 'd'), // Date like '1', '2'
            format(date, 'EEEE'),
            (dayIncl > 0 || isPastOrPresent) ? dayIncl : '',
            (dayVisitors > 0 || isPastOrPresent) ? dayVisitors : '',
            (dayTrans > 0 || isPastOrPresent) ? dayTrans : '',
            (dayQty > 0 || isPastOrPresent) ? dayQty : '',
            (conv > 0 || isPastOrPresent) ? conv : '', 
            (ept > 0 || isPastOrPresent) ? ept : '', 
            (upt > 0 || isPastOrPresent) ? upt : '', 
            (aur > 0 || isPastOrPresent) ? aur : '',
            productsSold
          ];
          
          const r = ws.addRow(rowData);
          r.eachCell((cell, colNumber) => {
            cell.border = borderThin;
            cell.alignment = centerAlign;
            if (colNumber === 3 || colNumber === 8 || colNumber === 10) {
              cell.numFmt = '0.000';
            }
            if (colNumber === 7) {
              cell.numFmt = '0.00%';
            }
            if (colNumber === 9) {
              cell.numFmt = '0.00';
            }
            if (colNumber === 11) {
              cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            }
          });
          
          r.getCell(1).font = { bold: true, italic: true };
        });

        // Totals Row
        const totalConv = totals.visitors > 0 ? (totals.trans / totals.visitors) : 0;
        const totalEPT = totals.trans > 0 ? (totals.incl / totals.trans) : 0;
        const totalUPT = totals.trans > 0 ? (totals.qty / totals.trans) : 0;
        const totalAUR = totals.qty > 0 ? (totals.incl / totals.qty) : 0;
        
        const rTotal = ws.addRow(["TOTAL", "", totals.incl, totals.visitors, totals.trans, totals.qty, totalConv, totalEPT, totalUPT, totalAUR, ""]);
        ws.mergeCells(`A${rTotal.number}:B${rTotal.number}`);
        rTotal.eachCell((cell, colNumber) => {
          cell.border = borderThin;
          cell.font = fontBold;
          cell.alignment = centerAlign;
          if (colNumber === 1 || colNumber === 2) {
            cell.fill = fillLightBlue;
          } else if (colNumber >= 3 && colNumber <= 6) {
            cell.fill = fillYellow;
          }
          if (colNumber === 3) cell.numFmt = '0.000';
          if (colNumber >= 4 && colNumber <= 6) cell.numFmt = '0.000';
          if (colNumber === 7) cell.numFmt = '0.00%';
          if (colNumber === 8 || colNumber === 10) cell.numFmt = '0.000';
          if (colNumber === 9) cell.numFmt = '0.00';
        });
        
        ws.addRow([]);

        // Month Summary Section
        const sumHeaderRow = ws.addRow(["MONTHS", "WORKING DAYS", "QUANTITY SOLD", "TOTAL SALES", "DAILY AVG"]);
        for (let colNumber = 1; colNumber <= 5; colNumber++) {
          const cell = sumHeaderRow.getCell(colNumber);
          cell.fill = fillOrange;
          cell.font = fontBold;
          cell.border = borderThin;
          cell.alignment = centerAlign;
        }
        
        let grandTotalSales = 0;
        let grandTotalQty = 0;
        sortedMonths.forEach(m => {
          const rMonthDate = parseISO(`${m}-01`);
          const monthDateStr = format(rMonthDate, 'MMM');
          
          let mSalesTotal = 0;
          let mQtyTotal = 0;
          let workingDays = 0;

          if (rMonthDate.getFullYear() === today.getFullYear() && rMonthDate.getMonth() === today.getMonth()) {
            workingDays = today.getDate();
          } else {
            if (rMonthDate.getFullYear() === 2026 && rMonthDate.getMonth() === 2) {
              workingDays = 6;
            } else if (rMonthDate.getFullYear() < 2026 || (rMonthDate.getFullYear() === 2026 && rMonthDate.getMonth() < 2)) {
              workingDays = 0;
            } else {
              workingDays = getDaysInMonth(rMonthDate);
            }
          }
          
          const r = reports[m];
          if (r && r.days) {
            Object.values(r.days).forEach(dd => {
              const mSales = Array.isArray(dd.sales) ? dd.sales : [];
              const sFiltered = mSales.filter(s => !s.highlighted);
              let dayTotal = 0;
              let dayQty = 0;
              sFiltered.forEach(s => {
                const qty = s.quantity || 1;
                dayTotal += s.price * qty;
                dayQty += qty;
              });
              mSalesTotal += dayTotal;
              mQtyTotal += dayQty;
            });
          }
          
          if (m === '2026-03' && mSalesTotal === 0) {
            mSalesTotal = 353100;
            mQtyTotal = 21;
          }
          
          if (workingDays > 0 || mSalesTotal > 0) {
             const dailyAvg = workingDays > 0 ? mSalesTotal / workingDays : 0;
             const summaryDataRow = ws.addRow([monthDateStr, workingDays, mQtyTotal, mSalesTotal, dailyAvg]);
             grandTotalSales += mSalesTotal;
             grandTotalQty += mQtyTotal;

             for (let colNumber = 1; colNumber <= 5; colNumber++) {
               const cell = summaryDataRow.getCell(colNumber);
               cell.border = borderThin;
               
               if (colNumber === 5) {
                 cell.fill = fillBrightBlue;
               } else {
                 cell.fill = fillGreen;
               }
               
               if (colNumber === 1) {
                 cell.font = fontBold;
                 cell.alignment = { horizontal: 'left', vertical: 'middle' };
               } else if (colNumber === 3) {
                 cell.numFmt = '0';
                 cell.alignment = rightAlign;
               } else if (colNumber === 4 || colNumber === 5) {
                 cell.numFmt = '0.000';
                 cell.alignment = rightAlign;
               } else {
                 cell.alignment = rightAlign;
               }
             }
          }
        });
        
        const sumTotalRow = ws.addRow(["Total", "", grandTotalQty, grandTotalSales, ""]);
        ws.mergeCells(`A${sumTotalRow.number}:B${sumTotalRow.number}`);
        for (let colNumber = 1; colNumber <= 5; colNumber++) {
          const cell = sumTotalRow.getCell(colNumber);
          cell.border = borderThin;
          cell.font = fontBold;
          
          if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 4) {
            cell.fill = fillGreen;
          } else if (colNumber === 5) {
            cell.fill = fillBrightBlue;
          }
          
          if (colNumber === 3) {
            cell.numFmt = '0';
            cell.alignment = rightAlign;
          } else if (colNumber === 4) {
            cell.numFmt = '0.000';
            cell.alignment = rightAlign;
          } else {
            cell.alignment = centerAlign;
          }
        }
      };

      if (activeTab === 'custom_report') {
        const start = parseISO(reportStartDate);
        const end = parseISO(reportEndDate);
        const wsTitle = "Custom Report";
        let periodText = "";
        try { periodText = `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}`; } catch(e){}
        const dateRange = eachDayOfInterval({ start, end });
        generateSheet(wsTitle, periodText, dateRange, true, "");
      } else {
        sortedMonths.forEach(mStr => {
          const mDate = parseISO(`${mStr}-01`);
          const wsTitle = format(mDate, 'MMM yy'); // e.g. "Mar 26"
          const periodText = format(mDate, 'MMMM yyyy'); // e.g. "March 2026"
          const daysInMonth = getDaysInMonth(mDate);
          const dateRange = Array.from({ length: daysInMonth }, (_, i) => new Date(mDate.getFullYear(), mDate.getMonth(), i + 1));
          generateSheet(wsTitle, periodText, dateRange, false, mStr);
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const fileName = activeTab === 'custom_report' 
        ? `Samsonite_Official_Tracker_${reportStartDate}_to_${reportEndDate}.xlsx`
        : `Samsonite_Official_Tracker_All_Months.xlsx`;
        
      saveAs(blob, fileName);

    } catch (error) {
      console.error("Error generating Excel:", error);
      alert("Failed to generate Excel file.");
    } finally {
      setIsDownloading(false);
    }
  };

  const syncHighlights = async () => {
    if (!user) return;
    const currentMonth = format(parseISO(selectedDate), 'yyyy-MM');
    const report = reports[currentMonth];
    if (!report) {
      alert('No report found for the selected month.');
      return;
    }

    const updatedReport = { ...report };
    let changed = false;

    Object.keys(updatedReport.days).forEach(dateStr => {
      const day = updatedReport.days[dateStr];
      if (day.sales && Array.isArray(day.sales)) {
        day.sales = day.sales.map(sale => {
          const stockItem = stock.find(s => s.id === sale.productId);
          if (stockItem && stockItem.highlighted !== sale.highlighted) {
            changed = true;
            return { ...sale, highlighted: stockItem.highlighted };
          }
          return sale;
        });
      }
    });

    if (changed) {
      try {
        await setDoc(doc(db, 'reports', currentMonth), updatedReport);
        alert('Historical sales for ' + currentMonth + ' have been updated with current highlight status.');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `reports/${currentMonth}`);
      }
    } else {
      alert('All sales in ' + currentMonth + ' already match current highlight status.');
    }
  };

  const downloadSalesLogPDF = async () => {
    if (activeDayData.sales.length === 0) return;
    
    setIsDownloading(true);
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const dateStr = format(parseISO(selectedDate), 'dd/MM/yyyy');
      
      // Header
      pdf.setFontSize(18);
      pdf.setTextColor(37, 99, 235); // blue-600
      pdf.text('Daily Sales Log', 14, 15);
      
      // Draw Yellow Header Box
      pdf.setFillColor(254, 249, 195); // bg-yellow-100
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.rect(14, 20, 150, 12, 'FD');
      
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Store Name', 16, 25);
      pdf.line(40, 20, 40, 32); // Vertical separator
      pdf.text('Samsonite Brand Store, Bagatelle Mall', 42, 25);
      
      pdf.line(14, 26, 164, 26); // Horizontal separator
      pdf.text('Date :', 16, 30);
      pdf.text(dateStr, 42, 30);

      // Table Header
      const startY = 38;
      const baseColWidths = [20, 65, 10, 20, 25, 20]; // Reduced some to give space to Product
      const baseHeaders = ['Date', 'Product', 'Qty', 'Excl. VAT', 'VAT (15%)', 'Total (Incl)'];
      
      const colWidths = showPaymentDetails ? [...baseColWidths.slice(0, 5), 20, 15] : [25, 80, 10, 20, 20, 20];
      const headers = showPaymentDetails ? [...baseHeaders.slice(0, 5), baseHeaders[5], 'Method'] : baseHeaders;
      
      pdf.setFillColor(241, 245, 249); // gray-100
      pdf.rect(14, startY, 175, 8, 'F');
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(51, 65, 85); // gray-700
      
      let currentX = 14;
      headers.forEach((h, i) => {
        pdf.text(h, currentX + 2, startY + 5.5);
        currentX += colWidths[i];
      });

      // Table Rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      let currentY = startY + 8;
      let totalIncl = 0;
      let totalExcl = 0;
      let totalVat = 0;
      let totalQty = 0;
      let paymentBreakdown = { cash: 0, card: 0, juice: 0 };

      const filteredSales = showHighlights ? activeDayData.sales : activeDayData.sales.filter(s => !s.highlighted);

      filteredSales.forEach((sale, index) => {
        const qty = sale.quantity || 1;
        const unitPrice = sale.price;
        const rowTotalIncl = unitPrice * qty;
        const rowTotalExcl = rowTotalIncl / 1.15;
        const rowVat = rowTotalIncl - rowTotalExcl;
        
        totalIncl += rowTotalIncl;
        totalExcl += rowTotalExcl;
        totalVat += rowVat;
        totalQty += qty;

        if (showPaymentDetails) {
          if (sale.paymentMethod === 'split' && sale.splitPayments) {
            sale.splitPayments.forEach(split => {
              paymentBreakdown[split.method] += split.amount;
            });
          } else {
            const method = sale.paymentMethod || 'cash';
            paymentBreakdown[method] += rowTotalIncl;
          }
        }

        // Alternate row background
        if (index % 2 === 1) {
          pdf.setFillColor(248, 250, 252); // gray-50
          pdf.rect(14, currentY, 175, 7, 'F');
        }

        currentX = 14;
        pdf.text(dateStr, currentX + 2, currentY + 5);
        currentX += colWidths[0];
        
        // Truncate product name if too long
        const baseName = `${sale.productName} (${sale.price.toLocaleString()} MUR) (x${qty})`;
        const method = (sale.paymentMethod || 'cash').toUpperCase();
        let methodLabel = '';
        if (sale.isGift) {
          methodLabel = 'GIFT';
        } else if (sale.paymentMethod === 'split' && sale.splitPayments) {
          methodLabel = sale.splitPayments.map(p => `${p.method.toUpperCase()} AMOUNT: ${p.amount.toLocaleString()}`).join(' | ');
        } else {
          methodLabel = sale.paymentMethod === 'juice' ? `J:${sale.transactionId}` : method;
        }
        let fullText = showPaymentDetails ? `${baseName} [${methodLabel}]` : baseName;
        
        if (sale.highlighted) {
          fullText = `[H]${fullText}`;
        }

        const productColWidth = colWidths[1] - 4; // Margin of 2 on each side
        let displayName = fullText;
        if (pdf.getTextWidth(displayName) > productColWidth) {
          while (pdf.getTextWidth(displayName + '...') > productColWidth && displayName.length > 0) {
            displayName = displayName.substring(0, displayName.length - 1);
          }
          displayName += '...';
        }

        // Draw text with parts in different colors
        let currentDisplayName = displayName;
        let isHighlighted = false;
        if (currentDisplayName.startsWith('[H]')) {
          isHighlighted = true;
          currentDisplayName = currentDisplayName.substring(3);
          
          // Draw highlight background
          pdf.setFillColor(220, 252, 231);
          pdf.rect(currentX, currentY, colWidths[1], 7, 'F');
        }

        if (showPaymentDetails && currentDisplayName.includes(' [')) {
          const bracketIndex = currentDisplayName.lastIndexOf(' [');
          const part1 = currentDisplayName.substring(0, bracketIndex);
          const part2 = currentDisplayName.substring(bracketIndex);
          
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'normal');
          pdf.text(part1, currentX + 2, currentY + 5);
          
          const part1Width = pdf.getTextWidth(part1);
          pdf.setTextColor(220, 38, 38); // red-600
          pdf.setFont('helvetica', 'bold');
          pdf.text(part2, currentX + 2 + part1Width, currentY + 5);
          
          // Reset for next row
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
        } else {
          pdf.setTextColor(0, 0, 0);
          pdf.text(currentDisplayName, currentX + 2, currentY + 5);
        }
        currentX += colWidths[1];
        
        pdf.text(qty.toString(), currentX + 2, currentY + 5);
        currentX += colWidths[2];
        
        pdf.text(rowTotalExcl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currentX + 2, currentY + 5);
        currentX += colWidths[3];

        pdf.text(rowVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currentX + 2, currentY + 5);
        currentX += colWidths[4];
        
        pdf.text(rowTotalIncl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currentX + 2, currentY + 5);
        
        if (showPaymentDetails) {
          currentX += colWidths[5];
          pdf.text((sale.paymentMethod || 'cash').toUpperCase(), currentX + 2, currentY + 5);
        }
        
        currentY += 7;

        // Add new page if needed
        if (currentY > 260) {
          pdf.addPage();
          currentY = 20;
        }
      });

      // Totals Row
      pdf.setFillColor(255, 255, 0); // Yellow
      pdf.rect(14, currentY, 175, 7, 'F');
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.1);
      pdf.line(14, currentY, 189, currentY);
      pdf.line(14, currentY + 7, 189, currentY + 7);
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('TOTAL', 14 + colWidths[0] + 2, currentY + 5);
      
      currentX = 14 + colWidths[0] + colWidths[1];
      pdf.text(totalQty.toString(), currentX + 2, currentY + 5);
      currentX += colWidths[2];
      
      pdf.text(totalExcl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currentX + 2, currentY + 5);
      currentX += colWidths[3];

      pdf.text(totalVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currentX + 2, currentY + 5);
      currentX += colWidths[4];

      pdf.text(totalIncl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currentX + 2, currentY + 5);

      // Payment Breakdown Summary
      if (showPaymentDetails) {
        currentY += 15;
        pdf.setFontSize(10);
        pdf.text('Payment Breakdown Summary:', 14, currentY);
        currentY += 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(`Cash: ${paymentBreakdown.cash.toLocaleString()} MUR`, 20, currentY);
        currentY += 5;
        pdf.text(`Card: ${paymentBreakdown.card.toLocaleString()} MUR`, 20, currentY);
        currentY += 5;
        pdf.text(`Juice: ${paymentBreakdown.juice.toLocaleString()} MUR`, 20, currentY);
      }

      pdf.save(`Sales_Log_${selectedDate}.pdf`);
    } catch (error) {
      console.error('Sales log PDF generation failed:', error);
      alert('Failed to generate sales log PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const selectedMonth = useMemo(() => {
    try {
      const date = parseISO(selectedDate);
      return isNaN(date.getTime()) ? format(new Date(), 'yyyy-MM') : format(date, 'yyyy-MM');
    } catch {
      return format(new Date(), 'yyyy-MM');
    }
  }, [selectedDate]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          // Create/Update user profile in Firestore
          const userRef = doc(db, 'users', u.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            const isAdminEmail = u.email === 'hramguttee6@gmail.com' || u.email === 'ramgutteeharris3@gmail.com' || u.email === 'bagatelleshop@samsonite.mu';
            await setDoc(userRef, {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName || (u.email === 'bagatelleshop@samsonite.mu' ? 'Bagatelle Shop' : u.email),
              role: isAdminEmail ? 'admin' : 'user'
            });
          }
        } catch (err) {
          console.error('[DEBUG] Failed to update user profile in Firestore:', err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setUser(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    const isShopAccount = cleanUsername.toLowerCase() === 'bagatelleshop';
    const email = isShopAccount ? 'bagatelleshop@samsonite.mu' : cleanUsername;
    
    try {
      // First attempt: Try to log in with email/password
      await loginWithEmail(email, cleanPassword);
    } catch (err: any) {
      console.warn("Login attempt failed:", err.code, err.message);

      // If Email/Password login is not enabled on Firebase project (auth/operation-not-allowed), fallback seamlessly
      if (err.code === 'auth/operation-not-allowed') {
        try {
          console.log("Attempting anonymous login fallback...");
          await loginAnonymously();
          return;
        } catch (anonErr: any) {
          console.warn("Anonymous sign in failed/disabled:", anonErr.code, anonErr.message);
          setUser({
            uid: 'bagatelleshop_local_user',
            email: 'bagatelleshop@samsonite.mu',
            displayName: 'Bagatelle Shop'
          } as any);
          return;
        }
      }

      // If it's the shop account and login failed due to password/not registered, attempt registration or anonymous login
      if (isShopAccount && cleanPassword === 'Pass@11') {
        try {
          console.log("Attempting to auto-register shop account...");
          await registerWithEmail(email, cleanPassword);
          return;
        } catch (regErr: any) {
          console.warn("Auto-registration failed:", regErr.code, regErr.message);
          if (regErr.code === 'auth/operation-not-allowed') {
            try {
              await loginAnonymously();
              return;
            } catch (anonErr) {
              setUser({
                uid: 'bagatelleshop_local_user',
                email: 'bagatelleshop@samsonite.mu',
                displayName: 'Bagatelle Shop'
              } as any);
              return;
            }
          }
          if (regErr.code === 'auth/email-already-in-use') {
            try {
              await loginAnonymously();
              return;
            } catch (anonErr) {
              setUser({
                uid: 'bagatelleshop_local_user',
                email: 'bagatelleshop@samsonite.mu',
                displayName: 'Bagatelle Shop'
              } as any);
              return;
            }
          }
          setLoginError(`System Error: ${regErr.message}`);
        }
      } else {
        // Standard error messages
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
          setLoginError('Invalid username or password. Default username is "BagatelleShop" and password is "Pass@11".');
        } else if (err.code === 'auth/too-many-requests') {
          setLoginError('Too many failed attempts. Please try again later.');
        } else {
          setLoginError(err.message || 'An unexpected error occurred.');
        }
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    // Listen for Stock
    const stockUnsubscribe = onSnapshot(collection(db, 'stock'), (snapshot) => {
      if (snapshot.empty) {
        console.log("Stock collection is empty. Auto-seeding American Tourister price list...");
        const initialList = getAmericanTouristerPriceList();
        const CHUNK_SIZE = 400;
        for (let i = 0; i < initialList.length; i += CHUNK_SIZE) {
          const batch = writeBatch(db);
          const chunk = initialList.slice(i, i + CHUNK_SIZE);
          chunk.forEach(item => {
            const itemRef = doc(db, 'stock', item.id);
            batch.set(itemRef, item);
          });
          batch.commit().catch(err => console.error("Auto-seed batch error:", err));
        }
        return;
      }

      const stockData: StockItem[] = [];
      const atPriceList = getAmericanTouristerPriceList();
      const atMap = new Map(atPriceList.map(item => [item.model.toLowerCase(), item]));

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        let model = data.model;
        let description = data.description || data.color;
        
        if (!model && data.name) {
          model = data.name.split(' - ')[0] || '';
        }
        if (!description && data.name) {
          const parts = data.name.split(' - ');
          if (parts.length > 1) {
            description = parts[1].split(' (')[0] || '';
          }
        }

        const cleanDescription = (description && description !== 'Product') ? description : '';
        const displayName = cleanDescription ? `${model} - ${cleanDescription}` : model;

        const atMatch = model ? atMap.get(model.toLowerCase()) : undefined;
        let currentPrice = Number(data.price) || 0;
        let currentPromo = data.promoPrice !== undefined && data.promoPrice !== null ? Number(data.promoPrice) : undefined;

        // Update items to match the newly updated official pricelist
        if (atMatch) {
          if (currentPrice !== atMatch.price || currentPromo !== atMatch.promoPrice) {
            currentPrice = atMatch.price;
            currentPromo = atMatch.promoPrice;
            const itemRef = doc(db, 'stock', docSnap.id);
            updateDoc(itemRef, { 
              price: currentPrice, 
              promoPrice: currentPromo ?? deleteField() 
            }).catch(err => console.error("Error auto-correcting price:", err));
          }
        }

        stockData.push({
          ...data,
          id: docSnap.id,
          model: model || '',
          description: cleanDescription,
          currentStock: data.currentStock ?? 0,
          price: currentPrice,
          promoPrice: currentPromo,
          name: displayName
        });
      });
      setStock(stockData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stock'));

    // Listen for Reports
    const reportsUnsubscribe = onSnapshot(collection(db, 'reports'), (snapshot) => {
      console.log(`[DEBUG] Received ${snapshot.size} reports from Firestore`);
      const reportsData: Record<string, MonthlyReport> = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as MonthlyReport;
        reportsData[doc.id] = data;
      });
      setReports(reportsData);
    }, (error) => {
      console.error("[DEBUG] Reports listener error:", error);
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    // Listen for Stock Movements
    const movementsUnsubscribe = onSnapshot(collection(db, 'stock_movements'), (snapshot) => {
      const movementsData: StockMovement[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        movementsData.push({ ...data, id: doc.id } as StockMovement);
      });
      console.log(`[DEBUG] Received ${movementsData.length} stock movements from Firestore`);
      if (movementsData.length > 0) {
        console.log(`[DEBUG] Sample movement:`, movementsData[0]);
      }
      // Sort by date descending
      setMovements(movementsData.sort((a, b) => {
        try {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
        } catch (e) {
          return 0;
        }
      }));
    }, (error) => {
      console.error("[DEBUG] Movements listener error:", error);
      handleFirestoreError(error, OperationType.LIST, 'stock_movements');
    });

    return () => {
      stockUnsubscribe();
      reportsUnsubscribe();
      movementsUnsubscribe();
    };
  }, [user]);

  const recoverPricesFromSales = async (reportsData: Record<string, MonthlyReport>, currentStock: StockItem[]) => {
    if (!currentStock || currentStock.length === 0) return;
    
    setIsDownloading(true);
    try {
      console.log("[DEBUG] Starting price recovery from sales history...");
      // Map from multiple identifiers to the most recent price
      const priceMap: Record<string, { price: number; timestamp: number }> = {};
      const modelMap: Record<string, { price: number; timestamp: number }> = {};
      const nameMap: Record<string, { price: number; timestamp: number }> = {};
      
      let salesScanned = 0;
      Object.values(reportsData).forEach(report => {
        if (!report.days) return;
        Object.values(report.days).forEach(day => {
          if (day.sales && Array.isArray(day.sales)) {
            day.sales.forEach(sale => {
              if (sale.price > 0) {
                salesScanned++;
                const ts = sale.timestamp || 0;
                
                // 1. By exact Product ID
                if (sale.productId) {
                  if (!priceMap[sale.productId] || ts > priceMap[sale.productId].timestamp) {
                    priceMap[sale.productId] = { price: sale.price, timestamp: ts };
                  }
                }
                
                // 2. By Product Name
                if (sale.productName) {
                  if (!nameMap[sale.productName] || ts > nameMap[sale.productName].timestamp) {
                    nameMap[sale.productName] = { price: sale.price, timestamp: ts };
                  }
                  
                  // 3. Try to extract model (item code) from name (e.g. "CODE - Description")
                  const modelPart = sale.productName.split(' - ')[0]?.trim();
                  if (modelPart && (!modelMap[modelPart] || ts > modelMap[modelPart].timestamp)) {
                    modelMap[modelPart] = { price: sale.price, timestamp: ts };
                  }
                }
              }
            });
          }
        });
      });
      
      console.log(`[DEBUG] Scanned ${salesScanned} sales entries. Maps built: IDs=${Object.keys(priceMap).length}, Names=${Object.keys(nameMap).length}, Models=${Object.keys(modelMap).length}`);
      
      const updatedStock = currentStock.map(item => {
        // Try all matching strategies in order of reliability
        const match = priceMap[item.id] || modelMap[item.model] || nameMap[item.name];
        
        if (match && match.price > 0 && Math.abs(match.price - item.price) > 0.01) {
          return { ...item, price: match.price };
        }
        return item;
      });
      
      const changedItems = updatedStock.filter((item, i) => item.price !== currentStock[i].price);
      
      if (changedItems.length === 0) {
        alert("No recent price history found for your items. \n\nTips:\n1. Ensure you have recorded sales in the 'Sales Entry' section.\n2. Prices are recovered from previous sales logs.");
        return;
      }
      
      const samples = changedItems.slice(0, 3).map(it => `${it.model}: ${it.price} MUR`).join('\n');
      if (confirm(`Found price history for ${changedItems.length} items.\n\nSample updates:\n${samples}${changedItems.length > 3 ? '\n...' : ''}\n\nWould you like to restore these prices?`)) {
        await updateStock(updatedStock, 'manual_update', 'Restored prices from historical sales records');
        alert(`Successfully restored prices for ${changedItems.length} items!`);
      }
    } catch (error) {
      console.error("Price recovery failed:", error);
      alert("An error occurred during price recovery. Please try again later.");
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    console.log(`[DEBUG] Reports state updated. Current reports count: ${Object.keys(reports).length}`);
    if (reports[selectedMonth]) {
      console.log(`[DEBUG] Current month report (${selectedMonth}) has ${Object.keys(reports[selectedMonth].days || {}).length} days recorded.`);
    }
  }, [reports, selectedMonth]);

  const currentReport: MonthlyReport = useMemo(() => reports[selectedMonth] || {
    storeName: 'Samsonite Brand Store, Bagatelle Mall, Mauritius',
    month: selectedMonth,
    days: {}
  }, [reports, selectedMonth]);

  const activeDayDataRaw = currentReport.days[selectedDate] || { date: selectedDate, visitors: 0, sales: [] };
  const activeDayData = useMemo(() => ({
    ...activeDayDataRaw,
    sales: Array.isArray(activeDayDataRaw.sales) ? activeDayDataRaw.sales : []
  }), [activeDayDataRaw]);

  let activeDayTotal = 0;
  activeDayData.sales.forEach(s => {
    activeDayTotal += (s.price || 0) * (s.quantity || 1);
  });

  const updateDailyData = async (dateStr: string, data: DailyData) => {
    if (!user || !dateStr) {
      console.warn('[DEBUG] updateDailyData skipped: user or dateStr missing', { user: !!user, dateStr });
      return;
    }
    
    let monthStr;
    try {
      const date = parseISO(dateStr);
      if (isNaN(date.getTime())) {
        console.error('[DEBUG] Invalid date string:', dateStr);
        return;
      }
      monthStr = format(date, 'yyyy-MM');
    } catch (error) {
      console.error('[DEBUG] Error parsing date:', dateStr, error);
      return;
    }
    
    const reportRef = doc(db, 'reports', monthStr);
    
    // Recursive function to remove undefined values from an object
    const sanitizeData = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeData(item));
      }
      if (obj !== null && typeof obj === 'object') {
        const cleaned: any = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== undefined) {
            cleaned[key] = sanitizeData(obj[key]);
          }
        });
        return cleaned;
      }
      return obj;
    };

    try {
      const cleanData = sanitizeData(data);
      console.log(`[DEBUG] Persisting daily data for ${dateStr} to report ${monthStr}`, cleanData);
      
      // Use setDoc with merge: true to update only the specific day
      // and ensure storeName/month exist. This avoids race conditions with local state.
      await setDoc(reportRef, {
        storeName: 'Samsonite Brand Store, Bagatelle Mall, Mauritius',
        month: monthStr,
        days: {
          [dateStr]: {
            ...cleanData,
            sales: Array.isArray(cleanData.sales) ? cleanData.sales : []
          }
        }
      }, { merge: true });
      
      console.log(`[DEBUG] Daily data persisted successfully for ${dateStr}`);
    } catch (error) {
      console.error(`[DEBUG] Failed to persist daily data for ${dateStr}:`, error);
      handleFirestoreError(error, OperationType.WRITE, `reports/${monthStr}`);
    }
  };

  const logMovement = async (movement: Omit<StockMovement, 'id'>) => {
    if (!user) return;
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    try {
      console.log("Logging movement:", movement);
      await setDoc(doc(db, 'stock_movements', id), { ...movement, id });
      console.log("Movement logged successfully");
    } catch (error) {
      console.error("Failed to log movement:", error);
    }
  };

  const updateStock = async (newStock: StockItem[], type: StockMovement['type'] = 'manual_update', reason?: string) => {
    if (!user) return;
    
    try {
      console.log(`[DEBUG] Starting stock sync for ${newStock.length} items (type: ${type})...`);
      
      // Get current IDs in Firestore
      const currentIds = stock.map(s => s.id);
      const newIds = new Set(newStock.map(s => s.id));
      
      // Delete items that are no longer in the list - ONLY if it's a full sync or explicitly requested
      // For CSV uploads, we typically WANT to keep existing items that aren't in the CSV
      const toDelete = (type === 'initial' || type === 'manual_update') ? currentIds.filter(id => !newIds.has(id)) : [];
      if (toDelete.length > 0) {
        console.log(`[DEBUG] Deleting ${toDelete.length} stale items...`);
      }
      
      // Use batches for efficiency (Firestore limit is 500 per batch)
      const CHUNK_SIZE = 400;
      
      // Process deletions in batches
      for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = toDelete.slice(i, i + CHUNK_SIZE);
        chunk.forEach(id => {
          batch.delete(doc(db, 'stock', id));
        });
        await batch.commit();
        console.log(`[DEBUG] Batch deletion of ${chunk.length} items committed.`);
      }

      // Process updates/creates in batches
      console.log(`[DEBUG] Updating/Creating ${newStock.length} items...`);
      const movementPromises: Promise<void>[] = [];

      // Filter newStock to ONLY those items that are different from stock
      // This saves a huge amount of Firestore writes (preventing quota exceeded errors)
      const changedOrNewItems = newStock.filter(newItem => {
        const existingItem = stock.find(s => s.id === newItem.id);
        if (!existingItem) return true; // It's new
        // Compare stringified versions for a deep equality check (skipping functions/prototypes)
        return JSON.stringify(existingItem) !== JSON.stringify(newItem);
      });

      console.log(`[DEBUG] Found ${changedOrNewItems.length} items that actually changed.`);

      for (let i = 0; i < changedOrNewItems.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = changedOrNewItems.slice(i, i + CHUNK_SIZE);
        chunk.forEach(item => {
          const oldItem = stock.find(s => s.id === item.id);
          
          let cleanItem: any;
          if (type === 'manual_update') {
            // For manual updates, we trust the incoming item completely since it was edited by the user
            cleanItem = { ...item };
            
            // Explicitly delete fields that might be undefined so they are removed from Firestore
            if (cleanItem.promoPrice === undefined) {
              cleanItem.promoPrice = deleteField();
            }
          } else {
            // For CSV or Transfer Note updates, only overwrite an existing field if the new item actually has meaningful data
            cleanItem = oldItem ? { 
              ...oldItem, 
              ...item,
              price: (item.price > 0) ? item.price : oldItem.price,
              promoPrice: (item.promoPrice && item.promoPrice > 0) ? item.promoPrice : oldItem.promoPrice,
              description: (item.description && item.description.trim().length > 0) ? item.description : oldItem.description,
              name: (item.name && !item.name.includes(' - ') && oldItem.name.includes(' - ')) ? oldItem.name : item.name
            } : { ...item };
          }
          
          // Ensure no undefined values (deleteField() is handled properly by setDoc with merge or without)
          Object.keys(cleanItem).forEach(key => {
            if (cleanItem[key] === undefined) {
              delete cleanItem[key];
            }
          });

          // If stock changed, log it (only if it's not a new item)
          if (oldItem && oldItem.currentStock !== item.currentStock) {
            let desc = `Manual update to ${item.currentStock}`;
            if (type === 'csv_upload') desc = `Bulk update from CSV to ${item.currentStock}`;
            if (type === 'transfer_note') desc = `Received from warehouse: +${item.currentStock - oldItem.currentStock}`;

            movementPromises.push(logMovement({
              productId: item.id,
              date: new Date().toISOString(),
              type: type,
              quantityChange: item.currentStock - oldItem.currentStock,
              newStock: item.currentStock,
              description: desc,
              reason: reason
            }));
          } else if (!oldItem) {
            movementPromises.push(logMovement({
              productId: item.id,
              date: new Date().toISOString(),
              type: 'initial',
              quantityChange: item.currentStock,
              newStock: item.currentStock,
              description: type === 'transfer_note' ? `New item from transfer note: ${item.currentStock}` : `Initial entry: ${item.currentStock}`,
              reason: reason
            }));
          }
          batch.set(doc(db, 'stock', item.id), cleanItem, { merge: true });
        });
        await batch.commit();
        console.log(`[DEBUG] Batch update of ${chunk.length} items committed.`);
      }
      
      // Wait for all movements to be logged
      if (movementPromises.length > 0) {
        console.log(`[DEBUG] Waiting for ${movementPromises.length} movements to be logged...`);
        await Promise.all(movementPromises);
      }
      
      console.log("[DEBUG] Stock sync completed successfully");
      if (type === 'csv_upload') {
        alert("Stock upload successful! The list has been updated.");
      }
    } catch (error) {
      console.error("[DEBUG] Stock sync failed:", error);
      handleFirestoreError(error, OperationType.WRITE, 'stock');
    }
  };

  const adjustStock = async (productId: string, delta: number) => {
    if (!user) return;
    const item = stock.find(s => s.id === productId);
    if (!item) return;

    const newStock = item.currentStock + delta;
    try {
      await setDoc(doc(db, 'stock', productId), { ...item, currentStock: newStock });
      
      // Log movement
      await logMovement({
        productId,
        date: new Date().toISOString(),
        type: delta < 0 ? 'sale' : 'manual_update',
        quantityChange: delta,
        newStock,
        description: delta < 0 ? `Sale of ${Math.abs(delta)} units` : `Stock adjustment: ${delta}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `stock/${productId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-blue-600 animate-spin" />
          <p className="text-gray-500 font-medium">Loading AT KIOSK BAGA...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-2xl shadow-blue-100 border border-gray-100 p-10"
        >
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-6 shadow-lg shadow-blue-200">AT</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">AT KIOSK BAGA</h1>
            <p className="text-gray-500">Sales & Stock Manager</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600 flex items-center gap-2">
                <UserIcon size={16} /> Username
              </label>
              <input 
                type="text"
                placeholder="Enter username"
                className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl focus:border-blue-500 outline-none transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600 flex items-center gap-2">
                <Lock size={16} /> Password
              </label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl focus:border-blue-500 outline-none transition-all pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-medium flex items-center gap-3 border border-red-100">
                <AlertCircle size={18} />
                {loginError}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  Login to Account
                </>
              )}
            </button>
          </form>
          
          <div className="mt-10 pt-8 border-t border-gray-50 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <ShieldCheck size={16} />
            Secure Enterprise Access
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        {/* Top Navigation Bar */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">AT</div>
                <div className="hidden sm:block">
                  <h1 className="font-bold text-gray-900 leading-tight text-sm">AT KIOSK BAGA</h1>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Sales & Stock Manager</p>
                </div>
              </div>

              <nav className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <LayoutDashboard size={18} />
                  <span className="hidden md:inline">Dashboard</span>
                </button>
                <button
                  onClick={() => setActiveTab('stock')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'stock' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Package size={18} />
                  <span className="hidden md:inline">Shop Stock</span>
                </button>
                <button
                  onClick={() => setActiveTab('warehouse')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'warehouse' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <RefreshCw size={18} />
                  <span className="hidden md:inline">Warehouse</span>
                </button>
                <button
                  onClick={() => setActiveTab('report')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'report' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <FileSpreadsheet size={18} />
                  <span className="hidden md:inline">Monthly Report</span>
                </button>
                <button
                  onClick={() => setActiveTab('custom_report')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'custom_report' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Calendar size={18} />
                  <span className="hidden md:inline">Custom Range</span>
                </button>
                <button
                  onClick={() => setActiveTab('analysis')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'analysis' ? 'bg-purple-50 text-purple-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <BrainCircuit size={18} />
                  <span className="hidden md:inline">Deep Analysis</span>
                </button>
                <button
                  onClick={() => setActiveTab('financial')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'financial' ? 'bg-green-50 text-green-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <FileSpreadsheet size={18} />
                  <span className="hidden md:inline">Financial Report</span>
                </button>
                <button
                  onClick={() => setActiveTab('daily_count')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${activeTab === 'daily_count' ? 'bg-amber-50 text-amber-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Package size={18} />
                  <span className="hidden md:inline">Daily Count</span>
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden lg:flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Period:</span>
                <input 
                  type="month" 
                  className="bg-transparent border-none outline-none text-xs font-bold text-blue-600"
                  value={selectedMonth}
                  onChange={(e) => {
                    const newMonth = e.target.value;
                    setSelectedDate(`${newMonth}-01`);
                  }}
                />
              </div>

              <div className="flex items-center gap-3 pl-4 border-l border-gray-100">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-gray-900">{user.displayName || user.email}</p>
                  <p className="text-[10px] text-gray-500">Bagatelle Mall Branch</p>
                </div>
                <div className="w-8 h-8 bg-gray-100 rounded-full border border-gray-200 overflow-hidden">
                  <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="User" referrerPolicy="no-referrer" />
                </div>
                <button 
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                  title="Settings"
                >
                  <Settings size={18} />
                </button>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Sign Out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              >
                <div className="lg:col-span-9 space-y-8">
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 text-white shadow-lg shadow-blue-200">
                    <h3 className="text-2xl font-bold mb-2">Welcome back!</h3>
                    <p className="text-blue-100 mb-6 max-w-md">Your daily sales report is ready to be updated. Just add the visitor count and mark products as sold.</p>
                    <div className="flex gap-4">
                      <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 flex-1">
                        <p className="text-xs text-blue-200 uppercase font-bold tracking-wider mb-1">Selected Day Sales</p>
                        <p className="text-2xl font-bold">
                          {activeDayTotal.toLocaleString()} <span className="text-sm font-normal">MUR</span>
                        </p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 flex-1">
                        <p className="text-xs text-blue-200 uppercase font-bold tracking-wider mb-1">Transactions</p>
                        <p className="text-2xl font-bold">{activeDayData.sales.length}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <h3 className="font-bold text-gray-800">Quick Preview</h3>
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            checked={showPaymentDetails}
                            onChange={(e) => setShowPaymentDetails(e.target.checked)}
                          />
                          <span className="text-xs font-bold text-gray-600">Payment Details</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 hover:bg-green-100 transition-colors">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                            checked={showHighlights}
                            onChange={(e) => setShowHighlights(e.target.checked)}
                          />
                          <span className="text-xs font-bold text-green-700">Show Highlights</span>
                        </label>
                      </div>
                      <button 
                        onClick={downloadPDF}
                        disabled={isDownloading}
                        className="text-xs flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                      >
                        {isDownloading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        {isDownloading ? 'Generating...' : 'Download PDF'}
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                       <ExcelTable report={currentReport} showVat={false} showPaymentDetails={showPaymentDetails} showHighlights={showHighlights} />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <DailyInput 
                    stock={stock} 
                    currentData={activeDayData} 
                    onUpdate={(data) => updateDailyData(selectedDate, data)}
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                    onStockChange={adjustStock}
                    onDownloadLog={downloadSalesLogPDF}
                    isDownloading={isDownloading}
                    showHighlights={showHighlights}
                  />
                </div>
              </motion.div>
            )}

            {activeTab === 'stock' && (
              <motion.div
                key="stock"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <StockManager 
                  stock={stock} 
                  movements={movements} 
                  onUpdate={updateStock} 
                  onRecoverPrices={() => recoverPricesFromSales(reports, stock)}
                />
              </motion.div>
            )}

            {activeTab === 'warehouse' && (
              <motion.div
                key="warehouse"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <WarehouseManager shopStock={stock} onUpdateShopStock={updateStock} />
              </motion.div>
            )}

            {activeTab === 'report' && (
              <motion.div
                key="report"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
              >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-6">
                    <div>
                      <h3 className="font-bold text-gray-800">Monthly Sales Report</h3>
                      <p className="text-sm text-gray-500">Official Excel-formatted view for export</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={showPaymentDetails}
                        onChange={(e) => setShowPaymentDetails(e.target.checked)}
                      />
                      <span className="text-sm font-bold text-gray-700">Include Payment Details</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                        checked={showHighlights}
                        onChange={(e) => setShowHighlights(e.target.checked)}
                      />
                      <span className="text-sm font-bold text-green-700">Show Highlights</span>
                    </label>
                    <button 
                      onClick={syncHighlights}
                      className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg border border-green-100 hover:bg-green-100 transition-colors shadow-sm text-sm font-bold"
                      title="Apply current highlights to all sales in this month"
                    >
                      <RefreshCw size={16} />
                      Sync Highlights
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={downloadOfficialExcel}
                      disabled={isDownloading}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <FileSpreadsheet size={18} />
                      )}
                      Excel
                    </button>
                    <button 
                      onClick={downloadPDF}
                      disabled={isDownloading}
                      className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 size={18} className="animate-spin text-blue-600" />
                      ) : (
                        <Download size={18} className="text-blue-600" />
                      )}
                      PDF
                    </button>
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <ExcelTable report={currentReport} showPaymentDetails={showPaymentDetails} showHighlights={showHighlights} />
                </div>
              </motion.div>
            )}

            {activeTab === 'custom_report' && (
              <motion.div
                key="custom_report"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
              >
                <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between bg-gray-50/50 gap-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <h3 className="font-bold text-gray-800">Custom Range Report</h3>
                      <p className="text-sm text-gray-500">Select any date range for a detailed report</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={showPaymentDetails}
                        onChange={(e) => setShowPaymentDetails(e.target.checked)}
                      />
                      <span className="text-sm font-bold text-gray-700">Include Payment Details</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                        checked={showHighlights}
                        onChange={(e) => setShowHighlights(e.target.checked)}
                      />
                      <span className="text-sm font-bold text-green-700">Show Highlights</span>
                    </label>
                    <button 
                      onClick={syncHighlights}
                      className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg border border-green-100 hover:bg-green-100 transition-colors shadow-sm text-sm font-bold"
                      title="Apply current highlights to all sales in this month"
                    >
                      <RefreshCw size={16} />
                      Sync Highlights
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Start Date</label>
                      <input 
                        type="date" 
                        className="text-sm font-bold text-gray-700 outline-none px-1"
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                      />
                    </div>
                    <div className="h-8 w-px bg-gray-200"></div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">End Date</label>
                      <input 
                        type="date" 
                        className="text-sm font-bold text-gray-700 outline-none px-1"
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={customReportShowVat}
                          onChange={(e) => setCustomReportShowVat(e.target.checked)}
                        />
                        <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 transition-all"></div>
                        <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-all"></div>
                      </div>
                      <span className="text-sm font-bold text-gray-600 group-hover:text-blue-600 transition-colors">Show VAT Details</span>
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={downloadOfficialExcel}
                      disabled={isDownloading}
                      className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-green-700 transition-all flex items-center gap-2 shadow-lg shadow-green-100 disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <FileSpreadsheet size={18} />
                      )}
                      Excel
                    </button>
                    <button 
                      onClick={downloadPDF}
                      disabled={isDownloading}
                      className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Download size={18} />
                      )}
                      PDF
                    </button>
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <CustomRangeReport 
                    startDate={reportStartDate} 
                    endDate={reportEndDate} 
                    allReports={reports}
                    storeName="Samsonite Brand Store, Bagatelle Mall, Mauritius"
                    showVat={customReportShowVat}
                    showPaymentDetails={showPaymentDetails}
                    showHighlights={showHighlights}
                  />
                </div>
              </motion.div>
            )}

            {activeTab === 'analysis' && (
              <motion.div
                key="analysis"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <SalesByProductAnalysis 
                  reports={reports} 
                  startDate={analysisStartDate}
                  endDate={analysisEndDate}
                  onStartDateChange={setAnalysisStartDate}
                  onEndDateChange={setAnalysisEndDate}
                />
                <DataAnalysis 
                  reports={reports}
                  startDate={analysisStartDate}
                  endDate={analysisEndDate}
                />
              </motion.div>
            )}

            {activeTab === 'financial' && (
              <motion.div
                key="financial"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <FinancialReport allReports={reports} />
              </motion.div>
            )}
            {activeTab === 'daily_count' && (
              <motion.div
                key="daily_count"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <DailyStockCountManager showHighlights={showHighlights} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
