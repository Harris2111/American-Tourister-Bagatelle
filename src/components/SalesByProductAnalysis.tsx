import React, { useState, useMemo, useEffect } from 'react';
import { MonthlyReport, SaleEntry } from '../types';
import { Search, Calendar, ArrowUpDown, Package, TrendingUp, Filter, Download, Activity, BarChart3 } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

interface SalesByProductAnalysisProps {
  reports: Record<string, MonthlyReport>;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

interface ProductSaleSummary {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  lastSold: number;
}

export const SalesByProductAnalysis: React.FC<SalesByProductAnalysisProps> = ({ 
  reports, 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductSaleSummary, direction: 'asc' | 'desc' }>({
    key: 'totalQuantity',
    direction: 'desc'
  });

  const salesData = useMemo(() => {
    const summary: Record<string, ProductSaleSummary> = {};
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    Object.values(reports).forEach(report => {
      Object.values(report.days).forEach(day => {
        const dayDate = parseISO(day.date);
        if (isWithinInterval(dayDate, { start, end })) {
          day.sales.forEach(sale => {
            if (!summary[sale.productId]) {
              summary[sale.productId] = {
                productId: sale.productId,
                productName: sale.productName,
                totalQuantity: 0,
                totalRevenue: 0,
                lastSold: 0
              };
            }
            summary[sale.productId].totalQuantity += (sale.quantity || 1);
            summary[sale.productId].totalRevenue += sale.price;
            summary[sale.productId].lastSold = Math.max(summary[sale.productId].lastSold, sale.timestamp);
          });
        }
      });
    });

    let result = Object.values(summary);

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.productName.toLowerCase().includes(term) || 
        p.productId.toLowerCase().includes(term)
      );
    }

    // Sort
    result.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return sortConfig.direction === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

    return result;
  }, [reports, startDate, endDate, searchTerm, sortConfig]);

  const handleSort = (key: keyof ProductSaleSummary) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const totalUnits = salesData.reduce((sum, p) => sum + p.totalQuantity, 0);
  const totalRevenue = salesData.reduce((sum, p) => sum + p.totalRevenue, 0);

  const topProductsChart = useMemo(() => {
    return [...salesData]
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10)
      .map(p => ({
        name: p.productName.length > 20 ? p.productName.substring(0, 20) + '...' : p.productName,
        fullName: p.productName,
        quantity: p.totalQuantity,
        revenue: p.totalRevenue
      }));
  }, [salesData]);

  const exportToCSV = () => {
    const headers = ['Product Name', 'Product ID', 'Quantity Sold', 'Total Revenue (MUR)', 'Last Sold'];
    const rows = salesData.map(p => [
      `"${p.productName}"`,
      `"${p.productId}"`,
      p.totalQuantity,
      p.totalRevenue,
      p.lastSold > 0 ? format(p.lastSold, 'yyyy-MM-dd HH:mm') : 'N/A'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Sales_Analysis_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isLive, setIsLive] = useState(true);
  useEffect(() => {
    // Visual feedback for "real-time" updates
    setIsLive(false);
    const timer = setTimeout(() => setIsLive(true), 500);
    return () => clearTimeout(timer);
  }, [reports]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-gray-900">Sales by Item Analysis</h3>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-500 ${
                  isLive ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  <Activity size={10} className={isLive ? 'animate-pulse' : ''} />
                  {isLive ? 'Live' : 'Updating...'}
                </div>
              </div>
              <p className="text-sm text-gray-500">Real-time tracking of product performance across any date range</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
              <Calendar size={16} className="text-gray-400" />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="bg-transparent border-none outline-none text-sm font-bold text-gray-700"
              />
              <span className="text-gray-300">to</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="bg-transparent border-none outline-none text-sm font-bold text-gray-700"
              />
            </div>
            <button 
              onClick={exportToCSV}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all shadow-sm"
            >
              <Download size={16} className="text-blue-600" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-2xl text-white shadow-lg shadow-blue-100">
            <p className="text-xs font-bold text-blue-100 uppercase mb-1 opacity-80">Total Items Sold</p>
            <p className="text-3xl font-black">{totalUnits}</p>
            <div className="mt-2 text-[10px] bg-white/20 inline-block px-2 py-0.5 rounded-full">
              Across {salesData.length} products
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Total Revenue</p>
            <p className="text-3xl font-black text-gray-900">{totalRevenue.toLocaleString()} <span className="text-sm font-bold text-gray-400">MUR</span></p>
            <div className="mt-2 flex items-center gap-1 text-green-600 font-bold text-xs">
              <TrendingUp size={12} />
              Real-time sync
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Top Performer</p>
            <p className="text-xl font-bold text-gray-900 truncate">
              {salesData[0]?.productName || 'N/A'}
            </p>
            <p className="text-sm font-bold text-blue-600 mt-1">
              {salesData[0]?.totalQuantity || 0} units sold
            </p>
          </div>
        </div>

        {/* Top Products Chart */}
        {topProductsChart.length > 0 && (
          <div className="mb-8 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
            <h4 className="text-sm font-bold text-gray-700 mb-6 flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-600" />
              Top 10 Products by Quantity
            </h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsChart} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    interval={0} 
                    height={80}
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`${value} units`, 'Quantity']}
                  />
                  <Bar dataKey="quantity" radius={[4, 4, 0, 0]} barSize={30}>
                    {topProductsChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#2563eb' : index < 3 ? '#3b82f6' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            placeholder="Search by product name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th 
                  className="px-6 py-4 text-xs font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('productName')}
                >
                  <div className="flex items-center gap-2">
                    Product Details
                    <ArrowUpDown size={14} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('totalQuantity')}
                >
                  <div className="flex items-center justify-center gap-2">
                    Qty Sold
                    <ArrowUpDown size={14} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('totalRevenue')}
                >
                  <div className="flex items-center justify-end gap-2">
                    Revenue
                    <ArrowUpDown size={14} />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">
                  Last Sold
                </th>
              </tr>
            </thead>
            <tbody>
              {salesData.length > 0 ? (
                salesData.map((product, idx) => (
                  <tr key={product.productId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 font-bold text-xs">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{product.productName}</p>
                          <p className="text-xs text-gray-500 font-mono">{product.productId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-bold text-sm ${
                        idx < 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {product.totalQuantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {product.totalRevenue.toLocaleString()} MUR
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-gray-500">
                      {product.lastSold > 0 ? format(product.lastSold, 'dd MMM yyyy HH:mm') : 'N/A'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Filter size={32} className="text-gray-300" />
                      <p>No sales found for the selected criteria.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
