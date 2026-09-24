/**
 * Header policy for render.yaml and _headers.
 * The page meta tag uses CONTENT_SECURITY_POLICY_META. Browsers ignore
 * frame-ancestors in a meta tag and log an error, so that directive is HTTP-only.
 */

const SHARED_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://*.environment.api.powerplatform.com",
];

export const CONTENT_SECURITY_POLICY_META = SHARED_POLICY.join('; ');

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://*.environment.api.powerplatform.com",
].join('; ');

export const CACHE_CONTROL_NO_STORE = 'private, no-store';
