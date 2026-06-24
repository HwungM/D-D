import { ART_STYLE_PREFIX } from './everrealmArtPrompt';

type ImageClient = {
  images: {
    generate(args: {
      model: string;
      prompt: string;
      n: number;
      size: '1024x1024';
      quality: 'high';
    }): Promise<{ data?: { b64_json?: string | null; url?: string | null }[] | null }>;
  };
};

type AssetStore = {
  from(table: string): any;
  storage: {
    from(bucket: string): any;
  };
};

type Fetcher = (url: string) => Promise<{
  ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export function buildCharacterPortraitCacheKey(name: string, race: string, characterClass: string): string {
  return `portrait-${name}-${race}-${characterClass}`.toLowerCase().replace(/\s+/g, '-');
}

export function buildCharacterPortraitDescription(
  name: string,
  race: string,
  characterClass: string,
  backstory?: string,
): string {
  return `Portrait of ${name}, a ${race} ${characterClass}. ${backstory ? backstory.slice(0, 100) : ''} Expressive Everrealm character portrait, face and shoulders, sharp facial structure, readable emotion, rugged adventuring details, painterly animated-film finish.`;
}

export async function rehostImageBuffer(
  supabaseAdmin: AssetStore,
  buffer: Buffer,
  cacheKey: string,
): Promise<string | null> {
  try {
    const path = `${cacheKey}.png`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('generated-art')
      .upload(path, buffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.error('Failed to rehost generated image:', uploadError.message);
      return null;
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('generated-art').getPublicUrl(path);
    return publicUrlData?.publicUrl || null;
  } catch (err) {
    console.error('Failed to rehost generated image:', err);
    return null;
  }
}

export async function generateImageFromService(
  openai: ImageClient,
  supabaseAdmin: AssetStore,
  description: string,
  cacheKey: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const { data: cached } = await supabaseAdmin
    .from('asset_cache')
    .select('url')
    .eq('cache_key', cacheKey)
    .single();

  if (cached?.url) return cached.url;

  const response = await openai.images.generate({
    model: 'gpt-image-2',
    prompt: ART_STYLE_PREFIX + description,
    n: 1,
    size: '1024x1024',
    quality: 'high',
  });

  const image = response.data?.[0];
  let imageBuffer: Buffer;
  if (image?.b64_json) {
    imageBuffer = Buffer.from(image.b64_json, 'base64');
  } else if (image?.url) {
    const fetched = await fetcher(image.url);
    if (!fetched.ok) throw new Error('Failed to download generated image');
    imageBuffer = Buffer.from(await fetched.arrayBuffer());
  } else {
    throw new Error('No image data returned from image generation');
  }

  const url = await rehostImageBuffer(supabaseAdmin, imageBuffer, cacheKey)
    || `data:image/png;base64,${imageBuffer.toString('base64')}`;

  await supabaseAdmin.from('asset_cache').insert({
    cache_key: cacheKey,
    url,
    asset_type: 'scene',
  });

  return url;
}

export function buildCharacterPortraitRequest(
  name: string,
  race: string,
  characterClass: string,
  backstory?: string,
): { cacheKey: string; description: string } {
  return {
    cacheKey: buildCharacterPortraitCacheKey(name, race, characterClass),
    description: buildCharacterPortraitDescription(name, race, characterClass, backstory),
  };
}
