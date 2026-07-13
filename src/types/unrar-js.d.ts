declare module 'unrar-js' {
  interface FileHeader {
    name: string;
    flags: {
      directory: boolean;
      [key: string]: any;
    };
  }

  interface ExtractedFile {
    fileHeader: FileHeader;
    extraction: Uint8Array | undefined;
  }

  interface ExtractorResult {
    files: ExtractedFile[];
  }

  interface Extractor {
    extract(options?: { files?: string[] }): ExtractorResult;
  }

  export function createExtractorFromData(options: { data: Buffer | Uint8Array }): Promise<Extractor>;
  export function createExtractorFromFile(options: { filepath: string }): Promise<Extractor>;
}
