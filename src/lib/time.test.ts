import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatTime, formatDate } from './time';

describe('time', () => {
  describe('formatTime', () => {
    it('should format ISO string to time', () => {
      const iso = '2024-01-15T14:30:00Z';
      const result = formatTime(iso);

      // Result will vary by timezone, but should be in HH:MM format
      expect(result).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
    });

    it('should handle midnight', () => {
      const iso = '2024-01-15T00:00:00Z';
      const result = formatTime(iso);

      expect(result).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
    });

    it('should handle noon', () => {
      const iso = '2024-01-15T12:00:00Z';
      const result = formatTime(iso);

      expect(result).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
    });

    it('should handle end of day', () => {
      const iso = '2024-01-15T23:59:00Z';
      const result = formatTime(iso);

      expect(result).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
    });

    it('should handle ISO string with milliseconds', () => {
      const iso = '2024-01-15T14:30:45.123Z';
      const result = formatTime(iso);

      expect(result).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
    });

    it('should handle ISO string with timezone offset', () => {
      const iso = '2024-01-15T14:30:00+05:00';
      const result = formatTime(iso);

      expect(result).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
    });

    it('should handle different dates consistently', () => {
      const iso1 = '2024-01-15T14:30:00Z';
      const iso2 = '2024-01-15T14:30:00Z';

      const result1 = formatTime(iso1);
      const result2 = formatTime(iso2);

      expect(result1).toBe(result2);
    });

    it('should return valid time for valid ISO string', () => {
      const iso = '2024-06-15T09:45:00Z';
      const result = formatTime(iso);

      // Should not be "Invalid Date" or similar
      expect(result).not.toContain('Invalid');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatDate', () => {
    it('should format ISO string to readable date', () => {
      const iso = '2024-01-15T14:30:00Z';
      const result = formatDate(iso);

      // Format: "Month Day, Year" (e.g., "January 15, 2024")
      expect(result).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    });

    it('should handle January 1st', () => {
      const iso = '2024-01-01T00:00:00Z';
      const result = formatDate(iso);

      expect(result).toContain('January');
      expect(result).toContain('2024');
    });

    it('should handle December 31st', () => {
      const iso = '2024-12-31T23:59:59Z';
      const result = formatDate(iso);

      expect(result).toContain('December');
      expect(result).toContain('2024');
    });

    it('should handle leap year date', () => {
      const iso = '2024-02-29T12:00:00Z';
      const result = formatDate(iso);

      expect(result).toContain('February');
      expect(result).toContain('29');
      expect(result).toContain('2024');
    });

    it('should format with full month name', () => {
      const testCases = [
        { iso: '2024-01-15T00:00:00Z', month: 'January' },
        { iso: '2024-02-15T00:00:00Z', month: 'February' },
        { iso: '2024-03-15T00:00:00Z', month: 'March' },
        { iso: '2024-04-15T00:00:00Z', month: 'April' },
        { iso: '2024-05-15T00:00:00Z', month: 'May' },
        { iso: '2024-06-15T00:00:00Z', month: 'June' },
        { iso: '2024-07-15T00:00:00Z', month: 'July' },
        { iso: '2024-08-15T00:00:00Z', month: 'August' },
        { iso: '2024-09-15T00:00:00Z', month: 'September' },
        { iso: '2024-10-15T00:00:00Z', month: 'October' },
        { iso: '2024-11-15T00:00:00Z', month: 'November' },
        { iso: '2024-12-15T00:00:00Z', month: 'December' },
      ];

      testCases.forEach(({ iso, month }) => {
        const result = formatDate(iso);
        expect(result).toContain(month);
      });
    });

    it('should handle different years', () => {
      const testCases = [
        '2020-06-15T00:00:00Z',
        '2021-06-15T00:00:00Z',
        '2022-06-15T00:00:00Z',
        '2023-06-15T00:00:00Z',
        '2024-06-15T00:00:00Z',
        '2025-06-15T00:00:00Z',
      ];

      testCases.forEach((iso) => {
        const result = formatDate(iso);
        const year = iso.substring(0, 4);
        expect(result).toContain(year);
      });
    });

    it('should handle ISO string with milliseconds', () => {
      const iso = '2024-06-15T14:30:45.123Z';
      const result = formatDate(iso);

      expect(result).toContain('June');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('should handle ISO string with timezone offset', () => {
      const iso = '2024-06-15T14:30:00+05:00';
      const result = formatDate(iso);

      // Date might shift depending on timezone, but should be valid
      expect(result).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
      expect(result).toContain('2024');
    });

    it('should produce consistent results for same date', () => {
      const iso1 = '2024-06-15T14:30:00Z';
      const iso2 = '2024-06-15T20:45:00Z';

      const result1 = formatDate(iso1);
      const result2 = formatDate(iso2);

      // Different times, same date (in UTC)
      // Note: This may fail if timezone conversion changes the date
      // In most timezones, this should be the same day
      expect(result1).toBe(result2);
    });

    it('should return valid date for valid ISO string', () => {
      const iso = '2024-06-15T09:45:00Z';
      const result = formatDate(iso);

      expect(result).not.toContain('Invalid');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should format single-digit days correctly', () => {
      const iso = '2024-06-05T00:00:00Z';
      const result = formatDate(iso);

      expect(result).toContain('June');
      expect(result).toContain('5');
      expect(result).not.toContain('05'); // Should be "5", not "05"
    });
  });

  describe('edge cases', () => {
    it('formatTime should handle invalid date string gracefully', () => {
      const result = formatTime('invalid-date');

      // Different browsers/environments may handle this differently
      // Just ensure it doesn't throw and returns a string
      expect(typeof result).toBe('string');
    });

    it('formatDate should handle invalid date string gracefully', () => {
      const result = formatDate('invalid-date');

      expect(typeof result).toBe('string');
    });

    it('should handle very old dates', () => {
      const iso = '1900-01-01T00:00:00Z';

      const time = formatTime(iso);
      const date = formatDate(iso);

      expect(typeof time).toBe('string');
      expect(typeof date).toBe('string');
      expect(date).toContain('1900');
    });

    it('should handle far future dates', () => {
      const iso = '2100-12-31T23:59:59Z';

      const time = formatTime(iso);
      const date = formatDate(iso);

      expect(typeof time).toBe('string');
      expect(typeof date).toBe('string');
      expect(date).toContain('2100');
    });

    it('should handle Unix epoch', () => {
      const iso = '1970-01-01T00:00:00Z';

      const time = formatTime(iso);
      const date = formatDate(iso);

      expect(typeof time).toBe('string');
      expect(typeof date).toBe('string');
      expect(date).toContain('1970');
    });

    it('formatTime and formatDate should work with Date.now() converted to ISO', () => {
      const now = new Date().toISOString();

      const time = formatTime(now);
      const date = formatDate(now);

      expect(typeof time).toBe('string');
      expect(typeof date).toBe('string');
      expect(time.length).toBeGreaterThan(0);
      expect(date.length).toBeGreaterThan(0);
    });
  });

  describe('locale consistency', () => {
    it('should use en-US locale for dates', () => {
      const iso = '2024-06-15T14:30:00Z';
      const result = formatDate(iso);

      // en-US format uses full month names in "Month Day, Year" format
      expect(result).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
      // Should contain full month name, not abbreviation
      expect(result).toContain('June');
      expect(result).not.toMatch(/^Jun \d/); // Not abbreviated
    });

    it('should format time consistently regardless of seconds', () => {
      const iso1 = '2024-06-15T14:30:00Z';
      const iso2 = '2024-06-15T14:30:59Z';

      const result1 = formatTime(iso1);
      const result2 = formatTime(iso2);

      // Both should format to same HH:MM (seconds are not shown)
      expect(result1).toBe(result2);
    });
  });
});
