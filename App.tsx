
import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Search, 
  Download, 
  Trash2, 
  Plus, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  FileUp,
  X,
  PlusCircle,
  RotateCcw,
  FilePlus2,
  Loader2,
  Table as TableIcon
} from 'lucide-react';
import { DataRow, MatchResult, AppStatus } from './types';

const STORAGE_KEYS = {
  SOURCE_DATA: 'excel_matcher_source_data',
  SEARCH_RESULTS: 'excel_matcher_search_results',
  APP_STATUS: 'excel_matcher_app_status'
};

const App: React.FC = () => {
  const [sourceData, setSourceData] = useState<DataRow[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SOURCE_DATA);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [searchResults, setSearchResults] = useState<MatchResult[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SEARCH_RESULTS);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [status, setStatus] = useState<AppStatus>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.APP_STATUS);
    return (saved as AppStatus) || AppStatus.IDLE;
  });

  const [inputValue, setInputValue] = useState('');
  const [previewMatch, setPreviewMatch] = useState<DataRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SOURCE_DATA, JSON.stringify(sourceData));
  }, [sourceData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SEARCH_RESULTS, JSON.stringify(searchResults));
  }, [searchResults]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.APP_STATUS, status);
  }, [status]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus(AppStatus.PROCESSING);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        const formattedData: DataRow[] = jsonData
          .filter(row => row.length >= 2 && row[0] !== undefined)
          .map(row => ({
            key: String(row[0]).trim(),
            value: String(row[1] || '').trim()
          }));

        if (formattedData.length === 0) {
          throw new Error("在 Excel 的前两列中未找到有效数据。");
        }

        setSourceData(formattedData);
        setStatus(AppStatus.DATA_LOADED);
      } catch (err: any) {
        setError(err.message || "解析 Excel 文件失败。");
        setStatus(AppStatus.IDLE);
      }
    };
    reader.onerror = () => {
      setError("文件读取错误。");
      setStatus(AppStatus.IDLE);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBatchSearchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || sourceData.length === 0) return;

    setIsProcessingBatch(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        const newMatches: MatchResult[] = [];
        const seen = new Set(searchResults.map(r => `${r.key}-${r.value}`));

        jsonData.forEach((row) => {
          for (let i = 0; i < Math.min(row.length, 5); i++) {
            const term = String(row[i] || '').trim().toLowerCase();
            if (!term) continue;

            const match = sourceData.find(baseRow => 
              baseRow.key.toLowerCase().includes(term) || 
              baseRow.value.toLowerCase().includes(term)
            );

            if (match) {
              const signature = `${match.key}-${match.value}`;
              if (!seen.has(signature)) {
                newMatches.push({
                  ...match,
                  timestamp: Date.now() + Math.random()
                });
                seen.add(signature);
              }
              break;
            }
          }
        });

        if (newMatches.length > 0) {
          setSearchResults(prev => [...newMatches, ...prev]);
        } else {
          setError("上传的文件中未找到新的匹配项。");
        }
      } catch (err: any) {
        setError("处理批量搜索文件失败。");
      } finally {
        setIsProcessingBatch(false);
        if (batchSearchInputRef.current) batchSearchInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    const trimmedInput = inputValue.trim().toLowerCase();
    if (!trimmedInput || sourceData.length === 0) {
      setPreviewMatch(null);
      return;
    }

    const match = sourceData.find(row => 
      row.key.toLowerCase().includes(trimmedInput) || 
      row.value.toLowerCase().includes(trimmedInput)
    );
    setPreviewMatch(match || null);
  }, [inputValue, sourceData]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      submitSearch();
    }
  };

  const submitSearch = () => {
    if (!previewMatch) return;

    const signature = `${previewMatch.key}-${previewMatch.value}`;
    const alreadyInList = searchResults.some(r => `${r.key}-${r.value}` === signature);

    if (!alreadyInList) {
      const newResult: MatchResult = {
        ...previewMatch,
        timestamp: Date.now()
      };
      setSearchResults(prev => [newResult, ...prev]);
    }
    
    setInputValue('');
    setPreviewMatch(null);
  };

  const handleExport = () => {
    if (searchResults.length === 0) return;

    const exportData = searchResults.map(res => ({
      "KOL 名称": res.key,
      "UID / 数值": res.value
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "匹配结果");
    XLSX.writeFile(wb, "matched_results.xlsx");
  };

  const clearHistory = () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      setTimeout(() => setIsConfirmingClear(false), 3000);
      return;
    }
    setSearchResults([]);
    setIsConfirmingClear(false);
  };

  const removeResult = (timestamp: number) => {
    setSearchResults(prev => prev.filter(r => r.timestamp !== timestamp));
  };

  const resetAll = () => {
    if (!isConfirmingReset) {
      setIsConfirmingReset(true);
      setTimeout(() => setIsConfirmingReset(false), 3000);
      return;
    }
    setSourceData([]);
    setSearchResults([]);
    setStatus(AppStatus.IDLE);
    setInputValue('');
    setPreviewMatch(null);
    setIsConfirmingReset(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    localStorage.removeItem(STORAGE_KEYS.SOURCE_DATA);
    localStorage.removeItem(STORAGE_KEYS.SEARCH_RESULTS);
    localStorage.removeItem(STORAGE_KEYS.APP_STATUS);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      <div className="max-w-4xl w-full">
        {/* 页眉 */}
        <header className="mb-8 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-200">
            <FileSpreadsheet className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Excel 数据匹配工具</h1>
          <p className="text-gray-500 mt-2">从参考数据中快速匹配并收集 KOL/UID 信息。</p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center text-red-700 animate-in fade-in slide-in-from-top-4 duration-300">
            <AlertCircle className="w-5 h-5 mr-3 shrink-0" />
            <span className="text-sm font-medium flex-1">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {status === AppStatus.IDLE && (
          <div className="bg-white p-8 border-2 border-dashed border-gray-300 rounded-3xl shadow-sm text-center hover:border-blue-400 transition-colors group cursor-pointer"
               onClick={() => fileInputRef.current?.click()}>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".xlsx, .xls" 
              onChange={handleFileUpload}
            />
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileUp className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">上传基础数据</h2>
            <p className="text-gray-500 text-sm mt-1 mb-4">请上传包含完整参考信息的 Excel 列表 (KOL, UID 等)</p>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-md active:scale-95">
              选择参考 Excel 文件
            </button>
          </div>
        )}

        {status !== AppStatus.IDLE && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* 状态控制栏 */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="text-green-600 w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">参考数据已就绪</p>
                  <p className="text-xs text-gray-500">已缓存 {sourceData.length} 条记录</p>
                </div>
              </div>
              
              <button 
                onClick={resetAll}
                className={`text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2 uppercase tracking-wider ${
                  isConfirmingReset 
                  ? "bg-red-500 text-white shadow-lg shadow-red-100 animate-pulse" 
                  : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                }`}
              >
                {isConfirmingReset ? <RotateCcw className="w-4 h-4" /> : <X className="w-4 h-4" />}
                {isConfirmingReset ? "确认重置？" : "更换参考数据"}
              </button>
            </div>

            {/* 搜索界面 */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-gray-700">
                  搜索数据 (KOL 或 UID)
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    ref={batchSearchInputRef} 
                    className="hidden" 
                    accept=".xlsx, .xls" 
                    onChange={handleBatchSearchUpload}
                  />
                  <button 
                    onClick={() => batchSearchInputRef.current?.click()}
                    disabled={isProcessingBatch}
                    className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 border border-blue-100"
                  >
                    {isProcessingBatch ? <Loader2 className="w-3 h-3 animate-spin" /> : <FilePlus2 className="w-3 h-3" />}
                    批量导入搜索
                  </button>
                </div>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-11 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none"
                  placeholder="输入 KOL 名称或 UID 片段，按回车添加..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>

              {/* 搜索预览 */}
              {inputValue && (
                <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                  {previewMatch ? (
                    <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-blue-900 truncate">{previewMatch.key}</span>
                          <span className="text-blue-300">→</span>
                          <span className="text-sm font-medium text-blue-600 truncate">{previewMatch.value}</span>
                        </div>
                        <p className="text-[10px] font-bold text-blue-400 uppercase mt-1">按回车键添加到列表</p>
                      </div>
                      <button 
                        onClick={submitSearch}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 active:scale-95 transition-all"
                      >
                        确认添加
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 text-gray-400 italic text-sm text-center">
                      正在参考数据库中匹配...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Excel 样式的匹配列表 */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <TableIcon className="text-green-600 w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-gray-900">已匹配的数据列表</h3>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleExport}
                    disabled={searchResults.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-green-100 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" /> 导出 Excel
                  </button>
                  <button 
                    onClick={clearHistory}
                    disabled={searchResults.length === 0}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                      isConfirmingClear ? "bg-red-500 text-white" : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                    }`}
                  >
                    <Trash2 className="w-5 h-5" />
                    {isConfirmingClear && <span>确认清空？</span>}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[600px] relative">
                <table className="w-full border-collapse bg-white">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th className="w-12 border-r border-gray-300"></th>
                      <th className="px-4 py-1.5 border-r border-gray-300 text-[10px] font-bold text-gray-500 uppercase text-center bg-gray-100">A</th>
                      <th className="px-4 py-1.5 border-r border-gray-300 text-[10px] font-bold text-gray-500 uppercase text-center bg-gray-100">B</th>
                      <th className="w-16 text-[10px] font-bold text-gray-500 uppercase text-center bg-gray-100">操作</th>
                    </tr>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="w-12 bg-gray-100 border-r border-gray-300 text-[10px] font-bold text-gray-400 text-center">1</th>
                      <th className="px-4 py-2 border-r border-gray-200 text-xs font-bold text-gray-600 text-left bg-gray-50 uppercase italic tracking-wider">KOL 名称</th>
                      <th className="px-4 py-2 border-r border-gray-200 text-xs font-bold text-gray-600 text-left bg-gray-50 uppercase italic tracking-wider">UID / 数值</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.length > 0 ? (
                      searchResults.map((result, idx) => (
                        <tr key={result.timestamp} className="border-b border-gray-100 hover:bg-blue-50/20 transition-colors group">
                          <td className="w-12 bg-gray-50 border-r border-gray-200 text-[10px] font-bold text-gray-400 text-center select-none">
                            {idx + 2}
                          </td>
                          <td className="px-4 py-3 border-r border-gray-100 text-sm text-gray-900 truncate max-w-[200px] font-medium">
                            {result.key}
                          </td>
                          <td className="px-4 py-3 border-r border-gray-100 text-sm text-blue-600 truncate max-w-[200px]">
                            {result.value}
                          </td>
                          <td className="w-16 text-center">
                            <button 
                              onClick={() => removeResult(result.timestamp)}
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="w-12 bg-gray-50 border-r border-gray-200 h-24"></td>
                        <td colSpan={3} className="px-4 py-24 text-center">
                          <div className="flex flex-col items-center opacity-30">
                            <TableIcon className="w-12 h-12 mb-4" />
                            <p className="text-sm font-medium">列表中暂无记录。</p>
                            <p className="text-xs mt-1">请通过上方搜索或批量导入来开始添加。</p>
                          </div>
                        </td>
                      </tr>
                    )}
                    {/* 填充行，增加 Excel 质感 */}
                    {[...Array(Math.max(0, 5 - searchResults.length))].map((_, i) => (
                      <tr key={`filler-${i}`} className="border-b border-gray-50 h-10">
                        <td className="w-12 bg-gray-50 border-r border-gray-100 text-[10px] font-bold text-gray-300 text-center">
                          {searchResults.length + i + 2}
                        </td>
                        <td className="border-r border-gray-50"></td>
                        <td className="border-r border-gray-50"></td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-12 text-gray-400 text-xs pb-8 text-center leading-relaxed">
        已启用本地缓存功能。您的数据不会离开浏览器。<br/>
        由 React, Tailwind & XLSX 驱动。
      </footer>
    </div>
  );
};

export default App;
