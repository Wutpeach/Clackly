const fs = require('node:fs');
const path = require('node:path');
const yauzl = require('yauzl');
const semver = require('semver');
const { crc32 } = require('node:zlib');
const { SchemaValidator } = require('../config/SchemaValidator');
const { validateCommandUi } = require('./commandUi');

const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 32 * 1024 * 1024;
const validator = new SchemaValidator();
function fail(code, message) { return Object.assign(new Error('[' + code + '] ' + message), { code }); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function safePath(name) {
  if (typeof name !== 'string' || !name || name.length > 180 || /[\\:\x00-\x1f<>"|?*]/.test(name)
    || name.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw fail('EXTENSION_INVALID_PATH', '包内路径无效。');
  }
  return name;
}
function validateManifest(value) {
  if (!plain(value) || ![1, 2].includes(value.schemaVersion) || !ID.test(value.id || '') || value.id.length > 80
    || ['constructor', 'prototype'].includes(value.id)
    || !semver.valid(value.version) || value.version !== semver.valid(value.version)
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120
    || !Array.isArray(value.commands) || !value.commands.length || value.commands.length > 100) {
    throw fail('EXTENSION_INVALID_MANIFEST', 'Manifest 身份、版本或命令无效。');
  }
  for (const key of ['description', 'source']) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 2000)) {
      throw fail('EXTENSION_INVALID_MANIFEST', 'Manifest ' + key + ' 无效。');
    }
  }
  const ids = new Set();
  const commands = value.commands.map((command) => {
    if (!plain(command) || !ID.test(command.id || '') || command.id.length > 80 || ids.has(command.id)
      || typeof command.name !== 'string' || !command.name.trim() || command.name.length > 120
      || command.description !== undefined && (typeof command.description !== 'string' || command.description.length > 2000)
      || command.keywords !== undefined && (!Array.isArray(command.keywords) || command.keywords.length > 50
        || command.keywords.some((word) => typeof word !== 'string' || word.length > 120))) {
      throw fail('EXTENSION_INVALID_MANIFEST', 'Manifest 命令或 ID 冲突。');
    }
    safePath(command.entry);
    if (!command.entry.endsWith('.py')) throw fail('EXTENSION_INVALID_MANIFEST', 'V1 仅支持 Python .py 入口。');
    ids.add(command.id);
    if (command.view !== undefined && (value.schemaVersion !== 2 || !plain(command.view)
      || Object.keys(command.view).join(',') !== 'version' || command.view.version !== 1 || command.ui !== undefined)) {
      throw fail('EXTENSION_INVALID_MANIFEST', 'Open View 需要 schemaVersion 2、view.version 1，且不能同时声明 Command UI。');
    }
    return { id: command.id, name: command.name, description: command.description || '',
      entry: command.entry, keywords: command.keywords || [],
      ...(command.view === undefined ? {} : { view: { version: 1 } }),
      ...(command.ui === undefined ? {} : { ui: validateCommandUi(command.ui) }) };
  });
  const schema = value.configSchema === undefined ? {} : value.configSchema;
  validator.validateSchema(schema);
  if (Object.keys(schema).length > 50 || Object.keys(schema).some((key) => !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(key)
    || ['__proto__', 'constructor', 'prototype'].includes(key))) throw fail('EXTENSION_INVALID_MANIFEST', '配置字段无效。');
  const configSchema = Object.fromEntries(Object.entries(schema).map(([key, field]) => [key,
    Object.fromEntries(['type', 'label', 'required', 'options'].filter((key) => field[key] !== undefined)
      .map((key) => [key, field[key]]))]));
  for (const [key, field] of Object.entries(configSchema)) field.label ||= key;
  return { schemaVersion: value.schemaVersion, id: value.id, name: value.name, version: value.version,
    description: value.description || '', source: value.source || '', commands, configSchema };
}

// Freeze one bounded archive before writing any member into a private staging directory.
function readPackage(file) {
  if (path.extname(file).toLowerCase() !== '.clackly' || !fs.lstatSync(file).isFile()
    || fs.statSync(file).size > MAX_TOTAL) throw fail('EXTENSION_INVALID_PACKAGE', '请选择有效的 .clackly 文件（最大 32 MiB）。');
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) { reject(fail('EXTENSION_INVALID_PACKAGE', '无法读取 ZIP 包。')); return; }
      const files = new Map();
      const entries = new Map();
      const spellings = new Map();
      let total = 0;
      let count = 0;
      let done = false;
      let active;
      const finish = (error, result) => {
        if (done) return;
        done = true;
        active?.destroy(); zip.close();
        if (error) reject(error); else resolve(result);
      };
      zip.on('error', () => finish(fail('EXTENSION_INVALID_PACKAGE', 'ZIP 包损坏。')));
      zip.on('entry', (entry) => {
        try {
          const directory = entry.fileName.endsWith('/');
          const name = safePath(directory ? entry.fileName.slice(0, -1) : entry.fileName);
          const key = name.toLowerCase();
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (++count > 512 || entries.has(key) || entry.generalPurposeBitFlag & 1
            || ![0, 0x8000, 0x4000].includes(mode) || entry.externalFileAttributes & 0x400
            || mode === 0x8000 && directory || mode === 0x4000 && !directory
            || ![0, 8].includes(entry.compressionMethod)
            || entry.uncompressedSize > MAX_FILE || directory && entry.uncompressedSize !== 0
            || (total += entry.uncompressedSize) > MAX_TOTAL) throw fail('EXTENSION_INVALID_PACKAGE', '包大小、链接或重复条目无效。');
          const parts = name.split('/');
          for (let i = 1; i <= parts.length; i++) {
            const prefix = parts.slice(0, i).join('/');
            const old = spellings.get(prefix.toLowerCase());
            if (old && old !== prefix || i < parts.length && entries.get(prefix.toLowerCase()) === false) {
              throw fail('EXTENSION_INVALID_PACKAGE', '包内文件路径冲突。');
            }
            spellings.set(prefix.toLowerCase(), prefix);
          }
          if (!directory && [...entries.keys()].some((old) => old.startsWith(key + '/'))) throw fail('EXTENSION_INVALID_PACKAGE', '包内文件路径冲突。');
          entries.set(key, directory);
          if (directory) { zip.readEntry(); return; }
          zip.openReadStream(entry, (error, stream) => {
            if (done) { stream?.destroy(); return; }
            if (error) { finish(error); return; }
            active = stream;
            const chunks = [];
            let size = 0;
            let crc = 0;
            stream.on('error', (error) => finish(error));
            stream.on('data', (chunk) => {
              size += chunk.length;
              crc = crc32(chunk, crc);
              if (size > entry.uncompressedSize || size > MAX_FILE) finish(fail('EXTENSION_INVALID_PACKAGE', '解压大小不符。'));
              else chunks.push(chunk);
            });
            stream.on('end', () => {
              if (done) return;
              if (size !== entry.uncompressedSize || crc !== entry.crc32) { finish(fail('EXTENSION_INVALID_PACKAGE', 'ZIP 文件校验失败。')); return; }
              files.set(name, Buffer.concat(chunks)); active = null; zip.readEntry();
            });
          });
        } catch (error) { finish(error); }
      });
      zip.on('end', () => {
        try {
          const bytes = files.get('manifest.json');
          if (!bytes || bytes.length > 128 * 1024) throw fail('EXTENSION_INVALID_MANIFEST', '根目录缺少 manifest.json 或文件过大。');
          const manifest = validateManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
          for (const command of manifest.commands) {
            if (!files.has(command.entry)) throw fail('EXTENSION_ENTRY_MISSING', '缺少入口：' + command.entry);
          }
          finish(null, { manifest, files });
        } catch (error) { finish(error); }
      });
      zip.readEntry();
    });
  });
}
module.exports = { ID, safePath, validateManifest, readPackage, fail };
