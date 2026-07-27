import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Save, Loader2, Download } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { DailyStockCount, DailyCountEntry, MonthlyStockCount, MonthlyReport } from '../types';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const initialEntry: DailyCountEntry = {
  opening: '',
  displayWall1: '',
  displayWall2: '',
  displayWall3: '',
  podium1: '',
  podium2: '',
  podium3: '',
  podium4: '',
  accessories: '',
  backStore: '',
  stkIn: '',
  sale: '',
  stkOut: '',
  signEmpl1: '',
  signEmpl2: '',
  remarks: ''
};

export const DailyStockCountManager: React.FC<{showHighlights?: boolean}> = ({ showHighlights = true }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState<Record<string, DailyStockCount>>({});
  const [currentMonthReport, setCurrentMonthReport] = useState<MonthlyReport | null>(null);

  const monthKey = format(currentDate, 'yyyy-MM');

  useEffect(() => {
    const docRef = doc(db, 'stock_counts', monthKey);
    const unsubscribeCounts = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as MonthlyStockCount;
        setLocalData(data.days || {});
      } else {
        setLocalData({});
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching stock counts:", error);
      setLoading(false);
    });

    const reportRef = doc(db, 'reports', monthKey);
    const unsubscribeReport = onSnapshot(reportRef, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentMonthReport(docSnap.data() as MonthlyReport);
      } else {
        setCurrentMonthReport(null);
      }
    }, (error) => {
      console.error("Error fetching report for stock counts:", error);
    });

    return () => {
      unsubscribeCounts();
      unsubscribeReport();
    };
  }, [monthKey]);

  const handlePrevMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
    setLoading(true);
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
    setLoading(true);
  };

  const updateEntry = (dateStr: string, time: 'morning' | 'evening', field: keyof DailyCountEntry, value: string | number) => {
    setLocalData(prev => {
      const dayData = prev[dateStr] || { 
        date: dateStr, 
        morning: { ...initialEntry }, 
        evening: { ...initialEntry } 
      };

      const updatedTimeData = {
        ...dayData[time],
        [field]: value === '' ? '' : (typeof value === 'string' && !isNaN(Number(value)) && field !== 'signEmpl1' && field !== 'signEmpl2' && field !== 'remarks' ? Number(value) : value)
      };

      return {
        ...prev,
        [dateStr]: {
          ...dayData,
          [time]: updatedTimeData
        }
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'stock_counts', monthKey);
      await setDoc(docRef, {
        month: monthKey,
        days: localData
      }, { merge: true });
    } catch (error) {
      console.error("Error saving data:", error);
      alert("Failed to save data. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const getDaysInCurrentMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  };

  const hasData = (entry: DailyCountEntry) => {
    return ['displayWall1', 'displayWall2', 'displayWall3', 'podium1', 'podium2', 'podium3', 'podium4', 'accessories', 'backStore', 'stkIn', 'sale', 'stkOut', 'signEmpl1', 'signEmpl2', 'remarks'].some(k => entry[k as keyof DailyCountEntry] !== '');
  };

  const calcTotalPhyStk = (entry: DailyCountEntry | undefined) => {
    if (!entry) return null;
    const hasPhyData = ['displayWall1', 'displayWall2', 'displayWall3', 'podium1', 'podium2', 'podium3', 'podium4', 'accessories', 'backStore'].some(k => entry[k as keyof DailyCountEntry] !== '');
    if (!hasPhyData) return null;
    return (Number(entry.displayWall1) || 0) +
           (Number(entry.displayWall2) || 0) +
           (Number(entry.displayWall3) || 0) +
           (Number(entry.podium1) || 0) +
           (Number(entry.podium2) || 0) +
           (Number(entry.podium3) || 0) +
           (Number(entry.podium4) || 0) +
           (Number(entry.accessories) || 0) +
           (Number(entry.backStore) || 0);
  };

  const formatNum = (val: number | string | null, isZeroDash = false) => {
    if (val === null || val === '') return '';
    if (isZeroDash && val === 0) return '-';
    return val;
  };

  const exportToExcel = async () => {
    const days = getDaysInCurrentMonth();
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(format(currentDate, 'MMM yyyy'));

    // Headers
    const headerRow = worksheet.addRow([
      'Date', 'Day', 'Day (Time)', 'Opening', 
      'Display Wall 1', 'Display Wall 2', 'Display Wall 3', 
      'Podium 1', 'Podium 2', 'Podium 3', 'Podium 4', 'Accessories', 'Back Store', 
      'Total Phy. Stk.', 'Opening Gap', 'Stk In', 'Sale', 'Stk Out', 
      'Net Movement', 'Closing', 'Closing Gap', 'Sign Empl 1', 'Sign Empl 2', 'Remarks, if Any'
    ]);

    // Apply header styles
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };

      // Header colors based on UI
      let fillColor = 'FFFF00'; // Default Yellow
      if (colNumber === 14) fillColor = 'C6E0B4'; // Total Phy. Stk. - Green
      if (colNumber === 22) fillColor = 'E2EFDA'; // Sign Empl 1 - Green
      if (colNumber === 23) fillColor = 'FCE4D6'; // Sign Empl 2 - Orange

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fillColor }
      };

      if (colNumber === 22) cell.font = { bold: true, color: { argb: '385723' } };
      if (colNumber === 23) cell.font = { bold: true, color: { argb: 'C55A11' } };
    });

    let lastKnownClosing: number | null = null;
    let currentRow = 2; // Data starts at row 2

    days.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayData = localData[dateStr] || { morning: { ...initialEntry }, evening: { ...initialEntry } };
      
      const m = dayData.morning;
      const e = dayData.evening;

      const daySales = currentMonthReport?.days?.[dateStr]?.sales || [];
      const activeSales = showHighlights ? daySales : daySales.filter(s => !s.highlighted);
      const autoSale = activeSales.reduce((sum, s) => sum + s.quantity, 0) || 0;
      const mDisplaySale = m.sale !== '' ? m.sale : (autoSale > 0 ? autoSale : '');
      const eDisplaySale = e.sale; // Evening uses its own sale

      // Morning
      const mHasData = hasData(m);
      const mTotal = calcTotalPhyStk(m);
      let mOpening: number | '' = '';
      if (mHasData || mTotal !== null) {
        if (lastKnownClosing !== null) mOpening = lastKnownClosing;
        else if (mTotal !== null) mOpening = mTotal;
      }
      const mOpeningGap = (mOpening !== '' && mTotal !== null) ? (mOpening - mTotal) : '';
      const mNetMovement = (m.stkIn !== '' || mDisplaySale !== '' || m.stkOut !== '') ? 
        ((Number(m.stkIn)||0) - (Number(mDisplaySale)||0) - (Number(m.stkOut)||0)) : '';
      
      const mClosing = mOpening !== '' ? mOpening + (mNetMovement !== '' ? Number(mNetMovement) : 0) : '';
      const mClosingGap = '-';
      if (mClosing !== '') lastKnownClosing = mClosing as number;

      // Evening
      const eHasData = hasData(e);
      const eTotal = calcTotalPhyStk(e);
      let eOpening: number | '' = '';
      if (eHasData || eTotal !== null) {
        if (lastKnownClosing !== null) eOpening = lastKnownClosing;
        else if (eTotal !== null) eOpening = eTotal;
      }
      const eOpeningGap = (eOpening !== '' && eTotal !== null) ? (eOpening - eTotal) : '';
      const eNetMovement = (e.stkIn !== '' || eDisplaySale !== '' || e.stkOut !== '') ? 
        ((Number(e.stkIn)||0) - (Number(eDisplaySale)||0) - (Number(e.stkOut)||0)) : '';
      let eClosing: number | '' = '';
      if (eHasData && eOpening !== '') {
         eClosing = eOpening + (eNetMovement !== '' ? Number(eNetMovement) : 0);
      }
      const eClosingGap = (eClosing !== '' && eTotal !== null) ? (eTotal - eClosing) : '';
      if (eClosing !== '') lastKnownClosing = eClosing as number;

      const mRow = worksheet.addRow([
        format(day, 'M/d/yyyy'), format(day, 'EEEE'), 'Morning', mOpening,
        m.displayWall1, m.displayWall2, m.displayWall3, m.podium1, m.podium2, m.podium3, m.podium4, m.accessories, m.backStore,
        mTotal !== null ? mTotal : '', mOpeningGap !== '' ? mOpeningGap : '', m.stkIn, mDisplaySale, m.stkOut, mNetMovement !== '' ? mNetMovement : '', mClosing, mClosingGap,
        m.signEmpl1, m.signEmpl2, m.remarks
      ]);

      const eRow = worksheet.addRow([
        format(day, 'M/d/yyyy'), format(day, 'EEEE'), 'Evening', eOpening,
        e.displayWall1, e.displayWall2, e.displayWall3, e.podium1, e.podium2, e.podium3, e.podium4, e.accessories, e.backStore,
        eTotal !== null ? eTotal : '', eOpeningGap !== '' ? eOpeningGap : '', e.stkIn, eDisplaySale, e.stkOut, eNetMovement !== '' ? eNetMovement : '', eClosing, eClosingGap !== '' ? eClosingGap : '',
        e.signEmpl1, e.signEmpl2, e.remarks
      ]);

      // Apply cell styles
      [mRow, eRow].forEach((row, rowIndex) => {
        const isMorning = rowIndex === 0;
        
        row.eachCell((cell, colNumber) => {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
          };

          // Basic text color
          if (colNumber === 3) { // Time
            cell.font = { color: { argb: isMorning ? '008000' : '0000FF' }, bold: true };
          }
          if (colNumber <= 2) cell.font = { bold: true };
          
          // Background colors based on UI
          let bgColor = 'FFFFFF'; // white default
          
          if (colNumber === 4 || colNumber === 20) bgColor = 'FFFF00'; // Opening, Closing
          if (colNumber === 14) bgColor = isMorning ? 'C6E0B4' : 'E2EFDA'; // Total Phy. Stk.
          if (colNumber === 15 || colNumber === 21) bgColor = 'FCE4D6'; // Gaps
          
          if (!isMorning && (colNumber >= 16 && colNumber <= 19)) {
            bgColor = 'D9E1F2'; // Stk In, Sale, Stk Out, Net Movement (Evening)
          } else if (isMorning && (colNumber >= 16 && colNumber <= 19)) {
            bgColor = 'D9E1F2'; // Morning also has blue bg for these fields in UI
          }

          if (bgColor !== 'FFFFFF') {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: bgColor }
            };
          }
          
          if (colNumber === 4 || colNumber === 20 || colNumber === 14) {
            cell.font = { ...cell.font, bold: true };
          }
        });
      });

      // Merge Date, Day, Remarks
      worksheet.mergeCells(`A${currentRow}:A${currentRow + 1}`);
      worksheet.mergeCells(`B${currentRow}:B${currentRow + 1}`);
      worksheet.mergeCells(`X${currentRow}:X${currentRow + 1}`);

      currentRow += 2;
    });

    // Column Widths
    worksheet.columns = [
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, 
      { width: 14 }, { width: 14 }, { width: 14 }, 
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, 
      { width: 16 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 10 }, 
      { width: 14 }, { width: 10 }, { width: 14 }, { width: 17 }, { width: 17 }, { width: 35 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Stock_Count_${format(currentDate, 'yyyy_MM')}.xlsx`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

    const rowStr = target.getAttribute('data-row');
    const colStr = target.getAttribute('data-col');
    if (!rowStr || !colStr) return;

    const r = parseInt(rowStr, 10);
    const c = parseInt(colStr, 10);

    const key = e.key;
    let dr = 0;
    let dc = 0;

    if (key === 'ArrowUp') dr = -1;
    else if (key === 'ArrowDown' || key === 'Enter') dr = 1;
    else if (key === 'ArrowLeft') dc = -1;
    else if (key === 'ArrowRight') dc = 1;
    else return;

    const isText = target.tagName === 'TEXTAREA' || (target as HTMLInputElement).type === 'text';
    if (isText && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      return; 
    }

    e.preventDefault();

    let currR = r + dr;
    let currC = c + dc;
    
    const maxRow = 31 * 2;
    const maxCol = 15;

    while (currR >= 0 && currR < maxRow && currC >= 0 && currC <= maxCol) {
      let el = document.querySelector(`[data-row="${currR}"][data-col="${currC}"]`) as HTMLElement;
      
      if (!el && currC === 15 && currR % 2 === 1) {
        el = document.querySelector(`[data-row="${currR - 1}"][data-col="${currC}"]`) as HTMLElement;
      }

      if (el) {
        el.focus();
        if (el.tagName === 'INPUT') {
          (el as HTMLInputElement).select();
        }
        return;
      }
      
      if (dc !== 0) currC += dc;
      else if (dr !== 0) currR += dr;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const days = getDaysInCurrentMonth();
  let lastKnownClosing: number | null = null;

  const inputClass = "w-10 h-6 px-1 text-center text-xs border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white";
  const textInputClass = "w-16 h-6 px-1 text-xs border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-4">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-800 min-w-[150px] text-center">{format(currentDate, 'MMMM yyyy')}</h2>
          <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg font-bold hover:bg-green-100 transition-colors">
            <Download size={18} /> Export Excel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto w-full max-h-[calc(100vh-200px)]">
        <table className="w-full text-xs border-collapse min-w-max" style={{ fontFamily: 'Calibri, sans-serif' }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center sticky left-0 z-30 min-w-[65px]">Date</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center sticky left-[65px] z-30 min-w-[70px]">Day</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center sticky left-[135px] z-30 min-w-[60px]">Day</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Opening</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Display<br/>Wall 1</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Display<br/>Wall 2</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Display<br/>Wall 3</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Podium<br/>1</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Podium<br/>2</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Podium<br/>3</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Podium<br/>4</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Accessories</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Back<br/>Store</th>
              <th className="border border-gray-400 bg-[#c6e0b4] px-1 py-2 text-center font-bold">Total<br/>Phy. Stk.</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Opening<br/>Gap</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Stk In</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Sale</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Stk Out</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Net<br/>Movement</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Closing</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold">Closing<br/>Gap</th>
              <th className="border border-gray-400 bg-[#e2efda] px-1 py-2 text-center font-bold text-[#385723]">Sign Empl 1</th>
              <th className="border border-gray-400 bg-[#fce4d6] px-1 py-2 text-center font-bold text-[#c55a11]">Sign Empl 2</th>
              <th className="border border-gray-400 bg-[#ffff00] px-1 py-2 text-center font-bold min-w-[150px]">Remarks, if Any</th>
            </tr>
          </thead>
          <tbody onKeyDown={handleKeyDown}>
            {days.map((day, index) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayData = localData[dateStr] || { morning: { ...initialEntry }, evening: { ...initialEntry } };
              
              const m = dayData.morning;
              const e = dayData.evening;

              const mRowIdx = index * 2;
              const eRowIdx = index * 2 + 1;

              const daySales = currentMonthReport?.days?.[dateStr]?.sales || [];
              const activeSales = showHighlights ? daySales : daySales.filter(s => !s.highlighted);
              const autoSale = activeSales.reduce((sum, s) => sum + s.quantity, 0) || 0;
              const mDisplaySale = m.sale !== '' ? m.sale : (autoSale > 0 ? autoSale : '');
              const eDisplaySale = e.sale;

              // Morning calculations
              const mHasData = hasData(m);
              const mTotal = calcTotalPhyStk(m);
              let mOpening: number | '' = '';
              
              if (mHasData || mTotal !== null) {
                if (lastKnownClosing !== null) mOpening = lastKnownClosing;
                else if (mTotal !== null) mOpening = mTotal;
              }
              
              const mOpeningGap = (mOpening !== '' && mTotal !== null) ? (mOpening - mTotal) : '';
              const mNetMovement = (m.stkIn !== '' || mDisplaySale !== '' || m.stkOut !== '') ? 
                ((Number(m.stkIn)||0) - (Number(mDisplaySale)||0) - (Number(m.stkOut)||0)) : '';
              
              const mClosing = mOpening !== '' ? mOpening + (mNetMovement !== '' ? Number(mNetMovement) : 0) : '';
              const mClosingGap = '-';
              
              if (mClosing !== '') lastKnownClosing = mClosing as number;

              // Evening calculations
              const eHasData = hasData(e);
              const eTotal = calcTotalPhyStk(e);
              let eOpening: number | '' = '';
              
              if (eHasData || eTotal !== null) {
                if (lastKnownClosing !== null) eOpening = lastKnownClosing;
                else if (eTotal !== null) eOpening = eTotal;
              }
              
              const eOpeningGap = (eOpening !== '' && eTotal !== null) ? (eOpening - eTotal) : '';
              const eNetMovement = (e.stkIn !== '' || eDisplaySale !== '' || e.stkOut !== '') ? 
                ((Number(e.stkIn)||0) - (Number(eDisplaySale)||0) - (Number(e.stkOut)||0)) : '';
                
              let eClosing: number | '' = '';
              if (eHasData && eOpening !== '') {
                 eClosing = eOpening + (eNetMovement !== '' ? Number(eNetMovement) : 0);
              }
              const eClosingGap = (eClosing !== '' && eTotal !== null) ? (eTotal - eClosing) : '';
              
              if (eClosing !== '') lastKnownClosing = eClosing as number;

              const isMorningMismatch = mOpeningGap !== '' && mOpeningGap !== 0;
              const isEveningMismatch = eClosingGap !== '' && eClosingGap !== 0;

              return (
                <React.Fragment key={dateStr}>
                  {/* Morning Row */}
                  <tr>
                    <td className="border border-gray-400 px-1 py-1 text-center font-bold sticky left-0 bg-white" rowSpan={2}>{format(day, 'M/d/yyyy')}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center font-bold sticky left-[65px] bg-white" rowSpan={2}>{format(day, 'EEEE')}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center sticky left-[135px] bg-white text-green-700 font-bold">Morning</td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#ffff00] text-center font-bold text-gray-800">{mOpening}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={1} value={m.displayWall1} onChange={ev => updateEntry(dateStr, 'morning', 'displayWall1', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={2} value={m.displayWall2} onChange={ev => updateEntry(dateStr, 'morning', 'displayWall2', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={3} value={m.displayWall3} onChange={ev => updateEntry(dateStr, 'morning', 'displayWall3', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={4} value={m.podium1} onChange={ev => updateEntry(dateStr, 'morning', 'podium1', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={5} value={m.podium2} onChange={ev => updateEntry(dateStr, 'morning', 'podium2', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={6} value={m.podium3} onChange={ev => updateEntry(dateStr, 'morning', 'podium3', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={7} value={m.podium4} onChange={ev => updateEntry(dateStr, 'morning', 'podium4', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={8} value={m.accessories} onChange={ev => updateEntry(dateStr, 'morning', 'accessories', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={mRowIdx} data-col={9} value={m.backStore} onChange={ev => updateEntry(dateStr, 'morning', 'backStore', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#c6e0b4] text-center font-bold text-gray-800">{mTotal !== null ? mTotal : ''}</td>
                    <td className={`border border-gray-400 px-1 py-1 text-center ${isMorningMismatch ? 'bg-red-200 text-red-700 font-bold' : 'bg-[#fce4d6]'}`}>{formatNum(mOpeningGap, true)}</td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center"><input type="number" data-row={mRowIdx} data-col={10} value={m.stkIn} onChange={ev => updateEntry(dateStr, 'morning', 'stkIn', ev.target.value)} className={inputClass.replace('bg-white', 'bg-[#d9e1f2]')} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center"><input type="number" data-row={mRowIdx} data-col={11} value={mDisplaySale} onChange={ev => updateEntry(dateStr, 'morning', 'sale', ev.target.value)} className={inputClass.replace('bg-white', 'bg-[#d9e1f2]')} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center"><input type="number" data-row={mRowIdx} data-col={12} value={m.stkOut} onChange={ev => updateEntry(dateStr, 'morning', 'stkOut', ev.target.value)} className={inputClass.replace('bg-white', 'bg-[#d9e1f2]')} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center">{mNetMovement !== '' ? mNetMovement : ''}</td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#ffff00] text-center font-bold text-gray-800">{mClosing}</td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#fce4d6] text-center">{mClosingGap}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="text" data-row={mRowIdx} data-col={13} value={m.signEmpl1} onChange={ev => updateEntry(dateStr, 'morning', 'signEmpl1', ev.target.value)} className={textInputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="text" data-row={mRowIdx} data-col={14} value={m.signEmpl2} onChange={ev => updateEntry(dateStr, 'morning', 'signEmpl2', ev.target.value)} className={textInputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white" rowSpan={2}><textarea data-row={mRowIdx} data-col={15} value={m.remarks} onChange={ev => updateEntry(dateStr, 'morning', 'remarks', ev.target.value)} className="w-full h-12 p-1 text-xs border border-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea></td>
                  </tr>
                  
                  {/* Evening Row */}
                  <tr>
                    <td className="border border-gray-400 px-1 py-1 text-center sticky left-[135px] bg-white text-blue-700 font-bold">Evening</td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#ffff00] text-center font-bold text-gray-800">{eOpening}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={1} value={e.displayWall1} onChange={ev => updateEntry(dateStr, 'evening', 'displayWall1', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={2} value={e.displayWall2} onChange={ev => updateEntry(dateStr, 'evening', 'displayWall2', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={3} value={e.displayWall3} onChange={ev => updateEntry(dateStr, 'evening', 'displayWall3', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={4} value={e.podium1} onChange={ev => updateEntry(dateStr, 'evening', 'podium1', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={5} value={e.podium2} onChange={ev => updateEntry(dateStr, 'evening', 'podium2', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={6} value={e.podium3} onChange={ev => updateEntry(dateStr, 'evening', 'podium3', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={7} value={e.podium4} onChange={ev => updateEntry(dateStr, 'evening', 'podium4', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={8} value={e.accessories} onChange={ev => updateEntry(dateStr, 'evening', 'accessories', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="number" data-row={eRowIdx} data-col={9} value={e.backStore} onChange={ev => updateEntry(dateStr, 'evening', 'backStore', ev.target.value)} className={inputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#e2efda] text-center font-bold text-gray-800">{eTotal !== null ? eTotal : ''}</td>
                    <td className={`border border-gray-400 px-1 py-1 text-center ${eOpeningGap !== '' && eOpeningGap !== 0 ? 'bg-red-200 text-red-700 font-bold' : 'bg-[#fce4d6]'}`}>{formatNum(eOpeningGap, true)}</td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center"><input type="number" data-row={eRowIdx} data-col={10} value={e.stkIn} onChange={ev => updateEntry(dateStr, 'evening', 'stkIn', ev.target.value)} className={inputClass.replace('bg-white', 'bg-[#d9e1f2]')} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center"><input type="number" data-row={eRowIdx} data-col={11} value={eDisplaySale} onChange={ev => updateEntry(dateStr, 'evening', 'sale', ev.target.value)} className={inputClass.replace('bg-white', 'bg-[#d9e1f2]')} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center"><input type="number" data-row={eRowIdx} data-col={12} value={e.stkOut} onChange={ev => updateEntry(dateStr, 'evening', 'stkOut', ev.target.value)} className={inputClass.replace('bg-white', 'bg-[#d9e1f2]')} /></td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#d9e1f2] text-center">{eNetMovement !== '' ? eNetMovement : ''}</td>
                    <td className="border border-gray-400 px-1 py-1 bg-[#ffff00] text-center font-bold text-gray-800">{eClosing}</td>
                    <td className={`border border-gray-400 px-1 py-1 text-center ${isEveningMismatch ? 'bg-red-200 text-red-700 font-bold' : 'bg-[#fce4d6]'}`}>{formatNum(eClosingGap, true)}</td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="text" data-row={eRowIdx} data-col={13} value={e.signEmpl1} onChange={ev => updateEntry(dateStr, 'evening', 'signEmpl1', ev.target.value)} className={textInputClass} /></td>
                    <td className="border border-gray-400 px-1 py-1 text-center bg-white"><input type="text" data-row={eRowIdx} data-col={14} value={e.signEmpl2} onChange={ev => updateEntry(dateStr, 'evening', 'signEmpl2', ev.target.value)} className={textInputClass} /></td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
