/**
 * 本地生成阿里风控参数 bx-ua / bx-umidtoken（不依赖 Chrome/CDP）
 *
 *   node gen_bx_params.js
 *   node gen_bx_params.js --url "//h5api.m.goofish.com/h5/mtop.xxx/1.0/?..."
 *   node gen_bx_params.js --no-json
 */
const { spawnSync } = require("child_process");
const path = require("path");

function parseArgs(argv) {
  const out = { url: null, json: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") out.url = argv[++i];
    else if (a === "--no-json") out.json = false;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node gen_bx_params.js [--url <reqUrl>] [--no-json]`);
    process.exit(0);
  }

  const childArgs = [path.join(__dirname, "run_bx_ua_local.js")];
  if (args.url) childArgs.push("--url", args.url);
  if (args.json) childArgs.push("--json");

  const r = spawnSync(process.execPath, childArgs, {
    cwd: __dirname,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

main();
