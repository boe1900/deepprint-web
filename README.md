# DeepPrint Web

A modern, browser-based Typst editor and previewer built for high-performance receipt and document generation.

![Features](https://img.shields.io/badge/Status-Active-success) ![License](https://img.shields.io/badge/License-MIT-blue)

## 🏗 Tech Stack

This project leverages the latest web technologies for a seamless local-first experience:

### Core & Framework
- **React 19**: Utilizing the latest React features for efficient UI rendering.
- **Vite 7**: Next-generation frontend tooling for instant HMR and optimized builds.
- **Hono**: Ultrafast web framework running on the edge for backend logic.

### Styling & UI
- **Tailwind CSS v4**: Utility-first CSS framework for rapid and responsive design.
- **Lucide React**: Beautiful, consistent icons.

### Editor & Rendering
- **Monaco Editor**: VS Code-like editing experience with syntax highlighting.
- **Typst.ts (WASM)**: Running the full Typst compiler in the browser via WebAssembly for millisecond-level preview updates.
- **Typst.react**: React bindings for Typst artifacts.

### AI & Intelligence
- **Vercel AI SDK**: Unified interface for building AI-powered features.
- **OpenAI**: Powering the "DeepPrint Copilot" for natural language to Typst code generation.

### Infrastructure
- **Cloudflare Pages**: Hosting the static assets.
- **Cloudflare Functions**: Serverless backend execution.

## ✨ Key Features

- **Real-time Preview**: Instant feedback as you type Typst code.
- **WASM-based Compilation**: Zero-latency compilation running entirely client-side.
- **AI Copilot**: Generate layouts and templates using natural language.
- **JSON Data Injection**: Separate data from logic for dynamic document generation.
- **Theme Support**: Built-in Light, Dark, and System theme modes.

## 🚀 Development

### Prerequisites

- Node.js 18+
- npm

### Quick Start

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Start development server**:
    ```bash
    npm run dev
    ```
    This command automatically syncs the local Typst universe packages and starts Vite.

## ☁️ Cloudflare Deployment

This project is configured for deployment on Cloudflare Pages.

### How to Deploy

1.  **Login to Cloudflare**:
    ```bash
    npx wrangler login
    ```

2.  **Deploy**:
    ```bash
    npm run deploy
    ```

3.  **Environment Variables**:
    After deployment, remember to set your `OPENAI_API_KEY` in the Cloudflare Pages dashboard under **Settings** -> **Environment Variables**. This is required for AI features.

4.  **Local Preview**:
    To preview the application locally with Cloudflare Functions:
    ```bash
    npm run preview
    ```
