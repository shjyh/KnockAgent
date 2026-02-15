import Loader, { VirtualFS } from "./Loader";
import { AiSdkModel } from "@openai/agents-extensions";
import { Agent, CallModelInputFilterArgs, ModelInputData, ModelSettings, Runner, Tool } from "@openai/agents";
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

function parseTemprature(t?: number | string) {
    if (typeof t === "number") return t;
    if (!t) return null;
    const n = Number.parseFloat(t);
    return Number.isNaN(n) ? null : n;
}

function split(list: string) {
    if (!list) return [];
    return list.split(",").map(l => l.trim()).filter(l => !!l);
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
    reasoningEffort?: ModelSettingsReasoningEffort;
    reasoningSummary?: ModelSettingsReasoning["summary"]
    verbosity?: ModelSettingsText["verbosity"];
    inputPrefix: string;
    inputSuffix: string;
}

export default class KnockAgent<Context extends object, ProviderNames extends string> {
    readonly #loader: Loader;
    readonly #providers: Record<ProviderNames, AiProvider>
    readonly #models: Map<string, AiSdkModelWithMapModelSettings>;
    readonly #runner: Runner;
    readonly #agents: Map<string, Agent<Context>>;
    readonly #agentsConfig: Map<Agent<Context>, AgentDefineConfig<ProviderNames>>;
    readonly #agent: Agent<Context>;
    readonly #defaultModel: `${ProviderNames}/${string}`;
    readonly #defaultTemperature: number;
    readonly #liquid: Liquid;
    readonly #tools: Map<string, Tool>;
    constructor(config: KnockAgentConfig<ProviderNames>) {
        // init fields
        this.#runner = new Runner({
            callModelInputFilter: this.#runnerModelInputFilter.bind(this)
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

        // create main agent
        const mainAgent = this.getAgent("main");
        if (!mainAgent) {
            throw new Error("[KnockAgent] Main Agent Not Exists");
        }
        this.#agent = mainAgent;
        if (config.tools && config.tools.length) {
            for (let tool of config.tools) {
                this.#tools.set(tool.name, tool);
            }
        }
    }
    #runnerModelInputFilter(input: CallModelInputFilterArgs): ModelInputData {
        const agentConfig = this.#agentsConfig.get(input.agent as any);
        if (!agentConfig || (!agentConfig.inputPrefix && !agentConfig.inputSuffix)) {
            return input.modelData;
        }
        const modelInput = input.modelData.input;
        const lastInput = modelInput[modelInput.length - 1];
        if (!lastInput) return input.modelData;

        if ("role" in lastInput && lastInput.role === "user") {
            let content = lastInput.content;
            if (agentConfig.inputPrefix) {
                content = agentConfig.inputPrefix + "\n\n" + content;
            }
            if (agentConfig.inputSuffix) {
                content = content + "\n\n" + agentConfig.inputSuffix;
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
    getAgent(path: string) {
        if (this.#agents.has(path)) {
            return this.#agents.get(path);
        }
        const agentMeta = this.#loader.getAgent(path);
        if (!agentMeta) {
            console.warn(`[KnockAgent] Agent Name [${path}] Not Found`);
            return null;
        }

        const agentDefineConfig: AgentDefineConfig<ProviderNames> = {
            name: agentMeta.data.name || path.replace(/\//g, "_"),
            desc: agentMeta.data.desc || agentMeta.data.description || "",
            model: agentMeta.data.model || this.#defaultModel,
            temperature: parseTemprature(agentMeta.data.temperature) || this.#defaultTemperature,
            instructions: agentMeta.content,
            handoffs: split(agentMeta.data.handoffs),
            agents: split(agentMeta.data.agents),
            tools: split(agentMeta.data.tools),
            inputPrefix: agentMeta.data.prefix || "",
            inputSuffix: agentMeta.data.suffix || ""
        }
        if (agentMeta.data.reasoning_effort) {
            agentDefineConfig.reasoningEffort = agentMeta.data.reasoning_effort;
        }
        if (agentMeta.data.reasoning_summary) {
            agentDefineConfig.reasoningSummary = agentMeta.data.reasoning_summary;
        }
        if (agentMeta.data.verbosity) {
            agentDefineConfig.verbosity = agentMeta.data.verbosity;
        }

        const modelSettings: ModelSettings = {
            temperature: agentDefineConfig.temperature
        }

        if (agentDefineConfig.reasoningEffort || agentDefineConfig.reasoningSummary) {
            modelSettings.reasoning = {};
            if (agentDefineConfig.reasoningEffort) {
                modelSettings.reasoning.effort = agentDefineConfig.reasoningEffort;
            }
            if (agentDefineConfig.reasoningSummary) {
                modelSettings.reasoning.summary = agentDefineConfig.reasoningSummary;
            }
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
            agent.handoffs = agentDefineConfig.handoffs.map(h => this.getAgent(h)).filter(a => !!a);
        }

        if (agentDefineConfig.agents.length || agentDefineConfig.tools.length) {
            agent.tools = [...agentDefineConfig.agents.map(h => this.getAgent(h)).filter(a => !!a).map(a => a.asTool({
                toolName: `agent_${a.name}`,
                toolDescription: a.handoffDescription,
            })), ...agentDefineConfig.tools.map(t => this.#tools.get(t)).filter(t => !!t)];
        }
        return agent;
    }
}