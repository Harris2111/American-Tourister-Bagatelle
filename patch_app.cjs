const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

// Add import
if (!code.includes('import { DailyStockCountManager }')) {
  code = code.replace(
    "import { FinancialReport } from './components/FinancialReport';",
    "import { FinancialReport } from './components/FinancialReport';\nimport { DailyStockCountManager } from './components/DailyStockCountManager';"
  );
}

// Add tab button
const financialTabBtn = `<button
                  onClick={() => setActiveTab('financial')}
                  className={\`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm \${activeTab === 'financial' ? 'bg-green-50 text-green-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}\`}
                >
                  <FileSpreadsheet size={18} />
                  <span className="hidden md:inline">Financial Report</span>
                </button>`;

const dailyCountTabBtn = `
                <button
                  onClick={() => setActiveTab('daily_count')}
                  className={\`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm \${activeTab === 'daily_count' ? 'bg-amber-50 text-amber-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}\`}
                >
                  <Package size={18} />
                  <span className="hidden md:inline">Daily Count</span>
                </button>`;

if (!code.includes("setActiveTab('daily_count')")) {
  code = code.replace(financialTabBtn, financialTabBtn + dailyCountTabBtn);
}

// Add tab view
const financialView = `{activeTab === 'financial' && (
              <motion.div
                key="financial"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <FinancialReport allReports={reports} />
              </motion.div>
            )}`;

const dailyCountView = `
            {activeTab === 'daily_count' && (
              <motion.div
                key="daily_count"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <DailyStockCountManager />
              </motion.div>
            )}`;

if (!code.includes("key=\"daily_count\"")) {
  code = code.replace(financialView, financialView + dailyCountView);
}

fs.writeFileSync('src/App.tsx', code);
