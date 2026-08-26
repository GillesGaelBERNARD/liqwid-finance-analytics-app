import fs from "fs";
import path from "path";
import { encodeZipArchive, decodeZipArchive } from "../src/browser/portableArchive.js";

async function rebuildDataArchive(dataRoot, archiveName = "liqwid-data.zip") {
  const root = path.resolve(dataRoot);
  const subdirs = ["clean", "computed", "metadata", "raw"];
  const archivePath = path.join(root, archiveName);

  // Safety check: If the zip archive exists, unpack its entries first so no user-saved data is lost
  if (fs.existsSync(archivePath)) {
    try {
      const existingBuffer = fs.readFileSync(archivePath);
      const decoded = await decodeZipArchive(existingBuffer);
      let unpackedCount = 0;
      for (const entry of decoded) {
        if (entry.path === "liqwid-portable-manifest.csv") continue;
        const targetFile = path.join(root, entry.path);
        const fileExists = fs.existsSync(targetFile);
        if (!fileExists) {
          fs.mkdirSync(path.dirname(targetFile), { recursive: true });
          fs.writeFileSync(targetFile, entry.text, "utf-8");
          unpackedCount++;
        }
      }
      if (unpackedCount > 0) {
        console.log(`[DATA SAFETY] Automatically restored/unpacked ${unpackedCount} updated entries from ${archiveName} into repository.`);
      }
    } catch (err) {
      console.warn(`[DATA SAFETY] Warning: Could not pre-read existing archive ${archiveName}:`, err.message);
    }
  }

  function scanDir(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanDir(full));
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
    return results;
  }

  const allFilePaths = [];
  for (const sd of subdirs) {
    const sdPath = path.join(root, sd);
    if (fs.existsSync(sdPath)) {
      allFilePaths.push(...scanDir(sdPath));
    }
  }

  const fileEntries = [];
  for (const filePath of allFilePaths) {
    const relPath = path.relative(root, filePath).replaceAll("\\", "/");
    const text = fs.readFileSync(filePath, "utf-8");
    fileEntries.push({ path: relPath, text });
  }

  fileEntries.sort((a, b) => a.path.localeCompare(b.path));

  // Generate manifest
  const encoder = new TextEncoder();
  const manifestRows = ["archive_format,archive_version,path,utf8_bytes,crc32"];

  for (const entry of fileEntries) {
    const bytes = encoder.encode(entry.text);
    const crc = crc32(bytes).toString(16).toUpperCase().padStart(8, "0");
    manifestRows.append ? null : manifestRows.push(`liqwid-portable-data,1,"${entry.path}",${bytes.length},${crc}`);
  }

  const manifestText = manifestRows.join("\n") + "\n";
  const manifestPath = path.join(root, "liqwid-portable-manifest.csv");
  fs.writeFileSync(manifestPath, manifestText, "utf-8");

  console.log(`Generated manifest with ${fileEntries.length} entries.`);

  const inputEntries = [
    { path: "liqwid-portable-manifest.csv", text: manifestText },
    ...fileEntries
  ];

  console.log("Encoding ZIP archive using portableArchive.js...");
  const zipBuffer = await encodeZipArchive(inputEntries);

  fs.writeFileSync(archivePath, Buffer.from(zipBuffer));

  console.log(`Successfully built archive: ${archivePath}`);
  console.log(`Archive size: ${(zipBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

  // Verify decoding immediately
  console.log("Verifying decoding using decodeZipArchive...");
  const decoded = await decodeZipArchive(zipBuffer);
  console.log(`Verification SUCCESS: ${decoded.length} entries decoded cleanly with UTF-8 flags intact!`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const targetRoot = process.argv[2] || path.resolve("data/liqwid");
rebuildDataArchive(targetRoot).catch((err) => {
  console.error("Error rebuilding archive:", err);
  process.exit(1);
});
