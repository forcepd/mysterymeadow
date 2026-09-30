import { PORTRAIT_VIEW } from '../art/animalSvg';
import { animalArt, type ArtRequest } from '../assets/manifest';
import { getIllness } from '../config/illnesses';
import type { Animal } from '../sim/types';
import styles from './PetPortrait.module.css';

/** Built pictures by key, so re-renders don't rebuild the SVG. */
const uris = new Map<string, string>();
const MAX_CACHED = 300;

function uriOf(art: ArtRequest): string {
  let uri = uris.get(art.key);
  if (!uri) {
    if (uris.size >= MAX_CACHED) uris.clear();
    uri = art.uri();
    uris.set(art.key, uri);
  }
  return uri;
}

type PortraitAnimal = Pick<Animal, 'speciesId' | 'variantId' | 'isSparkle'> &
  Partial<Pick<Animal, 'sickness' | 'grownAt' | 'outfit'>>;

/** A round head-and-shoulders portrait, outfit included, with small status marks. */
export function PetPortrait({
  animal,
  size = 64,
  now,
}: {
  animal: PortraitAnimal;
  size?: number;
  now?: number;
}) {
  const sick = animal.sickness && (getIllness(animal.sickness.illnessId)?.symptomIcon ?? '🤒');
  const baby = now !== undefined && animal.grownAt !== undefined && now < animal.grownAt;
  const src = uriOf(animalArt(animal, PORTRAIT_VIEW));
  return (
    <span
      className={`${styles.portrait} ${animal.isSparkle ? styles.sparkle : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img className={styles.art} src={src} alt="" draggable={false} />
      {sick && <span className={styles.mark}>{sick}</span>}
      {!sick && baby && <span className={styles.mark}>🐣</span>}
    </span>
  );
}

/** An undiscovered species in the Dex: its dark shape and a "?". */
export function Silhouette({ speciesId, size = 64 }: { speciesId?: string; size?: number }) {
  const src = speciesId
    ? uriOf(animalArt({ speciesId, variantId: '', silhouette: true }, PORTRAIT_VIEW))
    : undefined;
  return (
    <span
      className={`${styles.portrait} ${styles.silhouette}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src && <img className={styles.art} src={src} alt="" draggable={false} />}
      <span className={styles.question}>?</span>
    </span>
  );
}
