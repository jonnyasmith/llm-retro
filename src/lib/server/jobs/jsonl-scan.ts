/** Byte-offset line scanning shared by the Harness adapters' boundary finders. */
export function scanRecordLines(
  contents: Buffer,
  beforeByteOffset: number,
  visit: (line: string, lineNumber: number, byteOffset: number) => void,
): void {
  let lineStart = 0;
  let lineNumber = 1;
  while (lineStart < beforeByteOffset) {
    const newline = contents.indexOf(10, lineStart);
    if (newline === -1 || newline >= beforeByteOffset) break;
    const line = contents.subarray(lineStart, newline).toString('utf8');
    if (line.length > 0) visit(line, lineNumber, lineStart);
    lineStart = newline + 1;
    lineNumber += 1;
  }
}

export function findLastPromptBoundary(
  contents: Buffer,
  beforeByteOffset: number,
  isPromptBoundary: (line: string, lineNumber: number) => boolean,
): number {
  let lastPromptStart = 0;
  scanRecordLines(
    contents,
    beforeByteOffset,
    (line, lineNumber, byteOffset) => {
      if (isPromptBoundary(line, lineNumber)) lastPromptStart = byteOffset;
    },
  );
  return lastPromptStart;
}
