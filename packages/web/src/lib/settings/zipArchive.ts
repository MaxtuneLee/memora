// Minimal ZIP reader/writer for Memora data archives. See docs/data-export-format.md.
// Entries are written uncompressed (method 0), UTF-8 named, with ZIP64 records when an archive
// outgrows the 32-bit fields. Entry data stays as Blobs (OPFS Files are disk-backed), so an
// export never holds the whole library in memory.

export interface ZipWriteEntry {
  path: string;
  data: Blob;
}

export interface ZipReadEntry {
  path: string;
  size: number;
  /** Streams the entry's bytes. The stream errors if the data fails its CRC-32 or size check. */
  open: () => ReadableStream<Uint8Array>;
}

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const ZIP64_EXTRA_ID = 0x0001;
const UTF8_FLAG = 0x0800;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const updateCrc32 = (crc: number, data: Uint8Array): number => {
  let next = crc;
  for (const value of data) {
    next = CRC32_TABLE[(next ^ value) & 0xff] ^ (next >>> 8);
  }
  return next;
};

const crc32OfBlob = async (blob: Blob): Promise<number> => {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    crc = updateCrc32(crc, value);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = (date: Date): { date: number; time: number } => {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
    time:
      ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) &
      0xffff,
  };
};

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => new Uint8Array(value).buffer;

// ZIP64 extra field: only the values that overflowed, in spec order.
const buildZip64Extra = (values: readonly number[]): Uint8Array => {
  if (values.length === 0) return new Uint8Array(0);
  const extra = new Uint8Array(4 + values.length * 8);
  const view = new DataView(extra.buffer);
  view.setUint16(0, ZIP64_EXTRA_ID, true);
  view.setUint16(2, values.length * 8, true);
  values.forEach((value, index) => view.setBigUint64(4 + index * 8, BigInt(value), true));
  return extra;
};

export const buildZipArchive = async (
  entries: readonly ZipWriteEntry[],
  onEntry?: (entry: ZipWriteEntry, index: number) => void,
  modifiedAt = new Date(),
): Promise<Blob> => {
  const parts: BlobPart[] = [];
  const centralDirectory: Uint8Array[] = [];
  const { date, time } = getDosDateTime(modifiedAt);
  let offset = 0;

  for (const [index, entry] of entries.entries()) {
    const pathBytes = textEncoder.encode(entry.path);
    const size = entry.data.size;
    const crc32 = await crc32OfBlob(entry.data);
    const sizeOverflows = size >= MAX_UINT32;
    const offsetOverflows = offset >= MAX_UINT32;
    const versionNeeded = sizeOverflows || offsetOverflows ? 45 : 20;

    const localExtra = buildZip64Extra(sizeOverflows ? [size, size] : []);
    const local = new Uint8Array(30 + pathBytes.byteLength + localExtra.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_FILE_HEADER, true);
    localView.setUint16(4, versionNeeded, true);
    localView.setUint16(6, UTF8_FLAG, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc32, true);
    localView.setUint32(18, sizeOverflows ? MAX_UINT32 : size, true);
    localView.setUint32(22, sizeOverflows ? MAX_UINT32 : size, true);
    localView.setUint16(26, pathBytes.byteLength, true);
    localView.setUint16(28, localExtra.byteLength, true);
    local.set(pathBytes, 30);
    local.set(localExtra, 30 + pathBytes.byteLength);

    const centralExtra = buildZip64Extra([
      ...(sizeOverflows ? [size, size] : []),
      ...(offsetOverflows ? [offset] : []),
    ]);
    const central = new Uint8Array(46 + pathBytes.byteLength + centralExtra.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_DIRECTORY_HEADER, true);
    centralView.setUint16(4, versionNeeded, true);
    centralView.setUint16(6, versionNeeded, true);
    centralView.setUint16(8, UTF8_FLAG, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc32, true);
    centralView.setUint32(20, sizeOverflows ? MAX_UINT32 : size, true);
    centralView.setUint32(24, sizeOverflows ? MAX_UINT32 : size, true);
    centralView.setUint16(28, pathBytes.byteLength, true);
    centralView.setUint16(30, centralExtra.byteLength, true);
    centralView.setUint32(42, offsetOverflows ? MAX_UINT32 : offset, true);
    central.set(pathBytes, 46);
    central.set(centralExtra, 46 + pathBytes.byteLength);

    parts.push(toArrayBuffer(local), entry.data);
    centralDirectory.push(central);
    offset += local.byteLength + size;
    onEntry?.(entry, index);
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((sum, part) => sum + part.byteLength, 0);
  const needsZip64 =
    entries.length >= MAX_UINT16 ||
    centralDirectoryOffset >= MAX_UINT32 ||
    centralDirectorySize >= MAX_UINT32;

  const tail: Uint8Array[] = [];
  if (needsZip64) {
    const record = new Uint8Array(56 + 20);
    const view = new DataView(record.buffer);
    view.setUint32(0, ZIP64_END_OF_CENTRAL_DIRECTORY, true);
    view.setBigUint64(4, 44n, true);
    view.setUint16(12, 45, true);
    view.setUint16(14, 45, true);
    view.setBigUint64(24, BigInt(entries.length), true);
    view.setBigUint64(32, BigInt(entries.length), true);
    view.setBigUint64(40, BigInt(centralDirectorySize), true);
    view.setBigUint64(48, BigInt(centralDirectoryOffset), true);
    view.setUint32(56, ZIP64_END_LOCATOR, true);
    view.setBigUint64(64, BigInt(centralDirectoryOffset + centralDirectorySize), true);
    view.setUint32(72, 1, true);
    tail.push(record);
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY, true);
  endView.setUint16(8, needsZip64 ? MAX_UINT16 : entries.length, true);
  endView.setUint16(10, needsZip64 ? MAX_UINT16 : entries.length, true);
  endView.setUint32(12, needsZip64 ? MAX_UINT32 : centralDirectorySize, true);
  endView.setUint32(16, needsZip64 ? MAX_UINT32 : centralDirectoryOffset, true);
  tail.push(end);

  return new Blob([...parts, ...centralDirectory.map(toArrayBuffer), ...tail.map(toArrayBuffer)], {
    type: "application/zip",
  });
};

const readBytes = async (blob: Blob, start: number, end: number): Promise<DataView> => {
  return new DataView(await blob.slice(start, end).arrayBuffer());
};

const findEndOfCentralDirectory = async (
  archive: Blob,
): Promise<{ view: DataView; position: number }> => {
  // The record is 22 bytes plus a comment of up to 65535 bytes.
  const start = Math.max(0, archive.size - 22 - MAX_UINT16);
  const view = await readBytes(archive, start, archive.size);
  for (let index = view.byteLength - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === END_OF_CENTRAL_DIRECTORY) {
      return { view: new DataView(view.buffer, index, 22), position: start + index };
    }
  }
  throw new Error("This file is not a ZIP archive, or it is incomplete.");
};

const createCrcCheck = (
  path: string,
  expectedCrc: number,
  expectedSize: number,
): TransformStream<Uint8Array, Uint8Array> => {
  let crc = 0xffffffff;
  let size = 0;
  return new TransformStream({
    transform(chunk, controller) {
      crc = updateCrc32(crc, chunk);
      size += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      if ((crc ^ 0xffffffff) >>> 0 !== expectedCrc || size !== expectedSize) {
        throw new Error(`The archive entry ${path} is damaged.`);
      }
    },
  });
};

export const readZipArchive = async (archive: Blob): Promise<ZipReadEntry[]> => {
  const { view: end, position: endPosition } = await findEndOfCentralDirectory(archive);
  let entryCount = end.getUint16(10, true);
  let directorySize = end.getUint32(12, true);
  let directoryOffset = end.getUint32(16, true);

  if (entryCount === MAX_UINT16 || directorySize === MAX_UINT32 || directoryOffset === MAX_UINT32) {
    const locator = await readBytes(archive, endPosition - 20, endPosition);
    if (locator.getUint32(0, true) !== ZIP64_END_LOCATOR) {
      throw new Error("The archive's ZIP64 index is missing.");
    }
    const recordOffset = Number(locator.getBigUint64(8, true));
    const record = await readBytes(archive, recordOffset, recordOffset + 56);
    if (record.getUint32(0, true) !== ZIP64_END_OF_CENTRAL_DIRECTORY) {
      throw new Error("The archive's ZIP64 index is damaged.");
    }
    entryCount = Number(record.getBigUint64(32, true));
    directorySize = Number(record.getBigUint64(40, true));
    directoryOffset = Number(record.getBigUint64(48, true));
  }

  const directory = await readBytes(archive, directoryOffset, directoryOffset + directorySize);
  const entries: ZipReadEntry[] = [];
  let cursor = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (directory.getUint32(cursor, true) !== CENTRAL_DIRECTORY_HEADER) {
      throw new Error("The archive index is damaged.");
    }
    const method = directory.getUint16(cursor + 10, true);
    const crc32 = directory.getUint32(cursor + 16, true);
    let compressedSize = directory.getUint32(cursor + 20, true);
    let size = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    let localOffset = directory.getUint32(cursor + 42, true);
    const nameStart = directory.byteOffset + cursor + 46;
    const path = textDecoder.decode(new Uint8Array(directory.buffer, nameStart, nameLength));

    let extraCursor = cursor + 46 + nameLength;
    const extraEnd = extraCursor + extraLength;
    while (extraCursor + 4 <= extraEnd) {
      const id = directory.getUint16(extraCursor, true);
      const length = directory.getUint16(extraCursor + 2, true);
      if (id === ZIP64_EXTRA_ID) {
        let field = extraCursor + 4;
        const next = (): number => {
          const value = Number(directory.getBigUint64(field, true));
          field += 8;
          return value;
        };
        if (size === MAX_UINT32) size = next();
        if (compressedSize === MAX_UINT32) compressedSize = next();
        if (localOffset === MAX_UINT32) localOffset = next();
      }
      extraCursor += 4 + length;
    }
    cursor = extraEnd + commentLength;

    if (path.endsWith("/")) continue;
    if (method !== 0 && method !== 8) {
      throw new Error(`The archive entry ${path} uses an unsupported compression method.`);
    }

    const local = await readBytes(archive, localOffset, localOffset + 30);
    if (local.getUint32(0, true) !== LOCAL_FILE_HEADER) {
      throw new Error(`The archive entry ${path} is damaged.`);
    }
    const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    const data = archive.slice(dataStart, dataStart + compressedSize);
    if (data.size !== compressedSize) {
      throw new Error("The import archive looks incomplete.");
    }

    entries.push({
      path,
      size,
      open: () => {
        const raw = data.stream();
        const inflated =
          method === 8 ? raw.pipeThrough(new DecompressionStream("deflate-raw")) : raw;
        return inflated.pipeThrough(createCrcCheck(path, crc32, size));
      },
    });
  }

  return entries;
};
