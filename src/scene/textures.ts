import * as THREE from 'three';

const prepared = new WeakSet<THREE.Texture>();

/** Card portraits are small on the table. Full-resolution source files remain available to the DOM inspector. */
export function prepareArtTextures(value: THREE.Texture | THREE.Texture[]) {
  for (const texture of Array.isArray(value) ? value : [value]) {
    if (prepared.has(texture)) continue;
    const source = texture.image as HTMLImageElement | HTMLCanvasElement;
    const width = source.width;
    const height = source.height;
    const ratio = Math.min(1, 512 / Math.max(width, height));
    if (ratio < 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const context = canvas.getContext('2d');
      if (context) {
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        texture.image = canvas;
      }
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    prepared.add(texture);
  }
}
