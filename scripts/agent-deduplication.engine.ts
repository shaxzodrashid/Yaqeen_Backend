/**
 * Agent Deduplication & Intelligent Clustering Engine
 */

export interface RawAgentRecord {
  name: string;
  count: number;
  cargoIds?: string[];
  consolidationIds?: string[];
}

export interface ClusteredAgent {
  id?: string;
  canonicalName: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_names: string[];
  totalCargos: number;
  variations: { name: string; count: number }[];
  cargoIds: string[];
  consolidationIds: string[];
}

export class AgentDeduplicationEngine {
  private readonly similarityThreshold: number;

  private static readonly CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'yo',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
    ғ: 'g',
    қ: 'q',
    ҳ: 'h',
    ў: 'o',
  };

  private static readonly CORPORATE_NOISE_WORDS = new Set([
    'llc',
    'ltd',
    'limited',
    'corp',
    'corporation',
    'inc',
    'incorporated',
    'co',
    'company',
    'logistics',
    'cargo',
    'freight',
    'express',
    'transport',
    'trans',
    'lines',
    'shipping',
    'group',
    'intl',
    'international',
    'ooo',
    'mchj',
    'sp',
    'ip',
    'chp',
    'ao',
    'zao',
    'oao',
    'kargo',
    'logistika',
    'ekspress',
    'tashuvchi',
    'agent',
  ]);

  constructor(options?: { threshold?: number }) {
    this.similarityThreshold = options?.threshold ?? 0.88;
  }

  /**
   * Transliterate Cyrillic to Latin
   */
  transliterate(input: string): string {
    return input
      .toLowerCase()
      .split('')
      .map(
        (char) => AgentDeduplicationEngine.CYRILLIC_TO_LATIN_MAP[char] ?? char,
      )
      .join('');
  }

  /**
   * Split camelCase and PascalCase into separate words.
   * e.g. "TieTie" -> "Tie Tie", "tieTie" -> "tie Tie"
   */
  splitCamelCase(input: string): string {
    return input
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  }

  /**
   * Standardizes text with space normalization, transliteration, and separator cleaning.
   */
  normalizeText(input: string): string {
    if (!input) return '';
    let text = input.trim();
    text = this.transliterate(text);
    text = this.splitCamelCase(text);
    // Replace separators (-, _, /, \, ., ,, |, +) with spaces
    text = text.replace(/[-_./\\,+|()]/g, ' ');
    // Remove all non-alphanumeric characters except space
    text = text.replace(/[^a-z0-9\s]/g, '');
    // Collapse multiple spaces
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Generates alphanumeric slug with all punctuation and whitespace stripped.
   * "Tie Tie", "TieTie", "Tie tie", "tieTie", "tietie" ALL yield "tietie"!
   */
  toAlphanumericSlug(input: string): string {
    const normalized = this.normalizeText(input);
    return normalized.replace(/\s+/g, '').toLowerCase();
  }

  /**
   * Generates sorted tokens string.
   * e.g. "Silk Road Cargo" -> "cargo_road_silk"
   */
  toTokenSortKey(input: string): string {
    const normalized = this.normalizeText(input);
    const tokens = normalized
      .split(' ')
      .filter((t) => t.length > 0)
      .sort();
    return tokens.join('_');
  }

  /**
   * Generates entity core slug by removing corporate noise words.
   * e.g. "Tie Tie Logistics LLC" -> "tietie"
   */
  toEntityCoreSlug(input: string): string {
    const normalized = this.normalizeText(input);
    const tokens = normalized
      .split(' ')
      .filter(
        (t) =>
          t.length > 0 &&
          !AgentDeduplicationEngine.CORPORATE_NOISE_WORDS.has(t),
      );
    if (tokens.length === 0) {
      return this.toAlphanumericSlug(input);
    }
    return tokens.join('');
  }

  /**
   * Jaro-Winkler similarity calculation (0.0 to 1.0)
   */
  jaroWinklerSimilarity(s1: string, s2: string): number {
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const aMatches = new Array(a.length).fill(false);
    const bMatches = new Array(b.length).fill(false);

    let matches = 0;
    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, b.length);
      for (let j = start; j < end; j++) {
        if (bMatches[j]) continue;
        if (a[i] !== b[j]) continue;
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMatches[i]) continue;
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }

    const m = matches;
    const jaro =
      (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3.0;

    // Winkler prefix adjustment
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
      if (a[i] === b[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1.0 - jaro);
  }

  /**
   * Levenshtein Distance
   */
  levenshteinDistance(s1: string, s2: string): number {
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Determines if two agent strings represent the same agent entity.
   */
  areSameAgent(
    name1: string,
    name2: string,
  ): { match: boolean; score: number; reason: string } {
    if (!name1 || !name2)
      return { match: false, score: 0, reason: 'Empty string' };

    const t1 = name1.trim();
    const t2 = name2.trim();

    // 1. Exact string match (case-insensitive)
    if (t1.toLowerCase() === t2.toLowerCase()) {
      return {
        match: true,
        score: 1.0,
        reason: 'Exact case-insensitive match',
      };
    }

    // 2. Alphanumeric core match
    // E.g. "Tie Tie" vs "TieTie" vs "tietie" vs "tie-tie"
    const slug1 = this.toAlphanumericSlug(t1);
    const slug2 = this.toAlphanumericSlug(t2);
    if (slug1.length > 0 && slug1 === slug2) {
      return { match: true, score: 0.99, reason: 'Alphanumeric pattern match' };
    }

    // 3. Token Sort match (reordered words)
    // E.g. "Silk Road Cargo" vs "Cargo Silk Road"
    const tokenKey1 = this.toTokenSortKey(t1);
    const tokenKey2 = this.toTokenSortKey(t2);
    if (tokenKey1.length > 0 && tokenKey1 === tokenKey2) {
      return { match: true, score: 0.98, reason: 'Token reordering match' };
    }

    // 4. Entity core match (stripped corporate words)
    // E.g. "Tie Tie Logistics" vs "Tie Tie"
    const core1 = this.toEntityCoreSlug(t1);
    const core2 = this.toEntityCoreSlug(t2);
    if (core1.length >= 3 && core1 === core2) {
      return {
        match: true,
        score: 0.95,
        reason: 'Corporate entity core match',
      };
    }

    // 5. Fuzzy Jaro-Winkler & Levenshtein on slugs
    if (slug1.length >= 4 && slug2.length >= 4) {
      const jw = this.jaroWinklerSimilarity(slug1, slug2);
      const lev = this.levenshteinDistance(slug1, slug2);
      const maxLen = Math.max(slug1.length, slug2.length);

      if (
        jw >= this.similarityThreshold ||
        (lev <= 1 && maxLen >= 5) ||
        (lev <= 2 && maxLen >= 8)
      ) {
        return {
          match: true,
          score: jw,
          reason: `Fuzzy similarity (JW: ${jw.toFixed(2)}, Lev: ${lev})`,
        };
      }
    }

    return { match: false, score: 0, reason: 'Different entities' };
  }

  private static readonly KNOWN_ACRONYMS = new Set([
    'llc',
    'ltd',
    'inc',
    'corp',
    'ooo',
    'mchj',
    'sp',
    'ip',
    'chp',
    'ao',
    'zao',
    'oao',
    'cny',
    'usd',
    'uzs',
    'rub',
    'rmb',
    'ftl',
    'ltl',
  ]);

  /**
   * Formats a raw string into proper Title Case while preserving uppercase acronyms.
   * e.g. "tietie" -> "Tietie", "tie tie" -> "Tie Tie", "llc" -> "LLC"
   */
  toTitleCase(input: string): string {
    if (!input) return '';
    const split = this.splitCamelCase(input);
    return split
      .split(/[\s-_]+/)
      .filter((w) => w.length > 0)
      .map((w) => {
        const lower = w.toLowerCase();
        if (AgentDeduplicationEngine.KNOWN_ACRONYMS.has(lower)) {
          return lower.toUpperCase();
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Intelligently selects the best canonical name among all cluster variations.
   */
  pickCanonicalName(variations: { name: string; count: number }[]): string {
    if (variations.length === 0) return 'Unnamed Agent';
    if (variations.length === 1) {
      const single = variations[0].name.trim();
      // If it has no spaces and mixed case like "TieTie", split to "Tie Tie"
      const splitted = this.splitCamelCase(single);
      return this.toTitleCase(splitted);
    }

    let bestScore = -1;
    let bestName = variations[0].name;

    for (const v of variations) {
      const raw = v.name.trim();
      let score = v.count * 2;

      // Has spaces between words
      if (raw.includes(' ')) score += 10;
      // Mixed upper and lower (proper TitleCase)
      if (/[A-Z]/.test(raw) && /[a-z]/.test(raw)) score += 8;
      // All uppercase is less preferred than Title Case
      if (raw === raw.toUpperCase() && raw.length > 3) score -= 3;
      // All lowercase is least preferred
      if (raw === raw.toLowerCase()) score -= 5;
      // Avoid excessive punctuation
      if (/[_.-]/.test(raw)) score -= 2;

      if (score > bestScore) {
        bestScore = score;
        bestName = raw;
      }
    }

    const splitted = this.splitCamelCase(bestName);
    return this.toTitleCase(splitted);
  }

  /**
   * Extracts first_name, last_name, and company_name from canonical name and cluster variations.
   */
  extractAgentFields(
    canonicalName: string,
    variations: string[],
  ): {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    company_names: string[];
  } {
    const cleanLower = canonicalName.toLowerCase();

    // Check if canonical or any variation contains company keywords
    const isCompany = Array.from(
      AgentDeduplicationEngine.CORPORATE_NOISE_WORDS,
    ).some((keyword) => {
      // Avoid matching sub-words like 'agent' unless standalone
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return (
        regex.test(cleanLower) ||
        variations.some((v) => regex.test(v.toLowerCase()))
      );
    });

    // Extract potential parenthesized company name: e.g. "Tie Tie (Silk Road)"
    const parenMatch = canonicalName.match(/^([^(]+)\s*\(([^)]+)\)$/);
    if (parenMatch) {
      const personPart = parenMatch[1].trim();
      const compPart = parenMatch[2].trim();
      const pWords = personPart.split(/\s+/);
      return {
        first_name: pWords[0] || null,
        last_name: pWords.slice(1).join(' ') || null,
        company_name: compPart || null,
        company_names: compPart ? [compPart] : [],
      };
    }

    if (isCompany) {
      const companyNames = Array.from(
        new Set([canonicalName, ...variations.map((v) => this.toTitleCase(v))]),
      );
      return {
        first_name: null,
        last_name: null,
        company_name: canonicalName,
        company_names: companyNames,
      };
    }

    // Person name: split into first and last
    const words = canonicalName.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return {
        first_name: words[0],
        last_name: words.slice(1).join(' '),
        company_name: null,
        company_names: [],
      };
    }

    return {
      first_name: words[0] || canonicalName,
      last_name: null,
      company_name: null,
      company_names: [],
    };
  }

  /**
   * Clusters a collection of raw agent name records into deduplicated Agent groups.
   */
  clusterAgentRecords(records: RawAgentRecord[]): ClusteredAgent[] {
    const clusters: {
      canonicalKey: string;
      variations: { name: string; count: number }[];
      cargoIds: string[];
      consolidationIds: string[];
      totalCargos: number;
    }[] = [];

    for (const record of records) {
      const rawName = (record.name || '').trim();
      if (!rawName) continue;

      let matchedCluster: (typeof clusters)[0] | null = null;

      for (const cluster of clusters) {
        // Test against all existing variations in this cluster
        for (const existing of cluster.variations) {
          const matchResult = this.areSameAgent(rawName, existing.name);
          if (matchResult.match) {
            matchedCluster = cluster;
            break;
          }
        }
        if (matchedCluster) break;
      }

      if (matchedCluster) {
        matchedCluster.variations.push({ name: rawName, count: record.count });
        matchedCluster.totalCargos += record.count;
        if (record.cargoIds) matchedCluster.cargoIds.push(...record.cargoIds);
        if (record.consolidationIds)
          matchedCluster.consolidationIds.push(...record.consolidationIds);
      } else {
        clusters.push({
          canonicalKey: this.toAlphanumericSlug(rawName),
          variations: [{ name: rawName, count: record.count }],
          cargoIds: record.cargoIds ? [...record.cargoIds] : [],
          consolidationIds: record.consolidationIds
            ? [...record.consolidationIds]
            : [],
          totalCargos: record.count,
        });
      }
    }

    // Convert clusters into final ClusteredAgent definitions
    return clusters.map((c) => {
      const canonicalName = this.pickCanonicalName(c.variations);
      const fields = this.extractAgentFields(
        canonicalName,
        c.variations.map((v) => v.name),
      );

      return {
        canonicalName,
        first_name: fields.first_name,
        last_name: fields.last_name,
        company_name: fields.company_name,
        company_names: fields.company_names,
        totalCargos: c.totalCargos,
        variations: c.variations,
        cargoIds: Array.from(new Set(c.cargoIds)),
        consolidationIds: Array.from(new Set(c.consolidationIds)),
      };
    });
  }
}
