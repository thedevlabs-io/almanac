// ABOUTME: Which AI coding assistants are installed and active, read from the extension registry.
// ABOUTME: Presence only — no extension can see another's completions, so nothing is attributed to them.

import * as vscode from "vscode";

const KNOWN: { id: string; name: string }[] = [
  { id: "anthropic.claude-code", name: "Claude Code" },
  { id: "github.copilot", name: "GitHub Copilot" },
  { id: "github.copilot-chat", name: "Copilot Chat" },
  { id: "cursor.cursor", name: "Cursor" },
  { id: "codeium.codeium", name: "Codeium" },
  { id: "continue.continue", name: "Continue" },
  { id: "sourcegraph.cody-ai", name: "Cody" },
  { id: "tabnine.tabnine-vscode", name: "Tabnine" },
  { id: "amazonwebservices.amazon-q-vscode", name: "Amazon Q" },
  { id: "google.geminicodeassist", name: "Gemini Code Assist" },
];

export interface Assistant {
  name: string;
  active: boolean;
}

/**
 * Context for the composition numbers, not a measurement of them: knowing an
 * assistant is running does not tell us which characters it wrote.
 */
export function detectAssistants(): Assistant[] {
  const found: Assistant[] = [];
  for (const { id, name } of KNOWN) {
    const extension = vscode.extensions.getExtension(id);
    if (extension) {
      found.push({ name, active: extension.isActive });
    }
  }
  return found;
}
