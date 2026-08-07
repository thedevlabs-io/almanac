// ABOUTME: The report tab — one reused panel, redrawn when the range or rounding changes.
// ABOUTME: Formats every duration here so the webview never does time maths.

import * as vscode from "vscode";
import { duration } from "../core/format";
import type { Report } from "../core/report";
import { reportHtml, type ReportView } from "./reportHtml";

export interface ReportActions {
  setRange(preset: string): void;
  setRounding(rounding: string): void;
  exportCsv(): void;
  editClients(): void;
}

export function toView(
  report: Report,
  presets: { id: string; label: string }[],
  activePreset: string
): ReportView {
  return {
    report,
    presets,
    activePreset,
    rounding: report.rounding,
    labels: {
      total: duration(report.totalSeconds),
      rounded: duration(report.totalRounded),
      unassigned: duration(report.unassignedSeconds),
      clients: report.clients.map((client) => ({
        client: client.client,
        total: duration(client.seconds),
        rounded: duration(client.rounded),
        projects: client.projects.map((p) => ({ project: p.project, total: duration(p.seconds) })),
      })),
      days: report.byDay.map((day) => ({
        date: day.date,
        total: duration(day.seconds),
        rounded: duration(day.rounded),
        entries: day.entries.map((entry) => ({
          label: entry.client,
          total: duration(entry.seconds),
        })),
      })),
    },
  };
}

export class ReportPanel {
  private static panel: vscode.WebviewPanel | undefined;
  private static actions: ReportActions | undefined;

  static show(view: ReportView, actions: ReportActions): void {
    ReportPanel.actions = actions;
    if (!ReportPanel.panel) {
      const panel = vscode.window.createWebviewPanel(
        "almanac.report",
        "Almanac — Report",
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      ReportPanel.panel = panel;
      panel.onDidDispose(() => (ReportPanel.panel = undefined));
      panel.webview.onDidReceiveMessage((raw: unknown) => {
        if (raw === null || typeof raw !== "object") {
          return;
        }
        const msg = raw as { type?: unknown; preset?: unknown; rounding?: unknown };
        const current = ReportPanel.actions;
        if (msg.type === "range") {
          current?.setRange(String(msg.preset));
        } else if (msg.type === "rounding") {
          current?.setRounding(String(msg.rounding));
        } else if (msg.type === "csv") {
          current?.exportCsv();
        } else if (msg.type === "clients") {
          current?.editClients();
        }
      });
    }
    ReportPanel.panel.webview.html = reportHtml(view);
    ReportPanel.panel.reveal(ReportPanel.panel.viewColumn);
  }

  static close(): void {
    ReportPanel.panel?.dispose();
  }
}
