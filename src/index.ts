import zlib = require('zlib');
import CRC32 = require('crc-32');

const PNG_HEADER = Buffer.from('\x89PNG\r\n\x1a\n', 'latin1');
const IEND_CHUNK = Buffer.from([
  // size = 0
  0x00, 0x00, 0x00, 0x00,
  // type = 'IEND'
  0x49, 0x45, 0x4e, 0x44,
  // the crc of 'IEND'
  0xae, 0x42, 0x60, 0x82,
]);

export interface IHDR {
  /** width (4 bytes) */
  width:number;
  /** height (4 bytes) */
  height:number;
  /** bit depth (1 byte, values 1, 2, 4, 8, or 16) */
  bitDepth:number;
  /** color type (1 byte, values 0, 2, 3, 4, or 6) */
  colorType:number;
  /** compression method (1 byte, value 0) */
  compressionMethod:number;
  /** filter method (1 byte, value 0) */
  filterMethod:number;
  /** interlace method (1 byte, values 0 "no interlace" or 1 "Adam7 interlace") */
  interlaceMethod:number;
}

export function createIHDR(spec:IHDR) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(spec.width);
  buf.writeUInt32BE(spec.height, 4);
  buf[8] = spec.bitDepth;
  buf[9] = spec.colorType;
  buf[10] = spec.compressionMethod;
  buf[11] = spec.filterMethod;
  buf[12] = spec.interlaceMethod;
  return buf;
}

export function createPLTE(palette:number[]|number[][]) {
  const buf = Buffer.alloc(256 * 3);
  if (typeof palette[0] === 'number') {
    for (let i = 0; i < 256; i++) {
      buf[i * 3 + 0] = (<number>palette[i] >> 16) & 0xff;
      buf[i * 3 + 1] = (<number>palette[i] >> 8) & 0xff;
      buf[i * 3 + 2] = <number>palette[i] & 0xff;
    }
  } else {
    for (let i = 0; i < 256; i++) {
      buf[i * 3 + 0] = (<number[][]>palette)[i][0];
      buf[i * 3 + 1] = (<number[][]>palette)[i][1];
      buf[i * 3 + 2] = (<number[][]>palette)[i][2];
    }
  }
  return buf;
}

export async function createIDAT(data:Buffer, width:number, height:number) {
  const newWidth = width + 1;
  return new Promise<Buffer>((resolve, reject) => {
    const deflate = zlib.createDeflate();
    for (let i = 0; i < height; i++) {
      const buf = Buffer.alloc(newWidth);
      data.copy(buf, 1, width * i, width * (i + 1));
      deflate.write(buf);
    }
    deflate.end();
    const chunks:Buffer[] = [];
    deflate.on('error', reject);
    deflate.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deflate.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export function generateChunk(type:string, data:Buffer) {
  // 4 bytes length + 4 bytes type + 4 bytes crc + data length
  const buffer = Buffer.alloc(3 * 4 + data.length);
  const crc = CRC32.buf(data, CRC32.bstr(type));
  buffer.writeInt32BE(data.length)
  buffer.write(type, 4);
  data.copy(buffer, 8);
  buffer.writeInt32BE(crc, buffer.length - 4);
  return buffer;
}

export class IndexedPNG {
  private chunks:Buffer[] = []

  public write(chunk:Buffer) {
    this.chunks.push(chunk);
  }

  public writeChunk(type:string, data:Buffer) {
    this.write(generateChunk(type, data));
  }

  public writeIEND() {
    // this.writeChunk('IEND', Buffer.alloc(0));
    this.write(IEND_CHUNK);
  }

  public writeHeader() {
    this.write(PNG_HEADER);
  }

  public writeIHDR(spec:IHDR) {
    this.writeChunk('IHDR', createIHDR(spec));
  }

  public writePLTE(palette:number[]|number[][]) {
    this.writeChunk('PLTE', createPLTE(palette));
  }

  public writeTRNS(palette:number[]) {
    this.writeChunk('tRNS', Buffer.from(palette));
  }

  public async writeIDAT(data:Buffer, width:number, height:number) {
    this.writeChunk('IDAT', await createIDAT(data, width, height));
  }

  public getData() {
    return Buffer.concat(this.chunks);
  }
}

export async function createPNG(data:Buffer, palette:number[]|number[][], width:number, height?:number):Promise<Buffer>;
export async function createPNG(data:Buffer, palette:number[]|number[][], trnsPalette:number[], width:number, height?:number):Promise<Buffer>;
export async function createPNG(data:Buffer, palette:number[]|number[][], trnsPaletteWidth:number[]|number, widthHeight?:number, _height?:number) {
  const hasTransPalette = typeof trnsPaletteWidth !== 'number';
  const trnsPalette = hasTransPalette ? trnsPaletteWidth : undefined;
  const width = hasTransPalette ? widthHeight! : trnsPaletteWidth;
  const height = (hasTransPalette ? _height : widthHeight) || data.length / width;
  const png = new IndexedPNG();
  png.writeHeader();
  png.writeIHDR({
    width,
    height,
    bitDepth: 8,
    colorType: 3,
    compressionMethod: 0,
    filterMethod: 0,
    interlaceMethod: 0,
  });
  png.writePLTE(palette);
  if (trnsPalette) {
    png.writeTRNS(trnsPalette);
  }
  await png.writeIDAT(data, width, height);
  png.writeIEND();
  return png.getData();
}
