# KnockAgent

[中文文档](./README.zh_CN.md)

> **Configuration-over-convention** agent framework — define AI agents with Markdown files.

KnockAgent is built on top of the [`@openai/agents`](https://github.com/openai/openai-agents-js) framework. It lets you build complex multi-agent systems with minimal code — just write Markdown files with YAML front matter to define each agent's model, temperature, system prompt, tools, and collaboration behaviour. The framework reads these `.md` files and automatically wires everything together.

## ✨ Key Features

- 📝 **Markdown-as-Configuration** — Each agent is a `.md` file: front matter for settings, body for system prompt.
- 🔌 **Multi-Provider Support** — Supports a wide range of models via [Vercel AI SDK](https://ai-sdk.dev/) providers (OpenAI, Google, Anthropic, and more).
- 🧩 **Liquid Templates** — Use [LiquidJS](https://liquidjs.com/) template syntax in system prompts with full runtime context.
- 🤝 **Multi-Agent Collaboration** — Multiple agents can work together via delegation, task transfer, or tool invocation — all configured declaratively.
- 🛡️ **Type-Safe** — Written in TypeScript with full type inference for providers and models.
- 🧪 **VirtualFS** — Pluggable file-system interface, allowing you to embed agent definitions directly in code instead of reading from disk.

## 📦 Installation

```bash
npm install knockagent
# or
pnpm add knockagent
```

### Requirements

- Node.js `>=20.19.0` or `>=22.12.0`
- At least one [Vercel AI SDK provider](https://ai-sdk.dev/docs/foundations/providers-and-models) (e.g. `@ai-sdk/openai`)

## 🚀 Quick Start

### 1. Create project structure

```
my-project/
├── agents/
│   ├── main.md          # Entry agent (required)
│   └── translator.md    # Sub-agent
├── index.ts
└── package.json
```

### 2. Define agents in Markdown

**`agents/main.md`** — the entry agent (must be named `main.md`):

```markdown
---
name: main
desc: A helpful assistant that can translate text
model: openai/gpt-4o
temperature: 0.7
handoffs: translator
---

You are a helpful assistant. When the user asks you to translate text,
hand off the task to the translator agent.
```

**`agents/translator.md`** — a handoff target:

```markdown
---
name: translator
desc: Translates text between languages
model: openai/gpt-4o-mini
temperature: 0.3
---

You are a professional translator. Translate the user's text accurately
while preserving the original meaning and tone.
```

### 3. Wire it up in code

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

The `KnockAgent` instance exposes the built `@openai/agents` `Agent` object.  You can use the standard `Runner` API from `@openai/agents` to run conversations.

---

## 📖 Reference

### Agent Markdown File Format

Each agent is a Markdown file (`.md`) consisting of two parts:

```markdown
---
<YAML front matter – agent configuration>
---

<Markdown body – system prompt>
```

The **front matter** controls agent behaviour; the **body** becomes the system prompt (rendered through the Liquid template engine at runtime).

### Front Matter Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | File path as name | Display name of the agent |
| `desc` / `description` | `string` | `""` | Description shown when this agent is used as a handoff target or tool |
| `model` | `string` | `defaultModel` from config | Model identifier in `provider/model` format, e.g. `openai/gpt-4o` |
| `temperature` | `number` | `defaultTemperature` (default `1.0`) | Sampling temperature |
| `handoffs` | `string` (comma-separated) | – | Comma-separated list of agent paths to use as handoff targets |
| `agents` | `string` (comma-separated) | – | Comma-separated list of agent paths to mount as callable tools |
| `tools` | `string` (comma-separated) | – | Comma-separated list of tool names (must be registered via `KnockAgentConfig.tools`) |
| `reasoning_effort` | `"low"` \| `"medium"` \| `"high"` | – | Reasoning effort level (for supported models) |
| `reasoning_summary` | `string` | – | Reasoning summary configuration |
| `verbosity` | `string` | – | Text verbosity setting |
| `prefix` | `string` | – | Text prepended to every user message |
| `suffix` | `string` | – | Text appended to every user message |

#### Example: Full front matter

```yaml
---
name: researcher
desc: Researches topics using web search
model: openai/o4-mini
temperature: 0.5
handoffs: writer, reviewer
agents: summarizer
tools: search
reasoning_effort: medium
prefix: "Please research the following:"
suffix: "Provide sources for your claims."
---
```

### System Prompt (Markdown Body)

The Markdown body after the front matter is the agent's system prompt. It is processed through **LiquidJS** at runtime, meaning you can use template variables and filters.

#### Template Variables

The Liquid render context is the `RunContext.context` object you pass when running the agent. For example:

```markdown
---
name: greeter
---

Hello! You are assisting {{ username }}.

Today's tasks:
{% for task in tasks %}
- {{ task }}
{% endfor %}
```

#### Built-in Filters

| Filter | Description | Example |
|---|---|---|
| `json` | Serializes a value to JSON string | `{{ data \| json }}` |

All standard [LiquidJS filters](https://liquidjs.com/filters/overview.html) are also available.

> ⚠️ **Important:** To include content from other files, use KnockAgent's dedicated `@(path)` import syntax (described below) instead of LiquidJS's built-in `{% render %}` or `{% include %}` tags. The LiquidJS file-inclusion tags are **not supported** — only `@(path)` is recognized for file imports.

### Prompt Imports — `@(path)`

You can import the **content** (body only, not front matter) of another Markdown file using the `@(path)` syntax:

```markdown
---
name: agent_a
---

# Agent A Instructions

@(./shared_rules)

Additional specific instructions here.
```

This will inline the body of `shared_rules.md` at that position.

#### Import Path Resolution

| Path Format | Resolution |
|---|---|
| `@(./relative)` | Relative to the current file |
| `@(/absolute)` | Relative to the `rootDir` |

- The `.md` extension is automatically appended if omitted
- Circular imports are detected and will throw an error
- Only the **content** (Markdown body) is imported — front matter of the imported file is ignored

### Entry Agent

KnockAgent requires a **`main.md`** agent file in the `rootDir`. This is the entry point for the agent system. If `main.md` does not exist, the constructor will throw an error.

---

## 🔧 API Reference

### `KnockAgent<Context, ProviderNames>`

The main class that loads and wires all agents.

#### Constructor

```typescript
new KnockAgent(config: KnockAgentConfig<ProviderNames>)
```

**`KnockAgentConfig<ProviderNames>`**:

| Property | Type | Required | Description |
|---|---|---|---|
| `rootDir` | `string` | ✅ | Root directory containing agent `.md` files |
| `providers` | `Record<ProviderNames, AiProvider>` | ✅ | Map of provider name → provider instance |
| `defaultModel` | `` `${ProviderNames}/${string}` `` | ✅ | Default model in `provider/model` format |
| `defaultTemperature` | `number` | ❌ | Default temperature (defaults to `1.0`) |
| `tools` | `Tool[]` | ❌ | Array of tools available to agents |
| `fs` | `VirtualFS` | ❌ | Custom file-system implementation (for testing/embedding) |

#### Methods

##### `getAgent(path: string): Agent<Context> | null`

Retrieves (or lazily creates) an agent by its file path relative to `rootDir`.

```typescript
const agent = knockAgent.getAgent("main");
const subAgent = knockAgent.getAgent("subfolder/helper");
```

### `createAiProvider(baseProvider, mapModelSettings?)`

A helper function that wraps any AI SDK provider into a `KnockAgent`-compatible `AiProvider`.

```typescript
import { createAiProvider } from "knockagent";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

const providers = {
  openai: createAiProvider(openai),
  google: createAiProvider(google),
};
```

**Parameters**:

| Parameter | Type | Description |
|---|---|---|
| `baseProvider` | `BaseAiProvider` | Any object that implements `languageModel(modelName: string)` (standard AI SDK providers do) |
| `mapModelSettings` | `(settings: ModelSettings, modelName: string) => ModelSettings` | Optional function to transform model settings before they are passed to the model |

### `VirtualFS`

Interface for a pluggable file system. This is primarily designed for projects that prefer to embed agent prompt definitions directly in code rather than reading from disk files.

```typescript
interface VirtualFS {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding?: BufferEncoding): string;
  statSync(path: string): { isFile(): boolean };
}
```

---

## 🤝 Handoffs vs Agents-as-Tools

KnockAgent supports two patterns for multi-agent collaboration:

### Handoffs (`handoffs` field)

Handoffs **transfer control** from one agent to another. When an agent hands off, the new agent takes over the conversation entirely.

```yaml
handoffs: translator, researcher
```

### Agents-as-Tools (`agents` field)

Agents declared under `agents` are mounted as **callable tools**. The parent agent remains in control and can invoke the sub-agent to perform a specific task, receiving the result back.

```yaml
agents: summarizer, fact_checker
```

The sub-agent tool will be named `agent_<name>` and described with the sub-agent's `desc` field.

---

## 📂 Project Structure Example

```
agents/
├── main.md              # Entry agent (required)
├── researcher.md        # Handoff target
├── writer.md            # Handoff target
├── shared/
│   ├── rules.md         # Shared prompt fragment
│   └── format.md        # Shared output format
└── tools/
    └── summarizer.md    # Agent used as a tool
```

Each path used in `handoffs`, `agents`, or `@(...)` imports is relative to `rootDir`:

```yaml
# In main.md
handoffs: researcher, writer
agents: tools/summarizer
```

```markdown
# In researcher.md
@(/shared/rules)
```

---

## 🧪 Testing

Run the built-in test suite:

```bash
pnpm test
```

---

## 📄 License

[MIT](./LICENSE)
