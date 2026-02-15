import { ModelSettings } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions";
import { AiProvider, AiSdkModelWithMapModelSettings } from "./KnockAgent.ts";

export interface BaseAiProvider {
    languageModel(modelName: string): Parameters<typeof aisdk>[0];
}

export interface MapModelSettings {
    (modelSettings: ModelSettings, modelName: string): ModelSettings;
}

/**
 * A utility to handle values that might be promises.
 * If the value is a promise, it waits for it and then applies the function.
 * If it's not a promise, it applies the function immediately.
 */
function withPotentialPromise<T, R>(
    value: T | Promise<T>,
    callback: (resolvedValue: T) => R
): R | Promise<R> {
    if (value instanceof Promise || (value && typeof (value as any).then === "function")) {
        return (value as Promise<T>).then(callback);
    }
    return callback(value as T);
}

export function createAiProvider(
    baseProvider: BaseAiProvider,
    mapModelSettings?: MapModelSettings
): AiProvider {
    return {
        getModel(modelName: string) {
            const model = baseProvider.languageModel(modelName);

            // Intercept getArgs to support passing extra body parameters through settings.extra
            if (model && "getArgs" in model && typeof (model as any).getArgs === "function") {
                const originalGetArgs = (model as any).getArgs;

                (model as any).getArgs = function (settings: any, ...args: any[]) {
                    const result = originalGetArgs.apply(this, [settings, ...args]);

                    return withPotentialPromise(result, (rawArgs: any) => {
                        if (settings?.extra && rawArgs?.body) {
                            rawArgs.body = {
                                ...rawArgs.body,
                                ...settings.extra,
                            };
                        }
                        return rawArgs;
                    });
                };
            }

            const aiSdkModel = aisdk(model) as AiSdkModelWithMapModelSettings;

            if (mapModelSettings) {
                aiSdkModel.mapModelSettings = (modelSettings) =>
                    mapModelSettings(modelSettings, modelName);
            }

            return aiSdkModel;
        },
    };
}