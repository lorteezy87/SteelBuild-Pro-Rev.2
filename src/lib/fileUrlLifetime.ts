/** Signed links remain bearer capabilities until this server-issued expiry. */
export const SIGNED_URL_EXPIRY_SECONDS = 5 * 60;
/** Reauthorize early; never keep a link alive by extending a local cache timer. */
export const SIGNED_URL_REUSE_MS = (SIGNED_URL_EXPIRY_SECONDS - 30) * 1000;
