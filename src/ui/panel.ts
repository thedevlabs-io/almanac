import * as vscode from "vscode";
import { BRAND_FONT_FILES } from "./brand";
import type { BrandFonts, BrandTheme } from "./style";

/**
 * Resolves the bundled brand fonts to webview URIs.
 *
 * The panels' CSP allows `font-src ${cspSource}` and nothing else, so the fonts
 * have to be local resources served through `asWebviewUri` rather than fetched
 * from a CDN. That is deliberate: a webfont request would be the one piece of
 * network traffic in an extension that promises there is none.
 */
export function brandFonts(webview: vscode.Webview, extensionUri: vscode.Uri): BrandFonts {
  const uri = (file: string): string =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "fonts", file)).toString();
  return {
    display: uri(BRAND_FONT_FILES.display),
    mono400: uri(BRAND_FONT_FILES.mono400),
    mono600: uri(BRAND_FONT_FILES.mono600),
  };
}

/**
 * Which half of the design system applies, taken from VS Code's active colour
 * theme rather than from the OS.
 *
 * The two high contrast kinds map to the side they belong to, so the accent
 * still darkens for AA on a high contrast light theme. Surfaces are unaffected
 * either way: those come from `var(--vscode-*)`, which is what keeps a high
 * contrast theme intact.
 */
export function brandTheme(): BrandTheme {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light:
    case vscode.ColorThemeKind.HighContrastLight:
      return "light";
    default:
      return "dark";
  }
}
