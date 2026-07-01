import {
  sanitizeText,
  buildWAReminder,
  buildWAConfirmed,
  buildWAOverdue,
} from './message-templates';

describe('Message Templates', () => {
  describe('sanitizeText', () => {
    it('should remove newlines and tabs', () => {
      expect(sanitizeText('Hello\nWorld\tTest')).toBe('Hello World Test');
    });

    it('should remove markdown bold markers', () => {
      expect(sanitizeText('**Bold Text**')).toBe('Bold Text');
    });

    it('should remove markdown italic markers', () => {
      expect(sanitizeText('_Italic Text_')).toBe('Italic Text');
    });

    it('should remove markdown strikethrough', () => {
      expect(sanitizeText('~~Strikethrough~~')).toBe('Strikethrough');
    });

    it('should remove code markers', () => {
      expect(sanitizeText('`code`')).toBe('code');
    });

    it('should trim whitespace', () => {
      expect(sanitizeText('  Hello World  ')).toBe('Hello World');
    });

    it('should handle multiple types of formatting', () => {
      const input = '**Bold** _Italic_ `code` ~~strike~~\nNew Line';
      expect(sanitizeText(input)).toBe('Bold Italic code strike New Line');
    });

    it('should prevent malicious markdown injection', () => {
      const malicious = '**[Click Here](javascript:alert(1))**';
      const result = sanitizeText(malicious);
      expect(result).not.toContain('**');
      expect(result).toBe('[Click Here](javascript:alert(1))');
    });
  });

  describe('buildWAReminder', () => {
    const baseParams = {
      memberName: 'John Doe',
      serviceName: 'Netflix Premium',
      hostName: 'Jane Host',
      amountDue: '50000',
      dueDate: '2026-07-10',
      daysUntilDue: 3,
      confirmUrl: 'https://api.splitpay.id/payments/confirm?token=abc123',
    };

    it('should build plain text message', () => {
      const message = buildWAReminder(baseParams);
      
      expect(message).toContain('John Doe');
      expect(message).toContain('Netflix Premium');
      expect(message).toContain('Jane Host');
      expect(message).toContain('Rp 50.000');
      expect(message).toContain('2026-07-10');
    });

    it('should include signed URL', () => {
      const message = buildWAReminder(baseParams);
      expect(message).toContain('https://api.splitpay.id/payments/confirm?token=abc123');
    });

    it('should not contain HTML tags', () => {
      const message = buildWAReminder(baseParams);
      expect(message).not.toContain('<');
      expect(message).not.toContain('>');
    });

    it('should sanitize malicious member name', () => {
      const message = buildWAReminder({
        ...baseParams,
        memberName: '**Evil** Script\n<script>alert(1)</script>',
      });
      
      expect(message).not.toContain('<script>');
      expect(message).not.toContain('**');
      expect(message).toContain('Evil Script'); // Sanitized - HTML and markdown removed
    });

    it('should show correct urgency emoji for days > 1', () => {
      const message = buildWAReminder({ ...baseParams, daysUntilDue: 3 });
      expect(message).toContain('📅');
      expect(message).toContain('3 HARI LAGI');
    });

    it('should show correct urgency for 1 day', () => {
      const message = buildWAReminder({ ...baseParams, daysUntilDue: 1 });
      expect(message).toContain('🚨');
      expect(message).toContain('BESOK');
    });

    it('should show correct urgency for 0 days', () => {
      const message = buildWAReminder({ ...baseParams, daysUntilDue: 0 });
      expect(message).toContain('🚨');
      expect(message).toContain('HARI INI');
    });

    it('should use markdown bold for emphasis (allowed)', () => {
      const message = buildWAReminder(baseParams);
      // Check that template uses *text* for bold (WhatsApp markdown)
      expect(message).toContain('*REMINDER PEMBAYARAN*');
      expect(message).toContain('*Netflix Premium*');
    });
  });

  describe('buildWAConfirmed', () => {
    const baseParams = {
      hostName: 'Jane Host',
      memberName: 'John Doe',
      serviceName: 'Netflix Premium',
      amountPaid: '50000',
    };

    it('should build plain text message', () => {
      const message = buildWAConfirmed(baseParams);
      
      expect(message).toContain('Jane Host');
      expect(message).toContain('John Doe');
      expect(message).toContain('Netflix Premium');
      expect(message).toContain('Rp 50.000');
    });

    it('should not contain HTML', () => {
      const message = buildWAConfirmed(baseParams);
      expect(message).not.toContain('<');
      expect(message).not.toContain('>');
    });

    it('should sanitize user input', () => {
      const message = buildWAConfirmed({
        ...baseParams,
        memberName: '**Hacker** `code`\nNewline',
      });
      
      expect(message).not.toContain('**');
      expect(message).not.toContain('`');
      expect(message).toContain('Hacker code Newline'); // Sanitized
    });

    it('should include checkmark emoji', () => {
      const message = buildWAConfirmed(baseParams);
      expect(message).toContain('✅');
    });
  });

  describe('buildWAOverdue', () => {
    const baseParams = {
      memberName: 'John Doe',
      serviceName: 'Netflix Premium',
      hostName: 'Jane Host',
      amountDue: '50000',
      dueDate: '2026-06-30',
      daysOverdue: 5,
      confirmUrl: 'https://api.splitpay.id/payments/confirm?token=abc123',
    };

    it('should build plain text message', () => {
      const message = buildWAOverdue(baseParams);
      
      expect(message).toContain('John Doe');
      expect(message).toContain('Netflix Premium');
      expect(message).toContain('Rp 50.000');
      expect(message).toContain('5 HARI');
    });

    it('should not contain HTML', () => {
      const message = buildWAOverdue(baseParams);
      expect(message).not.toContain('<');
      expect(message).not.toContain('>');
    });

    it('should include warning emoji', () => {
      const message = buildWAOverdue(baseParams);
      expect(message).toContain('⚠️');
    });

    it('should include confirm URL', () => {
      const message = buildWAOverdue(baseParams);
      expect(message).toContain('https://api.splitpay.id/payments/confirm?token=abc123');
    });

    it('should sanitize all user inputs', () => {
      const message = buildWAOverdue({
        ...baseParams,
        memberName: '**Evil**_User',
        serviceName: '_Phishing_`Service`',
        hostName: '`Malicious`~Host',
      });
      
      expect(message).not.toContain('**');
      expect(message).not.toContain('`');
      expect(message).not.toContain('~');
      expect(message).toContain('EvilUser'); // Sanitized - all markdown markers removed
      expect(message).toContain('PhishingService'); // Sanitized
      expect(message).toContain('MaliciousHost'); // Sanitized
    });
  });

  describe('No HTML Leakage', () => {
    it('should never contain HTML tags in WA templates', () => {
      const reminder = buildWAReminder({
        memberName: '<b>Test</b>',
        serviceName: '<script>alert(1)</script>',
        hostName: '<img src=x>',
        amountDue: '10000',
        dueDate: '2026-07-10',
        daysUntilDue: 3,
        confirmUrl: 'https://test.com',
      });

      const confirmed = buildWAConfirmed({
        hostName: '<div>Test</div>',
        memberName: '<span>User</span>',
        serviceName: '<p>Service</p>',
        amountPaid: '10000',
      });

      const overdue = buildWAOverdue({
        memberName: '<h1>Title</h1>',
        serviceName: '<a href="#">Link</a>',
        hostName: '<button>Click</button>',
        amountDue: '10000',
        dueDate: '2026-06-30',
        daysOverdue: 5,
        confirmUrl: 'https://test.com',
      });

      // No HTML tags should be present
      [reminder, confirmed, overdue].forEach((message) => {
        expect(message).not.toMatch(/<[^>]*>/);
      });
    });
  });
});
