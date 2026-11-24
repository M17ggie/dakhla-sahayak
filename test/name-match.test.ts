import { describe, expect, it } from "vitest";

import { addressMentionsVillage, compareNames, jaroWinkler } from "@/lib/ai/name-match";
import { hasDevanagari, phoneticKey, toLatin } from "@/lib/ai/transliterate";

describe("transliteration", () => {
  it("drops the inherent vowel at the end of a word, as Marathi does", () => {
    expect(toLatin("गणेश")).toBe("ganesh");
    expect(toLatin("कदम")).toBe("kadam");
  });

  it("handles matras, conjuncts and the anusvara", () => {
    expect(toLatin("पाटील")).toBe("paatiil");
    expect(toLatin("शिंदे")).toBe("shinde");
    expect(toLatin("विठ्ठल")).toBe("viththal");
  });

  it("knows which strings carry Devanagari", () => {
    expect(hasDevanagari("गणेश")).toBe(true);
    expect(hasDevanagari("Ganesh")).toBe(false);
  });

  it("folds spelling variants that sound the same", () => {
    expect(phoneticKey("वैशाली")).toBe(phoneticKey("Waishali"));
    expect(phoneticKey("Patil")).toBe(phoneticKey("पाटील"));
    expect(phoneticKey("Shinde")).toBe(phoneticKey("शिंदे"));
    expect(phoneticKey("Ganesh")).not.toBe(phoneticKey("Ganpat"));
  });
});

describe("jaro-winkler", () => {
  it("is 1 for identical strings and 0 when one is empty", () => {
    expect(jaroWinkler("patil", "patil")).toBe(1);
    expect(jaroWinkler("", "patil")).toBe(0);
  });

  it("rewards a shared prefix", () => {
    expect(jaroWinkler("shinde", "shindey")).toBeGreaterThan(0.9);
  });
});

describe("comparing a name across documents", () => {
  it("matches the same name written in either script", () => {
    expect(compareNames("गणेश बाळू पाटील", "Ganesh Balu Patil").verdict).toBe("match");
    expect(compareNames("वैशाली सुभाष कुलकर्णी", "Vaishali Subhash Kulkarni").verdict).toBe(
      "match",
    );
  });

  it("ignores word order, because documents put the surname in different places", () => {
    expect(compareNames("Patil Ganesh Balu", "Ganesh Balu Patil").verdict).toBe("match");
  });

  it("ignores honorifics", () => {
    expect(compareNames("श्री. गणेश बाळू पाटील", "Ganesh Balu Patil").verdict).toBe("match");
    expect(compareNames("Smt. Asha Kadam", "आशा कदम").verdict).toBe("match");
  });

  it("accepts initials in place of a full middle name", () => {
    expect(compareNames("Ganesh Balu Patil", "G. B. Patil").verdict).toBe("match");
  });

  it("flags a different given name as a mismatch, not a spelling variation", () => {
    // The case this exists for: the 7/12 extract reads गणपत where Aadhaar reads गणेश.
    const result = compareNames("गणेश बाळू पाटील", "गणपत बाळू पाटील");
    expect(result.verdict).toBe("mismatch");
    expect(result.unmatched).toEqual(["ganesh"]);
  });

  it("treats a missing middle name as a variation worth a look, not a mismatch", () => {
    const result = compareNames("गणेश बाळू पाटील", "गणेश पाटील");
    expect(result.verdict).toBe("variation");
    expect(result.partOmitted).toBe(true);
  });

  it("reports a mismatch when one side has no usable name at all", () => {
    expect(compareNames("गणेश बाळू पाटील", "   ").verdict).toBe("mismatch");
  });
});

describe("matching an address to a village", () => {
  it("finds the village anywhere in a free-text address", () => {
    expect(addressMentionsVillage("मु.पो. माले, ता. मुळशी, जि. पुणे", "माले")).toBe(true);
    expect(addressMentionsVillage("घर क्र. ४२, माले, ता. मुळशी", "माले")).toBe(true);
  });

  it("matches across scripts", () => {
    expect(addressMentionsVillage("At Post Pirangut, Tal. Mulshi", "पिरंगुट")).toBe(true);
  });

  it("rejects an address in another village", () => {
    expect(addressMentionsVillage("मु.पो. वडगाव, ता. हवेली, जि. पुणे", "माले")).toBe(false);
  });
});
