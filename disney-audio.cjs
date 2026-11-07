// Rewrite only the known untagged Darkwing file's FFmpeg source selectors.
// The launcher then execs the real FFmpeg, preserving process/signal behaviour.
const fs = require('node:fs');
const path = require('node:path');

function shellQuote(value) { return "'" + value.replace(/'/g, "'\\''") + "'"; }
function rewriteArgs(original, config) {
  const args = [...original];
  const inputPositions = [];
  for (let i = 0; i < args.length - 1; i++) if (args[i] === '-i') inputPositions.push(i + 1);
  const input = inputPositions.findIndex(i => args[i].replace(/^file:/, '') === config.path);
  if (input < 0) return { args, applied: false };
  if (config.version !== 1 || !['da', 'en'].includes(config.language) ||
      !Number.isInteger(config.videoIndex) || !Number.isInteger(config.audioIndex)) {
    throw new Error('Invalid Darkwing audio override configuration');
  }
  let audioSelectors = 0;
  const audioFilter = /^(?:aresample|aformat|apad|anull|asetpts|atrim|volume|loudnorm|pan)(?:[=,]|$)/;
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '-filter_complex' || args[i] === '-lavfi') {
      args[i + 1] = args[i + 1].split(';').map(chain => {
        const match = chain.match(/^\[(\d+):(?:\d+|[av](?::\d+)?)\](.*)$/s);
        if (!match || Number(match[1]) !== input) return chain;
        if (audioFilter.test(match[2])) {
          audioSelectors++;
          return `[${input}:${config.audioIndex}]${match[2]}`;
        }
        return `[${input}:${config.videoIndex}]${match[2]}`;
      }).join(';');
    }
  }
  // Tunarr normally uses labelled audio/video filter outputs. Support typed direct maps too.
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] !== '-map') continue;
    if (new RegExp(`^${input}:a(?::\\d+)?\\??$`).test(args[i + 1])) {
      args[i + 1] = `${input}:${config.audioIndex}`; audioSelectors++;
    } else if (new RegExp(`^${input}:v(?::\\d+)?\\??$`).test(args[i + 1])) {
      args[i + 1] = `${input}:${config.videoIndex}`;
    }
  }
  if (audioSelectors !== 1) throw new Error('Darkwing override needs exactly one recognised audio selector; refusing wrong-language playback');
  return { args, applied: true };
}
module.exports = { rewriteArgs, shellQuote };

if (require.main === module) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'disney-audio.json'), 'utf8'));
    const result = rewriteArgs(process.argv.slice(2), config);
    process.stdout.write(result.args.map(shellQuote).join(' '));
  } catch (error) {
    process.stderr.write(`Disney audio selector: ${error.message}\n`);
    process.exitCode = 1;
  }
}
