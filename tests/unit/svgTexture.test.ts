import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { ensureTexture } from '../../src/game/sprites/svgTexture';

/** A stand-in for Phaser's texture manager: just the calls ensureTexture makes. */
class FakeTextures {
  readonly keys = new Set<string>();
  /** Phaser sets this to null when the game is destroyed. */
  game: object | null = {};
  exists(key: string) {
    return this.keys.has(key);
  }
  addCanvas(key: string) {
    this.keys.add(key);
  }
}

/** Images that finish loading only when the test says so. */
const images: { onload: (() => void) | null; src: string }[] = [];

function sceneWith(textures: FakeTextures) {
  return { textures } as unknown as Phaser.Scene;
}

describe('ensureTexture', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    images.length = 0;
  });

  function stubBrowser() {
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';
        constructor() {
          images.push(this);
        }
      },
    );
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }),
    });
  }

  it('does nothing when a picture finishes loading after its game was destroyed', () => {
    stubBrowser();
    const textures = new FakeTextures();
    const ready = vi.fn();
    ensureTexture(sceneWith(textures), 'k', () => 'data:', { w: 10, h: 10 }, ready);
    textures.game = null; // Switched to the 3D world while it loaded.
    expect(() => images[0]!.onload!()).not.toThrow();
    expect(textures.exists('k')).toBe(false);
    expect(ready).not.toHaveBeenCalled();
  });

  it('builds a picture once and shares it', () => {
    stubBrowser();
    const textures = new FakeTextures();
    const a = vi.fn();
    const b = vi.fn();
    ensureTexture(sceneWith(textures), 'k', () => 'data:', { w: 10, h: 10 }, a);
    ensureTexture(sceneWith(textures), 'k', () => 'data:', { w: 10, h: 10 }, b);
    expect(images).toHaveLength(1);
    images[0]!.onload!();
    expect(textures.exists('k')).toBe(true);
    expect(a).toHaveBeenCalledWith('k');
    expect(b).toHaveBeenCalledWith('k');
    const c = vi.fn();
    ensureTexture(sceneWith(textures), 'k', () => 'data:', { w: 10, h: 10 }, c);
    expect(c).toHaveBeenCalledWith('k');
    expect(images).toHaveLength(1);
  });

  it('a new game gets its own picture even while the old game’s is still loading', () => {
    // React StrictMode (and switching players) makes a game, throws it away, and makes another.
    stubBrowser();
    const oldGame = new FakeTextures();
    const newGame = new FakeTextures();
    const ready = vi.fn();
    ensureTexture(sceneWith(oldGame), 'k', () => 'data:', { w: 10, h: 10 }, vi.fn());
    ensureTexture(sceneWith(newGame), 'k', () => 'data:', { w: 10, h: 10 }, ready);
    for (const img of images) img.onload!();
    expect(newGame.exists('k')).toBe(true);
    expect(ready).toHaveBeenCalledWith('k');
  });
});
