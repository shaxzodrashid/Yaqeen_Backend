/**
 * Normalizes a phone number to standard international format (e.g. 998901234567).
 * Specifically handles Uzbekistan 9-digit local numbers by prefixing 998,
 * strips leading + or 00, and leaves only digits.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') {
    return '';
  }

  // Strip all non-numeric characters
  let digits = phone.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  // Strip leading international dial prefix '00' if present (e.g. 00998...)
  if (digits.startsWith('00998') && digits.length === 14) {
    digits = digits.slice(2);
  }

  // Uzbekistan 9-digit local mobile number (e.g. 901234567 -> 998901234567)
  if (digits.length === 9) {
    digits = `998${digits}`;
  } else if (
    digits.length === 10 &&
    (digits.startsWith('0') || digits.startsWith('8'))
  ) {
    // Some local formats use leading 0 or 8 (e.g. 0901234567 or 8901234567 -> 998901234567)
    digits = `998${digits.slice(1)}`;
  }

  return digits;
}

/**
 * Returns an array of phone number variations that might be stored in the database.
 * For Uzbekistan numbers, this includes both the 12-digit international format (998901234567),
 * formats with leading '+' (+998901234567), and local 9-digit formats (901234567).
 */
export function getPhoneVariants(phone: string | null | undefined): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>();
  variants.add(normalized);
  variants.add(`+${normalized}`);

  // If standard Uzbekistan 12-digit format, also include the 9-digit local format and prefixes
  if (normalized.length === 12 && normalized.startsWith('998')) {
    const local9 = normalized.slice(3);
    variants.add(local9);
    variants.add(`+${local9}`);
    variants.add(`0${local9}`);
    variants.add(`8${local9}`);
  } else if (normalized.length === 9) {
    variants.add(`998${normalized}`);
    variants.add(`+998${normalized}`);
  }

  // Also include the original raw digits and trimmed string if different
  if (phone) {
    const rawDigits = phone.replace(/\D/g, '');
    if (rawDigits) {
      variants.add(rawDigits);
      variants.add(`+${rawDigits}`);
    }
    const trimmed = phone.trim();
    if (trimmed) {
      variants.add(trimmed);
    }
  }

  return Array.from(variants);
}

/**
 * Formats a phone number for user-facing display (e.g. +998 90 123 45 67).
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';

  if (normalized.length === 12 && normalized.startsWith('998')) {
    const cc = normalized.slice(0, 3);
    const code = normalized.slice(3, 5);
    const p1 = normalized.slice(5, 8);
    const p2 = normalized.slice(8, 10);
    const p3 = normalized.slice(10, 12);
    return `+${cc} ${code} ${p1} ${p2} ${p3}`;
  }

  return `+${normalized}`;
}

/**
 * Helper to add phone/secondary_phone matching conditions to a Knex query builder
 * using regex digits stripping and SQL IN clause with parameters.
 */
export function buildPhoneMatchCondition(
  builder: any,
  variants: string[],
): void {
  if (!variants || variants.length === 0) {
    builder.whereRaw('1 = 0');
    return;
  }
  const digitVariants = Array.from(
    new Set(variants.map((v) => v.replace(/\D/g, '')).filter(Boolean)),
  );
  if (digitVariants.length === 0) {
    builder.whereRaw('1 = 0');
    return;
  }
  const placeholders = digitVariants.map(() => '?').join(', ');
  builder
    .whereRaw(
      `regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') IN (${placeholders})`,
      digitVariants,
    )
    .orWhereRaw(
      `regexp_replace(coalesce(secondary_phone, ''), '[^0-9]', '', 'g') IN (${placeholders})`,
      digitVariants,
    );
}
