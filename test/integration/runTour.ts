// Launches real desktop VS Code with the extension and plays the scripted tour (tour.ts) for a
// screen recording: `node out/test/runTour.js` with LD_TOUR_DIR set (markers + sync files go there).
import * as path from 'path';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function main() {
  const root = path.resolve(__dirname, '../..');
  const dir = process.env.LD_TOUR_DIR!;
  // LD_TOUR_SITE: folder to start from (default: the sample site); LD_TOUR_FOLDER: its name on screen.
  const ws = path.join(dir, process.env.LD_TOUR_FOLDER || 'my-site');
  fs.rmSync(ws, { recursive: true, force: true });
  fs.cpSync(process.env.LD_TOUR_SITE || path.join(root, 'test-site'), ws, { recursive: true });
  // LD_TOUR_MARKET=1: start with no extensions at all; the tour installs Live Design View from the Marketplace.
  const market = !!process.env.LD_TOUR_MARKET;
  const extDir = fs.mkdtempSync('/tmp/ldx-');
  const userData = fs.mkdtempSync('/tmp/ldt-');
  fs.mkdirSync(path.join(userData, 'User'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'User', 'settings.json'), JSON.stringify({
    'window.titleBarStyle': 'native',
    'window.nativeFullScreen': true,
    'window.title': '${activeEditorShort}',
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'workbench.colorTheme': 'Live Design Modern',
    'liveDesign.uiTheme': 'modern',
    'editor.fontSize': 14,
    'editor.minimap.enabled': false,
    'chat.commandCenter.enabled': false,
    'chat.disableAIFeatures': true,
    'workbench.layoutControl.enabled': false,
    'window.commandCenter': false,
    'telemetry.telemetryLevel': 'off',
    'extensions.ignoreRecommendations': true,
    'update.mode': 'none',
    'security.workspace.trust.enabled': false,
    'files.autoSave': 'off',
  }, null, 2));
  const local = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
  await runTests({
    vscodeExecutablePath: fs.existsSync(local) ? local : undefined,
    extensionDevelopmentPath: market ? path.join(root, 'test/integration/tour-host') : root,
    extensionTestsPath: path.join(__dirname, process.env.LD_TOUR_SCRIPT || 'tour.js'),
    launchArgs: [ws, `--user-data-dir=${userData}`, ...(market ? [`--extensions-dir=${extDir}`] : ['--disable-extensions']), '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      ...(process.env.LD_CDP_PORT ? [`--remote-debugging-port=${process.env.LD_CDP_PORT}`] : [])],
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
