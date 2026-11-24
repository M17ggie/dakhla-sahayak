import { describe, expect, it } from "vitest";

import { parseFormAmount, parseFormCount, parseFormNumber } from "@/lib/parse";

describe("reading a number out of a form", () => {
  it("reads a plain number", () => {
    expect(parseFormNumber("65000")).toBe(65000);
    expect(parseFormNumber(" 1.5 ")).toBe(1.5);
    expect(parseFormNumber(42)).toBe(42);
  });

  it("returns nothing for an empty or absent field", () => {
    // Regression: a cleared field used to arrive as null, and Number(null) is 0,
    // which was accepted as a verified income of nothing.
    expect(parseFormNumber("")).toBeNull();
    expect(parseFormNumber("   ")).toBeNull();
    expect(parseFormNumber(null)).toBeNull();
    expect(parseFormNumber(undefined)).toBeNull();
  });

  it("refuses the things Number() would quietly accept", () => {
    expect(parseFormNumber("0x10")).toBeNull();
    expect(parseFormNumber("1e3")).toBeNull();
    expect(parseFormNumber("12 lakh")).toBeNull();
    expect(parseFormNumber("Infinity")).toBeNull();
    expect(parseFormNumber(NaN)).toBeNull();
  });

  it("does accept a genuine zero", () => {
    expect(parseFormNumber("0")).toBe(0);
  });
});

describe("a family count", () => {
  it("has to be a whole number of at least one person", () => {
    expect(parseFormCount("5")).toBe(5);
    expect(parseFormCount("0")).toBeNull();
    expect(parseFormCount("2.5")).toBeNull();
    expect(parseFormCount("-3")).toBeNull();
    expect(parseFormCount("")).toBeNull();
  });
});

describe("an amount of money", () => {
  it("rounds to the rupee and refuses a negative income", () => {
    expect(parseFormAmount("21000")).toBe(21000);
    expect(parseFormAmount("21000.6")).toBe(21001);
    expect(parseFormAmount("0")).toBe(0);
    expect(parseFormAmount("-1")).toBeNull();
    expect(parseFormAmount("")).toBeNull();
  });
});
