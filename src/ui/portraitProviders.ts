import { useSyncExternalStore } from 'react';
import type { Animal } from '../sim/types';
import type { AvatarLoadout } from '../profile/avatar';

/**
 * 3D portraits for the menus (Animal Card, Dex, Pets, Wardrobe, Training, avatar views). The 3D
 * world registers these when it loads (`?3d`); until then, and in the original game, the menus
 * keep their SVG pictures. Kept tiny so the main bundle never pulls in Three.js.
 */
export interface PortraitProviders {
  /** A round head-and-shoulders picture (outfit included), as an image URL. */
  animal(
    look: Pick<Animal, 'speciesId' | 'variantId' | 'isSparkle'> & Partial<Pick<Animal, 'outfit'>>,
  ): string;
  /** An undiscovered species' dark shape. */
  silhouette(speciesId: string): string;
  /** The whole avatar, standing (132:224, like the original's). */
  avatar(loadout: AvatarLoadout): string;
}

let current: PortraitProviders | null = null;
const listeners = new Set<() => void>();

export function setPortraitProviders(providers: PortraitProviders | null): void {
  current = providers;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The registered 3D portraits, or null (use the SVG pictures). */
export function usePortraitProviders(): PortraitProviders | null {
  return useSyncExternalStore(subscribe, () => current);
}
