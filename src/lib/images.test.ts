import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_SIDE, prepareUpload, sniffImage } from "./images";

const solid = (width: number, height: number, channels: 3 | 4 = 3) => sharp({ create: { width, height, channels, background: { r: 200, g: 40, b: 40, alpha: channels === 4 ? 0.5 : 1 } } });

describe("sniffImage", () => {
  it("recognises allowed formats by content", async () => {
    expect(sniffImage(await solid(8, 8).jpeg().toBuffer())).toBe("jpeg");
    expect(sniffImage(await solid(8, 8).png().toBuffer())).toBe("png");
    expect(sniffImage(await solid(8, 8).webp().toBuffer())).toBe("webp");
    expect(sniffImage(await solid(8, 8).gif().toBuffer())).toBe("gif");
  });

  it("rejects everything else, whatever the file name says", () => {
    expect(sniffImage(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImage(Buffer.from("MZ\x90\x00"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
    // RIFF-контейнер, но не WebP (например WAV)
    expect(sniffImage(Buffer.from("RIFF\x00\x00\x00\x00WAVEfmt "))).toBeNull();
  });
});

describe("prepareUpload", () => {
  it("shrinks a large photo to the maximum side and re-encodes it as WebP", async () => {
    const r = await prepareUpload(await solid(4000, 3000).jpeg().toBuffer());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(sniffImage(r.data)).toBe("webp");
    expect(r.width).toBe(MAX_SIDE);
    expect(r.height).toBe(1500);
    const meta = await sharp(r.data).metadata();
    expect([meta.width, meta.height]).toEqual([2000, 1500]);
  });

  it("does not enlarge small images and keeps transparency", async () => {
    const r = await prepareUpload(await solid(120, 80, 4).png().toBuffer());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([120, 80]);
    expect((await sharp(r.data).metadata()).hasAlpha).toBe(true);
  });

  it("applies EXIF orientation and drops the metadata", async () => {
    const tilted = await solid(300, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await prepareUpload(tilted);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([100, 300]);
    const meta = await sharp(r.data).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("rejects a non-image and SVG as type", async () => {
    expect(await prepareUpload(Buffer.from("just text, renamed to photo.jpg"))).toEqual({ ok: false, error: "type" });
    expect(await prepareUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).toEqual({ ok: false, error: "type" });
  });

  it("rejects a file with an image header and garbage inside as broken", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("this is not a jpeg body at all".repeat(20))]);
    expect(await prepareUpload(fake)).toEqual({ ok: false, error: "broken" });
  });
});
