import pino from 'pino';

/**
 * Structured logger. Never log gift card codes, full phone numbers, signatures or secrets:
 * the redact list below is a second line of defence, not a licence to log them.
 */
export function createLogger(level: string) {
  return pino({
    level,
    redact: {
      paths: [
        '*.recipientPhone',
        '*.phone',
        '*.code',
        '*.codes',
        '*.pin',
        '*.signature',
        '*.access_token',
        '*.client_secret',
        'req.headers.authorization',
      ],
      censor: '[redacted]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;

/** "+234••••5678": enough to recognise a number, not enough to use it. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 6) return '••••';
  return `+${digits.slice(0, 3)}••••${digits.slice(-4)}`;
}
