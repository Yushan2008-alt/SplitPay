import {
  escapeHtml,
  formatRupiah,
  getUrgencyText,
  buildReminderEmailHtml,
  buildConfirmedEmailHtml,
  buildOverdueAlertHtml,
} from './email-templates';

describe('Email Templates', () => {
  describe('escapeHtml', () => {
    it('should escape < and > characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape & character', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape quotes', () => {
      expect(escapeHtml('"Hello" and \'World\'')).toBe(
        '&quot;Hello&quot; and &#039;World&#039;',
      );
    });

    it('should prevent XSS via script tags', () => {
      const malicious = '<script>alert("XSS")</script>';
      const escaped = escapeHtml(malicious);
      expect(escaped).not.toContain('<script>');
      expect(escaped).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
      );
    });

    it('should prevent XSS via img onerror', () => {
      const malicious = '<img src=x onerror="alert(1)">';
      const escaped = escapeHtml(malicious);
      expect(escaped).toContain('&lt;img'); // Tag is escaped
      expect(escaped).toContain('&quot;'); // Quotes are escaped
      expect(escaped).not.toContain('<img'); // Original tag not present
      expect(escaped).toBe(
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
      );
    });

    it('should handle normal text without changes', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('formatRupiah', () => {
    it('should format number with thousand separators', () => {
      expect(formatRupiah(10000)).toBe('Rp 10.000');
      expect(formatRupiah(1000000)).toBe('Rp 1.000.000');
    });

    it('should format string numbers', () => {
      expect(formatRupiah('15000')).toBe('Rp 15.000');
    });

    it('should handle decimal values', () => {
      expect(formatRupiah(10500.50)).toBe('Rp 10.500,5');
    });
  });

  describe('getUrgencyText', () => {
    it('should return "X hari lagi" for days > 1', () => {
      expect(getUrgencyText(3)).toBe('3 hari lagi');
      expect(getUrgencyText(7)).toBe('7 hari lagi');
    });

    it('should return "besok" for 1 day', () => {
      expect(getUrgencyText(1)).toBe('besok');
    });

    it('should return "hari ini" for 0 days', () => {
      expect(getUrgencyText(0)).toBe('hari ini');
    });

    it('should return "kemarin" for -1 day', () => {
      expect(getUrgencyText(-1)).toBe('kemarin');
    });

    it('should return "X hari yang lalu" for days < -1', () => {
      expect(getUrgencyText(-3)).toBe('3 hari yang lalu');
      expect(getUrgencyText(-10)).toBe('10 hari yang lalu');
    });
  });

  describe('buildReminderEmailHtml', () => {
    const baseParams = {
      memberName: 'John Doe',
      serviceName: 'Netflix Premium',
      hostName: 'Jane Host',
      amountDue: '50000',
      dueDate: '2026-07-10',
      daysUntilDue: 3,
      confirmUrl: 'https://api.splitpay.id/payments/confirm?token=abc123',
    };

    it('should generate valid HTML structure', () => {
      const html = buildReminderEmailHtml(baseParams);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="id">');
      expect(html).toContain('</html>');
    });

    it('should include all required content', () => {
      const html = buildReminderEmailHtml(baseParams);
      
      expect(html).toContain('John Doe');
      expect(html).toContain('Netflix Premium');
      expect(html).toContain('Jane Host');
      expect(html).toContain('Rp 50.000');
      expect(html).toContain('2026-07-10');
    });

    it('should include signed URL in button', () => {
      const html = buildReminderEmailHtml(baseParams);
      
      expect(html).toContain('href="https://api.splitpay.id/payments/confirm?token=abc123"');
      expect(html).toContain('Sudah Bayar');
    });

    it('should escape malicious member name', () => {
      const html = buildReminderEmailHtml({
        ...baseParams,
        memberName: '<script>alert("XSS")</script>',
      });
      
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape malicious service name', () => {
      const html = buildReminderEmailHtml({
        ...baseParams,
        serviceName: '<img src=x onerror="alert(1)">',
      });
      
      // Original tag should not be present
      expect(html).not.toContain('<img src=x onerror');
      // Escaped version should be present
      expect(html).toContain('&lt;img');
      expect(html).toContain('&quot;');
    });

    it('should show correct urgency for 3 days', () => {
      const html = buildReminderEmailHtml({ ...baseParams, daysUntilDue: 3 });
      expect(html).toContain('3 HARI LAGI');
    });

    it('should show correct urgency for 1 day', () => {
      const html = buildReminderEmailHtml({ ...baseParams, daysUntilDue: 1 });
      expect(html).toContain('BESOK');
    });

    it('should show correct urgency for 0 days', () => {
      const html = buildReminderEmailHtml({ ...baseParams, daysUntilDue: 0 });
      expect(html).toContain('HARI INI');
    });

    it('should use red color for urgent (days <= 1)', () => {
      const html = buildReminderEmailHtml({ ...baseParams, daysUntilDue: 1 });
      expect(html).toContain('#dc2626'); // Red color
    });

    it('should use orange color for less urgent (days > 1)', () => {
      const html = buildReminderEmailHtml({ ...baseParams, daysUntilDue: 3 });
      expect(html).toContain('#ea580c'); // Orange color
    });
  });

  describe('buildConfirmedEmailHtml', () => {
    const baseParams = {
      hostName: 'Jane Host',
      memberName: 'John Doe',
      serviceName: 'Netflix Premium',
      amountPaid: '50000',
      confirmedAt: '2026-07-01T10:30:00Z',
    };

    it('should generate valid HTML structure', () => {
      const html = buildConfirmedEmailHtml(baseParams);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="id">');
      expect(html).toContain('</html>');
    });

    it('should include checkmark icon', () => {
      const html = buildConfirmedEmailHtml(baseParams);
      expect(html).toContain('✓');
    });

    it('should show host name and member name', () => {
      const html = buildConfirmedEmailHtml(baseParams);
      
      expect(html).toContain('Jane Host');
      expect(html).toContain('John Doe');
    });

    it('should format amount paid', () => {
      const html = buildConfirmedEmailHtml(baseParams);
      expect(html).toContain('Rp 50.000');
    });

    it('should escape malicious content', () => {
      const html = buildConfirmedEmailHtml({
        ...baseParams,
        memberName: '<script>alert("XSS")</script>',
      });
      
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should use green color scheme for success', () => {
      const html = buildConfirmedEmailHtml(baseParams);
      expect(html).toContain('#10b981'); // Green color
      expect(html).toContain('#f0fdf4'); // Light green background
    });
  });

  describe('buildOverdueAlertHtml', () => {
    const baseParams = {
      memberName: 'John Doe',
      serviceName: 'Netflix Premium',
      hostName: 'Jane Host',
      amountDue: '50000',
      dueDate: '2026-06-30',
      daysOverdue: 5,
      confirmUrl: 'https://api.splitpay.id/payments/confirm?token=abc123',
    };

    it('should generate valid HTML structure', () => {
      const html = buildOverdueAlertHtml(baseParams);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="id">');
      expect(html).toContain('</html>');
    });

    it('should show overdue days', () => {
      const html = buildOverdueAlertHtml(baseParams);
      expect(html).toContain('TERLAMBAT 5 HARI');
    });

    it('should include warning icon', () => {
      const html = buildOverdueAlertHtml(baseParams);
      expect(html).toContain('!');
    });

    it('should include confirm URL', () => {
      const html = buildOverdueAlertHtml(baseParams);
      expect(html).toContain('href="https://api.splitpay.id/payments/confirm?token=abc123"');
      expect(html).toContain('Konfirmasi Sekarang');
    });

    it('should use red color scheme for warning', () => {
      const html = buildOverdueAlertHtml(baseParams);
      expect(html).toContain('#dc2626'); // Red color
      expect(html).toContain('#fef2f2'); // Light red background
    });

    it('should escape malicious content', () => {
      const html = buildOverdueAlertHtml({
        ...baseParams,
        memberName: '<img src=x onerror="alert(1)">',
      });
      
      // Original tag should not be present
      expect(html).not.toContain('<img src=x onerror');
      // Escaped version should be present
      expect(html).toContain('&lt;img');
      expect(html).toContain('&quot;');
    });
  });

  describe('XSS Protection Integration', () => {
    it('should prevent XSS in all user-provided fields', () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const reminderHtml = buildReminderEmailHtml({
        memberName: xssPayload,
        serviceName: xssPayload,
        hostName: xssPayload,
        amountDue: '10000',
        dueDate: xssPayload,
        daysUntilDue: 3,
        confirmUrl: 'https://safe.url',
      });
      
      // Count occurrences of escaped script tag
      const scriptCount = (reminderHtml.match(/&lt;script&gt;/g) || []).length;
      expect(scriptCount).toBeGreaterThan(0);
      expect(reminderHtml).not.toContain('<script>');
    });

    it('should prevent SQL injection patterns in templates', () => {
      const sqlPayload = "'; DROP TABLE users; --";
      
      const html = buildReminderEmailHtml({
        memberName: sqlPayload,
        serviceName: 'Netflix',
        hostName: 'Host',
        amountDue: '10000',
        dueDate: '2026-07-10',
        daysUntilDue: 3,
        confirmUrl: 'https://safe.url',
      });
      
      // Quotes should be escaped
      expect(html).toContain('&#039;');
      expect(html).not.toContain("'; DROP TABLE");
    });
  });
});
