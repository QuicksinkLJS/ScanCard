// Twin test: how well do card passports tell the same copy from another copy?
// Input: the file from Curio › More › Backup & export › "Card passports (for the twin test)".
//   node tools/passport_eval.mjs curio-passports-2026-11-08.json
// Ground truth comes from what you recorded:
//   * passports of one collection card with different notes (e.g. "A" and "B") = different copies
//   * a check answered "Yes, the same card" = the same copy as its passport; "No, another copy" = another copy
// Prints every comparison and suggests limits (js/passport.js LIMITS) that separate the two groups.
import { readFileSync } from 'node:fs';
import { comparePass, unpackFeatures, LIMITS } from '../js/passport.js';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/passport_eval.mjs <export.json>'); process.exit(1); }
const data = JSON.parse(readFileSync(file, 'utf8'));
const recs = data.records.map((r) => ({ ...r, f: unpackFeatures(r.feat) })).filter((r) => r.f?.cent);
const byId = new Map(recs.map((r) => [r.id, r]));

// copy identity: passports by (entry, note); checks answered "same" join their passport's copy
const copyOf = new Map();
for (const r of recs) if (r.kind === 'pass') copyOf.set(r.id, `${r.entryId || r.name}|${(r.label || '').toLowerCase()}`);
for (const r of recs) if (r.kind === 'check' && r.truth === 'same' && copyOf.has(r.against)) copyOf.set(r.id, copyOf.get(r.against));

const pairs = [];
const seen = new Set();
const add = (a, b, truth) => {
  const k = [a.id, b.id].sort().join('~');
  if (seen.has(k)) return;
  seen.add(k);
  pairs.push({ a, b, truth, ...comparePass(a.f, b.f) });
};
for (let i = 0; i < recs.length; i++) {
  for (let j = i + 1; j < recs.length; j++) {
    const a = recs[i], b = recs[j];
    if ((a.name || '') !== (b.name || '')) continue;               // only copies of the same card are interesting
    const ca = copyOf.get(a.id), cb = copyOf.get(b.id);
    if (ca && cb) add(a, b, ca === cb ? 'same' : 'other');
  }
}
for (const r of recs) {
  if (r.kind === 'check' && r.truth === 'other' && byId.has(r.against)) add(r, byId.get(r.against), 'other');
}

const fmt = (v, d = 3) => (v == null ? '  –  ' : v.toFixed(d));
console.log(`${recs.length} recordings, ${pairs.length} comparisons with known answer\n`);
console.log('truth  verdict  cent(mm) tex    edge   | a → b');
for (const p of pairs.sort((x, y) => (x.truth > y.truth ? 1 : -1) || x.cent - y.cent)) {
  const mark = p.verdict === p.truth ? '✓' : p.verdict === 'unsure' ? '?' : '✗';
  console.log(`${p.truth.padEnd(6)} ${mark} ${p.verdict.padEnd(6)} ${fmt(p.cent)}   ${fmt(p.tex)}  ${fmt(p.edge)}  | ${p.a.id} ${p.a.label || ''} → ${p.b.id} ${p.b.label || ''}`);
}
const same = pairs.filter((p) => p.truth === 'same'), other = pairs.filter((p) => p.truth === 'other');
const stat = (list, key) => list.map((p) => p[key]).filter((v) => v != null);
const max = (a) => (a.length ? Math.max(...a) : null), min = (a) => (a.length ? Math.min(...a) : null);
console.log('\nseparation (same copy vs other copy):');
const cS = max(stat(same, 'cent')), cO = min(stat(other, 'cent'));
const tS = min(stat(same, 'tex')), tO = max(stat(other, 'tex'));
const eS = min(stat(same, 'edge')), eO = max(stat(other, 'edge'));
console.log(`  print position: same up to ${fmt(cS)} mm, other from ${fmt(cO)} mm ${cS != null && cO != null ? (cS < cO ? '→ separates' : '→ overlaps') : ''}`);
console.log(`  fine details:   same from ${fmt(tS)}, other up to ${fmt(tO)} ${tS != null && tO != null ? (tS > tO ? '→ separates' : '→ overlaps') : ''}`);
console.log(`  edge wear:      same from ${fmt(eS)}, other up to ${fmt(eO)} ${eS != null && eO != null ? (eS > eO ? '→ separates' : '→ overlaps') : ''}`);
const right = pairs.filter((p) => p.verdict === p.truth).length, wrong = pairs.filter((p) => p.verdict !== p.truth && p.verdict !== 'unsure').length;
console.log(`\nwith the current limits ${JSON.stringify(LIMITS)}:\n  ${right} right, ${wrong} wrong, ${pairs.length - right - wrong} unsure`);
if (cS != null && cO != null && cS < cO) console.log(`  suggestion: centSame ≈ ${((cS + cO) / 2).toFixed(2)} (+ margin), centOther ≈ ${(cO * 0.8 + cS * 0.2).toFixed(2)}`);
if (tS != null && tO != null && tS > tO) console.log(`  suggestion: texSame ≈ ${((tS + tO) / 2).toFixed(2)}, texOther ≈ ${(tO).toFixed(2)}`);
if (!same.length || !other.length) console.log('\nNeed both: recordings of the same copy AND of another copy of the same card.');
