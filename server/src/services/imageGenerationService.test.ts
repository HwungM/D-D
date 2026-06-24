import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCharacterPortraitCacheKey,
  buildCharacterPortraitDescription,
  buildCharacterPortraitRequest,
  generateImageFromService,
} from './imageGenerationService';
import { ART_STYLE_PREFIX } from './everrealmArtPrompt';

function supabaseStub(cachedUrl?: string, uploadFails = false) {
  const inserts: unknown[] = [];
  const uploads: { path: string; buffer: Buffer }[] = [];

  return {
    inserts,
    uploads,
    client: {
      from: (_table: 'asset_cache') => ({
        select: (_columns: 'url') => ({
          eq: (_column: 'cache_key', _value: string) => ({
            single: async () => ({ data: cachedUrl ? { url: cachedUrl } : null }),
          }),
        }),
        insert: async (value: unknown) => {
          inserts.push(value);
          return {};
        },
      }),
      storage: {
        from: (_bucket: 'generated-art') => ({
          upload: async (path: string, buffer: Buffer) => {
            uploads.push({ path, buffer });
            return uploadFails ? { error: { message: 'nope' } } : {};
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
        }),
      },
    },
  };
}

test('buildCharacterPortraitRequest creates stable cache key and Everrealm portrait description', () => {
  const request = buildCharacterPortraitRequest(
    'Sun Mi',
    'High Elf',
    'College Bard',
    'A'.repeat(150),
  );

  assert.equal(request.cacheKey, 'portrait-sun-mi-high-elf-college-bard');
  assert.equal(buildCharacterPortraitCacheKey('Sun Mi', 'High Elf', 'College Bard'), request.cacheKey);
  assert.match(request.description, /Portrait of Sun Mi, a High Elf College Bard/);
  assert.match(request.description, /Expressive Everrealm character portrait/);
  assert.equal(buildCharacterPortraitDescription('A', 'B', 'C').includes('undefined'), false);
});

test('generateImageFromService returns cached URLs without calling image generation', async () => {
  const supabase = supabaseStub('https://cached.example/scene.png');
  let called = false;
  const openai = {
    images: {
      generate: async () => {
        called = true;
        return { data: [] };
      },
    },
  };

  const url = await generateImageFromService(openai, supabase.client, 'A chapel', 'scene-key');

  assert.equal(url, 'https://cached.example/scene.png');
  assert.equal(called, false);
  assert.equal(supabase.inserts.length, 0);
});

test('generateImageFromService prefixes prompt, rehosts base64 image data, and caches URL', async () => {
  const supabase = supabaseStub();
  let prompt = '';
  const openai = {
    images: {
      generate: async (args: {
        model: string;
        prompt: string;
        n: number;
        size: '1024x1024';
        quality: 'high';
      }) => {
        assert.equal(args.model, 'gpt-image-2');
        assert.equal(args.size, '1024x1024');
        assert.equal(args.quality, 'high');
        prompt = args.prompt;
        return { data: [{ b64_json: Buffer.from('fake-png').toString('base64') }] };
      },
    },
  };

  const url = await generateImageFromService(openai, supabase.client, 'Moonlit chapel', 'scene-key');

  assert.equal(prompt, ART_STYLE_PREFIX + 'Moonlit chapel');
  assert.equal(url, 'https://cdn.example/scene-key.png');
  assert.equal(supabase.uploads[0].path, 'scene-key.png');
  assert.deepEqual(supabase.inserts[0], {
    cache_key: 'scene-key',
    url: 'https://cdn.example/scene-key.png',
    asset_type: 'scene',
  });
});

test('generateImageFromService can download URL image data and falls back to data URL if rehost fails', async () => {
  const supabase = supabaseStub(undefined, true);
  const openai = {
    images: {
      generate: async () => ({ data: [{ url: 'https://images.example/generated.png' }] }),
    },
  };

  const url = await generateImageFromService(
    openai,
    supabase.client,
    'Storm road',
    'storm-road',
    async imageUrl => {
      assert.equal(imageUrl, 'https://images.example/generated.png');
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('downloaded-png').buffer,
      };
    },
  );

  assert.match(url, /^data:image\/png;base64,/);
  assert.equal(supabase.inserts.length, 1);
});
