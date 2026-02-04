# DeepPrint Next-Gen 架构设计文档 (v2.0)

**版本**：2.0 (Typst + Jamstack 重构版) **核心理念**：代码即设计 (Code as Design)，端到端同构 (End-to-End Isomorphism)。 **目标**：打造一个轻量、高性能、低成本的现代化云打印基础设施。

## 1. 总体架构图 (The "Iron Triangle")

系统由三个核心部分组成，形成稳固的“铁三角”关系。

```
graph TD
    subgraph Cloud [Cloudflare Edge Network]
        direction TB
        Web[Web 可视化设计器]
        Agent[AI Agent (后端函数)]
        Web -- 同源调用 /api/generate --> Agent
        Agent -- 调用 LLM --> LLM[OpenAI / LLM API]
    end

    subgraph ClientPC [用户本地环境 / 内网]
        User[业务系统 / ERP]
        Tauri[DeepPrint 客户端 (Tauri)]
        Printer[物理打印机]
        
        User -- HTTP / MQTT --> Tauri
        Tauri -- 渲染 Typst --> Printer
    end

    subgraph Flow [数据流向]
        Step1[1. Web端生成模板 (.typ)]
        Step2[2. 业务系统生成数据 (JSON)]
        Step3[3. 客户端结合两者渲染 (PDF)]
    end

    Web -.-> Step1
    User -.-> Step2
    Tauri -.-> Step3
```

## 2. 核心技术栈选择 (Tech Stack)

我们选择了目前业界最前沿的 **Jamstack** 和 **Rust** 生态组合，以实现极致的性能和最低的运维成本。

| 组件           | 选型                  | 理由                                                         |
| -------------- | --------------------- | ------------------------------------------------------------ |
| **排版内核**   | **Typst**             | **核心引擎**。基于 Rust，比 LaTeX 快百倍，支持流式布局、自动分页、数学公式。前后端共用同一套排版逻辑。 |
| **云端架构**   | **Jamstack**          | **Cloudflare Pages + Functions**。前端与后端 API 部署在同一仓库，全球 CDN 加速，零运维成本。 |
| **Web 前端**   | **React + Vite**      | 主流前端框架。结合 **Typst WASM** 实现毫秒级浏览器端预览。   |
| **Web 后端**   | **Hono (TypeScript)** | 运行在 Cloudflare Workers 上的超轻量 Web 框架，替代 Spring Boot。启动速度 0ms。 |
| **桌面客户端** | **Tauri (Rust)**      | 替代 Electron。体积小（<10MB），内存占用低。直接集成 `typst` crate 实现本地打印服务。 |
| **通信协议**   | **HTTP / MQTT**       | 本地服务使用 HTTP (Axum)，远程云打印使用 MQTT (Rumqttc)。    |

## 3. 详细子系统设计

### 3.1 Web 可视化设计器 (deepprint-web)

这是用户的创作中心。它不再是一个简单的表单工具，而是一个**“AI 辅助的代码编辑器”**。

- **部署方式：** Cloudflare Pages (静态托管)。

- **核心功能：**

  - **Editor:** 集成 `Monaco Editor`，支持 Typst 语法高亮。
  - **Preview:** 使用 `@myriaddreamin/typst.ts` (WASM)，在浏览器本地编译 Typst 代码为 SVG，实现**所见即所得**。
  - **Copilot:** 左侧聊天框，调用后端 AI 接口，通过自然语言生成/修改模板代码。

- **目录结构变更：**

  ```
  src/
  ├── components/
  │   ├── Editor.jsx      (Monaco 代码编辑器)
  │   ├── Preview.jsx     (Typst WASM 渲染器)
  │   └── ChatPanel.jsx   (AI 对话界面)
  └── App.jsx
  ```

### 3.2 AI Agent 后端 (deepprint-cloud)

这是系统的大脑。它不再是独立的 Java 服务，而是寄生在 Web 项目中的 **Serverless 函数**。

- **部署方式：** Cloudflare Pages Functions (自动部署)。

- **运行环境：** Edge Runtime (V8 Isolate)。

- **核心功能：**

  - **Prompt Engineering:** 内置 DeepPrint 专用的 System Prompt，教 AI 如何写 Typst。
  - **Streaming:** 使用 `Vercel AI SDK` 将生成的代码流式传输给前端，减少等待感。

- **目录结构 (合并入 Web 项目)：**

  ```
  functions/
  └── api/
      └── [[route]].ts    (Hono 入口，处理 /api/generate 请求)
  ```

### 3.3 Tauri 客户端 (deepprint-agent)

这是系统的手脚。它是一个高性能的**边缘计算节点**，旨在完全替代 C-Lodop。

- **技术栈：** Rust (`typst`, `axum`, `tauri-plugin-printer`).
- **核心职责：**
  1. **本地 HTTP 服务 (Port 19090):** 允许本地浏览器 JS 调用打印机。
  2. **云打印服务 (MQTT):** 允许远程服务器下发打印任务。
  3. **渲染引擎:** 接收 `Template String` + `Data JSON`，编译为 PDF/Image。
  4. **硬件控制:** 调用操作系统 API 驱动物理打印机。
- **代码大瘦身：**
  - **删除** `renderer.rs` (原 Skia 绘图逻辑)。
  - **删除** `deep_print_schema.rs` (原复杂 UI 协议)。
  - **新增** `engine.rs` (仅包含 Typst 编译调用)。

## 4. 新旧协议对比 (Protocol Evolution)

这是架构升级最本质的变化：从**UI 描述**转向**数据描述**。

### 4.1 旧协议 (DeepPrint v6.1 - 已废弃)

*前端需要计算布局，后端负责绘制。*

```
// ❌ 复杂，耦合度高
{
  "elements": [
    { "type": "text", "x": 10, "y": 20, "content": "标题" },
    { "type": "table", "y": 50, "linkedTo": "title", "columns": [...] }
  ]
}
```

### 4.2 新协议 (Typst Native - 现行标准)

*前端只传数据，后端负责排版。*

**请求载荷 (JSON):**

```
// ✅ 简单，纯业务数据
{
  "template": "#set page(width: 58mm)\n#align(center)[*#payload.store*]\n...",
  "data": {
    "store": "肯德基",
    "items": [{ "name": "汉堡", "price": 19.5 }]
  }
}
```

## 5. 项目迁移路线图 (Migration Plan)

### 第一阶段：Web 端重构 (Jamstack 化)

1. **合并仓库：** 将原本独立的 Java Agent 逻辑迁移到 `deepprint-web/functions` 目录下，使用 Hono 重写。
2. **替换渲染器：** 在 React 中移除旧的 DOM 模拟渲染组件，引入 `@myriaddreamin/typst.ts` 实现 WASM 预览。
3. **改造编辑器：** 引入 Monaco Editor，支持文本编辑模式。
4. **部署：** 关联 GitHub 到 Cloudflare Pages，实现一键上线。

### 第二阶段：Tauri 客户端重构 (引擎置换)

1. **引入依赖：** 在 `src-tauri/Cargo.toml` 中添加 `typst`, `typst-pdf`, `axum`。
2. **清理代码：** 删除所有 Skia 相关代码。
3. **实现服务：** 使用 `axum` 实现 `POST /print` 接口，接收 JSON 和 模板。
4. **对接打印机：** 确保生成的 PDF 能正确发送给 Windows/Mac 打印队列。

### 第三阶段：生态建设

1. **Prompt 调优：** 优化 AI 的 System Prompt，让它更擅长写中文表格、小票布局。
2. **模板库：** 预置 10-20 个常用行业模板（超市小票、物流面单、A4 合同）。

## 6. 总结 (Conclusion)

通过这次架构升级，**DeepPrint** 将实现质的飞跃：

1. **成本归零：** 放弃 VPS，全面拥抱免费且强大的 Cloudflare Serverless。
2. **体验统一：** 浏览器预览与物理打印结果实现 **100% 像素级一致**（基于同一 Typst 引擎）。
3. **无限扩展：** 不再受限于我们定义的 JSON 协议，用户可以使用 Typst 的完整编程能力（循环、函数、数学公式）来设计任意复杂的报表。

**DeepPrint 不再是一个简单的打印工具，它将成为一个基于 AI 和 Code-Infrastructure 的下一代报表生成平台。**