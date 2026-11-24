import { hasDevanagari, phoneticKey, toLatin } from "./transliterate";

/**
 * Comparing a name across two documents, in either script.
 *
 * The cases that actually come up at the counter:
 *   - the same name in Marathi on one paper and English on another
 *   - spelling variation (Vaishali / Waishali, Shinde / Shindey)
 *   - initials instead of a full middle name (G. B. Patil)
 *   - a missing middle name
 *   - a genuinely different person (गणपत where Aadhaar says गणेश)
 * Only the last of those is worth sending the citizen home for.
 */

/** Honorifics that carry no identity and appear inconsistently. */
const TITLES = [
  "shri", "shree", "sri", "smt", "smtt", "shrimati", "kum", "kumari",
  "mr", "mrs", "ms", "miss", "dr",
];

/**
 * Titles are matched phonetically as well as literally: श्री. transliterates to
 * "shrii", which is the same honorific but not the same string.
 */
const TITLE_FORMS = new Set([...TITLES, ...TITLES.map(phoneticKey)]);

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;

  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export type NameToken = {
  /** As written, for showing the user. */
  original: string;
  /** Latin form, lowercased. */
  latin: string;
  /** Phonetic key. */
  key: string;
  isInitial: boolean;
};

export function tokenize(name: string): NameToken[] {
  const latinised = hasDevanagari(name) ? toLatin(name) : name;

  return latinised
    .toLowerCase()
    .split(/[\s.,/]+/)
    .map((part) => part.replace(/[^a-z]/g, ""))
    .filter((part) => part.length > 0)
    .map((part) => ({
      original: part,
      latin: part,
      key: phoneticKey(part),
      isInitial: part.length === 1,
    }))
    .filter((token) => !TITLE_FORMS.has(token.latin) && !TITLE_FORMS.has(token.key));
}

/** A pair of tokens is the same name part when it sounds the same or is very close. */
function tokensAgree(a: NameToken, b: NameToken): number {
  if (a.isInitial || b.isInitial) {
    const initial = a.isInitial ? a : b;
    const full = a.isInitial ? b : a;
    return full.latin.startsWith(initial.latin) ? 0.95 : 0;
  }
  if (a.key && a.key === b.key) return 1;
  return Math.max(jaroWinkler(a.latin, b.latin), jaroWinkler(a.key, b.key));
}

export type NameVerdict = "match" | "variation" | "mismatch";

export type NameComparison = {
  verdict: NameVerdict;
  /** 0..1, the mean agreement over the paired tokens. */
  score: number;
  /** Tokens from the shorter name that found no counterpart, as written. */
  unmatched: string[];
  /** True when one name simply carries a part the other omits. */
  partOmitted: boolean;
};

/** A token pair at or above this is the same name part. */
const TOKEN_MATCH = 0.9;
/** Below this the pair is not a spelling variation, it is a different name. */
const TOKEN_NEAR = 0.82;

/**
 * Compare two names written in any mix of scripts. Word order does not matter,
 * because documents put the surname in different places.
 */
export function compareNames(left: string, right: string): NameComparison {
  const a = tokenize(left);
  const b = tokenize(right);

  if (!a.length || !b.length) {
    return { verdict: "mismatch", score: 0, unmatched: [], partOmitted: false };
  }

  // Pair each token of the shorter name with its best free counterpart.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const taken = new Set<number>();
  const scores: number[] = [];
  const unmatched: string[] = [];

  for (const token of short) {
    let best = 0;
    let bestIndex = -1;
    for (let i = 0; i < long.length; i++) {
      if (taken.has(i)) continue;
      const score = tokensAgree(token, long[i]);
      if (score > best) {
        best = score;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0 && best >= TOKEN_NEAR) {
      taken.add(bestIndex);
      scores.push(best);
    } else {
      unmatched.push(token.original);
      scores.push(best);
    }
  }

  const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const partOmitted = unmatched.length === 0 && long.length > short.length;
  const allStrong = scores.every((value) => value >= TOKEN_MATCH);

  let verdict: NameVerdict;
  if (unmatched.length > 0) {
    verdict = "mismatch";
  } else if (allStrong && !partOmitted) {
    verdict = "match";
  } else {
    verdict = "variation";
  }

  return { verdict, score: Math.round(score * 100) / 100, unmatched, partOmitted };
}

/**
 * Does an address belong to the given village? Addresses are free text written
 * by whoever filled the form, so this looks for the village name anywhere in it.
 */
export function addressMentionsVillage(address: string, village: string): boolean {
  const addressTokens = tokenize(address);
  const villageTokens = tokenize(village);
  if (!villageTokens.length) return true;

  return villageTokens.every((villageToken) =>
    addressTokens.some(
      (addressToken) =>
        (villageToken.key && villageToken.key === addressToken.key) ||
        jaroWinkler(villageToken.latin, addressToken.latin) >= TOKEN_MATCH,
    ),
  );
}
