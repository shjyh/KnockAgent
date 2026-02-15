import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import matter, { type GrayMatterFile } from "gray-matter";

export interface VirtualFS {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding?: BufferEncoding): string;
    statSync(path: string): { isFile(): boolean };
}

export default class Loader {
    readonly #fs: VirtualFS;
    readonly #rootDir: string;
    readonly #parsedCache = new Map<string, GrayMatterFile<string>>();

    constructor(rootDir: string, fs?: VirtualFS) {
        this.#rootDir = path.resolve(rootDir);
        this.#fs = fs ?? {
            existsSync: (filePath: string) => existsSync(filePath),
            readFileSync: (filePath: string, encoding: BufferEncoding = "utf-8") => readFileSync(filePath, encoding),
            statSync: (filePath: string) => statSync(filePath)
        };
    }

    getAgent(name: string): GrayMatterFile<string> | undefined {
        try {
            const entryPath = this.#resolveEntryPath(name);
            return this.#parseFile(entryPath, new Set<string>());
        } catch (error) {
            console.warn(`[Loader] Failed to load agent "${name}":`, error);
            return undefined;
        }
    }

    #parseFile(filePath: string, visiting: Set<string>): GrayMatterFile<string> {
        const normalized = path.normalize(filePath);

        if (this.#parsedCache.has(normalized)) {
            return this.#parsedCache.get(normalized)!;
        }

        if (visiting.has(normalized)) {
            const cyclePath = [...visiting, normalized].join(" -> ");
            throw new Error(`Circular reference detected: ${cyclePath}`);
        }

        visiting.add(normalized);
        try {
            const source = this.#fs.readFileSync(normalized, "utf-8");
            const parsed = matter(source);
            const resolvedContent = this.#resolveImports(parsed.content, normalized, visiting);
            const resolvedPrompt: GrayMatterFile<string> = {
                ...parsed,
                content: resolvedContent
            };
            this.#parsedCache.set(normalized, resolvedPrompt);
            return resolvedPrompt;
        } finally {
            visiting.delete(normalized);
        }
    }

    #resolveImports(content: string, currentFilePath: string, visiting: Set<string>): string {
        const importRegex = /@\(([^)]+)\)/g;

        return content.replace(importRegex, (_full, importPath: string) => {
            const targetPath = this.#resolveImportPath(currentFilePath, importPath.trim());
            const importedPrompt = this.#parseFile(targetPath, visiting);
            return importedPrompt.content;
        });
    }

    #resolveEntryPath(name: string): string {
        const targetPath = path.resolve(this.#rootDir, name);
        return this.#resolveMarkdownPath(targetPath, this.#rootDir);
    }

    #resolveImportPath(fromFilePath: string, importPath: string): string {
        if (!importPath) {
            throw new Error("Import path cannot be empty");
        }

        let targetPath: string;
        if (path.isAbsolute(importPath)) {
            targetPath = path.resolve(this.#rootDir, `.${importPath}`);
        } else {
            targetPath = path.resolve(path.dirname(fromFilePath), importPath);
        }

        return this.#resolveMarkdownPath(targetPath, this.#rootDir);
    }

    #resolveMarkdownPath(targetPath: string, baseDir: string): string {
        let resolvedPath = targetPath;

        if (!resolvedPath.endsWith(".md")) {
            resolvedPath += ".md";
        }

        this.#assertWithin(baseDir, resolvedPath);
        this.#assertFileExists(resolvedPath);
        return resolvedPath;
    }

    #assertWithin(baseDir: string, filePath: string): void {
        const normalizedBase = path.resolve(baseDir);
        const normalizedTarget = path.resolve(filePath);
        const targetRelative = path.relative(normalizedBase, normalizedTarget);

        if (targetRelative === ".." || targetRelative.startsWith(`..${path.sep}`)) {
            throw new Error(`Path escapes base directory: ${filePath}`);
        }
    }

    #assertFileExists(filePath: string): void {
        if (!this.#fs.existsSync(filePath) || !this.#isFile(filePath)) {
            throw new Error(`Markdown file not found: ${filePath}`);
        }
    }

    #isFile(filePath: string): boolean {
        try {
            return this.#fs.statSync(filePath).isFile();
        } catch {
            return false;
        }
    }
}
