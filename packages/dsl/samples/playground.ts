import { readFileSync } from 'node:fs';
import { parse, serialize } from '../src/index';

// --- 1. Read the sample DSL file ---
const dslText = readFileSync(new URL('./ecommerce.dsl', import.meta.url), 'utf-8');

console.log('=== INPUT DSL ===');
console.log(dslText);

// --- 2. Parse DSL → ArchitectureModel ---
const result = parse(dslText);

if (!result.ok) {
  console.error('=== PARSE ERRORS ===');
  result.errors.forEach((e) =>
    console.error(`  [${e.errorCode}] line ${e.location.line ?? '?'}: ${e.message}`)
  );
  process.exit(1);
}

const model = result.model;

console.log('=== PARSED MODEL ===');
console.log(`Elements (${model.elements.length}):`);
for (const el of model.elements) {
  const indent = el.parentId ? '    ' : '  ';
  const parent = el.parentId ? ` (parent: ${el.parentId})` : '';
  console.log(`${indent}[${el.kind}] "${el.name}" — id: ${el.id}${parent}`);
}

console.log(`\nRelationships (${model.relationships.length}):`);
for (const rel of model.relationships) {
  const src = model.elements.find((e) => e.id === rel.sourceId)?.name ?? rel.sourceId;
  const tgt = model.elements.find((e) => e.id === rel.targetId)?.name ?? rel.targetId;
  const label = rel.label ? ` "${rel.label}"` : '';
  console.log(`  "${src}" -> "${tgt}" [${rel.type}]${label}`);
}

// --- 3. Serialize back → DSL (round-trip check) ---
const roundTripped = serialize(model);
console.log('\n=== SERIALIZED BACK TO DSL ===');
console.log(roundTripped);

// --- 4. Verify round-trip ---
const reparsed = parse(roundTripped);
if (reparsed.ok) {
  console.log(
    `\n✓ Round-trip OK — reparsed ${reparsed.model.elements.length} elements, ${reparsed.model.relationships.length} relationships`
  );
} else {
  console.error('\n✗ Round-trip FAILED');
}
