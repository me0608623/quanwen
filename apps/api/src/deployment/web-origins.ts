export const LOCAL_WEB_ORIGIN = 'http://localhost:3000';

export const parseAllowedOrigins = (raw: string | undefined) => {
  const origins = (raw ?? '')
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : [LOCAL_WEB_ORIGIN];
};

export const isValidOriginList = (raw: string | undefined) => {
  const origins = parseAllowedOrigins(raw);

  return origins.every((origin) => {
    try {
      const url = new URL(origin);
      return Boolean(url.protocol && url.host);
    } catch {
      return false;
    }
  });
};