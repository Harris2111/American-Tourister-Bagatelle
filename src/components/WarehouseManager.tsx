import React, { useState } from 'react';
import { StockItem, WarehouseStockItem, StockComparison } from '../types';
import { Upload, Package, RefreshCw, Download, Trash2, CheckCircle2 } from 'lucide-react';

interface WarehouseManagerProps {
  shopStock: StockItem[];
  onUpdateShopStock: (stock: StockItem[]) => void;
}

export const WarehouseManager: React.FC<WarehouseManagerProps> = ({ shopStock, onUpdateShopStock }) => {
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockItem[]>([]);
  const [comparisonResults, setComparisonResults] = useState<StockComparison[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  const handleWarehouseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        // Handle different line endings and filter empty lines
        const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
        
        console.log(`Parsing warehouse stock CSV: ${lines.length} lines found`);

        const newItems: WarehouseStockItem[] = lines.map((line, index) => {
          // Better CSV parsing to handle quotes and commas within quotes
          const parts: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              parts.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          parts.push(current.trim());
          
          const cleanParts = parts.map(p => p.replace(/^"|"$/g, '').trim());
          
          // Skip header row if it looks like one
          if (index === 0 && (cleanParts[0].toLowerCase().includes('code') || cleanParts[0].toLowerCase() === 'item')) {
            return null;
          }

          if (cleanParts.length >= 2) {
            const [itemCode, quantityStr] = cleanParts;
            const quantity = parseInt(quantityStr.replace(/[^0-9-]/g, '')) || 0;

            if (!itemCode) return null;

            return {
              id: crypto.randomUUID(),
              name: itemCode,
              description: '', 
              model: itemCode,
              quantity: quantity
            };
          }
          return null;
        }).filter(Boolean) as WarehouseStockItem[];
        
        console.log(`Successfully parsed ${newItems.length} warehouse items`);

        if (newItems.length === 0) {
          alert("No valid items found in CSV. Please ensure the format is: Item Code, Quantity");
          return;
        }

        setWarehouseStock(newItems);
        // Clear file input so same file can be uploaded again if needed
        e.target.value = '';
      } catch (err) {
        console.error("Failed to parse warehouse stock file", err);
        alert("Error parsing CSV file. Please check the format.");
      }
    };
    reader.readAsText(file);
  };

  const compareStocks = () => {
    setIsComparing(true);
    
    // Normalize and aggregate warehouse stock by model
    const warehouseMap = new Map<string, { qty: number, originalCode: string }>();
    warehouseStock.forEach(item => {
      const normCode = item.model.trim().toUpperCase();
      const current = warehouseMap.get(normCode) || { qty: 0, originalCode: item.model };
      warehouseMap.set(normCode, { 
        qty: current.qty + item.quantity, 
        originalCode: current.originalCode 
      });
    });

    // Normalize and aggregate shop stock by model
    const shopMap = new Map<string, { qty: number, originalCode: string }>();
    shopStock.forEach(item => {
      const normCode = item.model.trim().toUpperCase();
      const current = shopMap.get(normCode) || { qty: 0, originalCode: item.model };
      shopMap.set(normCode, { 
        qty: current.qty + (item.currentStock || 0), 
        originalCode: current.originalCode 
      });
    });

    // Get all unique normalized item codes from both maps
    const allNormalizedCodes = new Set([
      ...Array.from(warehouseMap.keys()),
      ...Array.from(shopMap.keys())
    ]);

    const results: StockComparison[] = Array.from(allNormalizedCodes).map(normCode => {
      const warehouseData = warehouseMap.get(normCode);
      const shopData = shopMap.get(normCode);
      
      const warehouseQty = warehouseData ? warehouseData.qty : 0;
      const shopQty = shopData ? shopData.qty : 0;
      
      // Use the original item code from shop stock if available, otherwise from warehouse
      const originalCode = shopData?.originalCode || warehouseData?.originalCode || normCode;
      
      return {
        itemCode: originalCode,
        warehouseQty,
        shopQty,
        difference: warehouseQty - shopQty
      };
    });

    // Sort by item code
    results.sort((a, b) => a.itemCode.localeCompare(b.itemCode));

    setComparisonResults(results);
    setIsComparing(false);
  };

  const downloadComparison = () => {
    if (comparisonResults.length === 0) return;
    const headers = 'Item Code,Warehouse Stock,Shop Stock,Difference\n';
    const rows = comparisonResults.map(item => 
      `${item.itemCode},${item.warehouseQty},${item.shopQty},${item.difference}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Stock_Comparison_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8">
        {/* Warehouse Stock Upload */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
              <Package size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Warehouse Stock</h3>
              <p className="text-xs text-gray-500">Upload current warehouse inventory (Item Code, Quantity)</p>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-50 transition-all mb-6">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-3 text-gray-400" />
              <p className="text-sm text-gray-500 font-medium">Click to upload CSV</p>
            </div>
            <input type="file" accept=".csv" className="hidden" onChange={handleWarehouseUpload} />
          </label>

          {warehouseStock.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Items Loaded:</span>
                <span className="font-bold text-gray-900">{warehouseStock.length}</span>
              </div>
              <button
                onClick={compareStocks}
                disabled={isComparing}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
              >
                <RefreshCw size={18} className={isComparing ? 'animate-spin' : ''} />
                Compare Stocks
              </button>
              <button
                onClick={() => {
                  setWarehouseStock([]);
                  setComparisonResults([]);
                }}
                className="w-full flex items-center justify-center gap-2 bg-white text-red-600 border border-red-100 py-2 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
              >
                <Trash2 size={14} />
                Clear Warehouse Data
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stock Comparison Section */}
      {comparisonResults.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-50/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Stock Comparison Result</h3>
                <p className="text-xs text-gray-500">Comparison of Warehouse vs Shop inventory levels</p>
              </div>
            </div>
            <button
              onClick={downloadComparison}
              className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition-all shadow-lg shadow-gray-200"
            >
              <Download size={20} />
              Download Comparison
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider">Item Code</th>
                  <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider text-center">Warehouse Stock</th>
                  <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider text-center">Shop Stock</th>
                  <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider text-center">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comparisonResults.map((item, idx) => (
                  <tr key={item.itemCode ? `wh-${item.itemCode}` : `wh-idx-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">{item.itemCode}</td>
                    <td className="px-6 py-4 text-center font-bold text-amber-600">{item.warehouseQty}</td>
                    <td className="px-6 py-4 text-center font-bold text-blue-600">{item.shopQty}</td>
                    <td className={`px-6 py-4 text-center font-bold ${item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {item.difference > 0 ? `+${item.difference}` : item.difference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
