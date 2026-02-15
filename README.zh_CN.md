# KnockAgent

[English](./README.md)

> **配置大于约定** 的 Agent 框架 — 用 Markdown 文件定义 AI Agent。

KnockAgent 基于 [`@openai/agents`](https://github.com/openai/openai-agents-js) 框架打造，让你只需极少量代码即可构建复杂的多 Agent 系统 — 编写带有 YAML front matter 的 Markdown 文件来定义每个 Agent 的模型、温度、系统提示词、工具和协作方式。框架会读取这些 `.md` 文件并自动完成所有接线工作。

## ✨ 核心特性

- 📝 **Markdown 即配置** — 每个 Agent 是一个 `.md` 文件：front matter 用于配置，正文作为系统提示词。
- 🔌 **多模型供应商** — 通过 [Vercel AI SDK](https://ai-sdk.dev/) 支持多种模型供应商（OpenAI、Google、Anthropic 等）。
- 🧩 **Liquid 模板** — 在系统提示词中使用 [LiquidJS](https://liquidjs.com/) 模板语法，支持完整运行时上下文。
- 🤝 **多 Agent 协作** — 多个 Agent 可通过任务委派、控制转移或工具调用等方式协同工作，全部通过声明式配置完成。
- ️ **类型安全** — TypeScript 编写，对供应商和模型提供完整类型推断。
- 🧪 **虚拟文件系统** — 可插拔的文件系统接口，支持将 Agent 定义直接嵌入代码中，无需从磁盘读取文件。

## 📦 安装

```bash
npm install knockagent
# 或
pnpm add knockagent
```

### 环境要求

- Node.js `>=20.19.0` 或 `>=22.12.0`
- 至少一个 [Vercel AI SDK 供应商](https://ai-sdk.dev/docs/foundations/providers-and-models)（如 `@ai-sdk/openai`）

## 🚀 快速开始

### 1. 创建项目结构

```
my-project/
├── agents/
│   ├── main.md          # 入口 Agent（必需）
│   └── translator.md    # 子 Agent
├── index.ts
└── package.json
```

### 2. 用 Markdown 定义 Agent

**`agents/main.md`** — 入口 Agent（文件必须命名为 `main.md`）：

```markdown
---
name: main
desc: 一个可以翻译文本的助手
model: openai/gpt-4o
temperature: 0.7
handoffs: translator
---

你是一个有用的助手。当用户要求你翻译时，将任务移交给翻译 Agent。
```

**`agents/translator.md`** — 任务移交目标：

```markdown
---
name: translator
desc: 在语言之间翻译文本
model: openai/gpt-4o-mini
temperature: 0.3
---

你是一位专业翻译。准确翻译用户的文本，同时保持原文的含义和语气。
```

### 3. 在代码中接线

```typescript
import KnockAgent, { createAiProvider } from "knockagent";
import { openai } from "@ai-sdk/openai";

const agent = new KnockAgent({
  rootDir: "./agents",
  providers: {
    openai: createAiProvider(openai),
  },
  defaultModel: "openai/gpt-4o",
});
```

`KnockAgent` 实例会构建 `@openai/agents` 的 `Agent` 对象。你可以使用 `@openai/agents` 标准的 `Runner` API 来运行对话。

---

## 📖 参考文档

### Agent Markdown 文件格式

每个 Agent 是一个 Markdown 文件（`.md`），由两部分组成：

```markdown
---
<YAML front matter – Agent 配置>
---

<Markdown 正文 – 系统提示词>
```

**Front matter** 控制 Agent 行为；**正文**成为系统提示词（运行时通过 Liquid 模板引擎渲染）。

### Front Matter 字段

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `name` | `string` | 文件路径作为名称 | Agent 的显示名称 |
| `desc` / `description` | `string` | `""` | 当此 Agent 被用作移交目标或工具时显示的描述 |
| `model` | `string` | 配置中的 `defaultModel` | 模型标识符，格式为 `供应商/模型名`，如 `openai/gpt-4o` |
| `temperature` | `number` | `defaultTemperature`（默认 `1.0`） | 采样温度 |
| `handoffs` | `string`（逗号分隔） | – | 逗号分隔的 Agent 路径列表，用于任务移交 |
| `agents` | `string`（逗号分隔） | – | 逗号分隔的 Agent 路径列表，作为可调用工具挂载 |
| `tools` | `string`（逗号分隔） | – | 逗号分隔的工具名称列表（必须通过 `KnockAgentConfig.tools` 注册） |
| `reasoning_effort` | `"low"` \| `"medium"` \| `"high"` | – | 推理努力程度（支持的模型可用） |
| `reasoning_summary` | `string` | – | 推理摘要配置 |
| `verbosity` | `string` | – | 文本详细程度设置 |
| `prefix` | `string` | – | 在每条用户消息前添加的文本 |
| `suffix` | `string` | – | 在每条用户消息后追加的文本 |

#### 示例：完整的 front matter

```yaml
---
name: researcher
desc: 使用网络搜索研究主题
model: openai/o4-mini
temperature: 0.5
handoffs: writer, reviewer
agents: summarizer
tools: search
reasoning_effort: medium
prefix: "请研究以下内容："
suffix: "请提供你的信息来源。"
---
```

### 系统提示词（Markdown 正文）

Front matter 之后的 Markdown 正文即为 Agent 的系统提示词。它在运行时通过 **LiquidJS** 处理，你可以使用模板变量和过滤器。

#### 模板变量

Liquid 的渲染上下文是运行 Agent 时传入的 `RunContext.context` 对象。例如：

```markdown
---
name: greeter
---

你好！你正在为 {{ username }} 提供帮助。

今日任务：
{% for task in tasks %}
- {{ task }}
{% endfor %}
```

#### 内置过滤器

| 过滤器 | 说明 | 示例 |
|---|---|---|
| `json` | 将值序列化为 JSON 字符串 | `{{ data \| json }}` |

所有标准的 [LiquidJS 过滤器](https://liquidjs.com/filters/overview.html) 均可使用。

> ⚠️ **注意：** 如需引入其他文件内容，请使用 KnockAgent 专有的 `@(path)` 导入语法（见下文），**不要**使用 LiquidJS 内置的 `{% render %}` 或 `{% include %}` 标签。LiquidJS 的文件引入标签**不受支持** — 仅 `@(path)` 可用于文件导入。

### 提示词导入 — `@(path)`

你可以使用 `@(path)` 语法导入另一个 Markdown 文件的**内容**（仅正文，不包含 front matter）：

```markdown
---
name: agent_a
---

# Agent A 的指令

@(./shared_rules)

此处为额外的具体指令。
```

这会将 `shared_rules.md` 的正文内联到该位置。

#### 导入路径解析

| 路径格式 | 解析方式 |
|---|---|
| `@(./relative)` | 相对于当前文件 |
| `@(/absolute)` | 相对于 `rootDir` |

- `.md` 扩展名省略时会自动添加
- 循环导入会被检测并抛出错误
- 仅导入**内容**（Markdown 正文）— 被导入文件的 front matter 会被忽略

### 入口 Agent

KnockAgent 要求 `rootDir` 中必须有一个 **`main.md`** 文件作为 Agent 系统的入口。如果 `main.md` 不存在，构造函数将抛出错误。

---

## 🔧 API 参考

### `KnockAgent<Context, ProviderNames>`

加载并接线所有 Agent 的主类。

#### 构造函数

```typescript
new KnockAgent(config: KnockAgentConfig<ProviderNames>)
```

**`KnockAgentConfig<ProviderNames>`**：

| 属性 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `rootDir` | `string` | ✅ | 包含 Agent `.md` 文件的根目录 |
| `providers` | `Record<ProviderNames, AiProvider>` | ✅ | 供应商名称 → 供应商实例的映射 |
| `defaultModel` | `` `${ProviderNames}/${string}` `` | ✅ | 默认模型，格式为 `供应商/模型名` |
| `defaultTemperature` | `number` | ❌ | 默认温度（默认为 `1.0`） |
| `tools` | `Tool[]` | ❌ | 可供 Agent 使用的工具数组 |
| `fs` | `VirtualFS` | ❌ | 自定义文件系统实现（用于测试/嵌入） |

#### 方法

##### `getAgent(path: string): Agent<Context> | null`

根据相对于 `rootDir` 的文件路径获取（或惰性创建）Agent。

```typescript
const agent = knockAgent.getAgent("main");
const subAgent = knockAgent.getAgent("subfolder/helper");
```

### `createAiProvider(baseProvider, mapModelSettings?)`

辅助函数，将任意 AI SDK 供应商包装为 KnockAgent 兼容的 `AiProvider`。

```typescript
import { createAiProvider } from "knockagent";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

const providers = {
  openai: createAiProvider(openai),
  google: createAiProvider(google),
};
```

**参数**：

| 参数 | 类型 | 说明 |
|---|---|---|
| `baseProvider` | `BaseAiProvider` | 任意实现了 `languageModel(modelName: string)` 的对象（标准 AI SDK 供应商均满足） |
| `mapModelSettings` | `(settings: ModelSettings, modelName: string) => ModelSettings` | 可选函数，在将模型设置传递给模型前进行转换 |

### `VirtualFS`

可插拔文件系统接口。主要用于将 Agent 提示词定义直接嵌入到代码中，而非从磁盘文件读取。

```typescript
interface VirtualFS {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding?: BufferEncoding): string;
  statSync(path: string): { isFile(): boolean };
}
```

---

## 🤝 任务移交 vs Agent 作为工具

KnockAgent 支持两种多 Agent 协作模式：

### 任务移交（`handoffs` 字段）

任务移交将**控制权转移**给另一个 Agent。当 Agent 执行移交后，新 Agent 将完全接管对话。

```yaml
handoffs: translator, researcher
```

### Agent 作为工具（`agents` 字段）

在 `agents` 下声明的 Agent 被挂载为**可调用工具**。父 Agent 保持控制权，可以调用子 Agent 执行特定任务，并接收返回结果。

```yaml
agents: summarizer, fact_checker
```

子 Agent 工具将命名为 `agent_<name>`，并以子 Agent 的 `desc` 字段作为描述。

---

## 📂 项目结构示例

```
agents/
├── main.md              # 入口 Agent（必需）
├── researcher.md        # 移交目标
├── writer.md            # 移交目标
├── shared/
│   ├── rules.md         # 共享提示词片段
│   └── format.md        # 共享输出格式
└── tools/
    └── summarizer.md    # 作为工具的 Agent
```

在 `handoffs`、`agents` 或 `@(...)` 导入中使用的路径均相对于 `rootDir`：

```yaml
# 在 main.md 中
handoffs: researcher, writer
agents: tools/summarizer
```

```markdown
# 在 researcher.md 中
@(/shared/rules)
```

---

## 🧪 测试

运行内置测试套件：

```bash
pnpm test
```

---

## 📄 许可证

[MIT](./LICENSE)
