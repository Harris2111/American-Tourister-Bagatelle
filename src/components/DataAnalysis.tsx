import React, { useState, useMemo } from 'react';
import { MonthlyReport, DailyData } from '../types';
import { GoogleGenAI } from "@google/genai";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { Brain, Sparkles, TrendingUp, AlertCircle, Lightbulb, Loader2, Download, Eye, EyeOff } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import ReactMarkdown from 'react-markdown';

interface DataAnalysisProps {
  reports: Record<string, MonthlyReport>;
  startDate: string;
  endDate: string;
}

export const DataAnalysis: React.FC<DataAnalysisProps> = ({ reports, startDate, endDate }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showKeyCharacters, setShowKeyCharacters] = useState(false);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
  };

  const chartData = useMemo(() => {
    const data: any[] = [];
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    Object.values(reports).forEach(report => {
      if (!report.days) return;
      Object.entries(report.days).forEach(([date, day]) => {
        const dayDate = parseISO(day.date || date);
        if (!isNaN(dayDate.getTime()) && isWithinInterval(dayDate, { start, end })) {
          let sales = 0;
          if (Array.isArray(day.sales)) {
            day.sales.forEach(s => sales += (s.price || 0));
          }
          
          let formattedDate = date;
          try {
            const parsed = parseISO(date);
            if (!isNaN(parsed.getTime())) {
              formattedDate = format(parsed, 'dd MMM');
            }
          } catch {
            // Keep original date string if parsing fails
          }

          data.push({
            date: formattedDate,
            sales: sales,
            visitors: day.visitors || 0,
            conversion: (day.visitors || 0) > 0 ? ((day.sales?.length || 0) / day.visitors) * 100 : 0,
            rawDate: date
          });
        }
      });
    });

    return data.sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [reports, startDate, endDate]);

  const productStats = useMemo(() => {
    const stats: Record<string, { name: string, count: number, total: number }> = {};
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    Object.values(reports).forEach(report => {
      if (!report.days) return;
      Object.entries(report.days).forEach(([date, day]) => {
        const dayDate = parseISO(day.date || date);
        if (!isNaN(dayDate.getTime()) && isWithinInterval(dayDate, { start, end })) {
          if (Array.isArray(day.sales)) {
            day.sales.forEach(sale => {
              if (!stats[sale.productId]) {
                stats[sale.productId] = { name: sale.productName, count: 0, total: 0 };
              }
              stats[sale.productId].count += (sale.quantity || 1);
              stats[sale.productId].total += (sale.price || 0);
            });
          }
        }
      });
    });
    return Object.values(stats).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [reports, startDate, endDate]);

  const generateAIInsights = async () => {
    setIsAnalyzing(true);
    try {
      const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

      // Check for API key and prompt user if in AI Studio environment
      if (!effectiveApiKey) {
        const aistudio = (window as any).aistudio;
        if (aistudio && typeof aistudio.hasSelectedApiKey === 'function') {
          const hasKey = await aistudio.hasSelectedApiKey();
          if (!hasKey) {
            await aistudio.openSelectKey();
            // We proceed assuming the user will select a key or try again
          }
        } else {
          setShowKeyInput(true);
          throw new Error("Gemini API Key is missing. Please enter your API key in the field below.");
        }
      }

      const ai = new GoogleGenAI({ apiKey: effectiveApiKey || '' });
      
      const dataSummary = {
        period: `${format(parseISO(startDate), 'dd MMM yyyy')} to ${format(parseISO(endDate), 'dd MMM yyyy')}`,
        totalSales: chartData.reduce((sum, d) => sum + d.sales, 0),
        totalVisitors: chartData.reduce((sum, d) => sum + d.visitors, 0),
        avgConversion: chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.conversion, 0) / chartData.length : 0,
        topProducts: productStats.map(p => `${p.name} (${p.count} units)`),
        dailyBreakdown: chartData.map(d => `${d.date}: Sales ${d.sales}, Visitors ${d.visitors}, Conversion ${d.conversion.toFixed(2)}%`)
      };

      const prompt = `
        Analyze the following sales data for a Samsonite Brand Store in Mauritius for the period ${dataSummary.period}.
        
        Summary Metrics:
        - Total Sales: ${dataSummary.totalSales} MUR
        - Total Visitors: ${dataSummary.totalVisitors}
        - Average Conversion Rate: ${dataSummary.avgConversion.toFixed(2)}%
        - Top Selling Products: ${dataSummary.topProducts.join(', ')}
        
        Daily Data:
        ${dataSummary.dailyBreakdown.join('\n')}
        
        Please provide a detailed report including:
        1. **Performance Situation**: A deep analysis of how the store is performing.
        2. **Key Trends**: Identify patterns (e.g., best days, visitor vs sales correlation).
        3. **Best Sellers vs. Low Sellers Analysis**: 
           - Strategies to maintain and capitalize on the momentum of products that are already selling well.
           - Specific actionable advice on how to sell low-performing products (e.g., visual merchandising, bundling, or targeted staff pitches).
        4. **Improvement Suggestions**: Actionable advice to increase conversion, sales, or foot traffic.
        5. **Stock Insights**: Suggestions based on product popularity.
        
        Format the response in clear Markdown.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiReport(response.text || "Unable to generate report at this time.");
    } catch (error: any) {
      console.error("AI Analysis failed", error);
      setAiReport(`Error generating AI report: ${error.message || "Please try again later."}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadReport = () => {
    if (!aiReport) return;
    const blob = new Blob([aiReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Samsonite_Analysis_${startDate}_to_${endDate}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* API Key Input Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <AlertCircle size={18} className="text-amber-500" />
            Gemini API Configuration
          </h3>
          <button 
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showKeyInput ? 'Hide Settings' : 'Show Settings'}
          </button>
        </div>
        
        {showKeyInput && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              To use Deep AI Analysis, you need a Gemini API key. You can get one for free at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>.
            </p>
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  name="gemini-api-key"
                  id="gemini-api-key"
                  autoComplete="off"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="Enter your Gemini API Key..."
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none pr-10"
                  style={{ WebkitTextSecurity: showKeyCharacters ? 'none' : 'disc' } as any}
                />
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => setShowKeyCharacters(!showKeyCharacters)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeyCharacters ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
              {apiKey && (
                <button 
                  onClick={() => {
                    setApiKey('');
                    localStorage.removeItem('gemini_api_key');
                  }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Clear Key
                </button>
              )}
            </div>
            {process.env.GEMINI_API_KEY && !apiKey && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Sparkles size={12} />
                Using system-provided API key.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-600" />
            Sales & Visitors Trend
          </h3>
          <div className="h-[300px] flex items-center justify-center">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="visitors" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto">
                  <TrendingUp size={24} />
                </div>
                <p className="text-sm text-gray-400">No trend data for this period</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" />
            Top Selling Products
          </h3>
          <div className="h-[300px] flex items-center justify-center">
            {productStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productStats} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={120} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto">
                  <Sparkles size={24} />
                </div>
                <p className="text-sm text-gray-400">No product data for this period</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600">
              <Brain size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Deep AI Analysis</h3>
              <p className="text-sm text-gray-500">Intelligent insights and improvement suggestions powered by Gemini</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {aiReport && (
              <button
                onClick={downloadReport}
                className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
              >
                <Download size={20} />
                Download Report
              </button>
            )}
            <button
              onClick={generateAIInsights}
              disabled={isAnalyzing || chartData.length === 0}
              className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100 disabled:opacity-50 disabled:shadow-none"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Analyzing Data...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Generate Deep Report
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-8">
          {aiReport ? (
            <div className="prose prose-blue max-w-none">
              <ReactMarkdown>{aiReport}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                <Lightbulb size={32} />
              </div>
              <div className="max-w-sm">
                <h4 className="font-bold text-gray-800">Ready for Analysis</h4>
                <p className="text-sm text-gray-500">Click the button above to generate a detailed report of your store's performance and get actionable improvement suggestions.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
