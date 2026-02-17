import Loader, { VirtualFS } from "./Loader.ts";
import { AiSdkModel } from "@openai/agents-extensions";
import { Agent, CallModelInputFilterArgs, ModelInputData, ModelSettings, Runner, setTracingDisabled, Tool } from "@openai/agents";
import { promptWithHandoffInstructions } from "@openai/agents-core/extensions";
import { ModelSettingsReasoningEffort, ModelSettingsReasoning, ModelSettingsText } from "@openai/agents-core/model";
import { Liquid } from "liquidjs";

export type AiSdkModelWithMapModelSettings = AiSdkModel & {
    mapModelSettings?(modelSetting: ModelSettings): ModelSettings
}

export interface AiProvider {
    getModel(modelName: string): AiSdkModelWithMapModelSettings;
}

export interface KnockAgentConfig<ProviderNames extends string> {
    rootDir: string;
    fs?: VirtualFS;
    providers: Record<ProviderNames, AiProvider>;
    defaultModel: `${ProviderNames}/${string}`;
    defaultTemperature?: number;
    tools?: Tool[];
}

function parseTemprature(t?: any) {
    if (typeof t === "number") return t;
    if (typeof t === "string") {
        const n = Number.parseFloat(t);
        return Number.isNaN(n) ? null : n;
    }
    return null;
}

function split(list: any): string[] {
    if (Array.isArray(list)) return list.map(item => String(item));
    if (typeof list === "string") {
        return list.split(",").map(l => l.trim()).filter(l => !!l);
    }
    return [];
}

interface AgentDefineConfig<ProviderNames extends string> {
    name: string;
    desc: string;
    model: `${ProviderNames}/${string}`;
    temperature: number;
    instructions: string;
    handoffs: string[];
    agents: string[];
    tools: string[];
    reasoning?: {
        effort?: ModelSettingsReasoningEffort;
        summary?: ModelSettingsReasoning["summary"]
    }
    verbosity?: ModelSettingsText["verbosity"];
    input?: {
        prefix?: string;
        suffix?: string;
    }
}

type RunInput<T> = Parameters<typeof Runner.prototype.run<Agent<T>, T>>[1];

setTracingDisabled(true);

export default class KnockAgent<Context extends object, ProviderNames extends string> {
    readonly #loader: Loader;
    readonly #providers: Record<ProviderNames, AiProvider>
    readonly #models: Map<string, AiSdkModelWithMapModelSettings>;
    readonly #runner: Runner;
    readonly #agents: Map<string, Agent<Context>>;
    readonly #agentsConfig: Map<Agent<Context>, AgentDefineConfig<ProviderNames>>;
    readonly #defaultModel: `${ProviderNames}/${string}`;
    readonly #defaultTemperature: number;
    readonly #liquid: Liquid;
    readonly #tools: Map<string, Tool>;
    constructor(config: KnockAgentConfig<ProviderNames>) {
        // init fields
        this.#runner = new Runner({
            callModelInputFilter: this.#runnerModelInputFilter.bind(this),
            tracingDisabled: true
        })
        this.#liquid = new Liquid({
            strictFilters: true,
            strictVariables: true,
        });
        this.#liquid.registerFilter("json", (v: any) => JSON.stringify(v));
        this.#agentsConfig = new Map();
        this.#agents = new Map();
        this.#models = new Map();
        this.#tools = new Map();
        this.#loader = new Loader(config.rootDir, config.fs);
        this.#defaultModel = config.defaultModel;
        this.#defaultTemperature = config.defaultTemperature || 1.0;

        this.#providers = config.providers;

        if (config.tools && config.tools.length) {
            for (let tool of config.tools) {
                this.#tools.set(tool.name, tool);
            }
        }
    }
    #runnerModelInputFilter(input: CallModelInputFilterArgs): ModelInputData {
        const agentConfig = this.#agentsConfig.get(input.agent as any);
        if (!agentConfig || !agentConfig.input || (!agentConfig.input.prefix && !agentConfig.input.suffix)) {
            return input.modelData;
        }
        const modelInput = input.modelData.input;
        const lastInput = modelInput[modelInput.length - 1];
        if (!lastInput) return input.modelData;

        if ("role" in lastInput && lastInput.role === "user") {
            let content = lastInput.content;
            if (agentConfig.input.prefix) {
                content = agentConfig.input.prefix + "\n\n" + content;
            }
            if (agentConfig.input.suffix) {
                content = content + "\n\n" + agentConfig.input.suffix;
            }
            return {
                instructions: input.modelData.instructions,
                input: [...modelInput.slice(0, modelInput.length - 1), {
                    role: "user",
                    content: content
                }]
            }
        }
        return input.modelData;
    }
    #getModel(model: `${ProviderNames}/${string}` = this.#defaultModel, agentName: string) {
        if (this.#models.has(model)) {
            return this.#models.get(model)!;
        }
        const m = model.split("/");
        const provider = m.shift() as ProviderNames;
        const providerModel = m.join("/");
        if (!this.#providers[provider]) {
            throw new Error(`[KnockAgent] No Provider [${provider}] in agent [${agentName}]`)
        }
        const aiModel = this.#providers[provider].getModel(providerModel);
        this.#models.set(model, aiModel);
        return aiModel;
    }
    #getAgent(path: string) {
        if (this.#agents.has(path)) {
            return this.#agents.get(path);
        }
        const agentMeta = this.#loader.getAgent(path);
        if (!agentMeta) {
            console.warn(`[KnockAgent] Agent Name [${path}] Not Found`);
            return null;
        }

        const data = agentMeta.data;

        // Validation and Warnings
        const warn = (field: string, expected: string, actual: any) => {
            console.warn(`[KnockAgent] Agent [${path}] property "${field}" should be ${expected}, got ${typeof actual}`);
        };

        if (data.name !== undefined && typeof data.name !== "string") warn("name", "string", data.name);
        if (data.model !== undefined && typeof data.model !== "string") warn("model", "string", data.model);
        if (data.temperature !== undefined && typeof data.temperature !== "number" && typeof data.temperature !== "string") warn("temperature", "number or string", data.temperature);

        ["handoffs", "agents", "tools"].forEach(key => {
            if (data[key] !== undefined && typeof data[key] !== "string" && !Array.isArray(data[key])) {
                warn(key, "string or array", data[key]);
            }
        });

        if (data.reasoning !== undefined) {
            if (typeof data.reasoning !== "object" || data.reasoning === null) {
                warn("reasoning", "object", data.reasoning);
            } else {
                const r = data.reasoning as any;
                if (r.effort !== undefined && typeof r.effort !== "string") warn("reasoning.effort", "string", r.effort);
                if (r.summary !== undefined && typeof r.summary !== "string") warn("reasoning.summary", "string ('auto' | 'concise' | 'detailed')", r.summary);
            }
        }
        if (data.input !== undefined) {
            if (typeof data.input !== "object" || data.input === null) {
                warn("input", "object", data.input);
            } else {
                const i = data.input as any;
                if (i.prefix !== undefined && typeof i.prefix !== "string") warn("input.prefix", "string", i.prefix);
                if (i.suffix !== undefined && typeof i.suffix !== "string") warn("input.suffix", "string", i.suffix);
            }
        }

        if (data.verbosity !== undefined && typeof data.verbosity !== "string") warn("verbosity", "string", data.verbosity);

        const agentDefineConfig: AgentDefineConfig<ProviderNames> = {
            name: (typeof data.name === "string" ? data.name : "") || path.replace(/\//g, "_"),
            desc: (typeof data.desc === "string" ? data.desc : (typeof data.description === "string" ? data.description : "")) || "",
            model: (typeof data.model === "string" ? data.model : this.#defaultModel) as `${ProviderNames}/${string}`,
            temperature: parseTemprature(data.temperature) ?? this.#defaultTemperature,
            instructions: agentMeta.content,
            handoffs: split(data.handoffs),
            agents: split(data.agents),
            tools: split(data.tools),
        }

        if (typeof data.reasoning === "object" && data.reasoning !== null) {
            agentDefineConfig.reasoning = data.reasoning;
        }

        if (data.verbosity) {
            agentDefineConfig.verbosity = data.verbosity;
        }

        if (typeof data.input === "object" && data.input !== null) {
            agentDefineConfig.input = data.input;
        }

        const modelSettings: ModelSettings = {
            temperature: agentDefineConfig.temperature
        }

        if (agentDefineConfig.reasoning) {
            modelSettings.reasoning = agentDefineConfig.reasoning;
        }

        if (agentDefineConfig.verbosity) {
            modelSettings.text = { verbosity: agentDefineConfig.verbosity };
        }

        const model = this.#getModel(agentDefineConfig.model, path);

        const agent = new Agent<Context>({
            name: agentDefineConfig.name,
            handoffDescription: agentDefineConfig.desc,
            model,
            modelSettings: model.mapModelSettings ? model.mapModelSettings(modelSettings) : modelSettings,
            instructions: async (runContext) => {
                const rawPrompt = await this.#liquid.parseAndRender(agentDefineConfig.instructions, runContext.context);
                if (agentDefineConfig.handoffs.length) {
                    return promptWithHandoffInstructions(rawPrompt);
                }
                return rawPrompt;
            }
        })
        this.#agents.set(path, agent);
        this.#agentsConfig.set(agent, agentDefineConfig);

        if (agentDefineConfig.handoffs.length) {
            agent.handoffs = agentDefineConfig.handoffs.map(h => this.#getAgent(h)).filter(a => !!a);
        }

        if (agentDefineConfig.agents.length || agentDefineConfig.tools.length) {
            agent.tools = [...agentDefineConfig.agents.map(h => this.#getAgent(h)).filter(a => !!a).map(a => a.asTool({
                toolName: `agent_${a.name}`,
                toolDescription: a.handoffDescription,
            })), ...agentDefineConfig.tools.map(t => this.#tools.get(t)).filter(t => !!t)];
        }
        return agent;
    }

    run(input: RunInput<Context>, context: Context = {} as Context) {
        return this.runAgent("main", input, context);
    }

    runAgent(agentPath: string, input: RunInput<Context>, context: Context = {} as Context) {
        const agent = this.#getAgent(agentPath);
        if (!agent) {
            throw new Error(`[KnockAgent] Agent [${agentPath}] Not Exists`);
        }
        return this.#runner.run(agent, input, {
            context,
            stream: true
        });
    }
}