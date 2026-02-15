import { ModelSettings } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions";
import { AiProvider, AiSdkModelWithMapModelSettings } from "./KnockAgent";

export interface BaseAiProvider {
    languageModel(modelName: string): Parameters<typeof aisdk>[0];
}

export interface MapModelSettings {
    (modelSettings: ModelSettings, modelName: string): ModelSettings;
}

export function createAiProvider(baseProvider: BaseAiProvider, mapModelSettings?: MapModelSettings): AiProvider {
    return {
        getModel(modelName: string) {
            const m = aisdk(baseProvider.languageModel(modelName)) as AiSdkModelWithMapModelSettings;
            if (mapModelSettings) {
                m.mapModelSettings = modelSettings => mapModelSettings(modelSettings, modelName);
            }
            return m;
        }
    }
}