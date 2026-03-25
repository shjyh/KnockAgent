// import { tool } from "@openai/agents";
// import { OpenRouter } from "@openrouter/sdk";
// import { z } from "zod";
// import OpenAI from "openai";

// function createOpenrouterSearch(apiKey: string, engine?: "exa" | "native") {
//     function getSearchDeep(headers?: HeadersInit) {
//         if (!headers) return "medium";
//         const h = new Headers(headers);
//         return h.get("x-search-deep") === "high" ? "high" : "medium"
//     }

//     function removeSearchDeep(headers?: HeadersInit) {
//         if (!headers) return;
//         if (Array.isArray(headers)) {
//             headers = headers.filter(h => h[0] !== "x-search-deep");
//         } else if (headers instanceof Headers) {
//             headers.delete("x-search-deep");
//         } else {
//             delete headers["x-search-deep"];
//         }
//     }

//     const openrouter = new OpenRouter({
//         apiKey,
//         hooks: [{
//             beforeCreateRequest(_, request) {
//                 if (request.options) {
//                     const body = request.options.body;
//                     if (body && typeof body === "string") {
//                         const json = JSON.parse(body);
//                         json.web_search_options = {
//                             "search_context_size": getSearchDeep(request.options.headers)
//                         }
//                         request.options.body = JSON.stringify(json);
//                     }
//                     removeSearchDeep(request.options.headers);
//                 }
//                 return request;
//             }
//         }]
//     });

//     return async function search(config: {
//         model: string;
//         query: string;
//         deep?: boolean;
//     }) {
//         const isPerplexity = config.model.toLowerCase().includes('perplexity');

//         const response = await openrouter.beta.responses.send({
//             openResponsesRequest: {
//                 model: config.model,
//                 instructions: "Please use a deep web search to find the user's question.",
//                 input: config.query,
//                 plugins: [{
//                     id: "web",
//                     enabled: true,
//                     engine: isPerplexity ? "native" : engine,
//                     maxResults: 5
//                 }]
//             }
//         }, {
//             headers: {
//                 "x-search-deep": config.deep ? "high" : "medium"
//             }
//         });

//         if (response.output.length && response.output[0].type === "message" && response.output[0].content.length) {
//             const content = response.output[0].content[0];
//             if (content.type === "output_text") {
//                 return content.text + "\n\n引用：\n\n" + content.annotations?.filter(a => a.type === "url_citation").map(a => `[${a.title}](${a.url})`).join("\n");
//             }
//         }

//         return null;
//     }

// }

// function createAliyunSearch(apiKey: string, agent?: boolean) {
//     const searchStrategy: [string, string] = agent ? ["agent", "agent_max"] : ["turbo", "max"];

//     return async function search(config: {
//         model: string;
//         query: string;
//         deep?: boolean;
//     }) {
//         const endpoint = (config.model.includes("qwen3.5") || config.model.includes("vl")) ? "multimodal-generation" : "text-generation";
//         const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/services/aigc/${endpoint}/generation`, {
//             method: "POST",
//             headers: {
//                 "Authorization": `Bearer ${apiKey}`,
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({
//                 model: config.model,
//                 input: {
//                     messages: [
//                         { role: "user", content: config.query }
//                     ]
//                 },
//                 parameters: {
//                     enable_search: true,
//                     search_options: {
//                         search_strategy: config.deep ? searchStrategy[1] : searchStrategy[0],
//                         enable_source: true,
//                         forced_search: true,
//                         enable_citation: true,
//                         citation_format: "[ref_<number>]"
//                     },
//                     result_format: "message"
//                 }
//             })
//         })
//         const data = await response.json();
//         if (data?.output?.choices?.length) {
//             const c = data.output.choices[0];
//             if (c.message) {
//                 let content = "";
//                 if (c.message.reasoning_content) {
//                     content += c.message.reasoning_content + "\n\n";
//                 }
//                 if (c.message.content) {
//                     content += c.message.content[0]?.text + "\n\n";
//                 }
//                 if (data.output.search_info?.search_results) {
//                     for (const result of data.output.search_info.search_results) {
//                         content += `ref_${result.index}: [${result.title}](${result.url})\n`;
//                     }
//                 }
//                 return content;
//             }
//         }
//         return null;
//     }
// }

// test baseURL https://ark.cn-beijing.volces.com/api/v3
// export function createVolcengineSearch(apiKey: string, baseURL: string) {
//     return async function search(config: {
//         model: string;
//         query: string;
//         deep?: boolean;
//     }) {
//         const response = await fetch(`${baseURL}/responses`, {
//             method: "POST",
//             headers: {
//                 "Authorization": `Bearer ${apiKey}`,
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({
//                 model: config.model,
//                 tools: [
//                     {
//                         type: "web_search",
//                         max_keyword: 3,
//                         sources: ["douyin", "moji", "toutiao"],
//                         limit: config.deep ? 20 : 10
//                     }
//                 ],
//                 max_tool_calls: config.deep ? 3 : 10,
//                 input: [
//                     {
//                         role: "user",
//                         content: config.query
//                     }
//                 ],
//                 instructions: "Please use a deep web search to find the user's question.\nA web search was conducted on `date`. Incorporate the following web search results into your response.\nIMPORTANT: Cite them using markdown links named using the domain of the source.\nExample: [nytimes.com](https://nytimes.com/some-page)."
//             })
//         });

//         console.log(await response.json());
//     }
// }

// @todo need test
// export function createMoonshotSearch(apiKey: string) {
//     const client = new OpenAI({
//         apiKey,
//         baseURL: "https://api.moonshot.cn/v1"
//     })

//     return async function (config: {
//         model: string;
//         query: string;
//         deep?: boolean;
//     }) {
//         let finishReason = null;
//         let content: string | null = null;
//         const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
//             { "role": "system", "content": "Please use a deep web search to find the user's question.\nA web search was conducted on `date`. Incorporate the following web search results into your response.\nIMPORTANT: Cite them using markdown links named using the domain of the source.\nExample: [nytimes.com](https://nytimes.com/some-page)." },
//             { "role": "user", "content": "please web search: " + config.query }  // 在提问中要求 Kimi 大模型联网搜索
//         ];
//         while (finishReason === null || finishReason === "tool_calls") {
//             const completion = await client.chat.completions.create({
//                 model: config.model,
//                 messages,
//                 temperature: 0.6,
//                 tools: [
//                     {
//                         // @ts-ignore
//                         "type": "builtin_function",
//                         "function": {
//                             "name": "$web_search",
//                         },
//                     }
//                 ],
//             });

//             const choice = completion.choices[0];
//             finishReason = choice.finish_reason;
//             if (finishReason === "tool_calls") {
//                 messages.push(choice.message);
//                 for (const toolCall of choice.message.tool_calls || []) {
//                     // @ts-ignore
//                     const tool_call_name = toolCall.function.name;
//                     if (tool_call_name == "$web_search") {
//                         // @ts-ignore
//                         const tool_call_arguments = JSON.parse(toolCall.function.arguments);
//                         messages.push({
//                             "role": "tool",
//                             "tool_call_id": toolCall.id,
//                             //@ts-ignore
//                             "name": tool_call_name,
//                             "content": JSON.stringify(tool_call_arguments)
//                         });
//                     }
//                 }
//             }
//             content = choice.message.content;
//             // console.log(choice.message.annotations);
//         }
//         return content;
//     }
// }

// export default function createSearchTool(config: {
//     openrouter?: {
//         apiKey: string;
//         engine?: "exa" | "native";
//         models: string[];
//     },
//     aliyun?: {
//         apiKey: string;
//         // agent模式只支持几个qwen系列模型，且不支持来源标注，详见：https://help.aliyun.com/zh/model-studio/web-search?spm=a2c4g.11186623.help-menu-2400256.d_0_2_0_10_1.3b1562e7N3yZdW#a852cbcd9bm88
//         agent?: boolean;
//         models: string[];
//     },
//     moonshot?: {
//         apiKey: string;
//         models: string[];
//     }
// }) {
//     const searchFns: ((query: string, deep?: boolean) => Promise<any>)[] = [];
//     if (config.openrouter) {
//         const openrouterSearch = createOpenrouterSearch(config.openrouter.apiKey, config.openrouter.engine);
//         for (const model of config.openrouter.models) {
//             searchFns.push((query, deep?) => openrouterSearch({
//                 model,
//                 query,
//                 deep
//             }));
//         }
//     }

//     if (config.aliyun) {
//         const aliyunSearch = createAliyunSearch(config.aliyun.apiKey, config.aliyun.agent);
//         for (const model of config.aliyun.models) {
//             searchFns.push((query, deep?) => aliyunSearch({
//                 model,
//                 query,
//                 deep
//             }));
//         }
//     }

//     if (config.moonshot) {
//         const moonshotSearch = createMoonshotSearch(config.moonshot.apiKey);
//         for (const model of config.moonshot.models) {
//             searchFns.push((query, deep?) => moonshotSearch({
//                 model,
//                 query,
//                 deep
//             }));
//         }
//     }

//     return tool({
//         name: "search",
//         description: "Search the web for information",
//         parameters: z.object({
//             query: z.string().describe("The search query"),
//             deep: z.boolean().optional().describe("Whether to perform a deep search").default(false)
//         }),
//         execute: async ({ query, deep }) => {
//             return await Promise.all(searchFns.map(fn => fn(query, deep)));
//         }
//     })
// }