import React, { useState, useRef } from 'react';
import { StockItem, SaleEntry, DailyData } from '../types';
import { ShoppingCart, Users, Calendar, CheckCircle2, Trash2, XCircle, Download, Loader2, CreditCard, Banknote, Smartphone, Hash, RefreshCw, Gift } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface DailyInputProps {
  stock: StockItem[];
  currentData: DailyData;
  onUpdate: (data: DailyData) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onStockChange: (productId: string, delta: number) => void;
  onDownloadLog?: () => void;
  isDownloading?: boolean;
  showHighlights?: boolean;
}

export const DailyInput: React.FC<DailyInputProps> = ({ 
  stock, 
  currentData, 
  onUpdate, 
  selectedDate, 
  onDateChange,
  onStockChange,
  onDownloadLog,
  isDownloading,
  showHighlights = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'juice' | 'split'>('cash');
  const [transactionId, setTransactionId] = useState('');
  const [splitPayments, setSplitPayments] = useState<Record<string, string>>({
    cash: '',
    card: '',
    juice: ''
  });
  const [splitJuiceId, setSplitJuiceId] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleSplitAmountChange = (method: string, val: string) => {
    setSplitPayments(prev => ({ ...prev, [method]: val }));
  };

  const handleDateClick = () => {
    if (dateInputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          dateInputRef.current.showPicker();
        } else {
          dateInputRef.current.click();
        }
      } catch (e) {
        dateInputRef.current.click();
      }
    }
  };

  const filteredStock = stock.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [isSelling, setIsSelling] = useState<string | null>(null);
  const [isGiftMode, setIsGiftMode] = useState(false);

  const handleSold = async (item: StockItem) => {
    if (isSelling) return;
    
    const qty = quantities[item.id] || 1;
    console.log(`[DEBUG] handleSold triggered for item: ${item.name}, qty: ${qty}, currentData:`, currentData);
    
    if (item.currentStock <= 0 && !isGiftMode) {
      if (!window.confirm(`Stock for "${item.name}" is currently ${item.currentStock}. Do you want to proceed with this sale? This will result in negative stock.`)) {
        return;
      }
    }

    if (isGiftMode) {
      setIsSelling(item.id);
      try {
        const newSale: SaleEntry = {
          id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
          productId: item.id,
          productName: item.name + ' (GIFT)',
          price: 0,
          quantity: qty,
          timestamp: Date.now(),
          paymentMethod: 'cash',
          highlighted: item.highlighted,
          isGift: true
        };

        const updatedSales = [...(currentData.sales || []), newSale];
        await onUpdate({
          ...currentData,
          sales: updatedSales
        });
        await onStockChange(item.id, -qty);
        setQuantities(prev => ({ ...prev, [item.id]: 1 }));
      } catch (error) {
        console.error(`[DEBUG] Error in gift flow:`, error);
      } finally {
        setIsSelling(null);
      }
      return;
    }

    if (paymentMethod === 'juice' && !transactionId.trim()) {
      alert('Please enter the Juice transaction ID.');
      return;
    }

    if (paymentMethod === 'split') {
      const cleanNum = (val: string) => parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
      const cash = cleanNum(splitPayments.cash);
      const card = cleanNum(splitPayments.card);
      const juice = cleanNum(splitPayments.juice);
      const totalEntered = cash + card + juice;
      const salePrice = (item.promoPrice && item.promoPrice > 0 ? item.promoPrice : item.price) * qty;

      if (Math.abs(totalEntered - salePrice) > 1) { // Allow 1 MUR rounding difference
        alert(`Payment mismatch!\n\nProduct Total: ${salePrice.toLocaleString()} MUR\nYour Split Total: ${totalEntered.toLocaleString()} MUR\n\nPlease adjust the amounts to match.`);
        return;
      }

      if (juice > 0 && !splitJuiceId.trim()) {
        alert('Please enter the Juice transaction ID for the split payment.');
        return;
      }
    }

    setIsSelling(item.id);
    try {
      const salePrice = item.promoPrice && item.promoPrice > 0 ? item.promoPrice : item.price;

      const newSale: SaleEntry = {
        id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        productId: item.id,
        productName: item.name,
        price: salePrice,
        quantity: qty,
        timestamp: Date.now(),
        paymentMethod: paymentMethod,
        highlighted: item.highlighted
      };

      if (paymentMethod === 'juice' && transactionId.trim()) {
        newSale.transactionId = transactionId.trim();
      }

      if (paymentMethod === 'split') {
        const cleanNum = (val: string) => parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
        const splits: any[] = [];
        const cash = cleanNum(splitPayments.cash);
        const card = cleanNum(splitPayments.card);
        const juice = cleanNum(splitPayments.juice);
        
        if (cash > 0) splits.push({ method: 'cash', amount: cash });
        if (card > 0) splits.push({ method: 'card', amount: card });
        if (juice > 0) splits.push({ method: 'juice', amount: juice, transactionId: splitJuiceId.trim() });
        newSale.splitPayments = splits;
      }

      const updatedSales = [...(currentData.sales || []), newSale];
      console.log(`[DEBUG] Sending updated sales to onUpdate:`, updatedSales);

      await onUpdate({
        ...currentData,
        sales: updatedSales
      });
      
      await onStockChange(item.id, -qty);
      
      // Reset quantity and transaction ID
      setQuantities(prev => ({ ...prev, [item.id]: 1 }));
      setTransactionId('');
      setSplitJuiceId('');
      setSplitPayments({ cash: '', card: '', juice: '' });
      console.log(`[DEBUG] Sale recording process completed for ${item.name}`);
    } catch (error) {
      console.error(`[DEBUG] Error in handleSold:`, error);
    } finally {
      setIsSelling(null);
    }
  };

  const removeSale = (id: string, productId: string, quantity: number) => {
    onUpdate({
      ...currentData,
      sales: currentData.sales.filter(s => s.id !== id)
    });
    onStockChange(productId, quantity);
  };

  const clearAllSales = () => {
    if (window.confirm('Are you sure you want to clear all sales for this day?')) {
      currentData.sales.forEach(sale => {
        onStockChange(sale.productId, sale.quantity);
      });
      onUpdate({
        ...currentData,
        sales: []
      });
    }
  };

  const updateVisitors = (val: string) => {
    const visitors = parseInt(val) || 0;
    onUpdate({ ...currentData, visitors });
  };

  const handleQtyChange = (id: string, val: string) => {
    const qty = parseInt(val) || 1;
    setQuantities(prev => ({ ...prev, [id]: qty }));
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-gray-800">
          <Calendar className="text-blue-600" size={24} />
          <h2 className="text-xl font-bold">Daily Sales Entry</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Selected Date</p>
            <p className="text-sm font-bold text-blue-600">
              {(() => {
                try {
                  const date = parseISO(selectedDate);
                  return isNaN(date.getTime()) ? 'Select Date' : format(date, 'dd/MM/yyyy');
                } catch {
                  return 'Select Date';
                }
              })()}
            </p>
          </div>
          <button 
            onClick={handleDateClick}
            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all"
            title="Change Date"
          >
            <Calendar size={20} />
            <input
              ref={dateInputRef}
              type="date"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-none"
              value={selectedDate}
              onChange={e => onDateChange(e.target.value)}
            />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 flex-1">
        {/* Top Section: Product Selection */}
        <div className="space-y-4 flex flex-col">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Visitors Count</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0"
                  className="w-full pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  value={currentData.visitors || ''}
                  onChange={e => updateVisitors(e.target.value)}
                />
                <Users className="absolute left-3 top-2.5 text-gray-400" size={16} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Search Product</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <ShoppingCart className="absolute left-3 top-2.5 text-gray-400" size={16} />
              </div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment Method</label>
              {paymentMethod === 'juice' && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                  <Hash size={12} className="text-purple-500" />
                  <input
                    type="text"
                    placeholder="Transaction ID"
                    className="w-32 px-2 py-1 border rounded text-xs focus:ring-2 focus:ring-purple-500 outline-none font-medium"
                    value={transactionId}
                    onChange={e => setTransactionId(e.target.value)}
                  />
                </div>
              )}
            </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Payment Method</h3>
              <button
                onClick={() => setIsGiftMode(!isGiftMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm active:scale-95 ${
                  isGiftMode 
                  ? 'bg-purple-600 text-white shadow-purple-500/20' 
                  : 'bg-white text-gray-400 border border-gray-200'
                }`}
              >
                <Gift size={12} />
                Gift Mode {isGiftMode ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className={`grid grid-cols-4 gap-3 ${isGiftMode ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all h-16 w-16 ${
                  paymentMethod === 'cash' 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                  : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300'
                }`}
              >
                <Banknote size={20} />
                <span className="text-[10px] font-black">CASH</span>
              </button>
              <button
                onClick={() => setPaymentMethod('card')}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all h-16 w-16 ${
                  paymentMethod === 'card' 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                  : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300'
                }`}
              >
                <CreditCard size={20} />
                <span className="text-[10px] font-black">CARD</span>
              </button>
              <button
                onClick={() => setPaymentMethod('juice')}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all h-16 w-16 ${
                  paymentMethod === 'juice' 
                  ? 'bg-purple-600 text-white border-purple-600 shadow-md scale-105' 
                  : 'bg-white text-gray-400 border-gray-200 hover:border-purple-300'
                }`}
              >
                <Smartphone size={20} />
                <span className="text-[10px] font-black">JUICE</span>
              </button>
              <button
                onClick={() => setPaymentMethod('split')}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all h-16 w-16 ${
                  paymentMethod === 'split' 
                  ? 'bg-[#f4511e] text-white border-[#f4511e] shadow-md scale-105' 
                  : 'bg-white text-gray-400 border-gray-200 hover:border-orange-300'
                }`}
              >
                <Hash size={20} />
                <span className="text-[10px] font-black">SPLIT</span>
              </button>
            </div>

            {paymentMethod === 'split' && (
              <div className="mt-3 p-4 bg-[#fff8f1] rounded-2xl border border-orange-100 space-y-4 animate-in zoom-in-95 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black text-[#f4511e] uppercase tracking-tight">Split Breakdown</h4>
                  <button 
                    onClick={() => {
                      setSplitPayments({ cash: '', card: '', juice: '' });
                      setSplitJuiceId('');
                    }}
                    className="text-[10px] font-bold text-orange-500 hover:text-orange-700 uppercase"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <Banknote className="absolute left-3 top-3 text-gray-300" size={14} />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Cash Amount"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-gray-800 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-sm text-gray-700 placeholder:text-gray-400"
                      value={splitPayments.cash}
                      onChange={e => handleSplitAmountChange('cash', e.target.value)}
                    />
                  </div>
                  
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-3 text-gray-300" size={14} />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Card Amount"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-gray-800 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-sm text-gray-700 placeholder:text-gray-400"
                      value={splitPayments.card}
                      onChange={e => handleSplitAmountChange('card', e.target.value)}
                    />
                  </div>

                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3 text-gray-300" size={14} />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Juice Amount"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-gray-800 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-sm text-gray-700 placeholder:text-gray-400"
                      value={splitPayments.juice}
                      onChange={e => handleSplitAmountChange('juice', e.target.value)}
                    />
                  </div>

                  {(() => {
                    const cleanNum = (val: string) => parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
                    return cleanNum(splitPayments.juice) > 0;
                  })() && (
                    <div className="relative animate-in slide-in-from-top-2">
                      <Hash className="absolute left-3 top-3 text-purple-300" size={14} />
                      <input
                        type="text"
                        placeholder="Juice Transaction ID"
                        className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-purple-800 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-medium text-sm text-purple-700 placeholder:text-purple-300"
                        value={splitJuiceId}
                        onChange={e => setSplitJuiceId(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                
                <div className="pt-2 border-t border-orange-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-[#f4511e] uppercase">Total to match:</span>
                  <div className="text-right">
                    <span className={`text-sm font-black font-mono ${
                      (() => {
                        const cleanNum = (val: string) => parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
                        const cash = cleanNum(splitPayments.cash);
                        const card = cleanNum(splitPayments.card);
                        const juice = cleanNum(splitPayments.juice);
                        const total = cash + card + juice;
                        // We don't know the product total here easily without a specific item selected, 
                        // but we can show the current sum.
                        return 'text-[#f4511e]';
                      })()
                    }`}>
                      {(() => {
                        const cleanNum = (val: string) => parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
                        const cash = cleanNum(splitPayments.cash);
                        const card = cleanNum(splitPayments.card);
                        const juice = cleanNum(splitPayments.juice);
                        const total = cash + card + juice;
                        return total.toLocaleString();
                      })()} MUR
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto border rounded-lg divide-y bg-white">
            {filteredStock.map((item, idx) => (
              <div key={item.id ? `di-${item.id}` : `di-idx-${idx}`} className={`p-3 hover:bg-blue-50 transition-colors group border-b last:border-0 ${item.highlighted ? 'bg-green-50/50' : ''}`}>
                <div className="font-bold text-gray-800 text-sm mb-2 break-words">
                  {item.name}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] flex flex-wrap items-center gap-2">
                    {item.promoPrice && item.promoPrice > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 line-through font-mono">{item.price.toLocaleString()}</span>
                        <span className="text-green-600 font-bold font-mono">{item.promoPrice.toLocaleString()} MUR</span>
                      </div>
                    ) : (
                      <span className="text-gray-500 font-mono">{item.price.toLocaleString()} MUR</span>
                    )}
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      item.currentStock <= 0 ? 'bg-red-100 text-red-600' : 
                      item.currentStock < 3 ? 'bg-amber-100 text-amber-600' : 
                      'bg-gray-100 text-gray-500'
                    }`}>
                      Stk: {item.currentStock}
                    </span>
                    {paymentMethod === 'split' && !isGiftMode && (
                      <span className="text-[10px] font-black text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded animate-pulse">
                        TOTAL: {((item.promoPrice && item.promoPrice > 0 ? item.promoPrice : item.price) * (quantities[item.id] || 1)).toLocaleString()} MUR
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      className="w-12 px-1 py-1 border rounded text-xs focus:ring-2 focus:ring-blue-500 outline-none text-center font-bold"
                      value={quantities[item.id] || 1}
                      onChange={e => handleQtyChange(item.id, e.target.value)}
                    />
                    <button
                      onClick={() => handleSold(item)}
                      disabled={isSelling === item.id}
                      className={`flex items-center justify-center min-w-[70px] gap-1 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 ${isGiftMode ? 'bg-purple-500 hover:bg-purple-600' : 'bg-green-500 hover:bg-green-600'}`}
                    >
                      {isSelling === item.id ? <Loader2 size={12} className="animate-spin" /> : (isGiftMode ? <Gift size={12} /> : <CheckCircle2 size={12} />)}
                      {isSelling === item.id ? '...' : (isGiftMode ? 'Gift' : 'Sold')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filteredStock.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-gray-400 text-xs italic">No matching products found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Sales Log */}
        <div className="flex flex-col border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Today's Sales Log</h3>
              <p className="text-[10px] text-gray-500 font-medium">{currentData.sales.length} transactions recorded</p>
            </div>
            <div className="flex items-center gap-2">
              {currentData.sales.length > 0 && onDownloadLog && (
                <button 
                  onClick={onDownloadLog}
                  disabled={isDownloading}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                  title="Download PDF"
                >
                  {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                </button>
              )}
              {currentData.sales.length > 0 && (
                <button 
                  onClick={clearAllSales}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Clear All"
                >
                  <XCircle size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2">
            {currentData.sales
              .filter(s => showHighlights ? true : !s.highlighted)
              .map((sale, idx) => {
              const totalIncl = sale.price * (sale.quantity || 1);
              const totalExcl = totalIncl / 1.15;
              const vatAmount = totalIncl - totalExcl;
              
              return (
                <div key={sale.id || `sale-${idx}`} className={`flex flex-col text-xs p-3 rounded-xl group border transition-all ${
                  sale.highlighted 
                    ? 'bg-green-50 border-green-200 hover:border-green-300' 
                    : 'bg-gray-50 border-gray-100 hover:border-blue-200'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2 min-w-0 pr-2">
                      <span className="text-gray-400 font-mono text-[10px] mt-0.5">{idx + 1}.</span>
                      <span className="text-gray-800 font-bold">{sale.productName}</span>
                    </div>
                    <button 
                      onClick={() => removeSale(sale.id, sale.productId, sale.quantity || 1)}
                      className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-[9px] uppercase font-bold text-gray-400 mb-1">
                    <div>Excl. VAT</div>
                    <div>VAT (15%)</div>
                    <div>Total (Incl)</div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div className="text-gray-600">{totalExcl.toFixed(2)}</div>
                    <div className="text-amber-600">{vatAmount.toFixed(2)}</div>
                    <div className="text-blue-600 font-bold">{totalIncl.toFixed(2)}</div>
                  </div>
                  
                  <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] flex items-center justify-between">
                    <span className="text-gray-500">Qty: {sale.quantity} × {sale.price.toLocaleString()}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-1">
                        {sale.isGift ? (
                          <span className="px-1.5 py-0.5 rounded uppercase font-bold text-[9px] bg-purple-100 text-purple-700">
                            GIFT
                          </span>
                        ) : sale.paymentMethod === 'split' ? (
                          sale.splitPayments?.map((split, sIdx) => (
                            <span key={`split-${sale.id || idx}-${sIdx}`} className={`px-1.5 py-0.5 rounded uppercase font-bold text-[8px] flex items-center gap-1 ${
                              split.method === 'cash' ? 'bg-green-100 text-green-700' :
                              split.method === 'card' ? 'bg-blue-100 text-blue-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {split.method.toUpperCase()} AMOUNT: {split.amount.toLocaleString()}
                              {split.transactionId && <span className="opacity-50">#{split.transactionId}</span>}
                            </span>
                          ))
                        ) : (
                          <>
                            <span className={`px-1.5 py-0.5 rounded uppercase font-bold text-[9px] ${
                              sale.paymentMethod === 'cash' ? 'bg-green-100 text-green-700' :
                              sale.paymentMethod === 'card' ? 'bg-blue-100 text-blue-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {sale.paymentMethod || 'cash'}
                            </span>
                            {sale.transactionId && (
                              <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono text-[9px]">
                                #{sale.transactionId}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {currentData.sales.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs py-12 border-2 border-dashed border-gray-50 rounded-2xl bg-gray-50/30">
                <ShoppingCart size={32} className="mb-2 opacity-20" />
                <p>No sales recorded yet today.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyInput;
