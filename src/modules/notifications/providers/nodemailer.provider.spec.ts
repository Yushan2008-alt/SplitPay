import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NodemailerProvider } from './nodemailer.provider';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const mockSendMail = jest.fn();

describe('NodemailerProvider', () => {
  let provider: NodemailerProvider;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SMTP_HOST') return 'smtp.example.com';
        if (key === 'SMTP_PORT') return 587;
        if (key === 'SMTP_USER') return 'user@example.com';
        if (key === 'SMTP_PASS') return 'secret';
        if (key === 'MAIL_FROM') return 'noreply@splitpay.id';
        return null;
      }),
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    } as unknown as Transporter);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodemailerProvider,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    provider = module.get<NodemailerProvider>(NodemailerProvider);
    configService = module.get(ConfigService);
  });

  describe('initialization', () => {
    it('should initialize with SMTP config', () => {
      expect(provider).toBeDefined();
      expect(provider.isConfigured()).toBe(true);
    });

    it('should handle missing SMTP_HOST gracefully', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SMTP_HOST') return null;
        if (key === 'MAIL_FROM') return 'noreply@splitpay.id';
        return null;
      });

      const testProvider = new NodemailerProvider(configService as any);
      expect(testProvider.isConfigured()).toBe(false);
    });

    it('should use fallback email if MAIL_FROM not configured', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SMTP_HOST') return 'smtp.example.com';
        if (key === 'MAIL_FROM') return null;
        if (key === 'RESEND_FROM_EMAIL') return null;
        return null;
      });

      const testProvider = new NodemailerProvider(configService as any);
      expect(testProvider).toBeDefined();
      expect(testProvider.isConfigured()).toBe(true);
    });
  });

  describe('sendEmail', () => {
    it('should return success: true in dev mode (no SMTP_HOST)', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SMTP_HOST') return null;
        return 'noreply@splitpay.id';
      });

      const testProvider = new NodemailerProvider(configService as any);
      const result = await testProvider.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('dev-mode-no-send');
    });

    it('should handle successful send (mocked)', async () => {
      mockSendMail.mockResolvedValueOnce({
        messageId: '<mock-id@example.com>',
        accepted: ['user@example.com'],
        rejected: [],
      });

      const result = await provider.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<mock-id@example.com>');
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@splitpay.id',
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });
    });

    it('should validate email parameters', async () => {
      mockSendMail.mockResolvedValueOnce({
        messageId: '<mock-id@example.com>',
        accepted: ['test@example.com'],
        rejected: [],
      });

      const params = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      };

      const result = await provider.sendEmail(params);
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle sendMail throwing gracefully', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await provider.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should return failure shape when sendMail rejects', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Invalid recipient'));

      const result = await provider.sendEmail({
        to: '',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid recipient');
    });
  });

  describe('isConfigured', () => {
    it('should return true when SMTP_HOST is set', () => {
      expect(provider.isConfigured()).toBe(true);
    });

    it('should return false when SMTP_HOST is not set', () => {
      configService.get.mockImplementation(() => null);
      const testProvider = new NodemailerProvider(configService as any);
      expect(testProvider.isConfigured()).toBe(false);
    });
  });
});
