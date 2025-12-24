
// 状态管理
let state = {
    sourceData: JSON.parse(localStorage.getItem('matcher_source') || '[]'),
    results: JSON.parse(localStorage.getItem('matcher_results') || '[]'),
    currentPreview: null
};

// DOM 元素引用
const elements = {
    uploadSection: document.getElementById('upload-section'),
    mainInterface: document.getElementById('main-interface'),
    sourceFileInput: document.getElementById('source-file-input'),
    batchFileInput: document.getElementById('batch-file-input'),
    searchInput: document.getElementById('search-input'),
    searchPreview: document.getElementById('search-preview'),
    previewKey: document.getElementById('preview-key'),
    previewValue: document.getElementById('preview-value'),
    resultsBody: document.getElementById('results-body'),
    dataCountText: document.getElementById('data-count-text'),
    errorContainer: document.getElementById('error-container'),
    errorMessage: document.getElementById('error-message'),
    addMatchBtn: document.getElementById('add-match-btn'),
    exportBtn: document.getElementById('export-btn'),
    clearBtn: document.getElementById('clear-btn'),
    resetBtn: document.getElementById('reset-btn')
};

// 初始化
function init() {
    lucide.createIcons();
    render();
    
    // 监听基础数据文件选择
    elements.sourceFileInput.addEventListener('change', handleSourceUpload);
    // 监听批量搜索文件选择
    elements.batchFileInput.addEventListener('change', handleBatchUpload);
    
    // 搜索输入逻辑
    elements.searchInput.addEventListener('input', handleSearchInput);
    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && state.currentPreview) {
            e.preventDefault();
            addCurrentPreview();
        }
    });

    // 按钮点击
    elements.addMatchBtn.addEventListener('click', addCurrentPreview);
    elements.exportBtn.addEventListener('click', exportToExcel);
    elements.clearBtn.addEventListener('click', clearResults);
    elements.resetBtn.addEventListener('click', resetAll);
    
    // 注意：不再需要为 uploadSection 绑定 click 监听器，
    // 因为 HTML 中已经使用了 <label for="source-file-input">
}

// 错误处理
function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorContainer.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideError() {
    elements.errorContainer.classList.add('hidden');
}

// 文件解析核心逻辑
async function parseExcel(file) {
    return new Promise((resolve, reject) => {
        // 修复：之前这里判断反了
        if (typeof XLSX === 'undefined') {
            reject(new Error("Excel 解析库加载失败，请刷新页面重试。"));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                // 使用 header: 1 得到二维数组
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                // 过滤出至少有两列有效数据的行
                const formatted = json
                    .filter(row => row && row.length >= 2 && row[0] !== undefined && row[0] !== null && String(row[0]).trim() !== "")
                    .map(row => ({
                        key: String(row[0]).trim(),
                        value: String(row[1] || '').trim()
                    }));
                
                resolve(formatted);
            } catch (err) {
                console.error("Parse error:", err);
                reject(new Error("文件读取失败，请确保是有效的 Excel 文档"));
            }
        };
        reader.onerror = () => reject(new Error("文件读取中断"));
        reader.readAsArrayBuffer(file);
    });
}

// 上传基础数据
async function handleSourceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const data = await parseExcel(file);
        if (data.length === 0) throw new Error("Excel 中未发现有效数据（第一列必须有内容）");
        
        state.sourceData = data;
        saveState();
        render();
        hideError();
    } catch (err) {
        showError(err.message);
    } finally {
        e.target.value = '';
    }
}

// 批量搜索导入
async function handleBatchUpload(e) {
    const file = e.target.files[0];
    if (!file || state.sourceData.length === 0) return;
    
    try {
        const data = await parseExcel(file);
        let addedCount = 0;
        
        data.forEach(row => {
            const term = row.key.toLowerCase();
            const match = state.sourceData.find(s => 
                s.key.toLowerCase().includes(term) || s.value.toLowerCase().includes(term)
            );
            
            if (match) {
                const exists = state.results.some(r => r.key === match.key && r.value === match.value);
                if (!exists) {
                    state.results.unshift({ ...match, id: Date.now() + Math.random() });
                    addedCount++;
                }
            }
        });
        
        if (addedCount > 0) {
            saveState();
            render();
            hideError();
        } else {
            showError("批量匹配完成，但未发现新的匹配项");
        }
    } catch (err) {
        showError("批量解析失败：" + err.message);
    } finally {
        e.target.value = '';
    }
}

// 搜索逻辑
function handleSearchInput(e) {
    const val = e.target.value.trim().toLowerCase();
    if (!val) {
        state.currentPreview = null;
        elements.searchPreview.classList.add('hidden');
        return;
    }
    
    const match = state.sourceData.find(s => 
        s.key.toLowerCase().includes(val) || s.value.toLowerCase().includes(val)
    );
    
    if (match) {
        state.currentPreview = match;
        elements.previewKey.textContent = match.key;
        elements.previewValue.textContent = match.value;
        elements.searchPreview.classList.remove('hidden');
    } else {
        state.currentPreview = null;
        elements.searchPreview.classList.add('hidden');
    }
}

function addCurrentPreview() {
    if (!state.currentPreview) return;
    
    const exists = state.results.some(r => 
        r.key === state.currentPreview.key && r.value === state.currentPreview.value
    );
    
    if (!exists) {
        state.results.unshift({ ...state.currentPreview, id: Date.now() });
        saveState();
        render();
    }
    
    elements.searchInput.value = '';
    state.currentPreview = null;
    elements.searchPreview.classList.add('hidden');
    elements.searchInput.focus();
}

// 导出
function exportToExcel() {
    if (state.results.length === 0) {
        showError("列表为空，无法导出");
        return;
    }
    const wsData = state.results.map(r => ({
        "KOL 名称": r.key,
        "UID / 数值": r.value
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "匹配结果");
    XLSX.writeFile(wb, `匹配导出_${new Date().getTime()}.xlsx`);
}

// 状态清除
function clearResults() {
    if (state.results.length > 0 && confirm("确定要清空当前的匹配结果列表吗？")) {
        state.results = [];
        saveState();
        render();
    }
}

function resetAll() {
    if (confirm("更换参考数据将同时清空当前的匹配列表。是否继续？")) {
        state.sourceData = [];
        state.results = [];
        localStorage.removeItem('matcher_source');
        localStorage.removeItem('matcher_results');
        render();
        hideError();
    }
}

window.removeResult = function(id) {
    state.results = state.results.filter(r => r.id !== id);
    saveState();
    render();
};

function saveState() {
    localStorage.setItem('matcher_source', JSON.stringify(state.sourceData));
    localStorage.setItem('matcher_results', JSON.stringify(state.results));
}

// 渲染 UI
function render() {
    const hasData = state.sourceData && state.sourceData.length > 0;
    
    elements.uploadSection.classList.toggle('hidden', hasData);
    elements.mainInterface.classList.toggle('hidden', !hasData);
    
    if (hasData) {
        elements.dataCountText.textContent = `已缓存 ${state.sourceData.length} 条记录`;
        elements.resultsBody.innerHTML = '';
        
        if (state.results.length === 0) {
            elements.resultsBody.innerHTML = `
                <tr>
                    <td class="w-12 bg-gray-50 border-r border-gray-200 h-24"></td>
                    <td colspan="3" class="px-4 py-16 text-center opacity-30 italic text-sm text-gray-400">
                        暂无匹配数据，请在上方搜索或批量导入。
                    </td>
                </tr>
            `;
        } else {
            state.results.forEach((res, index) => {
                const row = document.createElement('tr');
                row.className = "border-b border-gray-100 hover:bg-blue-50/30 group transition-colors";
                row.innerHTML = `
                    <td class="w-12 bg-gray-50 border-r border-gray-200 text-[10px] font-bold text-gray-400 text-center select-none">
                        ${index + 2}
                    </td>
                    <td class="px-4 py-3 border-r border-gray-100 text-sm text-gray-900 font-medium max-w-[200px] truncate">
                        ${res.key}
                    </td>
                    <td class="px-4 py-3 border-r border-gray-100 text-sm text-blue-600 max-w-[200px] truncate">
                        ${res.value}
                    </td>
                    <td class="w-16 text-center">
                        <button onclick="removeResult(${res.id})" class="p-1.5 text-gray-300 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </td>
                `;
                elements.resultsBody.appendChild(row);
            });
        }
        
        const fillerCount = Math.max(0, 8 - state.results.length);
        for (let i = 0; i < fillerCount; i++) {
            const filler = document.createElement('tr');
            filler.className = "border-b border-gray-50 h-10";
            filler.innerHTML = `
                <td class="w-12 bg-gray-50 border-r border-gray-200 text-[10px] font-bold text-gray-200 text-center">
                    ${state.results.length + i + 2}
                </td>
                <td class="border-r border-gray-50"></td>
                <td class="border-r border-gray-50"></td>
                <td></td>
            `;
            elements.resultsBody.appendChild(filler);
        }
    }
    
    lucide.createIcons();
}

init();
