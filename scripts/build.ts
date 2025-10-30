#!/usr/bin/env bun

const builds = [
  { entry: 'src/index.ts', outdir: 'dist' },
  { entry: 'src/acids/index.ts', outdir: 'dist/acids' },
  { entry: 'src/acids/hono/index.ts', outdir: 'dist/acids/hono' },
] as const;

for (const { entry, outdir } of builds) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: 'node',
  });
  
  if (!result.success) {
    console.error(`Failed to build ${entry}`);
    process.exit(1);
  }
}

