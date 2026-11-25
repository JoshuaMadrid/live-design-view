import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

async function main() {
  const root = path.resolve(__dirname, '../..');
  // Tests mutate the page, so work on a throwaway copy of the sample site (path has a space on purpose).
  const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'live design ws-')));
  fs.cpSync(path.join(root, 'test-site'), ws, { recursive: true });
  // Short user-data dir: macOS caps IPC socket paths at 103 chars.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ldv-'));
  const local = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_PATH ?? (fs.existsSync(local) ? local : undefined),
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(__dirname, process.env.LD_DEMO ? 'demo.js' : 'index.js'),
    launchArgs: [ws, `--user-data-dir=${userData}`, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
  });
}

main().catch((err) => {
  console.error('Integration tests failed:', err);
  process.exit(1);
});
