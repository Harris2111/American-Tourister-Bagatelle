export interface StockItem {
  id: string;
  name: string;
  price: number;
  promoPrice?: number;
  description: string;
  model: string;
  currentStock: number;
  highlighted?: boolean;
}

export interface WarehouseStockItem {
  id: string;
  name: string;
  description: string;
  model: string;
  quantity: number;
}

export interface StockComparison {
  itemCode: string;
  warehouseQty: number;
  shopQty: number;
  difference: number;
}

export interface SplitPayment {
  method: 'cash' | 'card' | 'juice';
  amount: number;
  transactionId?: string;
}

export interface SaleEntry {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  timestamp: number;
  paymentMethod?: 'cash' | 'card' | 'juice' | 'split';
  splitPayments?: SplitPayment[];
  transactionId?: string;
  highlighted?: boolean;
  isGift?: boolean;
}

export interface DailyData {
  date: string; // ISO date string (YYYY-MM-DD)
  visitors: number;
  sales: SaleEntry[];
}

export interface MonthlyReport {
  storeName: string;
  month: string;
  days: Record<string, DailyData>;
}

export interface StockMovement {
  id: string;
  productId: string;
  date: string; // ISO string
  type: 'sale' | 'manual_update' | 'csv_upload' | 'initial' | 'transfer_note';
  quantityChange: number;
  newStock: number;
  description: string;
  reason?: string;
}

export interface DailyCountEntry {
  opening: number | '';
  displayWall1: number | '';
  displayWall2: number | '';
  displayWall3: number | '';
  podium1: number | '';
  podium2: number | '';
  podium3: number | '';
  podium4: number | '';
  accessories: number | '';
  backStore: number | '';
  stkIn: number | '';
  sale: number | '';
  stkOut: number | '';
  signEmpl1: string;
  signEmpl2: string;
  remarks: string;
}

export interface DailyStockCount {
  date: string; // YYYY-MM-DD
  morning: DailyCountEntry;
  evening: DailyCountEntry;
}

export interface MonthlyStockCount {
  month: string; // YYYY-MM
  days: Record<string, DailyStockCount>;
}
