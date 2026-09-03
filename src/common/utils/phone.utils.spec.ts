import {
  normalizePhone,
  getPhoneVariants,
  formatPhoneDisplay,
  buildPhoneMatchCondition,
} from './phone.utils';

describe('PhoneUtils', () => {
  describe('normalizePhone', () => {
    it('should normalize 9-digit local Uzbekistan numbers by prepending 998', () => {
      expect(normalizePhone('901234567')).toBe('998901234567');
      expect(normalizePhone('931112233')).toBe('998931112233');
    });

    it('should normalize international Uzbekistan numbers with leading +', () => {
      expect(normalizePhone('+998901234567')).toBe('998901234567');
    });

    it('should normalize numbers with spaces, dashes, brackets', () => {
      expect(normalizePhone('+998 (90) 123-45-67')).toBe('998901234567');
      expect(normalizePhone('(90) 123 45 67')).toBe('998901234567');
    });

    it('should strip leading international prefix 00 for 00998', () => {
      expect(normalizePhone('00998901234567')).toBe('998901234567');
    });

    it('should normalize 10-digit numbers starting with 0 or 8 (trunk prefixes)', () => {
      expect(normalizePhone('0901234567')).toBe('998901234567');
      expect(normalizePhone('8901234567')).toBe('998901234567');
    });

    it('should keep other international numbers intact as digits', () => {
      expect(normalizePhone('+7 (999) 123-45-67')).toBe('79991234567');
    });

    it('should return empty string for null, undefined, or empty string', () => {
      expect(normalizePhone(null)).toBe('');
      expect(normalizePhone(undefined)).toBe('');
      expect(normalizePhone('')).toBe('');
      expect(normalizePhone('   ')).toBe('');
    });
  });

  describe('getPhoneVariants', () => {
    it('should generate both 12-digit and 9-digit variants and + prefixes for Uzbekistan numbers', () => {
      const variants = getPhoneVariants('+998901234567');
      expect(variants).toContain('998901234567');
      expect(variants).toContain('+998901234567');
      expect(variants).toContain('901234567');
      expect(variants).toContain('+901234567');
    });

    it('should generate both variants from 9-digit input', () => {
      const variants = getPhoneVariants('901234567');
      expect(variants).toContain('998901234567');
      expect(variants).toContain('+998901234567');
      expect(variants).toContain('901234567');
      expect(variants).toContain('0901234567');
    });

    it('should return empty array for empty input', () => {
      expect(getPhoneVariants('')).toEqual([]);
      expect(getPhoneVariants(null)).toEqual([]);
      expect(getPhoneVariants(undefined)).toEqual([]);
    });
  });

  describe('formatPhoneDisplay', () => {
    it('should format 12-digit Uzbekistan numbers cleanly', () => {
      expect(formatPhoneDisplay('998901234567')).toBe('+998 90 123 45 67');
    });

    it('should format other numbers with leading +', () => {
      expect(formatPhoneDisplay('79991234567')).toBe('+79991234567');
    });

    it('should return empty string for empty input', () => {
      expect(formatPhoneDisplay('')).toBe('');
    });
  });

  describe('buildPhoneMatchCondition', () => {
    it('should add 1 = 0 if variants are empty', () => {
      const mockBuilder = {
        whereRaw: jest.fn().mockReturnThis(),
        orWhereRaw: jest.fn().mockReturnThis(),
      };
      buildPhoneMatchCondition(mockBuilder, []);
      expect(mockBuilder.whereRaw).toHaveBeenCalledWith('1 = 0');
    });

    it('should add IN clause with placeholders for phone and secondary_phone', () => {
      const mockBuilder = {
        whereRaw: jest.fn().mockReturnThis(),
        orWhereRaw: jest.fn().mockReturnThis(),
      };
      buildPhoneMatchCondition(mockBuilder, ['998901234567', '901234567']);
      expect(mockBuilder.whereRaw).toHaveBeenCalledWith(
        "regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') IN (?, ?)",
        ['998901234567', '901234567'],
      );
      expect(mockBuilder.orWhereRaw).toHaveBeenCalledWith(
        "regexp_replace(coalesce(secondary_phone, ''), '[^0-9]', '', 'g') IN (?, ?)",
        ['998901234567', '901234567'],
      );
    });

    it('should extract pure digits for regexp matching when variants have plus or spaces', () => {
      const mockBuilder = {
        whereRaw: jest.fn().mockReturnThis(),
        orWhereRaw: jest.fn().mockReturnThis(),
      };
      buildPhoneMatchCondition(mockBuilder, [
        '+998901234567',
        '998901234567',
        '+998 90 123 45 67',
      ]);
      expect(mockBuilder.whereRaw).toHaveBeenCalledWith(
        "regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') IN (?)",
        ['998901234567'],
      );
    });
  });
});
