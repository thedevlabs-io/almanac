import type { LegendStop } from "../core/dashboardModel";
import { escapeHtml, type DynamicStyles } from "./webview";

/**
 * The pieces both panels are built from.
 *
 * The dashboard and the report are the same page with a different default tab,
 * so the strip, the tab bar and the panes live here rather than being written
 * twice and drifting apart.
 */

export interface StripCell {
  value: string;
  label: string;
  /** Marks the one figure that is still changing, so it carries the accent. */
  live?: boolean;
  /** An extra line beneath the label, escaped here rather than by the caller. */
  warning?: string;
}

/**
 * The headline figures, always visible.
 *
 * This is what earns the tabs the right to hide anything: whichever tab is
 * open, the numbers a person opened the panel for have not moved.
 */
export function statStrip(cells: StripCell[]): string {
  const inner = cells
    .map(
      (cell) => `<div class="cell${cell.live ? " live" : ""}">
    <span class="v">${escapeHtml(cell.value)}</span>
    <span class="k">${escapeHtml(cell.label)}</span>
    ${
      cell.warning === undefined ? "" : `<span class="k warn">${escapeHtml(cell.warning)}</span>`
    }
  </div>`
    )
    .join("");
  return `<div class="strip">${inner}</div>`;
}

export interface TabDef {
  id: string;
  label: string;
}

export function tabNav(tabs: TabDef[], active: string, hint: string): string {
  const buttons = tabs
    .map(
      (tab) =>
        `<button data-tab="${tab.id}" aria-pressed="${tab.id === active}">${escapeHtml(
          tab.label
        )}</button>`
    )
    .join("");
  return `<nav class="tabnav">${buttons}<span class="hint">${escapeHtml(hint)}</span></nav>`;
}

/** One tab's content. `lead` is a sentence saying what the reader is looking at. */
export function pane(id: string, active: boolean, lead: string, inner: string): string {
  const sentence = lead.length > 0 ? `<p class="lead">${escapeHtml(lead)}</p>` : "";
  return `<div class="pane${active ? " on" : ""}" data-pane="${id}">${sentence}${inner}</div>`;
}

export function card(title: string, inner: string, span = ""): string {
  const classes = span.length > 0 ? `card ${span}` : "card";
  return `<div class="${classes}"><h2>${escapeHtml(title)}</h2>${inner}</div>`;
}

export function bar(styles: DynamicStyles, share: number, extraClass = ""): string {
  const width = styles.percent("width", share);
  const outer = extraClass.length > 0 ? `bar ${extraClass}` : "bar";
  return `<span class="${outer}"><span class="${width}"></span></span>`;
}

/**
 * The heat scale, worded in real durations.
 *
 * Levels are cut against the busiest day in the window, so the same shade means
 * different things in different windows, and saying so out loud is what makes
 * the graph readable rather than decorative.
 */
export function legend(stops: LegendStop[], note = ""): string {
  const inner = stops
    .map(
      (stop) =>
        `<span class="legend-stop"><span class="heat-cell" data-level="${
          stop.level
        }"></span>${escapeHtml(stop.text)}</span>`
    )
    .join("");
  const tail = note.length > 0 ? `<span>${escapeHtml(note)}</span>` : "";
  return `<div class="legend">${inner}${tail}</div>`;
}

/**
 * Tab switching, plus a message so the panel remembers which tab was open.
 *
 * The class toggle is what the reader sees, and it happens without a round
 * trip. The message exists because the panels re-render their whole HTML on a
 * settings or theme change, and a tab that silently jumped back to the first
 * one every time the colour theme changed would look like a bug.
 */
export function tabScript(): string {
  return `for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => {
      const id = button.dataset.tab;
      for (const other of document.querySelectorAll("[data-tab]")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      for (const pane of document.querySelectorAll("[data-pane]")) {
        pane.classList.toggle("on", pane.dataset.pane === id);
      }
      vscode.postMessage({ type: "tab", tab: id });
    });
  }`;
}
