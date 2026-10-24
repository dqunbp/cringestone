import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Text, useTexture } from '@react-three/drei';
import type { Texture } from 'three';
import { CARDS, HEROES } from '../core/catalog';
import { recordDiagnostic } from '../diagnostics/runtime';
import { prepareArtTextures } from './textures';

const ART_URLS = [...new Set([...Object.values(CARDS).map(card => card.art), ...Object.values(HEROES).map(hero => hero.art), '/assets/card-back.png'])];
const FONTS = ['/assets/fonts/heading.ttf', '/assets/fonts/body.ttf'];
const GLYPHS = '0123456789−+!?.,:–—«»ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const ArtContext = createContext<ReadonlyMap<string, Texture> | null>(null);

/** One loading boundary owns all scene art; consumers never start a second loader. */
export function SceneAssets({ children }: { children: ReactNode }) {
  const textures = useTexture(ART_URLS, prepareArtTextures);
  const art = useMemo(() => new Map(ART_URLS.map((url, index) => [url, textures[index]])), [textures]);
  useEffect(() => { recordDiagnostic('scene.assets.ready', { images: ART_URLS.length, fonts: FONTS.length }); }, []);
  return <ArtContext.Provider value={art}>
    {/* Drei caches by font + characters, not text. Warm both normal Text keys before ready. */}
    {FONTS.map(font => <Text key={font} font={font} visible={false} fontSize={.1}>{GLYPHS}</Text>)}
    {children}
  </ArtContext.Provider>;
}

export function useArtTexture(url: string): Texture {
  const art = useContext(ArtContext);
  if (!art) throw new Error('Scene art requires SceneAssets.');
  const texture = art.get(url);
  if (!texture) throw new Error(`Unknown scene art: ${url}`);
  return texture;
}
