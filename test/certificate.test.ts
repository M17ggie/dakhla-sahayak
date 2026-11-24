import { describe, expect, it } from "vitest";

import { certificateNumberFor } from "@/lib/certificate";
import { formatDate, formatDateNumeric, formatRupees, formatHectares } from "@/i18n/format";

describe("certificate numbering", () => {
  it("uses the taluka code and the application number", () => {
    expect(certificateNumberFor("001031", new Date("2026-11-24T12:00:00Z"))).toBe(
      "INC/2026/MLS/001031",
    );
  });

  it("takes the year in India, not in the server's zone", () => {
    // 01 January 2027, 02:00 IST, is 31 December 2026 in UTC. A certificate
    // signed then belongs to 2027.
    expect(certificateNumberFor("001031", new Date("2026-12-31T20:30:00Z"))).toBe(
      "INC/2027/MLS/001031",
    );
  });
});

describe("formatting for an Indian office", () => {
  it("groups rupees in lakhs with no paise", () => {
    expect(formatRupees(120000)).toBe("₹1,20,000");
    expect(formatRupees(21000)).toBe("₹21,000");
  });

  it("writes the month in the reading language with Latin digits", () => {
    const date = new Date("2026-11-24T12:00:00Z");
    expect(formatDate(date, "mr")).toBe("24 नोव्हेंबर 2026");
    expect(formatDate(date, "en")).toBe("24 November 2026");
  });

  it("uses the Indian calendar date on the certificate", () => {
    // 20:30 UTC is already the next day in India.
    expect(formatDateNumeric(new Date("2026-11-24T20:30:00Z"))).toBe("25/11/2026");
  });

  it("writes hectares without a pointless decimal", () => {
    expect(formatHectares(3)).toBe("3");
    expect(formatHectares(1.1)).toBe("1.1");
  });
});
