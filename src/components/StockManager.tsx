import React, { useState } from 'react';
import { StockItem, StockMovement } from '../types';
import { Plus, Trash2, Upload, Package, Edit2, Save, X, Search, History, ArrowUpRight, ArrowDownRight, Clock, Download, FileText, AlertTriangle, Loader2, AlertCircle, Eye, EyeOff, Printer } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { printerService } from '../lib/printerService';
import * as XLSX from 'xlsx';
import { getAmericanTouristerPriceList, parseCSVWithHeaders } from '../initialPriceList';

interface StockManagerProps {
  stock: StockItem[];
  movements: StockMovement[];
  onUpdate: (stock: StockItem[], type?: StockMovement['type'], reason?: string) => void;
  onRecoverPrices?: () => void;
}

export const StockManager: React.FC<StockManagerProps> = ({ stock, movements, onUpdate, onRecoverPrices }) => {
  const [newItem, setNewItem] = useState({ 
    name: '', 
    price: '', 
    promoPrice: '',
    description: '', 
    model: '', 
    currentStock: '0',
    highlighted: false
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<StockItem>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [verifySearch, setVerifySearch] = useState('');
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<StockItem | null>(null);
  const [selectedPrintItem, setSelectedPrintItem] = useState<StockItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [isProcessingNote, setIsProcessingNote] = useState(false);
  const [isPrinting, setIsPrinting] = useState<string | null>(null);
  const [rotateLabel, setRotateLabel] = useState(false);
  const [updateDescriptionOnly, setUpdateDescriptionOnly] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showKeyCharacters, setShowKeyCharacters] = useState(false);
  const [transferSummary, setTransferSummary] = useState<{
    updated: { model: string; added: number; newTotal: number }[];
    new: { model: string; quantity: number }[];
  } | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    isOpen: boolean;
    oldQty: number;
    newQty: number;
    reason: string;
    onConfirm: (reason: string) => void;
  }>({
    isOpen: false,
    oldQty: 0,
    newQty: 0,
    reason: '',
    onConfirm: () => {}
  });

  const toggleHighlight = (item: StockItem) => {
    const updatedStock = stock.map(s => 
      s.id === item.id ? { ...s, highlighted: !s.highlighted } : s
    );
    onUpdate(updatedStock, 'manual_update', `Toggled highlight for ${item.name}`);
  };

  const addItem = () => {
    if (!newItem.model || !newItem.price) return;
    const name = newItem.description ? `${newItem.model} - ${newItem.description}` : newItem.model;
    const id = `item_${newItem.model.trim().replace(/[^a-zA-Z0-9]/g, '_')}`;
    const item: any = {
      id,
      name,
      price: parseFloat(newItem.price.replace(/[^0-9.]/g, '')),
      description: newItem.description || '',
      model: newItem.model,
      currentStock: parseInt(newItem.currentStock.replace(/[^0-9]/g, '')) || 0,
      highlighted: newItem.highlighted
    };

    if (newItem.promoPrice) {
      item.promoPrice = parseFloat(newItem.promoPrice.replace(/[^0-9.]/g, ''));
    }

    onUpdate([...stock, item as StockItem]);
    setNewItem({ 
      name: '', 
      price: '', 
      promoPrice: '',
      description: '', 
      model: '', 
      currentStock: '0',
      highlighted: false
    });
    setShowAddForm(false);
  };

  const removeItem = (id: string) => {
    onUpdate(stock.filter(i => i.id !== id));
    setConfirmDeleteId(null);
  };

  const clearAllStock = () => {
    if (stock.length > 0) {
      // Auto-download backup before clearing as requested by user
      const headers = 'Item Code (Model),Description,Current Stock,Price,Promo Price\n';
      const rows = displayStock.map(item => {
        const desc = item.description.replace(/,/g, ' ');
        const model = item.model.replace(/,/g, ' ');
        return `${model},${desc},${item.currentStock},${item.price},${item.promoPrice || ''}`;
      }).join('\n');
      
      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `erased stock ${format(new Date(), 'yyyy-MM-dd HH-mm')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    onUpdate([], 'manual_update');
    setIsConfirmingClearAll(false);
  };

  const startEditing = (item: StockItem) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = () => {
    if (!editingId) return;
    
    const oldItem = stock.find(i => i.id === editingId);
    const newStockQty = editValues.currentStock ?? oldItem?.currentStock ?? 0;
    
    const performUpdate = (reason: string) => {
      const updatedStock = stock.map(item => {
        if (item.id === editingId) {
          const updated = { ...item, ...editValues } as any;
          if (updated.promoPrice === undefined || updated.promoPrice === null || isNaN(updated.promoPrice)) {
            delete updated.promoPrice;
          }
          return updated as StockItem;
        }
        return item;
      });
      
      onUpdate(updatedStock, 'manual_update', reason);
      setEditingId(null);
      setReasonModal(prev => ({ ...prev, isOpen: false }));
    };

    if (oldItem && oldItem.currentStock !== newStockQty) {
      setReasonModal({
        isOpen: true,
        oldQty: oldItem.currentStock,
        newQty: newStockQty,
        reason: 'Manual adjustment',
        onConfirm: performUpdate
      });
    } else {
      performUpdate('');
    }
  };

  const downloadBackup = (prefix = 'manual') => {
    if (stock.length === 0) return;
    const headers = 'Item Code,Description,Stock,Price,Promo Price\n';
    const rows = stock.map(item => {
      const desc = (item.description || item.name || '').replace(/"/g, '""');
      const model = (item.model || '').replace(/"/g, '""');
      return `"${model}","${desc}",${item.currentStock},${item.price},${item.promoPrice || 0}`;
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `samsonite_stock_backup_${prefix}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Auto-backup before updating
    downloadBackup('pre_stock_upload');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        // Handle different line endings and filter empty lines
        const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
        
        console.log(`Parsing shop stock CSV: ${lines.length} lines found`);

        const newItems: StockItem[] = lines.map((line, index) => {
          try {
            // Better CSV parsing to handle quotes and commas within quotes
            const parts: string[] = [];
            let current = '';
            let inQuotes = false;
            const separator = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === separator && !inQuotes) {
                parts.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            parts.push(current.trim());
            
            const cleanParts = parts.map(p => p.replace(/^"|"$/g, '').trim());
            
            // Skip header row - be very flexible with Samsonite headers
            const firstCol = cleanParts[0].toLowerCase();
            if (index === 0 && (
              firstCol.includes('code') || 
              firstCol.includes('item') ||
              firstCol.includes('sku') ||
              cleanParts.some(p => p.toLowerCase().includes('description'))
            )) {
              console.log("Skipping header row:", cleanParts);
              return null;
            }

            if (cleanParts.length >= 2) {
              const itemCode = cleanParts[0];
              if (!itemCode || itemCode.toLowerCase() === 'item code') return null;

              let description = '';
              let stockStr = '';
              let priceStr = '';
              let promoStr = '';

              // Detect column mapping based on length or content
              // Format: Item Code, Item Description, Qty On Hand, Price, Promo
              if (cleanParts.length >= 5) {
                description = cleanParts[1];
                stockStr = cleanParts[2];
                priceStr = cleanParts[3];
                promoStr = cleanParts[4];
              } else if (cleanParts.length === 4) {
                // Fallback: Code, Desc, Qty, Price
                description = cleanParts[1];
                stockStr = cleanParts[2];
                priceStr = cleanParts[3];
              } else if (cleanParts.length === 3) {
                // Fallback: Code, Price, Qty
                priceStr = cleanParts[1];
                stockStr = cleanParts[2];
              } else {
                stockStr = cleanParts[1];
              }
              
              // Clean numeric strings robustly
              const cleanNum = (s: string) => s.replace(/[^0-9.-]/g, '');
              
              const price = parseFloat(cleanNum(priceStr)) || 0;
              
              let promoPrice: number | undefined = undefined;
              if (promoStr && promoStr.trim() !== '') {
                const parsedPromo = parseFloat(cleanNum(promoStr));
                if (!isNaN(parsedPromo) && parsedPromo > 0) {
                  promoPrice = parsedPromo;
                }
              }

              const currentStock = parseInt(cleanNum(stockStr)) || 0;

              // Validate/derive ID
              const fallbackId = `item_${itemCode.replace(/[^a-zA-Z0-9]/g, '_')}`;

              // Safety check: ensure we reuse EXACTLY the id of the existing item
              // This relies on matching by either the assumed id pattern or the model field
              const existingItem = stock.find(s => s.id === fallbackId || s.model.toLowerCase() === itemCode.toLowerCase());
              
              const finalId = existingItem ? existingItem.id : fallbackId;
              const finalPrice = (price === 0 && existingItem) ? existingItem.price : price;

              const item: StockItem = {
                id: finalId,
                name: description || (existingItem ? existingItem.name : itemCode),
                price: finalPrice,
                description: description || (existingItem ? existingItem.description : ''), 
                model: itemCode,
                currentStock: currentStock
              };

              if (promoPrice !== undefined) {
                item.promoPrice = promoPrice;
              }

              return item;
            }
          } catch (err) {
            console.error(`Error parsing line ${index + 1}:`, line, err);
          }
          return null;
        }).filter(Boolean) as StockItem[];
        
        console.log(`Successfully parsed ${newItems.length} items`);

        if (newItems.length === 0) {
          alert("No valid items found in CSV. Please ensure the format is: Item code, Item Description, Quantity, Price, Promo");
          return;
        }

        onUpdate(newItems, 'csv_upload');
        e.target.value = '';
        alert(`Successfully parsed ${newItems.length} items. The database is being updated in the background. Please wait a few seconds for the list to refresh.`);
      } catch (err) {
        console.error("Failed to parse stock file", err);
        alert("Error parsing CSV file. Please check the format.");
      }
    };
    reader.readAsText(file);
  };

  const handlePricelistUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Auto-backup before updating
    downloadBackup('pre_pricelist_upload');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsedItems = parseCSVWithHeaders(text);
        
        if (parsedItems.length === 0) {
          alert("Could not parse any valid items from the uploaded CSV file. Please check the file header format.");
          e.target.value = '';
          return;
        }

        const addedItems: any[] = [];
        const updatedItems: any[] = [];
        const updatedStock = [...stock];

        parsedItems.forEach((parsedItem) => {
          const existingItemIndex = updatedStock.findIndex(
            s => s.model.toLowerCase() === parsedItem.model.toLowerCase() || s.id === parsedItem.id
          );

          if (existingItemIndex !== -1) {
            const existingItem = updatedStock[existingItemIndex];
            if (existingItem.price !== parsedItem.price || existingItem.promoPrice !== parsedItem.promoPrice) {
              updatedItems.push({
                model: parsedItem.model,
                oldPrice: existingItem.price,
                newPrice: parsedItem.price,
                oldPromo: existingItem.promoPrice,
                newPromo: parsedItem.promoPrice
              });
              updatedStock[existingItemIndex] = {
                ...existingItem,
                price: parsedItem.price,
                promoPrice: parsedItem.promoPrice,
                description: parsedItem.description || existingItem.description,
                name: parsedItem.name || existingItem.name
              };
            }
          } else {
            updatedStock.push(parsedItem);
            addedItems.push(parsedItem);
          }
        });

        if (addedItems.length === 0 && updatedItems.length === 0) {
          alert("No changes detected in the pricelist. All items and prices match the current database.");
          e.target.value = '';
          return;
        }
        
        // Generate PDF Report
        const pdf = new jsPDF();
        pdf.setFontSize(18);
        pdf.setTextColor(37, 99, 235);
        pdf.text('Pricelist Update Report', 14, 20);
        pdf.setFontSize(10);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Date: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);
        pdf.text(`Store: Samsonite Brand Store, Bagatelle Mall`, 14, 33);
        
        let currentY = 45;
        
        if (addedItems.length > 0) {
          pdf.setFontSize(12);
          pdf.setTextColor(22, 163, 74); // green-600
          pdf.text(`New Items Added (${addedItems.length})`, 14, currentY);
          currentY += 5;
          
          autoTable(pdf, {
            startY: currentY,
            head: [['Item Code', 'Description', 'Price', 'Promo Price']],
            body: addedItems.map(item => [
              item.model,
              item.description,
              `${item.price.toLocaleString()} MUR`,
              item.promoPrice ? `${item.promoPrice.toLocaleString()} MUR` : '-'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [34, 197, 94] },
            styles: { fontSize: 8 }
          });
          currentY = (pdf as any).lastAutoTable.finalY + 15;
        }
        
        if (updatedItems.length > 0) {
          if (currentY > 250) { pdf.addPage(); currentY = 20; }
          pdf.setFontSize(12);
          pdf.setTextColor(37, 99, 235); // blue-600
          pdf.text(`Prices Updated (${updatedItems.length})`, 14, currentY);
          currentY += 5;
          
          autoTable(pdf, {
            startY: currentY,
            head: [['Item Code', 'Old Price', 'New Price', 'Old Promo', 'New Promo']],
            body: updatedItems.map(item => [
              item.model,
              `${item.oldPrice.toLocaleString()} MUR`,
              `${item.newPrice.toLocaleString()} MUR`,
              item.oldPromo ? `${item.oldPromo.toLocaleString()} MUR` : '-',
              item.newPromo ? `${item.newPromo.toLocaleString()} MUR` : '-'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235] },
            styles: { fontSize: 8 }
          });
        }
        
        pdf.save(`Pricelist_Update_Report_${format(new Date(), 'yyyy-MM-dd_HHmm')}.pdf`);
        
        // Update state
        onUpdate(updatedStock, 'manual_update', `Pricelist upload: ${addedItems.length} added, ${updatedItems.length} updated`);
        alert(`Pricelist processed successfully!\n- ${addedItems.length} new items added\n- ${updatedItems.length} prices updated\n\nA detailed PDF report has been downloaded.`);
        e.target.value = '';
        
      } catch (err) {
        console.error("Failed to process pricelist", err);
        alert("Error processing pricelist. Please ensure it's a valid CSV with format: Item Code, Description, Price, Promo Price");
      }
    };
    reader.readAsText(file);
  };

  const handleLoadAmericanTouristerList = () => {
    downloadBackup('pre_at_pricelist_import');
    const atItems = getAmericanTouristerPriceList();
    
    const stockMap = new Map<string, StockItem>();
    
    stock.forEach(item => {
      stockMap.set(item.id, item);
    });

    let addedCount = 0;
    let updatedCount = 0;

    atItems.forEach(atItem => {
      if (stockMap.has(atItem.id)) {
        const existing = stockMap.get(atItem.id)!;
        stockMap.set(atItem.id, {
          ...existing,
          price: atItem.price,
          promoPrice: atItem.promoPrice,
          description: atItem.description || existing.description,
          name: atItem.name || existing.name
        });
        updatedCount++;
      } else {
        stockMap.set(atItem.id, atItem);
        addedCount++;
      }
    });

    const updatedStockList = Array.from(stockMap.values());
    onUpdate(updatedStockList, 'manual_update', `Uploaded American Tourister Price List (${addedCount} added, ${updatedCount} updated)`);
    alert(`American Tourister Price List Uploaded Successfully!\n\n• ${addedCount} new items added\n• ${updatedCount} existing items updated\n• Total products: ${updatedStockList.length}`);
  };

  const downloadStockCSV = () => {
    if (stock.length === 0) return;
    
    // Header for stock take
    const headers = 'Item Code (Model),Description,Current System Stock,Physical Count (Write here),Difference\n';
    
    const rows = displayStock.map((item, index) => {
      // Escape commas in description if any
      const desc = item.description.replace(/,/g, ' ');
      const model = item.model.replace(/,/g, ' ');
      const rowNum = index + 2; // +1 for header, +1 for 1-based indexing in Excel
      // Formula: Current Stock (C) - Physical Count (D)
      return `${model},${desc},${item.currentStock},,"=C${rowNum}-D${rowNum}"`;
    }).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Shop_Stock_Take_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
  };

  const handlePrintLabel = async (item: StockItem) => {
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth) {
      alert('Bluetooth is not supported by your browser or device. Please use Chrome on Android or a compatible browser.');
      return;
    }

    setIsPrinting(item.id);
    try {
      await printerService.printLabel({
        model: item.model || item.name,
        description: item.description || '',
        price: item.price,
        promoPrice: item.promoPrice && item.promoPrice > 0 ? item.promoPrice : undefined,
        rotate: rotateLabel
      });
    } catch (error: any) {
      console.error('Printing failed:', error);
      alert(`Printing failed: ${error.message || 'Make sure the printer is on and connected.'}`);
    } finally {
      setIsPrinting(null);
    }
  };

  const handlePCPrint = () => {
    const printContent = document.getElementById('label-to-print');
    if (!printContent) return;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.write(`
      <html>
        <head>
          <style>
            @page {
              size: ${rotateLabel ? '25mm 45mm' : '45mm 25mm'};
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              width: ${rotateLabel ? '25mm' : '45mm'};
              height: ${rotateLabel ? '45mm' : '25mm'};
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: sans-serif;
              box-sizing: border-box;
              text-align: center;
              overflow: hidden;
            }
            .content {
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              padding: 1.5mm;
              box-sizing: border-box;
              ${rotateLabel ? `
                transform: rotate(90deg);
                transform-origin: center;
                width: 45mm;
                height: 25mm;
                position: absolute;
                top: 50%;
                left: 50%;
                margin-top: -12.5mm;
                margin-left: -22.5mm;
              ` : ''}
            }
            .top-section {
              display: flex;
              flex-direction: column;
              gap: 0.5mm;
            }
            .model {
              font-weight: bold;
              font-size: 9pt;
              margin: 0;
              line-height: 1;
              text-transform: uppercase;
              padding-top: 0;
            }
            .description {
                font-size: 9pt;
                margin: 0;
                line-height: 1.1;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
              }
            .price-section {
              display: flex;
              flex-direction: column;
              gap: 0.2mm;
            }
            .normal-price {
              font-size: 9pt;
              margin: 0;
            }
            .promo-price {
              font-size: 9pt;
              font-weight: bold;
              margin: 0;
            }
            .single-price {
              font-size: 9pt;
              font-weight: bold;
              margin: 0;
            }
            .footer {
              font-size: 9pt;
              font-weight: normal;
              margin-top: auto;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <div class="content">
            <div class="top-section">
              <p class="model">${selectedPrintItem?.model}</p>
              <p class="description">${selectedPrintItem?.description}</p>
            </div>
            
            <div class="price-section">
              ${selectedPrintItem?.promoPrice && selectedPrintItem.promoPrice > 0 ? `
                <p class="normal-price">Normal Price: Rs ${selectedPrintItem.price.toLocaleString()}</p>
                <p class="promo-price">Promo Price: Rs ${selectedPrintItem.promoPrice.toLocaleString()}</p>
              ` : `
                <p class="single-price">Price: Rs ${selectedPrintItem?.price.toLocaleString()}</p>
              `}
            </div>
            
            <p class="footer">VAT INCLUDED</p>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => {
                window.parent.document.body.removeChild(iframe);
              }, 100);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const handleTransferNoteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingNote(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          
          const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
          if (!effectiveApiKey) {
            setShowKeyInput(true);
            alert("Gemini API key is missing. Please enter your API key in the configuration section at the top.");
            setIsProcessingNote(false);
            return;
          }

          const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: file.type,
                },
              },
              {
                text: "Extract the items from this warehouse transfer note. For each item, find the Item Code (model), the Item Description, and the Quantity received. Return the data as a JSON array of objects with 'model', 'description', and 'quantity' properties. If you see multiple entries for the same model, sum them up.",
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    model: { type: Type.STRING },
                    description: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                  },
                  required: ["model", "description", "quantity"],
                },
              },
            },
          });

          const extractedItems = JSON.parse(response.text);
          
          // Auto-backup before updating
          downloadBackup('pre_transfer_note');
          
          // Process items
          const updatedStock = [...stock];
          let newItemsCount = 0;
          let updatedItemsCount = 0;
          const summary = {
            updated: [] as { model: string; added: number; newTotal: number }[],
            new: [] as { model: string; quantity: number }[]
          };

          for (const extracted of extractedItems) {
            const existingIndex = updatedStock.findIndex(item => item.model.toLowerCase() === extracted.model.toLowerCase());
            
            if (existingIndex !== -1) {
              const oldQty = updatedStock[existingIndex].currentStock;
              const newQty = updateDescriptionOnly ? oldQty : oldQty + extracted.quantity;
              
              // Only overwrite description if explicitly requested or if current is generic
              let updatedDesc = updatedStock[existingIndex].description;
              let updatedName = updatedStock[existingIndex].name;
              
              if (extracted.description) {
                // Determine if we should update the description (e.g., if it's missing or a placeholder)
                if (updateDescriptionOnly || !updatedDesc || updatedDesc.includes("from transfer note:") || updatedDesc.toLowerCase() === updatedStock[existingIndex].model.toLowerCase()) {
                   updatedDesc = extracted.description;
                }
                
                // If name is just the model, expand it with the description
                if (updateDescriptionOnly || !updatedName || updatedName.toLowerCase() === updatedStock[existingIndex].model.toLowerCase()) {
                   updatedName = `${extracted.model} - ${extracted.description}`;
                }
              }

              if (updateDescriptionOnly) {
                if (updatedStock[existingIndex].description !== updatedDesc || updatedStock[existingIndex].name !== updatedName) {
                  updatedStock[existingIndex] = {
                    ...updatedStock[existingIndex],
                    description: updatedDesc,
                    name: updatedName
                  };
                  summary.updated.push({ 
                    model: updatedStock[existingIndex].model, 
                    added: 0, 
                    newTotal: oldQty 
                  });
                  updatedItemsCount++;
                }
              } else {
                // Update existing item
                updatedStock[existingIndex] = {
                  ...updatedStock[existingIndex],
                  currentStock: newQty,
                  description: updatedDesc,
                  name: updatedName
                };
                summary.updated.push({ 
                  model: updatedStock[existingIndex].model, 
                  added: extracted.quantity, 
                  newTotal: newQty 
                });
                updatedItemsCount++;
              }
            } else {
              if (updateDescriptionOnly) {
                 continue; // Skip adding new items if we are just correcting descriptions
              }

              // Add new item
              const id = `item_${extracted.model.trim().replace(/[^a-zA-Z0-9]/g, '_')}`;
              updatedStock.push({
                id,
                name: extracted.description ? `${extracted.model} - ${extracted.description}` : extracted.model,
                price: 0,
                description: extracted.description || `New item from transfer note: ${extracted.model}`,
                model: extracted.model,
                currentStock: extracted.quantity
              });
              summary.new.push({ 
                model: extracted.model, 
                quantity: extracted.quantity 
              });
              newItemsCount++;
            }
          }

          setTransferSummary(summary);
          onUpdate(updatedStock, 'transfer_note', `Processed transfer note: ${updatedItemsCount} updated, ${newItemsCount} new`);
        } catch (innerErr) {
          console.error("Inner error processing note:", innerErr);
          alert("Error analyzing the document. Please ensure it's a clear image of a transfer note.");
        } finally {
          setIsProcessingNote(false);
          e.target.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing transfer note:", error);
      alert("Failed to process transfer note. Please try again.");
      setIsProcessingNote(false);
      e.target.value = '';
    }
  };

  // Process stock to handle legacy data or missing fields
  const displayStock = stock.map(item => {
    // If model/description are missing, try to extract from name
    let model = item.model;
    let description = item.description;

    if (!model && item.name) {
      model = item.name.split(' - ')[0] || '';
    }
    if (!description && item.name) {
      const parts = item.name.split(' - ');
      if (parts.length > 1) {
        description = parts[1].split(' (')[0] || '';
      }
    }

    const cleanDescription = (description && description !== 'Product') ? description : '';

    return {
      ...item,
      model: model || '',
      description: cleanDescription,
      price: item.price || 0,
      promoPrice: item.promoPrice,
      currentStock: item.currentStock ?? 0
    };
  });

  const filteredStock = displayStock.filter(item => 
    item.model.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const itemsWithPriceOne = displayStock.filter(item => item.price === 1);

  const totalStockValue = displayStock.reduce((total, item) => total + (item.price * item.currentStock), 0);

  const handleExportStock = () => {
    const dataToExport = displayStock
      .filter(item => item.currentStock > 0)
      .map(item => ({
        'Item Code': item.model || item.name || '',
        'Description': item.description || '',
        'Quantity': item.currentStock
      }));

    if (dataToExport.length === 0) {
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Available Stock");
    XLSX.writeFile(wb, "stock download.xlsx");
  };

  return (
    <div className="space-y-6">
      {/* API Key Input Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-in fade-in slide-in-from-top-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500">
              <AlertCircle size={18} />
            </div>
            <h3 className="font-bold text-gray-800">Transfer Note API Settings</h3>
          </div>
          <button 
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
          >
            {showKeyInput ? 'Hide Settings' : 'Configure API Key'}
          </button>
        </div>
        
        {showKeyInput && (
          <div className="space-y-4 pt-2 border-t border-gray-50 mt-2">
            <p className="text-xs text-gray-500 leading-relaxed">
              To process transfer notes automatically from images, you need a Gemini API key. 
              Get one free at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">Google AI Studio</a>.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  autoComplete="off"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="Paste your Gemini API Key here..."
                  className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-sm font-medium transition-all"
                  style={{ WebkitTextSecurity: showKeyCharacters ? 'none' : 'disc' } as any}
                />
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => setShowKeyCharacters(!showKeyCharacters)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    {showKeyCharacters ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
              {apiKey && (
                <button 
                  onClick={() => {
                    setApiKey('');
                    localStorage.removeItem('gemini_api_key');
                  }}
                  className="px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Shop Stock Management</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mt-1">
            <p className="text-gray-500 text-sm">
              Manage your current shop inventory ({stock.length} items)
            </p>
            <div className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-sm font-bold border border-green-100 flex items-center gap-2">
              <span>Total Value:</span>
              <span>Rs {totalStockValue.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {stock.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportStock}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-all font-bold text-sm border border-green-200"
                title="Export stock (qty > 0) to Excel"
              >
                <Download size={18} />
                Export
              </button>
              {isConfirmingClearAll ? (
                <div className="flex items-center gap-2 bg-red-50 p-1 rounded-xl border border-red-100 animate-in fade-in zoom-in-95">
                  <span className="text-[10px] font-bold text-red-600 px-2 uppercase">Confirm Clear All?</span>
                  <button 
                    onClick={clearAllStock}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-all"
                  >
                    Yes, Clear
                  </button>
                  <button 
                    onClick={() => setIsConfirmingClearAll(false)}
                    className="bg-white text-gray-500 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 hover:bg-gray-50 transition-all"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsConfirmingClearAll(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all font-bold text-sm border border-red-100"
                  title="Delete all stock items"
                >
                  <Trash2 size={18} />
                  Clear All
                </button>
              )}
            </div>
          )}
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-bold text-sm shadow-sm ${
              showAddForm ? 'bg-gray-200 text-gray-700' : 'bg-gray-900 text-white hover:bg-black'
            }`}
          >
            {showAddForm ? <X size={18} /> : <Plus size={18} />}
            {showAddForm ? 'Cancel' : 'Add New Product'}
          </button>
          <button 
            onClick={downloadStockCSV}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-sm font-bold text-sm"
            title="Download stock list for stock take"
          >
            <Download size={18} />
            Download Stock List
          </button>
          <button 
            onClick={() => downloadBackup('manual')}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm font-bold text-sm"
            title="Export full stock data with prices for backup"
          >
            <Download size={18} />
            Export Backup
          </button>
          
          <div className="flex flex-col gap-1 items-end justify-center">
            <label className="flex items-center gap-2 text-[10px] uppercase font-extrabold text-purple-600 tracking-wider cursor-pointer bg-purple-50 px-3 py-1 rounded-lg border border-purple-100">
              <input 
                type="checkbox" 
                checked={updateDescriptionOnly} 
                onChange={(e) => setUpdateDescriptionOnly(e.target.checked)} 
                className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 w-3 h-3"
              />
              Descriptions Only
            </label>
            <label className={`flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl cursor-pointer hover:bg-purple-700 transition-all shadow-sm ${isProcessingNote ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isProcessingNote ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              <span className="text-sm font-bold">{isProcessingNote ? 'Processing...' : 'Upload Transfer Note'}</span>
              <input 
                type="file" 
                accept="image/*,.pdf" 
                className="hidden" 
                onChange={handleTransferNoteUpload} 
                disabled={isProcessingNote}
              />
            </label>
          </div>

          <button
            onClick={handleLoadAmericanTouristerList}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white rounded-xl hover:from-blue-800 hover:to-indigo-800 transition-all shadow-md font-bold text-sm"
            title="Import/Sync complete American Tourister Bagatelle Price List (133 items)"
          >
            <Package size={18} />
            <span>Upload AT Price List</span>
          </button>
          <label className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl cursor-pointer hover:bg-blue-700 transition-all shadow-sm" title="Expected format: Item Code, Description, Stock Quantity, Price, Promo Price (Optional)">
            <Upload size={18} />
            <span className="text-sm font-bold">Upload CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <label className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl cursor-pointer hover:bg-indigo-700 transition-all shadow-sm" title="Expected format: Item Code, Description, Price">
            <FileText size={18} />
            <span className="text-sm font-bold">Upload Pricelist</span>
            <input type="file" accept=".csv" className="hidden" onChange={handlePricelistUpload} />
          </label>
          {onRecoverPrices && (
            <button 
              onClick={onRecoverPrices}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-all shadow-sm font-bold text-sm"
              title="Restore prices from sales history if they were incorrectly overwritten"
            >
              <History size={18} />
              Restore Prices
            </button>
          )}
        </div>
      </div>

      {itemsWithPriceOne.length > 0 && (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-900">Action Required: New Items Detected</h4>
            <p className="text-sm text-amber-700 mt-1">
              There are {itemsWithPriceOne.length} new items added from transfer notes with a default price of Rs 1. 
              Please update their prices manually.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {itemsWithPriceOne.slice(0, 5).map(item => (
                <span key={item.id} className="px-2 py-1 bg-white border border-amber-200 rounded text-[10px] font-bold text-amber-800">
                  {item.model}
                </span>
              ))}
              {itemsWithPriceOne.length > 5 && (
                <span className="px-2 py-1 bg-white border border-amber-200 rounded text-[10px] font-bold text-amber-800">
                  +{itemsWithPriceOne.length - 5} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {transferSummary && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-purple-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Transfer Note Summary</h3>
                  <p className="text-xs text-purple-600 font-medium">Document processed successfully</p>
                </div>
              </div>
              <button 
                onClick={() => setTransferSummary(null)}
                className="p-2 hover:bg-white/50 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {transferSummary.updated.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <ArrowUpRight size={16} className="text-green-500" />
                    Updated Existing Items ({transferSummary.updated.length})
                  </h4>
                  <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 text-gray-600 font-bold">
                        <tr>
                          <th className="px-4 py-2 text-left">Model</th>
                          <th className="px-4 py-2 text-right">Added</th>
                          <th className="px-4 py-2 text-right">New Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {transferSummary.updated.map((item, idx) => (
                          <tr key={idx} className="hover:bg-white transition-colors">
                            <td className="px-4 py-2 font-medium text-gray-800">{item.model}</td>
                            <td className="px-4 py-2 text-right text-green-600 font-bold">+{item.added}</td>
                            <td className="px-4 py-2 text-right font-bold">{item.newTotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {transferSummary.new.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Plus size={16} className="text-purple-500" />
                    New Items Added ({transferSummary.new.length})
                  </h4>
                  <div className="bg-purple-50/50 rounded-xl border border-purple-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-100 text-purple-600 font-bold">
                        <tr>
                          <th className="px-4 py-2 text-left">Model</th>
                          <th className="px-4 py-2 text-right">Quantity</th>
                          <th className="px-4 py-2 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-100">
                        {transferSummary.new.map((item, idx) => (
                          <tr key={idx} className="hover:bg-white transition-colors">
                            <td className="px-4 py-2 font-medium text-gray-800">{item.model}</td>
                            <td className="px-4 py-2 text-right font-bold">{item.quantity}</td>
                            <td className="px-4 py-2 text-right text-amber-600 font-bold">Rs 1</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setTransferSummary(null)}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Quick Verify Searchable Dropdown */}
        <div className="relative">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-2 block">Quick Stock Verification</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Search product to verify stock..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              value={verifySearch}
              onChange={(e) => {
                setVerifySearch(e.target.value);
                setIsVerifyOpen(true);
              }}
              onFocus={() => setIsVerifyOpen(true)}
            />
          </div>

          {isVerifyOpen && verifySearch && (
            <div className="absolute z-20 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl max-h-[300px] overflow-y-auto">
              {displayStock.filter(s => 
                (s.model || '').toLowerCase().includes(verifySearch.toLowerCase()) || 
                (s.description || '').toLowerCase().includes(verifySearch.toLowerCase())
              ).map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSearchTerm(item.model);
                    setVerifySearch('');
                    setIsVerifyOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                >
                  <div>
                    <p className="font-bold text-gray-900">{item.model}</p>
                    <p className="text-xs text-gray-500">{item.description}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${item.currentStock < 3 ? 'text-red-500' : 'text-green-600'}`}>
                      {item.currentStock} in stock
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono">{item.price.toLocaleString()} MUR</p>
                  </div>
                </button>
              ))}
              {displayStock.filter(s => 
                (s.model || '').toLowerCase().includes(verifySearch.toLowerCase()) || 
                (s.description || '').toLowerCase().includes(verifySearch.toLowerCase())
              ).length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-500 mb-4 italic">Product not found in list</p>
                  <button
                    onClick={() => {
                      setNewItem({ ...newItem, model: verifySearch });
                      setShowAddForm(true);
                      setIsVerifyOpen(false);
                      setVerifySearch('');
                    }}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-sm hover:bg-blue-100 transition-colors"
                  >
                    <Plus size={16} />
                    Add "{verifySearch}" as New Product
                  </button>
                </div>
              )}
            </div>
          )}
          {isVerifyOpen && verifySearch && (
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setIsVerifyOpen(false)}
            />
          )}
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
            <p className="text-[10px] font-bold text-amber-600 uppercase">Low Stock Items</p>
            <p className="text-2xl font-black text-amber-700">{displayStock.filter(s => s.currentStock < 3 && s.currentStock > 0).length}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-xl border border-red-100">
            <p className="text-[10px] font-bold text-red-600 uppercase">Out of Stock</p>
            <p className="text-2xl font-black text-red-700">{displayStock.filter(s => s.currentStock <= 0).length}</p>
          </div>
        </div>
      </div>

      {searchTerm && (
        <div className="mb-6 flex items-center justify-between bg-blue-50 p-4 rounded-xl border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
              <Search size={16} />
            </div>
            <div>
              <p className="text-xs text-blue-600 font-bold uppercase">Active Filter</p>
              <p className="text-sm font-bold text-blue-900">Showing results for: "{searchTerm}"</p>
            </div>
          </div>
          <button 
            onClick={() => setSearchTerm('')}
            className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all border border-blue-200"
          >
            <X size={14} />
            Clear Filter
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8 p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Model</label>
            <input
              type="text"
              placeholder="e.g. S'Cure"
              className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
              value={newItem.model}
              onChange={e => setNewItem({ ...newItem, model: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Description</label>
            <input
              type="text"
              placeholder="e.g. Black"
              className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={newItem.description}
              onChange={e => setNewItem({ ...newItem, description: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Price (MUR)</label>
            <input
              type="number"
              placeholder="0.00"
              className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono"
              value={newItem.price}
              onChange={e => setNewItem({ ...newItem, price: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Promo Price (Optional)</label>
            <input
              type="number"
              placeholder="0.00"
              className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono text-blue-600"
              value={newItem.promoPrice}
              onChange={e => setNewItem({ ...newItem, promoPrice: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Initial Stock</label>
            <input
              type="number"
              placeholder="0"
              className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
              value={newItem.currentStock}
              onChange={e => setNewItem({ ...newItem, currentStock: e.target.value })}
            />
          </div>
          <div className="space-y-1 flex flex-col justify-center">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-1">Highlight</label>
            <div className="flex items-center h-full">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={newItem.highlighted}
                  onChange={e => setNewItem({ ...newItem, highlighted: e.target.checked })}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                <span className="ml-3 text-xs font-medium text-gray-500">Green</span>
              </label>
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={addItem}
              className="w-full h-[50px] flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-100"
            >
              <Plus size={18} />
              Save Product
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-100 rounded-2xl shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider">Model</th>
              <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider">Description</th>
              <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider">Price</th>
              <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider">Promo</th>
              <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider">Stock</th>
              <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider">Highlight</th>
              <th className="px-6 py-4 font-bold text-gray-600 text-sm uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredStock.map(item => (
              <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${item.highlighted ? 'bg-green-50/50' : ''}`}>
                <td className="px-6 py-4">
                  {editingId === item.id ? (
                    <input 
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={editValues.model}
                      onChange={e => setEditValues({ ...editValues, model: e.target.value })}
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-800">{item.model}</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingId === item.id ? (
                    <input 
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={editValues.description}
                      onChange={e => setEditValues({ ...editValues, description: e.target.value })}
                    />
                  ) : (
                    <span className="text-sm text-gray-600">{item.description}</span>
                  )}
                </td>
                <td className="px-6 py-4 font-mono text-blue-600 font-bold text-sm">
                  {editingId === item.id ? (
                    <input 
                      type="number"
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={editValues.price}
                      onChange={e => setEditValues({ ...editValues, price: parseFloat(e.target.value) || 0 })}
                    />
                  ) : `${item.price.toLocaleString()} MUR`}
                </td>
                <td className="px-6 py-4 font-mono text-green-600 font-bold text-sm">
                  {editingId === item.id ? (
                    <input 
                      type="number"
                      placeholder="None"
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={editValues.promoPrice || ''}
                      onChange={e => setEditValues({ ...editValues, promoPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                  ) : (item.promoPrice ? `${item.promoPrice.toLocaleString()} MUR` : '-')}
                </td>
                <td className="px-6 py-4">
                  {editingId === item.id ? (
                    <input 
                      type="number"
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={editValues.currentStock}
                      onChange={e => setEditValues({ ...editValues, currentStock: parseInt(e.target.value) || 0 })}
                    />
                  ) : (
                    <span className={`font-bold text-sm ${item.currentStock < 3 ? 'text-red-500' : 'text-gray-800'}`}>
                      {item.currentStock}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                        checked={editValues.highlighted || false}
                        onChange={e => setEditValues({ ...editValues, highlighted: e.target.checked })}
                      />
                      <span className="text-xs text-gray-500">Highlight</span>
                    </div>
                  ) : (
                    <button 
                      onClick={() => toggleHighlight(item)}
                      className="group relative flex items-center justify-center p-1 hover:bg-gray-100 rounded-full transition-all"
                      title={item.highlighted ? 'Click to remove highlight' : 'Click to highlight product'}
                    >
                      <div className={`w-3 h-3 rounded-full transition-all ${item.highlighted ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] scale-110' : 'bg-gray-200 group-hover:bg-gray-300'}`} />
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {editingId === item.id ? (
                      <>
                        <button onClick={saveEdit} className="text-green-600 p-2 hover:bg-green-50 rounded-lg"><Save size={18} /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 p-2 hover:bg-gray-50 rounded-lg"><X size={18} /></button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => setSelectedPrintItem(item)}
                          className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-all border border-transparent hover:border-blue-100 group relative"
                          title="Print Price Label (PC Mode / Bluetooth)"
                        >
                          <Printer size={18} className="group-hover:scale-110 transition-transform" />
                        </button>

                        <button 
                          onClick={() => {
                            console.log("[DEBUG] Opening history for item:", item);
                            console.log("[DEBUG] Total movements available:", movements.length);
                            const matches = movements.filter(m => 
                              m.productId === item.id || 
                              m.productId === item.model ||
                              (m.description && m.description.includes(item.model))
                            );
                            console.log("[DEBUG] Found matches:", matches.length);
                            if (matches.length > 0) {
                              console.log("[DEBUG] First match:", matches[0]);
                            }
                            setSelectedHistoryItem(item);
                          }} 
                          className="text-amber-500 hover:text-amber-600 p-2 hover:bg-amber-50 rounded-lg"
                          title="View History"
                        >
                          <History size={18} />
                        </button>
                        <button onClick={() => startEditing(item)} className="text-blue-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg"><Edit2 size={18} /></button>
                        
                        {confirmDeleteId === item.id ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100 animate-in slide-in-from-right-2">
                            <button 
                              onClick={() => removeItem(item.id)}
                              className="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-red-700"
                            >
                              Delete
                            </button>
                            <button 
                              onClick={() => setConfirmDeleteId(null)}
                              className="bg-white text-gray-500 px-2 py-1 rounded text-[10px] font-bold border border-gray-200 hover:bg-gray-50"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setConfirmDeleteId(item.id)} 
                            className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {stock.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                  <div className="flex flex-col items-center gap-2">
                    <Package size={40} className="text-gray-200" />
                    <p>No items in stock. Upload a CSV to get started.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Label Print Modal */}
      {selectedPrintItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden motion-safe:animate-in motion-safe:zoom-in-95">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-blue-600" />
                <h3 className="font-bold text-gray-900">Print Label</h3>
              </div>
              <button onClick={() => setSelectedPrintItem(null)} className="p-2 hover:bg-gray-200 rounded-full"><X size={18} /></button>
            </div>
            
            <div className="p-8 flex flex-col items-center bg-gray-100/50 gap-6">
              <div 
                onClick={() => setRotateLabel(!rotateLabel)}
                className="flex items-center gap-4 cursor-pointer bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 mb-2"
              >
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Rotate 90°</span>
                <div 
                  className={`w-12 h-6 rounded-full transition-all duration-300 relative ${rotateLabel ? 'bg-blue-600 shadow-inner' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${rotateLabel ? 'left-7' : 'left-1'}`} />
                </div>
              </div>

              {/* Preview Box */}
              <div 
                id="label-to-print" 
                className={`bg-white shadow-2xl border border-gray-200 p-[2mm] flex flex-col justify-between items-center text-center font-sans overflow-hidden origin-center transition-all duration-500
                  ${rotateLabel ? 'w-[25mm] h-[45mm] scale-[1.2]' : 'w-[45mm] h-[25mm] scale-[1.8]'}`}
              >
                <div className={`w-full flex flex-col items-center ${rotateLabel ? 'rotate-90 origin-center h-full justify-center w-[45mm] absolute' : ''}`}>
                  <p className="font-bold text-[9pt] m-0 leading-tight uppercase line-clamp-1 pt-0">{selectedPrintItem.model}</p>
                  <p className="text-[9pt] m-0 leading-[1.1] line-clamp-2 mt-0.5">{selectedPrintItem.description}</p>
                  
                  <div className="flex flex-col gap-[0.2mm] my-1">
                    {selectedPrintItem.promoPrice && selectedPrintItem.promoPrice > 0 ? (
                      <>
                        <p className="text-[9pt] m-0 text-gray-600">Normal Price: Rs {selectedPrintItem.price.toLocaleString()}</p>
                        <p className="text-[9pt] m-0 font-bold text-black font-sans">Promo Price: Rs {selectedPrintItem.promoPrice.toLocaleString()}</p>
                      </>
                    ) : (
                      <p className="text-[9pt] m-0 font-bold">Price: Rs {selectedPrintItem.price.toLocaleString()}</p>
                    )}
                  </div>
                  <p className="text-[9pt] m-0 uppercase font-normal mt-1">VAT INCLUDED</p>
                </div>
              </div>
              
              {!rotateLabel && (
                <div className="mt-4 text-[10px] text-gray-400 font-medium italic">Standard Landscape mode</div>
              )}
              {rotateLabel && (
                <div className="mt-4 text-[10px] text-blue-500 font-bold uppercase italic tracking-widest">Rotated Portrait mode enabled</div>
              )}
            </div>

            <div className="p-6 grid grid-cols-2 gap-4 bg-white border-t border-gray-100">
              <button 
                onClick={() => handlePrintLabel(selectedPrintItem)}
                disabled={isPrinting !== null}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100 transition-all"
              >
                {isPrinting === selectedPrintItem.id ? <Loader2 size={18} className="animate-spin" /> : <Printer size={20} />}
                <span className="text-xs font-bold uppercase tracking-tight">Bluetooth Mode</span>
              </button>
              
              <button 
                onClick={handlePCPrint}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-all font-bold"
              >
                <Search size={20} />
                <span className="text-xs font-bold uppercase tracking-tight">PC Mode</span>
              </button>
            </div>
            
            <div className="px-6 pb-6 pt-2 text-center">
              <p className="text-[10px] text-gray-400 font-medium">Use PC Mode for USB Connection. Use Bluetooth Mode for Mobile Apps.</p>
            </div>
          </div>
        </div>
      )}

      {/* Stock History Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] motion-safe:animate-in motion-safe:zoom-in-95">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{selectedHistoryItem?.model || 'Unknown Product'}</h3>
                  <p className="text-xs text-gray-500">{selectedHistoryItem?.description || 'No description available'}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedHistoryItem(null)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {(() => {
                  const itemMovements = movements.filter(m => 
                    m.productId === selectedHistoryItem.id || 
                    m.productId === selectedHistoryItem.model ||
                    (m.description && m.description.includes(selectedHistoryItem.model))
                  );

                  if (itemMovements.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <Clock size={40} className="text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 italic">No movement history found for this item.</p>
                        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 inline-block text-left">
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Debug Info</p>
                          <p className="text-[10px] text-gray-500 font-mono">Item ID: {selectedHistoryItem.id}</p>
                          <p className="text-[10px] text-gray-500 font-mono">Model: {selectedHistoryItem.model}</p>
                          <p className="text-[10px] text-gray-500 font-mono">Total Movements in DB: {movements.length}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="relative border-l-2 border-gray-100 ml-3 pl-6 space-y-8">
                      {itemMovements.map((m, idx) => (
                        <div key={m.id} className="relative">
                          <div className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                            m.type === 'sale' ? 'bg-red-500' : 
                            m.type === 'csv_upload' ? 'bg-blue-500' : 
                            m.type === 'initial' ? 'bg-green-500' : 'bg-amber-500'
                          }`} />
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400 uppercase">
                                {format(parseISO(m.date), 'MMM dd, yyyy • HH:mm')}
                              </span>
                              <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                m.quantityChange > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                              }`}>
                                {m.quantityChange > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                              </div>
                            </div>
                            <p className="text-sm font-bold text-gray-800">{m.description}</p>
                            {m.reason && (
                              <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 italic">
                                Reason: {m.reason}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase font-bold">
                                New Stock: {m.newStock}
                              </span>
                              <span className="text-[10px] bg-gray-50 text-gray-400 px-2 py-0.5 rounded uppercase font-bold">
                                Type: {m.type.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setSelectedHistoryItem(null)}
                className="px-6 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Reason Modal */}
      {reasonModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden motion-safe:animate-in motion-safe:zoom-in-95">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-900">Reason for Stock Change</h3>
              <p className="text-xs text-gray-500 mt-1">
                Changing stock from <span className="font-bold text-gray-700">{reasonModal.oldQty}</span> to <span className="font-bold text-blue-600">{reasonModal.newQty}</span>
              </p>
            </div>
            <div className="p-6">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1 mb-2 block">Reason</label>
              <textarea
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm min-h-[100px]"
                placeholder="e.g. Stock received from warehouse, Damaged item removed..."
                value={reasonModal.reason}
                onChange={e => setReasonModal(prev => ({ ...prev, reason: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setReasonModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => reasonModal.onConfirm(reasonModal.reason)}
                className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
