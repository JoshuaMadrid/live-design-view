// Runs the page audit for a Live session and reports it: Problems panel, canvas markers, scores.
import * as vscode from 'vscode';
import { axeFindings, basicChecks, scores, type AxeReport, type Category, type Finding } from './audit';
import type { Hub } from './hub';
import type { LiveSession } from './liveEditorProvider';

const LABEL: Record<Category, string> = { accessibility: 'Accessibility', 'best-practices': 'Best Practices', seo: 'SEO', forms: 'Forms' };
const LIGHTHOUSE = 'lighthouse@13.5.0';

export interface AuditResult {
  findings: Finding[];
  scores: Record<Category, number | null>;
  axeError?: string;
}

export function registerAudit(context: vscode.ExtensionContext, hub: Hub) {
  const collection = vscode.languages.createDiagnosticCollection('liveDesign.audit');
  const results = new Map<string, AuditResult>();

  const sessionFor = (uri?: vscode.Uri) => (uri ? hub.sessionFor(uri) : undefined) ?? hub.active;

  async function audit(s: LiveSession): Promise<AuditResult> {
    const axeUrl = s.panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'vendor', 'axe.min.js')).toString();
    const axe = await s.runAxe(axeUrl);
    const basic = basicChecks(s.model);
    const a = axe && !('error' in axe) ? axeFindings(axe) : { findings: [], checks: [] };
    const findings = [...a.findings, ...basic.findings];
    const sc = scores([...a.checks, ...basic.checks]);
    if (!axe || 'error' in axe) sc.accessibility = null;
    const res: AuditResult = { findings, scores: sc, axeError: axe && 'error' in axe ? axe.error : axe ? undefined : 'The page did not answer (still rendering?).' };
    results.set(s.document.uri.toString(), res);
    publish(s, res);
    return res;
  }

  function publish(s: LiveSession, res: AuditResult) {
    const doc = s.document;
    const diags = res.findings.map((f) => {
      const n = f.nodeId !== undefined ? s.model.nodes[f.nodeId] : undefined;
      const range = n?.located
        ? new vscode.Range(doc.positionAt(n.stStart), doc.positionAt(n.stEnd))
        : new vscode.Range(0, 0, 0, Math.min(15, doc.lineAt(0).text.length));
      const sev = f.impact === 'critical' ? vscode.DiagnosticSeverity.Error : f.impact === 'minor' ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;
      const d = new vscode.Diagnostic(range, f.message, sev);
      d.source = `Live Design · ${LABEL[f.category]}`;
      d.code = f.helpUrl ? { value: f.rule, target: vscode.Uri.parse(f.helpUrl) } : f.rule;
      return d;
    });
    collection.set(doc.uri, diags);
    const note = res.axeError ? `Accessibility not checked: ${res.axeError}` : '';
    s.showAuditMarkers(
      res.findings.map((f) => ({ id: f.nodeId, impact: f.impact, category: LABEL[f.category], message: f.message })),
      res.scores,
      note,
    );
  }

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidCloseTextDocument((d) => collection.delete(d.uri)),
    vscode.commands.registerCommand('liveDesign.audit', async (uri?: vscode.Uri) => {
      const s = sessionFor(uri instanceof vscode.Uri ? uri : undefined);
      if (!s) {
        void vscode.window.showInformationMessage('Open an HTML file in Design or Split view to audit it.');
        return undefined;
      }
      const res = await audit(s);
      const sc = res.scores;
      const fmt = (c: Category) => `${LABEL[c]} ${sc[c] ?? '–'}`;
      void vscode.window.setStatusBarMessage(`Audit: ${fmt('accessibility')} · ${fmt('best-practices')} · ${fmt('seo')} · ${fmt('forms')} — ${res.findings.length} issue(s)`, 8000);
      return res;
    }),
    vscode.commands.registerCommand('liveDesign.auditShow', async () => {
      await vscode.commands.executeCommand('workbench.actions.view.problems');
    }),
    vscode.commands.registerCommand('liveDesign.lighthouse', async (uri?: vscode.Uri) => {
      const s = sessionFor(uri instanceof vscode.Uri ? uri : undefined);
      const target = s?.document.uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return void vscode.window.showInformationMessage('Open an HTML file to run Lighthouse on it.');
      if (s?.document.isDirty) await s.document.save();
      const term = vscode.window.createTerminal({ name: 'Lighthouse', cwd: vscode.workspace.getWorkspaceFolder(target)?.uri });
      term.show();
      // Needs Node and Google Chrome. Lighthouse opens its HTML report when done.
      term.sendText(`npx --yes ${LIGHTHOUSE} "${target.toString()}" --only-categories=accessibility,best-practices,seo --chrome-flags="--headless=new --allow-file-access-from-files" --output=html --output-path=./lighthouse-report.html --view`);
    }),
  );
  return { audit, results, collection };
}
