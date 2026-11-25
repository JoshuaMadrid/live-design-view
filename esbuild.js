const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const tests = process.argv.includes('--tests');

/** Logs build errors in a format VS Code's problem matcher understands. */
const problemMatcher = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => console.log('[watch] build started'));
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`);
      }
      console.log('[watch] build finished');
    });
  },
};

/** Copies the codicon font into media/ so the webviews can use VS Code's own icons. */
function copyCodicons() {
  const fs = require('fs');
  const path = require('path');
  const src = path.join(__dirname, 'node_modules/@vscode/codicons/dist');
  const dst = path.join(__dirname, 'media/codicons');
  fs.mkdirSync(dst, { recursive: true });
  for (const f of ['codicon.css', 'codicon.ttf']) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}

/** Copies axe-core (the engine behind Lighthouse's accessibility audits) into media/vendor. */
function copyAxe() {
  const fs = require('fs');
  const path = require('path');
  const dst = path.join(__dirname, 'media/vendor');
  fs.mkdirSync(dst, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'node_modules/axe-core/axe.min.js'), path.join(dst, 'axe.min.js'));
}

async function main() {
  if (!tests) {
    copyCodicons();
    copyAxe();
  }
  const ctx = await esbuild.context(
    tests
      ? {
          entryPoints: ['test/integration/runTest.ts', 'test/integration/index.ts', 'test/integration/live.test.ts', 'test/integration/demo.ts', 'test/integration/runTour.ts', 'test/integration/tour.ts'],
          bundle: true,
          format: 'cjs',
          platform: 'node',
          outdir: 'out/test',
          external: ['vscode', 'mocha', '@vscode/test-electron'],
          logLevel: 'silent',
          plugins: [problemMatcher],
        }
      : {
          entryPoints: ['src/extension.ts'],
          bundle: true,
          format: 'cjs',
          minify: production,
          sourcemap: !production,
          sourcesContent: false,
          platform: 'node',
          target: 'node18',
          outfile: 'dist/extension.js',
          external: ['vscode'],
          logLevel: 'silent',
          plugins: [problemMatcher],
        },
  );
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
