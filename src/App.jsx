import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Bot, Database, Code, 
  ZoomIn, ZoomOut, AlertCircle, Play, 
  Layout, FileJson, ArrowRight, Layers, Check
} from 'lucide-react';

// --- 常量定义：物理单位转屏幕像素 (96 DPI) ---
const MM_TO_PX = 3.78; // 1mm ≈ 3.78px
const PT_TO_PX = 1.33; // 1pt ≈ 1.33px

// --- 辅助函数：生成 UUID ---
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// --- 插值引擎 ---
const interpolate = (text, data) => {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{(.+?)\}\}/g, (match, content) => {
    const parts = content.split('|');
    const key = parts[0].trim();
    const formatterStr = parts[1] ? parts[1].trim() : null;

    let value = data[key];
    if (value === undefined) return `[${key}]`; // 缺省显示

    if (formatterStr) {
      if (formatterStr.startsWith('currency')) return `¥${Number(value).toFixed(2)}`;
      if (formatterStr.startsWith('date')) return value; // 简化处理
      if (formatterStr.startsWith('percent')) return `${value}%`;
    }
    return value;
  });
};

// --- 智能 Mock 数据生成器 ---
const generateAutoMockData = (template) => {
  const mock = {};
  
  const getElements = (node) => {
    let els = [];
    if (node.layers) els = node.layers.flatMap(l => l.elements || []);
    else if (node.elements) els = node.elements;
    return els;
  };

  const traverse = (nodes) => {
    if (!nodes) return;
    nodes.forEach(el => {
      const stringsToCheck = [el.content, ...(el.props ? Object.values(el.props) : [])];
      stringsToCheck.forEach(str => {
        if (typeof str === 'string') {
          const matches = str.match(/\{\{(.+?)\}\}/g);
          if (matches) {
            matches.forEach(m => {
              const rawContent = m.replace(/\{\{|\}\}/g, ''); 
              const key = rawContent.split('|')[0].trim(); 
              
              if (!mock[key]) {
                 const k = key.toLowerCase();
                 if (k.includes('title') || k.includes('movie')) mock[key] = "阿凡达：水之道";
                 else if (k.includes('theater') || k.includes('screen')) mock[key] = "IMAX 3号厅";
                 else if (k.includes('row')) mock[key] = "7";
                 else if (k.includes('seat')) mock[key] = "12";
                 else if (k.includes('date')) mock[key] = "2025-12-31";
                 else if (k.includes('time')) mock[key] = "19:30";
                 else if (k.includes('price') || k.includes('amount')) mock[key] = 85.00;
                 else if (k.includes('ticket') || k.includes('id')) mock[key] = "T88888888";
                 else if (k.includes('qr')) mock[key] = "https://example.com";
                 else if (k.includes('name')) mock[key] = "张三";
                 else mock[key] = `[${key}]`;
              }
            });
          }
        }
      });
      if (el.elements) traverse(el.elements);
    });
  };

  traverse(getElements(template));
  return JSON.stringify(mock, null, 2);
};

const DEFAULT_MOCK_DATA = { "user_name": "演示用户" };

const resolveAsset = (src, assets) => {
  if (!src) return '';
  if (src.startsWith('ref:') && assets) {
    const key = src.substring(4);
    return assets[key] || '';
  }
  return src;
};

// --- 尺寸计算: 区分 mm 和 pt ---
// lengthScale: 用于 mm 单位 (x, y, width, height, padding)
// fontScale: 用于 pt 单位 (fontSize)
const getDimension = (value, scale) => {
  if (value === undefined || value === null) return 'auto';
  if (typeof value === 'string' && value.endsWith('%')) return value; 
  if (typeof value === 'number') return `${value * MM_TO_PX * scale}px`; 
  return value;
};

// --- Renderer 组件 ---
const Renderer = ({ template, scale, data, isThumbnail = false }) => {
  if (!template || (!template.elements && !template.layers)) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">暂无模板内容</div>;
  }

  const { canvas, assets } = template;
  const elements = template.layers ? template.layers.flatMap(l => l.elements) : template.elements;
  
  // 画布尺寸总是 mm
  const unitFactor = canvas?.unit === 'pt' ? 1.33 : MM_TO_PX;
  const width = (canvas?.width || 210) * unitFactor;
  const height = (canvas?.height || 297) * unitFactor;

  return (
    <div 
      className={`relative bg-white transition-all duration-300 ease-in-out ${isThumbnail ? 'shadow-sm' : 'shadow-xl'}`}
      style={{
        width: `${width * scale}px`,
        height: `${height * scale}px`,
        overflow: 'hidden',
        transformOrigin: 'top left'
      }}
    >
      {elements.map((el, idx) => (
        <RenderElement 
          key={el.id || idx} 
          element={el} 
          scale={scale} // 这里只传纯倍数，具体单位转换在内部做
          assets={assets} 
          data={data}
          parentLayout="absolute"
        />
      ))}
      
      {!isThumbnail && (
        <div className="absolute inset-[3mm] border border-dashed border-gray-300 pointer-events-none opacity-50"></div>
      )}
    </div>
  );
};

const RenderElement = ({ element, scale, assets, data, parentLayout }) => {
  const { type, x, y, width, height, props, style, elements, columns, headerStyle, layout, gap } = element;
  
  const resolvedContent = interpolate(element.content || (props && props.text), data);
  const resolvedQrValue = interpolate(props?.value, data);

  const isFlowItem = parentLayout === 'vertical' || parentLayout === 'horizontal';

  const commonStyle = {
    position: isFlowItem ? 'relative' : 'absolute',
    left: isFlowItem ? 'auto' : `${(x || 0) * MM_TO_PX * scale}px`,
    top: isFlowItem ? 'auto' : `${(y || 0) * MM_TO_PX * scale}px`,
    width: getDimension(width, scale),
    height: getDimension(height, scale),
    zIndex: element.zIndex || 1,
    ...convertStyle(style, scale, assets)
  };

  switch (type) {
    case 'text':
      return (
        <div style={{
          ...commonStyle,
          display: 'flex',
          alignItems: 'center', 
          justifyContent: style?.textAlign === 'center' ? 'center' : style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
          whiteSpace: props?.wrap ? 'normal' : 'nowrap',
          overflow: 'hidden',
          lineHeight: props?.lineHeight || 1.2
        }} title={resolvedContent}>
          {resolvedContent}
        </div>
      );
      
    case 'rect':
    case 'line':
      const isLine = type === 'line';
      const strokeW = (style?.strokeWidth || 0.5) * PT_TO_PX * scale; // 线宽通常也是 pt
      
      const lineStyle = isLine ? {
         height: `${Math.max(1, strokeW)}px`,
         borderTop: props?.dashArray ? `${Math.max(1, strokeW)}px dashed ${style?.stroke || '#000'}` : 'none',
         backgroundColor: props?.dashArray ? 'transparent' : (style?.stroke || '#000')
      } : {
         backgroundColor: style?.backgroundColor || 'transparent',
         border: style?.border || '1px solid #000'
      };

      return (
        <div style={{
          ...commonStyle,
          ...lineStyle
        }} />
      );

    case 'image':
      const imgSrc = resolveAsset(props?.src, assets);
      return (
        <img 
          src={imgSrc} 
          alt="img"
          style={{...commonStyle, objectFit: props?.objectFit || 'cover'}}
          onError={(e) => { e.target.src = 'https://placehold.co/100x100?text=Err'; }}
        />
      );

    case 'qrcode':
      // 二维码尺寸按 mm 计算
      const qrW = Math.floor((width || 20) * MM_TO_PX * scale);
      const qrH = Math.floor((height || 20) * MM_TO_PX * scale);
      const qrValue = resolvedQrValue || "DP";
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrW}x${qrH}&data=${encodeURIComponent(qrValue)}`;
      return (
        <div style={{...commonStyle}}>
          <img src={qrUrl} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      );

    case 'container':
      const isFlexContainer = layout === 'vertical' || layout === 'horizontal';
      const flexStyle = isFlexContainer ? {
        display: 'flex',
        flexDirection: layout === 'vertical' ? 'column' : 'row',
        gap: `${(gap || 0) * MM_TO_PX * scale}px`,
        alignItems: 'stretch',
        flexWrap: 'nowrap'
      } : {};

      return (
        <div style={{...commonStyle, ...flexStyle, border: 'none'}}>
          {elements && elements.map((child, idx) => (
             <RenderElement 
                key={idx} 
                element={child} 
                scale={scale} 
                assets={assets} 
                data={data}
                parentLayout={layout}
             />
          ))}
        </div>
      );

    case 'table':
      const dataKey = element.dataSource ? element.dataSource.replace(/[{}]/g, '') : '';
      const tableData = Array.isArray(data[dataKey]) ? data[dataKey] : [];
      return (
        <div style={{...commonStyle, overflow: 'hidden', display: 'block'}}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: commonStyle.fontSize }}>
            <thead>
              <tr style={convertStyle(headerStyle, scale, assets)}>
                {columns.map((col, idx) => (
                  <th key={idx} style={{ padding: '2px', textAlign: col.align || 'left', width: col.width, borderBottom: '1px solid #ccc' }}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.length > 0 ? tableData.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderBottom: '1px solid #eee' }}>
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} style={{ padding: '2px', textAlign: col.align || 'left' }}>{row[col.field]}</td>
                  ))}
                </tr>
              )) : (
                <tr><td colSpan={columns.length} className="text-center text-gray-300 py-1">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      );
    default: return null;
  }
};

// --- 关键修复：样式转换逻辑 ---
const convertStyle = (styleObj, scale, assets) => {
  if (!styleObj) return {};
  const newStyle = { ...styleObj };
  
  // 1. 字体处理: pt -> px
  if (typeof newStyle.fontSize === 'number') {
    newStyle.fontSize = `${newStyle.fontSize * PT_TO_PX * scale}px`;
  }
  
  // 2. 空间距离处理: mm -> px
  ['borderRadius', 'padding', 'borderWidth', 'top', 'left', 'right', 'bottom'].forEach(prop => {
     if (typeof newStyle[prop] === 'number') {
        newStyle[prop] = `${newStyle[prop] * MM_TO_PX * scale}px`;
     }
  });

  // 3. 线宽处理: pt -> px (通常)
  if (typeof newStyle.strokeWidth === 'number') {
     newStyle.strokeWidth = `${newStyle.strokeWidth * PT_TO_PX * scale}px`;
  }
  
  if (newStyle.fontFamily && newStyle.fontFamily.startsWith('ref:')) {
    newStyle.fontFamily = resolveAsset(newStyle.fontFamily, assets);
  }
  return newStyle;
};

// --- 主应用组件 ---
export default function DeepPrintChatStudio() {
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      role: 'assistant', 
      text: "你好！我是 DeepPrint 排版助手。\n请告诉我你想设计什么？",
      template: null 
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(generateUUID());
  
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [mockData, setMockData] = useState(JSON.stringify(DEFAULT_MOCK_DATA, null, 2));
  const [scale, setScale] = useState(1.0);
  const [rightPanelTab, setRightPanelTab] = useState('preview'); 
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = { id: Date.now(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8888/api/layout/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'X-Session-Id': sessionId },
        body: input
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      
      const responseText = await response.text();
      let jsonPart = responseText;
      if (responseText.includes("```json")) {
        jsonPart = responseText.split("```json")[1].split("```")[0];
      } else if (responseText.includes("```")) {
        jsonPart = responseText.split("```")[1].split("```")[0];
      }

      const parsedTemplate = JSON.parse(jsonPart);
      const autoData = generateAutoMockData(parsedTemplate);
      setMockData(autoData); 

      const aiMsg = { 
        id: Date.now() + 1, 
        role: 'assistant', 
        text: "设计已优化。字号已校正，Mock 数据已自动补全。",
        template: parsedTemplate 
      };

      setMessages(prev => [...prev, aiMsg]);
      setActiveTemplate(parsedTemplate);
      if (rightPanelTab !== 'preview') setRightPanelTab('preview');

    } catch (e) {
      const errorMsg = { 
        id: Date.now() + 1, 
        role: 'assistant', 
        text: `Error: ${e.message}`,
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden text-slate-800">
      
      {/* 左侧：聊天区域 */}
      <div className="w-[400px] flex flex-col bg-white border-r shadow-sm z-10 flex-shrink-0">
        <div className="h-14 border-b flex items-center px-4 gap-2 bg-slate-50">
          <Bot className="text-indigo-600" />
          <span className="font-bold text-gray-700">DeepPrint Copilot</span>
          <span className="text-[10px] text-gray-400 font-mono ml-auto">ID: {sessionId.substring(0,4)}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : msg.isError 
                    ? 'bg-red-50 text-red-600 border border-red-100 rounded-tl-none'
                    : 'bg-white border border-gray-100 text-gray-700 rounded-tl-none'
              }`}>
                <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
                
                {msg.template && (
                  <div 
                    className={`mt-3 border rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all ${activeTemplate === msg.template ? 'ring-2 ring-indigo-500' : 'border-gray-200'}`}
                    onClick={() => {
                        setActiveTemplate(msg.template);
                        setMockData(generateAutoMockData(msg.template));
                    }}
                  >
                    <div className="bg-gray-100 p-2 h-[120px] relative overflow-hidden flex items-center justify-center">
                       <div className="scale-[0.25] origin-center">
                         <Renderer template={msg.template} scale={1} data={JSON.parse(mockData)} isThumbnail={true} />
                       </div>
                    </div>
                    <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600 flex justify-between items-center border-t">
                      <span>{msg.template.meta?.name || "布局"}</span>
                      <ArrowRight size={12} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start animate-pulse">
               <div className="bg-gray-200 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-gray-500">
                  Thinking...
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t">
          <div className="relative">
            <input
              type="text"
              className="w-full pl-4 pr-12 py-3 bg-gray-100 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl outline-none transition-all text-sm"
              placeholder="输入需求..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button 
              onClick={handleSend}
              disabled={isLoading}
              className={`absolute right-2 top-2 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 右侧：工作台 */}
      <div className="flex-1 flex flex-col bg-slate-200/50 min-w-0">
        <div className="h-14 bg-white border-b flex items-center justify-between px-6 shadow-sm">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setRightPanelTab('preview')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 ${rightPanelTab === 'preview' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <Layout size={14} /> 预览
            </button>
            <button onClick={() => setRightPanelTab('json')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 ${rightPanelTab === 'json' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <FileJson size={14} /> JSON
            </button>
            <button onClick={() => setRightPanelTab('data')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 ${rightPanelTab === 'data' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <Database size={14} /> Data
            </button>
          </div>
          
          {rightPanelTab === 'preview' && (
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1.5 hover:bg-white rounded text-gray-600"><ZoomOut size={16}/></button>
              <span className="text-xs font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1.5 hover:bg-white rounded text-gray-600"><ZoomIn size={16}/></button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden relative">
          {rightPanelTab === 'preview' && (
            <div className="absolute inset-0 overflow-auto flex items-center justify-center p-10 bg-slate-300">
              {activeTemplate ? (
                <Renderer template={activeTemplate} scale={scale} data={JSON.parse(mockData)} />
              ) : (
                <div className="flex flex-col items-center text-gray-400 gap-2">
                   <Layout size={48} className="opacity-20"/>
                   <span>请在左侧输入需求生成模板</span>
                </div>
              )}
            </div>
          )}

          {rightPanelTab === 'json' && (
            <textarea
              className="w-full h-full p-6 font-mono text-xs bg-slate-900 text-green-400 resize-none outline-none"
              value={activeTemplate ? JSON.stringify(activeTemplate, null, 2) : "// 暂无数据"}
              readOnly
            />
          )}

          {rightPanelTab === 'data' && (
             <textarea
               className="w-full h-full p-6 font-mono text-xs bg-white text-slate-700 resize-none outline-none"
               value={mockData}
               onChange={(e) => setMockData(e.target.value)}
               placeholder="输入 JSON 数据..."
             />
          )}
        </div>
        
        <div className="h-8 bg-white border-t px-4 flex items-center justify-between text-[10px] text-gray-400">
           <span>{activeTemplate?.canvas ? `${activeTemplate.canvas.width}x${activeTemplate.canvas.height} ${activeTemplate.canvas.unit}` : 'Ready'}</span>
           <span>DeepPrint v2.3</span>
        </div>
      </div>
    </div>
  );
}