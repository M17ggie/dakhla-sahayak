import { describe, expect, it } from "vitest";

import mr from "../messages/mr.json";
import en from "../messages/en.json";
import { ACTIONS } from "@/lib/workflow";
import { DOC_TYPES, OCCUPATIONS, PURPOSES, ROLES, STAGES } from "@/db/schema";

type Tree = Record<string, unknown>;

function leafKeys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? leafKeys(value as Tree, path)
      : [path];
  });
}

const mrKeys = leafKeys(mr as Tree);
const enKeys = leafKeys(en as Tree);

describe("the message catalogues", () => {
  it("have exactly the same keys, so no screen falls back silently", () => {
    expect([...enKeys].sort()).toEqual([...mrKeys].sort());
  });

  it("have no empty strings", () => {
    const values = Object.values(mr as Tree);
    expect(values.length).toBeGreaterThan(0);
    for (const key of mrKeys) {
      const value = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Tree)[part], mr);
      expect(String(value).trim(), key).not.toBe("");
    }
  });
});

describe("every code the logic can emit has wording", () => {
  it.each([
    ["action", ACTIONS],
    ["stage", STAGES],
    ["role", ROLES],
    ["docType", DOC_TYPES],
    ["occupation", OCCUPATIONS],
    ["purpose", PURPOSES],
  ])("covers every %s", (namespace, codes) => {
    for (const code of codes) {
      expect(mrKeys, `mr.${namespace}.${code}`).toContain(`${namespace}.${code}`);
      expect(enKeys, `en.${namespace}.${code}`).toContain(`${namespace}.${code}`);
    }
  });

  it("gives every finding both a title and a detail, plus a short label", () => {
    const findingCodes = mrKeys
      .filter((key) => key.startsWith("ai.finding.") && key.endsWith(".title"))
      .map((key) => key.split(".")[2]);

    expect(findingCodes.length).toBeGreaterThan(0);
    for (const code of findingCodes) {
      expect(mrKeys).toContain(`ai.finding.${code}.detail`);
      expect(mrKeys).toContain(`ai.findingLabel.${code}`);
    }
  });
});
