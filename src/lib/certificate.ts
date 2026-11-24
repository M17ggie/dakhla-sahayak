/** Taluka code that appears in the certificate number. */
export const TALUKA_CODE = "MLS";

const YEAR_IN_IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

/**
 * `INC/2026/MLS/001031`.
 *
 * The year is taken in Asia/Kolkata, not in the server's zone. On a host running
 * UTC, an approval signed at 02:00 IST on 1 January would otherwise be numbered
 * against the previous year.
 */
export function certificateNumberFor(applicationNumber: string, decidedAt: Date): string {
  const year = YEAR_IN_IST.format(decidedAt);
  return `INC/${year}/${TALUKA_CODE}/${applicationNumber}`;
}
