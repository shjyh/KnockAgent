import { tool } from "@openai/agents";
import { z } from "zod";

export default function createSearchTool(providers: string[]) {
    return tool({
        name: "search",
        description: "Search the web for information",
        parameters: z.object({
            query: z.string().describe("The search query"),
            deep: z.boolean().optional().describe("Whether to perform a deep search").default(false)
        }),
        execute: async ({ query }) => {
            return `Search results for "${query}"`;
        }
    })
}