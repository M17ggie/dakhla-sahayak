import { describe, expect, it } from "vitest";

import {
  detectDocType,
  extractFields,
  normaliseDigits,
  parseAmount,
  parseLandArea,
} from "@/lib/ai/extract";
import samples from "@/db/fixtures/sample-documents.json";

function sample(key: string): string {
  const found = samples.find((entry) => entry.key === key);
  if (!found) throw new Error(`no sample document named ${key}`);
  return found.text;
}

describe("reading numbers off a document", () => {
  it("converts Devanagari digits", () => {
    expect(normaliseDigits("४८,०००")).toBe("48,000");
    expect(normaliseDigits("67 units")).toBe("67 units");
  });

  it("reads an amount however it is punctuated", () => {
    expect(parseAmount("₹ १,२०,०००/-")).toBe(120000);
    expect(parseAmount("Rs. 1,20,000")).toBe(120000);
    expect(parseAmount("23,800")).toBe(23800);
    expect(parseAmount("—")).toBeNull();
  });

  it("converts land area to hundredths of a hectare", () => {
    expect(parseLandArea("3.20 हे.आर.")).toBe(320);
    expect(parseLandArea("2 एकर")).toBe(81);
    expect(parseLandArea("20 गुंठे")).toBe(20);
    expect(parseLandArea("नाही")).toBeNull();
  });
});

describe("recognising the kind of document", () => {
  it("identifies each of the sample documents", () => {
    expect(detectDocType(sample("salary_slip"))).toBe("salary_slip");
    expect(detectDocType(sample("electricity_bill"))).toBe("electricity_bill");
    expect(detectDocType(sample("land_7_12"))).toBe("land_7_12");
    expect(detectDocType(sample("self_declaration"))).toBe("self_declaration");
    expect(detectDocType(sample("ration_card"))).toBe("ration_card");
  });

  it("says nothing rather than guessing on unrelated text", () => {
    expect(detectDocType("हा मजकूर कोणत्याही कागदपत्राचा नाही.")).toBeNull();
  });
});

describe("pulling the fields out", () => {
  it("reads the name and the net pay off a Marathi salary slip", () => {
    const fields = extractFields(sample("salary_slip"));
    expect(fields.docType).toBe("salary_slip");
    expect(fields.nameOnDocument).toBe("अनिल दत्तात्रय शिंदे");
    // The gross is on the slip too; the net is the one the label asks for.
    expect(fields.monthlyNetPay).toBe(23800);
    expect(fields.annualIncome).toBeNull();
  });

  it("reads the consumer and the address off an electricity bill", () => {
    const fields = extractFields(sample("electricity_bill"));
    expect(fields.nameOnDocument).toBe("दत्ता शिवाजी कांबळे");
    expect(fields.addressOnDocument).toContain("माले");
  });

  it("reads the holder, the area and the irrigation off a 7/12 extract", () => {
    const fields = extractFields(sample("land_7_12"));
    expect(fields.docType).toBe("land_7_12");
    expect(fields.nameOnDocument).toBe("गणपत बाळू पाटील");
    expect(fields.landAreaCentiHectares).toBe(320);
    expect(fields.irrigated).toBe(true);
  });

  it("reads the declared income off a self-declaration in Devanagari digits", () => {
    const fields = extractFields(sample("self_declaration"));
    expect(fields.nameOnDocument).toBe("रेखा संजय मोरे");
    expect(fields.annualIncome).toBe(36000);
    expect(fields.irrigated).toBeNull();
  });

  it("takes the value from the line below when the label stands alone", () => {
    const fields = extractFields("धारकाचे नाव\nसुनीता रमेश जाधव\nशिधापत्रिका");
    expect(fields.nameOnDocument).toBe("सुनीता रमेश जाधव");
  });

  it("returns empty fields rather than noise when nothing is recognised", () => {
    const fields = extractFields("~~~ |||  ???");
    expect(fields.nameOnDocument).toBeNull();
    expect(fields.monthlyNetPay).toBeNull();
    expect(fields.docType).toBeNull();
  });

  it("discards a one-glyph name, which is always OCR noise", () => {
    expect(extractFields("नाव : क").nameOnDocument).toBeNull();
  });
});
