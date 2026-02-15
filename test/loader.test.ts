import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Loader from "../src/Loader";

interface FileMap {
  [filePath: string]: string;
}

function createVirtualFS(files: FileMap) {
  return {
    existsSync(filePath: string): boolean {
      return Object.prototype.hasOwnProperty.call(files, filePath);
    },
    readFileSync(filePath: string): string {
      const content = files[filePath];
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return content;
    },
    statSync(filePath: string): { isFile(): boolean } {
      if (!Object.prototype.hasOwnProperty.call(files, filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      return { isFile: () => true };
    }
  };
}

describe("Loader", () => {
  it("resolves dotted names by appending .md", () => {
    const loader = new Loader(
      "/workspace",
      createVirtualFS({
        "/workspace/aaa.xxx.md": [
          "---",
          "name: dotted",
          "---",
          "Dotted file name."
        ].join("\n")
      })
    );

    const agent = loader.getAgent("aaa.xxx");

    assert.ok(agent, "Agent should be defined");
    assert.equal(agent.data.name, "dotted");
    assert.match(agent.content, /Dotted file name\./);
  });

  it("loads front matter and resolves @(...) markdown imports with content only", () => {
    const loader = new Loader(
      "/workspace",
      createVirtualFS({
        "/workspace/demo.md": [
          "---",
          "name: demo",
          "version: 1",
          "---",
          "# Demo Agent",
          "",
          "@(./common)",
          "",
          "Done."
        ].join("\n"),
        "/workspace/common.md": [
          "---",
          "name: common",
          "---",
          "## Common Skill",
          "Shared section."
        ].join("\n")
      })
    );

    const agent = loader.getAgent("demo");

    assert.ok(agent, "Agent should be defined");
    assert.equal(agent.data.name, "demo");
    assert.equal(agent.data.version, 1);
    assert.match(agent.content, /# Demo Agent/);
    assert.match(agent.content, /## Common Skill/);
    assert.match(agent.content, /Shared section\./);
    assert.match(agent.content, /Done\./);
    assert.doesNotMatch(agent.content, /name: common/);
  });

  it("returns undefined when circular references are detected", () => {
    // Capture console.warn calls
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = () => { warnCalled = true; };

    const loader = new Loader(
      "/workspace",
      createVirtualFS({
        "/workspace/a.md": "@(./b)",
        "/workspace/b.md": "@(./a)"
      })
    );

    const agent = loader.getAgent("a");

    assert.equal(agent, undefined);
    assert.ok(warnCalled, "console.warn should have been called");

    // Restore console.warn
    console.warn = originalWarn;
  });
});
