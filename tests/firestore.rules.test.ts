import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rules = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('firestore.rules enforces default-deny catch-all and covers every blueprint collection', () => {
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);

  const collectionNames = Object.keys(blueprint.firestore).map((p) => p.split('/')[1]);
  for (const name of collectionNames) {
    assert.ok(
      rules.includes(`match /${name}/`),
      `Expected firestore.rules to explicitly secure collection /${name}/`
    );
  }
});

test('firestore.rules passes Dirty Dozen security invariant checks', () => {
  // 1. Email spoofing prevention on bootstrap owner
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  // 2. Trusted admin lookup (no client custom claims)
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.uid\)\)/);
  assert.doesNotMatch(rules, /request\.auth\.token\.role|request\.auth\.token\.admin/);
  // 3. Strict key allowlists (shadow field protection)
  assert.match(rules, /data\.keys\(\)\.hasAll/);
  assert.match(rules, /data\.keys\(\)\.hasOnly/);
  // 4. Immutable retention window on reading updates
  assert.match(rules, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rules, /incoming\(\)\.expiresAt == existing\(\)\.expiresAt/);
  // 5. Server timestamps enforced
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);
  // 6. Atomic photo pairing on reading creation & edit
  assert.match(rules, /existsAfter\(\/databases\/\$\(database\)\/documents\/reading_photos\/\$\(incoming\(\)\.photoId\)\)/);
  // 7. Secure list queries on readings & photos
  assert.match(rules, /resource\.data\.submittedBy == request\.auth\.uid/);
  assert.match(rules, /resource\.data\.ownerUid == request\.auth\.uid/);
  // 8. Per-plant motor interlock validates parent plant existence and updater identity
  assert.match(rules, /match \/plant_motor_states\/\{plantId\}/);
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/plants\/\$\(plantId\)\)/);
  assert.match(rules, /incoming\(\)\.updatedBy == request\.auth\.uid/);
  // 9. Active members can only perform one-way Running -> Stopped transition on readings
  assert.match(rules, /existing\(\)\.motorStatus == 'Running'/);
  assert.match(rules, /incoming\(\)\.motorStatus == 'Stopped'/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['motorStatus', 'updatedAt'\]\)/);
});
