// ABOUTME: Shared webview plumbing — per-render nonce, the strict CSP, and safe JSON embedding.
// ABOUTME: Every panel builds its HTML through these so the security posture is identical.

import { randomBytes } from "node:crypto";

export function nonce(): string {
  return randomBytes(16).toString("base64");
}

export function csp(n: string): string {
  return ["default-src 'none'", "style-src 'unsafe-inline'", `script-src 'nonce-${n}'`].join("; ");
}

/**
 * Serialise data for a `<script type="application/json">` block. Escaping `<`
 * stops a value ending the script element early; values are never interpolated
 * into markup anywhere else.
 */
export function embed(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
