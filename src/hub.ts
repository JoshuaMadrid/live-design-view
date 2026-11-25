import * as vscode from 'vscode';
import type { LiveSession } from './liveEditorProvider';

/**
 * Tracks which Live session the side panels (Insert, DOM, Properties) act on:
 * the most recently focused Live editor, or the Live editor of the focused code editor.
 */
export class Hub implements vscode.Disposable {
  private _active: LiveSession | undefined;
  private readonly sessions = new Set<LiveSession>();
  private readonly _onDidChangeActive = new vscode.EventEmitter<LiveSession | undefined>();
  private readonly _onDidChangeSelection = new vscode.EventEmitter<LiveSession>();
  private readonly _onDidChangeModel = new vscode.EventEmitter<LiveSession>();
  readonly onDidChangeActive = this._onDidChangeActive.event;
  /** Fires when the active session's selection changes. */
  readonly onDidChangeSelection = this._onDidChangeSelection.event;
  /** Fires when the active session re-parsed its document. */
  readonly onDidChangeModel = this._onDidChangeModel.event;
  private readonly _onDidRender = new vscode.EventEmitter<LiveSession>();
  /** Fires when the active session's canvas finished rendering a new version. */
  readonly onDidRender = this._onDidRender.event;
  private readonly disposables: vscode.Disposable[] = [];
  /** On-canvas style edits (gap / padding / margin handles, grid tracks). Set by the Styles panel. */
  canvasEdit?: (edit:
    | { kind: 'props'; props: Record<string, string> }
    | { kind: 'track'; axis: 'columns' | 'rows'; op: 'set' | 'add' | 'remove'; index: number; value?: string; computed: string[] }) => Promise<string | undefined>;

  /** Stylesheets / <style> blocks a new rule can go in (set by the Styles panel). */
  ruleSources?: () => Promise<{ key: string; label: string }[]>;
  /** Creates empty rules (".name {}") in a source; "page:new" adds a <style> block first. Set by the Styles panel. */
  createRules?: (selectors: string[], sourceKey: string) => Promise<number>;

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (!e) return;
        const s = [...this.sessions].find((x) => x.document === e.document);
        if (s) this.setActive(s);
      }),
    );
  }

  /** Session showing a document (any mode), if one is open. */
  sessionFor(uri: vscode.Uri): LiveSession | undefined {
    return [...this.sessions].find((x) => x.document.uri.toString() === uri.toString());
  }

  get active(): LiveSession | undefined {
    return this._active;
  }

  add(s: LiveSession) {
    this.sessions.add(s);
    if (!this._active || s.panel.active) this.setActive(s);
  }

  remove(s: LiveSession) {
    this.sessions.delete(s);
    if (this._active === s) this.setActive([...this.sessions].at(-1));
  }

  setActive(s: LiveSession | undefined) {
    if (this._active === s) return;
    this._active = s;
    void vscode.commands.executeCommand('setContext', 'liveDesign.hasSession', !!s);
    this._onDidChangeActive.fire(s);
  }

  selectionChanged(s: LiveSession) {
    if (s === this._active) this._onDidChangeSelection.fire(s);
  }

  modelChanged(s: LiveSession) {
    if (s === this._active) this._onDidChangeModel.fire(s);
  }

  rendered(s: LiveSession) {
    if (s === this._active) this._onDidRender.fire(s);
  }

  dispose() {
    this._onDidRender.dispose();
    this.disposables.forEach((d) => d.dispose());
    this._onDidChangeActive.dispose();
    this._onDidChangeSelection.dispose();
    this._onDidChangeModel.dispose();
  }
}
