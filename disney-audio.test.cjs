const assert = require('node:assert/strict');
const { rewriteArgs, shellQuote } = require('./disney-audio.cjs');
const config = { version: 1, language: 'da', path: '/data/Darkwing.mkv', videoIndex: 0, audioIndex: 2 };
const sample = ['-hwaccel', 'vaapi', '-i', config.path, '-filter_complex',
  '[0:1]scale_vaapi=w=1920:h=1080[v];[0:4]aresample=async=1,apad[a]',
  '-map', '[v]', '-map', '[a]', '-c:v', 'h264_vaapi', 'output.m3u8'];
const original = [...sample];
const da = rewriteArgs(sample, config);
assert(da.applied);
assert(da.args.includes('[0:0]scale_vaapi=w=1920:h=1080[v];[0:2]aresample=async=1,apad[a]'));
const en = rewriteArgs(sample, { ...config, language: 'en', audioIndex: 1 });
assert(en.args.includes('[0:0]scale_vaapi=w=1920:h=1080[v];[0:1]aresample=async=1,apad[a]'));
assert.deepEqual(sample, original);
assert.deepEqual(rewriteArgs(['-version'], config), { args: ['-version'], applied: false });
const cn = sample.map(s => s === config.path ? '/data/Courage.mp4' : s);
assert.deepEqual(rewriteArgs(cn, config), { args: cn, applied: false });
const direct = rewriteArgs(['-i', config.path, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], config);
assert.deepEqual(direct.args, ['-i', config.path, '-map', '0:0', '-map', '0:2', '-f', 'null', '-']);
assert.throws(() => rewriteArgs(['-i', config.path, '-map', '0'], config));
assert.throws(() => rewriteArgs(sample, { ...config, audioIndex: '2' }));
assert.equal(shellQuote("a'b"), "'a'\\''b'");
assert.equal(shellQuote('$(touch BAD)`x`\n; spaces'), "'$(touch BAD)`x`\n; spaces'");
// Round-trip arguments through a real POSIX shell, including shell metacharacters.
const { execFileSync } = require('node:child_process');
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh';
const tricky = ["a'b", '$(printf UNWANTED)', '`printf UNWANTED`', 'a;b', 'line\nbreak', '', 'space value'];
const script = `node -e ${shellQuote('process.stdout.write(JSON.stringify(process.argv.slice(1)))')} -- ${tricky.map(shellQuote).join(' ')}`;
assert.deepEqual(JSON.parse(execFileSync(shell, ['-c', script], { encoding: 'utf8' })), tricky);
console.log('PASS: exact-file targeting, DA/EN tracks, shifted video index, unchanged CN/version calls, typed maps, rejection and shell quoting.');
