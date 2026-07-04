import { registerAs } from '@nestjs/config';

function parseDatabaseUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port, 10) || 5432,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

export default registerAs('database', () => {
  const url = process.env.DATABASE_URL;
  const parsed = url ? parseDatabaseUrl(url) : null;
  return {
    host: parsed?.host ?? 'localhost',
    port: parsed?.port ?? 5432,
    username: parsed?.username ?? 'postgres',
    password: parsed?.password ?? '',
    database: parsed?.database ?? 'splitpay',
    ssl: process.env.NODE_ENV === 'production',
    logging: process.env.NODE_ENV === 'development',
  };
});
