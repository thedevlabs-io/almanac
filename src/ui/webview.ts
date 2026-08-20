import { randomBytes } from "crypto";

/** A CSP nonce. From a CSPRNG, because a security primitive built on `Math.random` teaches the wrong lesson. */
export function nonce(): string {
  return randomBytes(24).toString("base64");
}

/**
 * No `connect-src`, so a panel cannot make a network request even if some
 * future edit tried to. That is the privacy promise written as a header rather
 * than as a comment.
 *
 * No `'unsafe-inline'` either, which has a consequence worth stating: a nonce
 * whitelists `<style>` *elements* only. Inline `style` attributes fall under
 * `style-src-attr`, which no nonce can satisfy. So panels must not use inline
 * style attributes at all, and every dynamic dimension goes through
 * `DynamicStyles` into the nonced stylesheet instead.
 */
export function contentSecurityPolicy(cspSource: string, id: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'nonce-${id}'`,
    `script-src 'nonce-${id}'`,
    `font-src ${cspSource}`,
  ].join("; ");
}

/** Escapes text for an HTML text node or a quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Collects the dimensions that vary with data into generated classes, which the
 * caller emits inside the nonced stylesheet.
 *
 * Every declaration this accepts is built from a number the extension computed,
 * never from a repository or language name, and `percent` clamps and formats it
 * rather than interpolating whatever it was handed.
 */
export class DynamicStyles {
  private readonly rules: string[] = [];

  /** Registers a declaration and returns the class name carrying it. */
  add(declaration: string): string {
    const name = `d${this.rules.length}`;
    this.rules.push(`.${name}{${declaration}}`);
    return name;
  }

  /** A class setting one property to a percentage, clamped to 0 to 100. */
  percent(property: "width" | "height", share: number): string {
    const value = Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
    return this.add(`${property}:${(value * 100).toFixed(2)}%`);
  }

  get css(): string {
    return this.rules.join("");
  }
}
