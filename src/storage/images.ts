import { getCloudflareContext } from '@opennextjs/cloudflare';

type ImagesTransformer = {
  transform(options: Record<string, unknown>): ImagesTransformer;
  output(options: { format: string; quality?: number }): Promise<ImagesResult>;
};

type ImagesResult = {
  image(): ReadableStream;
  contentType(): string;
};

type ImagesBindingLike = {
  input(stream: ReadableStream): ImagesTransformer;
};

/** Thrown for configuration problems, as opposed to undecodable image bytes. */
export class ImagesBindingUnavailableError extends Error {}

/** Longest side of a stored profile photo. Plenty for the CV templates at print size. */
const PHOTO_MAX_PX = 800;

/**
 * Decode any supported input (HEIC from iPhones included), scale down and
 * re-encode as JPEG. Buffered because R2 put needs a known length. Throws
 * when the binding is missing or the bytes are not a decodable image.
 */
export async function normalizePhotoToJpeg(source: ReadableStream): Promise<ArrayBuffer> {
  let env: { IMAGES?: ImagesBindingLike };
  try {
    ({ env } = await getCloudflareContext({ async: true }) as { env: { IMAGES?: ImagesBindingLike } });
  } catch {
    throw new ImagesBindingUnavailableError('[images] binding context unavailable');
  }
  if (!env.IMAGES) {
    throw new ImagesBindingUnavailableError('[images] env.IMAGES is missing. Bind images as IMAGES in wrangler.jsonc.');
  }
  const result = await env.IMAGES
    .input(source)
    .transform({ width: PHOTO_MAX_PX, height: PHOTO_MAX_PX, fit: 'scale-down' })
    .output({ format: 'image/jpeg', quality: 85 });
  // A silent pass-through must fail loud, never be stored mislabelled as JPEG.
  const contentType = result.contentType();
  if (contentType !== 'image/jpeg') {
    throw new Error(`[images] unexpected output type: ${contentType}`);
  }
  return new Response(result.image()).arrayBuffer();
}
