import { createMemoryDataStore } from "./memoryDataStore.js";

const DEFAULT_STORE_NAME = "portable Liqwid data archive";
const DEFAULT_ARCHIVE_NAME = "liqwid-data.zip";
const PORTABLE_ARCHIVE_FORMAT = "liqwid-portable-data";
const PORTABLE_ARCHIVE_VERSION = "1";
const PORTABLE_ARCHIVE_MIME = "application/zip";
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_LOCAL_HEADER_SIZE = 30;
const ZIP_CENTRAL_HEADER_SIZE = 46;
const ZIP_END_SIZE = 22;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export const PORTABLE_DATA_MANIFEST_PATH = "liqwid-portable-manifest.csv";

export function createPortableDataStore(initialEntries = [], options = {}) {
  return createMemoryDataStore(initialEntries, { ...options, name: options.name ?? DEFAULT_STORE_NAME });
}

export function encodeZip(inputEntries) {
  return encodePreparedZip(prepareZipEntries(inputEntries));
}

export async function encodeZipArchive(inputEntries, options = {}) {
  const entries = prepareZipEntries(inputEntries);
  const CompressionStreamConstructor = options.CompressionStream ?? globalThis.CompressionStream;
  if (typeof CompressionStreamConstructor !== "function") return encodePreparedZip(entries);
  try {
    for (const entry of entries) {
      const compressed = await transformBytes(entry.dataBytes, CompressionStreamConstructor, "deflate-raw");
      if (compressed.length < entry.dataBytes.length) {
        entry.method = 8;
        entry.storedBytes = compressed;
      }
    }
  } catch {
    for (const entry of entries) {
      entry.method = 0;
      entry.storedBytes = entry.dataBytes;
    }
    return encodePreparedZip(entries);
  }
  return encodePreparedZip(entries);
}

function prepareZipEntries(inputEntries) {
  const entries = [...inputEntries].map((entry) => {
    const path = relativePath(entry?.path);
    if (typeof entry?.text !== "string") throw new Error(`ZIP entry must contain UTF-8 text: ${path}`);
    const nameBytes = textEncoder.encode(path);
    const dataBytes = textEncoder.encode(entry.text);
    if (nameBytes.length > 0xffff) throw new Error(`ZIP entry path is too long: ${path}`);
    if (dataBytes.length > 0xffffffff) throw new Error(`ZIP entry is too large: ${path}`);
    return { path, nameBytes, dataBytes, storedBytes: dataBytes, method: 0, crc: crc32(dataBytes) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (entries.length > 0xffff) throw new Error("ZIP64 is not supported: too many entries.");
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].path === entries[index].path) {
      throw new Error(`Duplicate ZIP entry path: ${entries[index].path}`);
    }
  }
  return entries;
}

function encodePreparedZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  for (const entry of entries) {
    assertUint32(localOffset, "ZIP local-header offset");
    const localHeader = new Uint8Array(ZIP_LOCAL_HEADER_SIZE + entry.nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, ZIP_UTF8_FLAG, true);
    localView.setUint16(8, entry.method, true);
    localView.setUint32(14, entry.crc, true);
    localView.setUint32(18, entry.storedBytes.length, true);
    localView.setUint32(22, entry.dataBytes.length, true);
    localView.setUint16(26, entry.nameBytes.length, true);
    localHeader.set(entry.nameBytes, ZIP_LOCAL_HEADER_SIZE);
    localChunks.push(localHeader, entry.storedBytes);

    const centralHeader = new Uint8Array(ZIP_CENTRAL_HEADER_SIZE + entry.nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, ZIP_UTF8_FLAG, true);
    centralView.setUint16(10, entry.method, true);
    centralView.setUint32(16, entry.crc, true);
    centralView.setUint32(20, entry.storedBytes.length, true);
    centralView.setUint32(24, entry.dataBytes.length, true);
    centralView.setUint16(28, entry.nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(entry.nameBytes, ZIP_CENTRAL_HEADER_SIZE);
    centralChunks.push(centralHeader);

    localOffset += localHeader.length + entry.storedBytes.length;
  }

  const centralOffset = localOffset;
  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  assertUint32(centralOffset, "ZIP central-directory offset");
  assertUint32(centralSize, "ZIP central-directory size");
  assertUint32(centralOffset + centralSize, "ZIP archive size");

  const end = new Uint8Array(ZIP_END_SIZE);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  return joinBytes([...localChunks, ...centralChunks, end]);
}

export function decodeZip(input) {
  return readZipRecords(input).map((record) => {
    if (record.method !== 0) throw new Error(`Compressed ZIP entries require asynchronous decoding: ${record.path}`);
    return decodeZipRecord(record, record.storedBytes);
  });
}

export async function decodeZipArchive(input, options = {}) {
  const records = readZipRecords(input);
  const DecompressionStreamConstructor = options.DecompressionStream ?? globalThis.DecompressionStream;
  const entries = [];
  for (const record of records) {
    if (record.method === 0) {
      entries.push(decodeZipRecord(record, record.storedBytes));
      continue;
    }
    if (typeof DecompressionStreamConstructor !== "function") {
      throw new Error(`This browser cannot decompress ZIP entry: ${record.path}`);
    }
    let dataBytes;
    try {
      dataBytes = await transformBytes(record.storedBytes, DecompressionStreamConstructor, "deflate-raw");
    } catch {
      throw new Error(`ZIP decompression failed: ${record.path}`);
    }
    entries.push(decodeZipRecord(record, dataBytes));
  }
  return entries;
}

function readZipRecords(input) {
  const bytes = byteView(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findZipEnd(view);
  const diskNumber = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Multi-disk and ZIP64 archives are not supported.");
  }
  if (centralOffset + centralSize !== endOffset) throw new Error("Invalid ZIP central directory bounds.");

  const records = [];
  const paths = new Set();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(bytes, offset, ZIP_CENTRAL_HEADER_SIZE, "central directory entry");
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid ZIP central directory signature.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expectedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const centralEntrySize = ZIP_CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
    requireRange(bytes, offset, centralEntrySize, "central directory entry");
    validateZipEntryFlags(flags, method);

    const centralNameBytes = bytes.subarray(offset + ZIP_CENTRAL_HEADER_SIZE, offset + ZIP_CENTRAL_HEADER_SIZE + nameLength);
    const path = relativePath(decodeUtf8(centralNameBytes, "ZIP entry path"));
    if (paths.has(path)) throw new Error(`Duplicate ZIP entry path: ${path}`);
    paths.add(path);
    requireRange(bytes, localOffset, ZIP_LOCAL_HEADER_SIZE, `local header for ${path}`);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Invalid ZIP local header: ${path}`);
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    validateZipEntryFlags(localFlags, localMethod);
    if (localFlags !== flags || localMethod !== method || localCrc !== expectedCrc
      || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) {
      throw new Error(`ZIP local and central metadata disagree: ${path}`);
    }
    const localNameStart = localOffset + ZIP_LOCAL_HEADER_SIZE;
    requireRange(bytes, localNameStart, localNameLength + localExtraLength + compressedSize, `entry data for ${path}`);
    const localPath = relativePath(decodeUtf8(bytes.subarray(localNameStart, localNameStart + localNameLength), "ZIP entry path"));
    if (localPath !== path) throw new Error(`ZIP local and central paths disagree: ${path}`);
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const storedBytes = bytes.slice(dataStart, dataStart + compressedSize);
    records.push({ path, method, expectedCrc, uncompressedSize, storedBytes });
    offset += centralEntrySize;
  }
  if (offset !== centralOffset + centralSize) throw new Error("ZIP central directory size does not match its entries.");
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function decodeZipRecord(record, dataBytes) {
  if (dataBytes.length !== record.uncompressedSize) throw new Error(`ZIP entry size mismatch: ${record.path}`);
  if (crc32(dataBytes) !== record.expectedCrc) throw new Error(`ZIP CRC validation failed: ${record.path}`);
  return { path: record.path, text: decodeUtf8(dataBytes, `ZIP entry ${record.path}`) };
}

export async function pickPortableDataSaveHandle(options = {}) {
  const host = options.host ?? globalThis;
  if (typeof host?.showSaveFilePicker !== "function") return null;
  return host.showSaveFilePicker({
    suggestedName: options.suggestedName ?? DEFAULT_ARCHIVE_NAME,
    types: [{
      description: "Liqwid portable data archive",
      accept: { [PORTABLE_ARCHIVE_MIME]: [".zip"] }
    }]
  });
}

export async function pickPortableDataOpenHandle(options = {}) {
  const host = options.host ?? globalThis;
  if (typeof host?.showOpenFilePicker !== "function") return null;
  const handles = await host.showOpenFilePicker({
    id: "liqwid-analysis-data-archive",
    multiple: false,
    types: [{
      description: "Liqwid portable data archive",
      accept: { [PORTABLE_ARCHIVE_MIME]: [".zip"] }
    }]
  });
  return handles?.[0] ?? null;
}

export async function savePortableDataArchive(store, options = {}) {
  if (!store || typeof store.exportEntries !== "function") {
    throw new TypeError("A portable data store is required.");
  }
  const suggestedName = options.suggestedName ?? DEFAULT_ARCHIVE_NAME;
  const dataEntries = store.exportEntries();
  if (dataEntries.some((entry) => entry.path === PORTABLE_DATA_MANIFEST_PATH)) {
    throw new Error(`${PORTABLE_DATA_MANIFEST_PATH} is reserved for archive metadata.`);
  }
  const manifest = buildManifest(dataEntries);
  const bytes = await encodeZipArchive(
    [{ path: PORTABLE_DATA_MANIFEST_PATH, text: manifest }, ...dataEntries],
    { CompressionStream: options.CompressionStream }
  );
  const pickSaveHandle = options.pickSaveHandle ?? pickPortableDataSaveHandle;
  const hasExplicitHandle = Object.prototype.hasOwnProperty.call(options, "fileHandle")
    || Object.prototype.hasOwnProperty.call(options, "handle");
  const fileHandle = hasExplicitHandle
    ? options.fileHandle ?? options.handle ?? null
    : await pickSaveHandle({ host: options.host, suggestedName });

  if (fileHandle) {
    await writeArchiveFile(fileHandle, bytes);
    return { bytes, fileHandle, downloaded: false, suggestedName };
  }

  const download = options.download ?? ((value, metadata) => defaultArchiveDownload(value, metadata, options.host ?? globalThis));
  await download(bytes, { suggestedName, mimeType: PORTABLE_ARCHIVE_MIME });
  return { bytes, fileHandle: null, downloaded: true, suggestedName };
}

export async function loadPortableDataArchive(source) {
  const bytes = await archiveSourceBytes(source);
  const archiveEntries = await decodeZipArchive(bytes);
  const manifestEntries = archiveEntries.filter((entry) => entry.path === PORTABLE_DATA_MANIFEST_PATH);
  if (manifestEntries.length !== 1) throw new Error("Portable archive must contain exactly one CSV manifest.");
  const dataEntries = archiveEntries.filter((entry) => entry.path !== PORTABLE_DATA_MANIFEST_PATH);
  validateManifest(manifestEntries[0].text, dataEntries);
  const name = typeof source?.name === "string" && source.name ? source.name : DEFAULT_STORE_NAME;
  return createPortableDataStore(dataEntries, { name });
}

function relativePath(value) {
  const path = typeof value === "string" ? value : "";
  const segments = path.split("/");
  const unsafe = !path
    || path.startsWith("/")
    || path.startsWith("\\")
    || path.includes("\\")
    || path.includes(":")
    || /[\u0000-\u001f\u007f]/.test(path)
    || segments.some((segment) => !segment || segment === "." || segment === "..");
  if (unsafe) throw new Error(`Portable archive paths must be safe relative paths: ${JSON.stringify(path)}`);
  return path;
}

function buildManifest(entries) {
  const lines = ["archive_format,archive_version,path,utf8_bytes,crc32"];
  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    const dataBytes = textEncoder.encode(entry.text);
    lines.push([
      PORTABLE_ARCHIVE_FORMAT,
      PORTABLE_ARCHIVE_VERSION,
      csvCell(entry.path, true),
      String(dataBytes.length),
      crcHex(dataBytes)
    ].join(","));
  }
  return `${lines.join("\n")}\n`;
}

function validateManifest(text, entries) {
  const rows = parseCsv(text);
  const expectedHeader = ["archive_format", "archive_version", "path", "utf8_bytes", "crc32"];
  if (!rows.length || rows[0].length !== expectedHeader.length
    || rows[0].some((value, index) => value !== expectedHeader[index])) {
    throw new Error("Portable archive CSV manifest has an invalid header.");
  }
  const records = new Map();
  for (const row of rows.slice(1)) {
    if (row.length !== expectedHeader.length || row[0] !== PORTABLE_ARCHIVE_FORMAT || row[1] !== PORTABLE_ARCHIVE_VERSION) {
      throw new Error("Portable archive CSV manifest has an invalid record.");
    }
    const path = relativePath(row[2]);
    if (path === PORTABLE_DATA_MANIFEST_PATH || records.has(path)) {
      throw new Error(`Portable archive CSV manifest has a duplicate or reserved path: ${path}`);
    }
    if (!/^(0|[1-9]\d*)$/.test(row[3]) || !/^[0-9A-F]{8}$/.test(row[4])) {
      throw new Error(`Portable archive CSV manifest has invalid entry metadata: ${path}`);
    }
    records.set(path, { byteLength: Number(row[3]), crc: row[4] });
  }
  if (records.size !== entries.length) throw new Error("Portable archive CSV manifest does not match its entries.");
  for (const entry of entries) {
    const record = records.get(entry.path);
    const dataBytes = textEncoder.encode(entry.text);
    if (!record || record.byteLength !== dataBytes.length || record.crc !== crcHex(dataBytes)) {
      throw new Error(`Portable archive CSV manifest does not match entry: ${entry.path}`);
    }
  }
}

function csvCell(value, alwaysQuote = false) {
  const text = String(value);
  if (!alwaysQuote && !/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let justClosedQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        justClosedQuote = true;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field || justClosedQuote) throw new Error("Portable archive CSV manifest has invalid quoting.");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
      justClosedQuote = false;
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      justClosedQuote = false;
    } else if (character === "\r" && text[index + 1] === "\n") {
      continue;
    } else {
      if (justClosedQuote) throw new Error("Portable archive CSV manifest has characters after a closing quote.");
      field += character;
    }
  }
  if (quoted) throw new Error("Portable archive CSV manifest has an unterminated quote.");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function writeArchiveFile(fileHandle, bytes) {
  if (typeof fileHandle?.createWritable !== "function") throw new TypeError("A writable file handle is required.");
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    if (typeof writable.abort === "function") {
      try { await writable.abort(); } catch { /* Preserve the original write error. */ }
    }
    throw error;
  }
}

async function archiveSourceBytes(source) {
  let value = source;
  if (typeof value?.getFile === "function") value = await value.getFile();
  if (typeof value?.arrayBuffer === "function") value = await value.arrayBuffer();
  return byteView(value);
}

function defaultArchiveDownload(bytes, metadata, host) {
  const document = host?.document;
  const BlobConstructor = host?.Blob ?? globalThis.Blob;
  const urlApi = host?.URL ?? globalThis.URL;
  if (!document?.createElement || typeof BlobConstructor !== "function"
    || typeof urlApi?.createObjectURL !== "function" || typeof urlApi?.revokeObjectURL !== "function") {
    throw new Error("This page cannot download the portable data archive.");
  }
  const link = document.createElement("a");
  const url = urlApi.createObjectURL(new BlobConstructor([bytes], { type: metadata.mimeType }));
  link.href = url;
  link.download = metadata.suggestedName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  const defer = typeof host.setTimeout === "function" ? host.setTimeout.bind(host) : setTimeout;
  defer(() => urlApi.revokeObjectURL(url), 1200);
}

function crcHex(bytes) {
  return crc32(bytes).toString(16).toUpperCase().padStart(8, "0");
}

function validateZipEntryFlags(flags, method) {
  if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}.`);
  if ((flags & ZIP_UTF8_FLAG) === 0) throw new Error("ZIP entry names must be UTF-8.");
  if ((flags & ~ZIP_UTF8_FLAG) !== 0) throw new Error("Encrypted or streamed ZIP entries are not supported.");
}

async function transformBytes(bytes, StreamConstructor, format) {
  const stream = new StreamConstructor(format);
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const chunksPromise = (async () => {
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) return chunks;
      chunks.push(byteView(value));
    }
  })();
  await writer.write(bytes);
  await writer.close();
  return joinBytes(await chunksPromise);
}

function byteView(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("ZIP input must be an ArrayBuffer or typed array.");
}

function findZipEnd(view) {
  if (view.byteLength < ZIP_END_SIZE) throw new Error("Invalid ZIP archive: end record is missing.");
  const firstCandidate = Math.max(0, view.byteLength - ZIP_END_SIZE - 0xffff);
  for (let offset = view.byteLength - ZIP_END_SIZE; offset >= firstCandidate; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + ZIP_END_SIZE + commentLength === view.byteLength) return offset;
  }
  throw new Error("Invalid ZIP archive: end record is missing.");
}

function requireRange(bytes, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new Error(`Invalid ZIP ${label} bounds.`);
  }
}

function decodeUtf8(bytes, label) {
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

function assertUint32(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`${label} requires ZIP64, which is not supported.`);
}

function joinBytes(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
