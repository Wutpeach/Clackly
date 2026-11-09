const assert = require('node:assert/strict');
const fs = require('node:fs');
const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit');

const bytes = (icon) => Buffer.from(icon.isRaw() ? icon.bin : icon.generate());

// Check the default shell icon, including the independently drawn small frames.
function verifyWindowsIcon(executable, ico) {
  const expected = Data.IconFile.from(ico).icons.map(({ data }) => bytes(data));
  const entries = NtExecutableResource.from(NtExecutable.from(executable)).entries;
  const group = Resource.IconGroupEntry.fromEntries(entries)[0];
  assert(group, 'Executable has no default icon');
  const actual = group.getIconItemsFromEntries(entries).map(bytes);
  assert.equal(actual.length, expected.length, 'Executable icon frame count differs from ICO');
  actual.forEach((frame, index) => assert(frame.equals(expected[index]),
    'Executable icon frame differs from ICO: ' + index));
  return group.icons.map(({ width }) => width || 256);
}

if (require.main === module) {
  const [executable, ico] = process.argv.slice(2);
  console.log(JSON.stringify({ executable, sizes: verifyWindowsIcon(fs.readFileSync(executable), fs.readFileSync(ico)) }));
}
module.exports = { verifyWindowsIcon };
