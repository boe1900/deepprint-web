import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

type Bindings = {
  OPENAI_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

const TYPST_SYSTEM_PROMPT = `你是一个 Typst 排版专家。请根据用户的需求生成 Typst 代码。

## 规则：
1. 数据通过 \`sys.inputs.payload\` 变量注入，使用 \`let data = json.decode(sys.inputs.payload)\` 读取。
2. 只返回纯 Typst 代码，不要使用 Markdown 代码块标记（不要用 \`\`\`typst）。
3. 使用中文注释解释关键部分。
4. 遵循 Typst 最佳实践，使用 #set 和 #show 规则定义样式。
5. 对于小票/收据，使用 #set page(width: 58mm, height: auto) 设置页面尺寸。
6. 对于 A4 文档，使用 #set page(paper: "a4")。

## 示例模板（收据）：
\`\`\`typst
// 解析注入的 JSON 数据
#let data = json.decode(sys.inputs.payload)

// 页面设置：58mm 热敏小票
#set page(width: 58mm, height: auto, margin: 3mm)
#set text(font: "Noto Sans SC", size: 10pt)

// 店铺名称
#align(center)[
  #text(size: 14pt, weight: "bold")[#data.store_name]
]

#line(length: 100%, stroke: 0.5pt)

// 商品列表
#for item in data.items [
  #grid(
    columns: (1fr, auto),
    [#item.name],
    [¥#item.price]
  )
]

#line(length: 100%, stroke: 0.5pt)

// 合计
#align(right)[
  #text(weight: "bold")[合计: ¥#data.total]
]
\`\`\`

现在，请根据用户的需求生成 Typst 代码。`

// 健康检查端点
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// AI 生成端点
app.post('/generate', async (c) => {
  try {
    const { messages } = await c.req.json()
    
    const openai = createOpenAI({
      apiKey: c.env.OPENAI_API_KEY,
    })

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: TYPST_SYSTEM_PROMPT,
      messages,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Generate error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    )
  }
})

export const onRequest = handle(app)
