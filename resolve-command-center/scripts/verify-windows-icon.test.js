const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit');
const { verifyWindowsIcon } = require('./verify-windows-icon');
const ico = fs.readFileSync(path.join(__dirname, '../resources/icons/clackly.ico'));
function executable(icons) {
  const exe = NtExecutable.createEmpty();
  const resources = NtExecutableResource.from(exe);
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, icons);
  resources.outputResource(exe);
  return Buffer.from(exe.generate());
}
test('packaged EXE preserves all size-specific Satin Enamel A frames and rejects a lost small frame', () => {
  const icons = Data.IconFile.from(ico).icons.map(({ data }) => data);
  assert.deepEqual(verifyWindowsIcon(executable(icons), ico), [16, 20, 24, 32, 48, 64, 128, 256]);
  assert.throws(() => verifyWindowsIcon(executable(icons.slice(1)), ico), /frame count/);
  const changed = icons.slice();
  changed[0] = icons[1];
  assert.throws(() => verifyWindowsIcon(executable(changed), ico), /frame differs/);
});
