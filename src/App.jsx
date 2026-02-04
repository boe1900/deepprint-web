import { useState, useEffect, useRef, useCallback } from 'react';
import { TypstDocument } from '@myriaddreamin/typst.react';
import { createTypstCompiler, preloadRemoteFonts } from '@myriaddreamin/typst.ts';
import { useChat } from 'ai/react';
import Editor from '@monaco-editor/react';
import {
  Send, Bot, Code2, Eye, Database,
  PanelLeftClose, PanelLeft, Loader2,
  FileCode, Sparkles, AlertCircle,
  ZoomIn, ZoomOut, RotateCcw, Maximize2
} from 'lucide-react';

// 将 JSON 值转换为 Typst 字面量语法
const jsonToTypst = (value) => {
  if (value === null || value === undefined) {
    return 'none';
  }
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    const items = value.map(jsonToTypst).join(', ');
    return `(${items})`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `${k}: ${jsonToTypst(v)}`)
      .join(', ');
    return `(${entries})`;
  }
  return String(value);
};

// 配置 Typst 渲染器 WASM 路径 (0.6.0 全局配置)
TypstDocument.setWasmModuleInitOptions({
  getModule: () => ({
    module_or_path: fetch('/assets/typst_ts_renderer_bg.wasm').then(res => res.arrayBuffer())
  })
});

// Typst WASM 渲染器组件 - PDF 阅读器风格预览
const TypstPreview = ({ code, data }) => {
  const [compiler, setCompiler] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // 缩放状态
  const [zoom, setZoom] = useState(1); // 100% = 1
  const containerRef = useRef(null);
  const documentRef = useRef(null);

  // 缩放控制函数
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3)); // 最大 300%
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.25)); // 最小 25%
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1); // 重置为 100%
  }, []);

  const fitToWidth = useCallback(() => {
    if (!containerRef.current || !documentRef.current) return;

    // 获取容器可用宽度（减去 padding）
    const containerWidth = containerRef.current.clientWidth - 64; // 32px padding each side
    // 获取文档原始宽度
    const documentWidth = documentRef.current.scrollWidth / zoom;

    if (documentWidth > 0) {
      const newZoom = Math.min(containerWidth / documentWidth, 2); // 最大适应到 200%
      setZoom(Math.max(newZoom, 0.25));
    }
  }, [zoom]);

  // 初始化编译器
  useEffect(() => {
    let mounted = true;
    const initCompiler = async () => {
      try {
        const comp = createTypstCompiler();

        // 加载中文字体 - 先获取数据，防止 WASM Panic
        let fontData = null;
        try {
          // 尝试加载 public/fonts/SimHei.ttf
          const fontRes = await fetch('/fonts/NotoSansSC-Regular.ttf');
          if (fontRes.ok) {
            fontData = new Uint8Array(await fontRes.arrayBuffer());
          } else {
            console.error('NotoSansSC-Regular.ttf font not found');
            throw new Error('未找到 NotoSansSC-Regular.ttf 字体文件，请将其放入 public/fonts/ 目录');
          }
        } catch (fontErr) {
          console.error('Failed to load font:', fontErr);
          if (mounted) {
            setError(fontErr.message || '字体加载失败');
            setLoading(false);
          }
          return;
        }

        await comp.init({
          getModule: () => ({
            module_or_path: fetch('/assets/typst_ts_web_compiler_bg.wasm').then(res => res.arrayBuffer())
          }),
          beforeBuild: [
            preloadRemoteFonts([fontData])
          ]
        });

        if (mounted) {
          setCompiler(comp);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to init compiler:', err);
        if (mounted) {
          setError(`引擎初始化失败: ${err.message}`);
          setLoading(false);
        }
      }
    };

    initCompiler();
    return () => { mounted = false; };
  }, []);

  // 编译代码
  useEffect(() => {
    if (!compiler || !code) return;

    const compile = async () => {
      try {
        // 构建完整代码 - 使用 JSON 数据注入
        // 使用 Typst 内置的 json.decode 解析 JSON 字符串，比手动拼接字符串更健壮
        const dataCode = `#let data = json.decode("${JSON.stringify(data).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")\n`;
        const fullCode = dataCode + code;

        // 编译
        const mainFilePath = '/main.typ';
        compiler.addSource(mainFilePath, fullCode);
        const compileResult = await compiler.compile({
          mainFilePath
        });

        console.log('Compilation Result:', compileResult);
        const artifactData = compileResult.result;

        if (artifactData && artifactData.length > 0) {
          console.log('Artifact size:', artifactData.length);
          setArtifact(artifactData);
          setError(null);
        } else {
          console.warn('Artifact is empty!');
          if (compileResult.diagnostics) {
            console.log('Diagnostics:', compileResult.diagnostics);
          }
        }
      } catch (err) {
        console.error('Compile error:', err);
        setError(err.message || '编译错误');
      }
    };

    // 防抖处理
    const timer = setTimeout(compile, 300);
    return () => clearTimeout(timer);
  }, [compiler, code, data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-200 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} />
        <span>加载 Typst 引擎...</span>
      </div>
    );
  }

  // 获取设备像素比，用于高清渲染
  const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  return (
    <div className="w-full h-full flex flex-col bg-slate-200">
      {/* 缩放工具栏 */}
      <div className="flex-shrink-0 h-10 bg-slate-700 border-b border-slate-600 flex items-center justify-center gap-1 px-4">
        <button
          onClick={zoomOut}
          className="p-1.5 rounded hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
          title="缩小"
        >
          <ZoomOut size={16} />
        </button>

        <div className="px-3 py-1 bg-slate-800 rounded text-xs text-slate-300 min-w-[60px] text-center font-mono">
          {Math.round(zoom * 100)}%
        </div>

        <button
          onClick={zoomIn}
          className="p-1.5 rounded hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
          title="放大"
        >
          <ZoomIn size={16} />
        </button>

        <div className="w-px h-5 bg-slate-600 mx-2" />

        <button
          onClick={resetZoom}
          className="p-1.5 rounded hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
          title="重置为 100%"
        >
          <RotateCcw size={16} />
        </button>

        <button
          onClick={fitToWidth}
          className="p-1.5 rounded hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
          title="适应宽度"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {/* 预览区域 - 可滚动 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }}
      >
        {/* 错误提示 */}
        {error && (
          <div className="fixed top-16 right-4 bg-red-100 text-red-600 p-3 rounded-lg shadow-lg text-xs flex items-center gap-2 z-50 border border-red-200">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* 文档容器 - 纸张效果 */}
        {artifact && (
          <div className="flex justify-center">
            <div
              ref={documentRef}
              className="bg-white"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                // 给文档一个基础宽度，80mm ≈ 302px (at 96 DPI)
                minWidth: '302px',
                // 使用 inline-block 让容器能根据内容自适应
                display: 'inline-block',
                // 纸张阴影效果
                boxShadow: `
                  0 4px 6px -1px rgba(0, 0, 0, 0.1),
                  0 10px 15px -3px rgba(0, 0, 0, 0.1),
                  0 20px 25px -5px rgba(0, 0, 0, 0.1),
                  0 25px 50px -12px rgba(0, 0, 0, 0.25)
                `
              }}
            >
              <TypstDocument
                fill="#ffffff"
                artifact={artifact}
                pixelPerPt={pixelRatio * 2}
              />
            </div>
          </div>
        )}

        {/* 无内容时的占位 */}
        {!artifact && !error && (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <Eye size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm">等待编译...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 默认 Typst 代码
const DEFAULT_CODE = `
// DeepPrint v2.0 - Typst Template
#set page(width: 80mm, height: auto, margin: 5mm)
#set text(size: 10pt, font: ("Noto Sans SC", "Arial"))

#align(center)[
  #text(size: 16pt, weight: "bold")[Welcome to DeepPrint]
]

#v(1em)

This is a demo template. Edit the code on the left or use AI chat to generate new templates.

#v(1em)

#text(weight: "bold")[Sample Data:]
- Store: #data.store_name
- Total: #data.total
`;

// 默认数据
const DEFAULT_DATA = {
  store_name: "示例店铺",
  items: [
    { name: "商品 A", price: 10.00 },
    { name: "商品 B", price: 20.00 }
  ],
  total: 30.00
};

export default function DeepPrintStudio() {
  // Typst 代码和数据状态
  const [code, setCode] = useState(DEFAULT_CODE);
  const [data, setData] = useState(DEFAULT_DATA);
  const [dataInput, setDataInput] = useState(JSON.stringify(DEFAULT_DATA, null, 2));
  const [dataError, setDataError] = useState(null);

  // UI 状态
  const [showChat, setShowChat] = useState(true);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'preview' | 'data'
  const messagesEndRef = useRef(null);

  // AI Chat
  const { messages, input, setInput, handleSubmit, isLoading, error: chatError } = useChat({
    api: '/api/generate',
    onFinish: (message) => {
      // AI 完成后，提取 Typst 代码
      if (message.role === 'assistant' && message.content) {
        // 移除可能的 markdown 代码块标记
        let typstCode = message.content;
        if (typstCode.includes('```typst')) {
          typstCode = typstCode.split('```typst')[1].split('```')[0];
        } else if (typstCode.includes('```')) {
          typstCode = typstCode.split('```')[1].split('```')[0];
        }
        setCode(typstCode.trim());
        setActiveTab('preview');
      }
    }
  });

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 处理数据 JSON 输入
  const handleDataChange = useCallback((value) => {
    setDataInput(value);
    try {
      const parsed = JSON.parse(value);
      setData(parsed);
      setDataError(null);
    } catch (err) {
      setDataError('JSON 格式错误');
    }
  }, []);

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      {/* 左侧：Chat Panel */}
      {showChat && (
        <div className="w-[360px] flex flex-col bg-slate-800 border-r border-slate-700 flex-shrink-0">
          {/* Header */}
          <div className="h-14 border-b border-slate-700 flex items-center px-4 gap-3 bg-slate-800/50">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="font-semibold text-sm">DeepPrint Copilot</h1>
              <p className="text-[10px] text-slate-400">Typst AI 排版助手</p>
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="ml-auto p-1.5 rounded hover:bg-slate-700 text-slate-400"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 py-8">
                <Bot size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">描述你想要的排版设计</p>
                <p className="text-xs mt-1 opacity-60">例如: "生成一个餐厅小票模板"</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-slate-700 text-slate-100 rounded-tl-sm'
                  }`}>
                  {msg.role === 'assistant' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <FileCode size={14} />
                        <span>Typst 代码已生成</span>
                      </div>
                      <pre className="text-xs bg-slate-800 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                        {msg.content.substring(0, 300)}
                        {msg.content.length > 300 && '...'}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-indigo-400" />
                  <span className="text-sm text-slate-300">生成中...</span>
                </div>
              </div>
            )}

            {chatError && (
              <div className="flex justify-start">
                <div className="bg-red-900/50 border border-red-700 rounded-2xl rounded-tl-sm px-4 py-3">
                  <p className="text-sm text-red-300">错误: {chatError.message}</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-slate-700">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="描述你的排版需求..."
                className="w-full pl-4 pr-12 py-3 bg-slate-700 rounded-xl text-sm placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-2 top-2 p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 右侧：工作区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center px-4 gap-4">
          {!showChat && (
            <button
              onClick={() => setShowChat(true)}
              className="p-2 rounded hover:bg-slate-700 text-slate-400"
            >
              <PanelLeft size={18} />
            </button>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-700/50 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${activeTab === 'editor'
                ? 'bg-slate-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
                }`}
            >
              <Code2 size={14} />
              编辑器
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${activeTab === 'preview'
                ? 'bg-slate-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
                }`}
            >
              <Eye size={14} />
              预览
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${activeTab === 'data'
                ? 'bg-slate-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
                }`}
            >
              <Database size={14} />
              数据
              {dataError && <span className="w-2 h-2 rounded-full bg-red-500" />}
            </button>
          </div>

          <div className="ml-auto text-xs text-slate-500">
            DeepPrint v2.0 · Typst
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
          {/* Editor Panel */}
          {activeTab === 'editor' && (
            <Editor
              height="100%"
              defaultLanguage="markdown"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || '')}
              options={{
                fontSize: 14,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                padding: { top: 16 },
                scrollBeyondLastLine: false,
              }}
            />
          )}

          {/* Preview Panel */}
          {activeTab === 'preview' && (
            <div className="absolute inset-0 bg-slate-300 overflow-auto">
              <TypstPreview code={code} data={data} />
            </div>
          )}

          {/* Data Panel */}
          {activeTab === 'data' && (
            <div className="absolute inset-0 flex flex-col">
              <div className="p-4 bg-slate-800 border-b border-slate-700">
                <h3 className="text-sm font-medium">业务数据 (JSON)</h3>
                <p className="text-xs text-slate-400 mt-1">
                  数据将通过 <code className="bg-slate-700 px-1 rounded">sys.inputs.payload</code> 注入到模板中
                </p>
                {dataError && (
                  <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {dataError}
                  </p>
                )}
              </div>
              <div className="flex-1">
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  theme="vs-dark"
                  value={dataInput}
                  onChange={(value) => handleDataChange(value || '')}
                  options={{
                    fontSize: 14,
                    fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="h-8 bg-slate-800 border-t border-slate-700 px-4 flex items-center justify-between text-[10px] text-slate-500">
          <span>Typst WASM Engine</span>
          <span>{code.length} chars</span>
        </div>
      </div>
    </div>
  );
}