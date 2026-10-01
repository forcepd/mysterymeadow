import type { ActivityEntry } from '../profile/activity';
import type { AvatarLoadout } from '../profile/avatar';
import type { SimMeta, SimState, WorldState } from '../sim/types';

/** Bump this and add a migration in migrations.ts for ANY change to saved state. */
export const CURRENT_SCHEMA_VERSION = 8;

/** Where a new profile is in the onboarding tutorial (DESIGN 5 step 4). */
export type TutorialStep = 'reveal' | 'feed' | 'poop' | 'card' | 'done';

/** DESIGN 19 Profile (save v5). */
export interface Profile {
  id: string;
  username: string;
  avatar: AvatarLoadout;
  /** Boutique items bought (starter items are always owned). */
  ownedAvatarItems: string[];
  /** Up to 3 favorite outfits, by slot (null = empty slot). */
  savedOutfits: (AvatarLoadout | null)[];
  tutorial: TutorialStep;
}

/** DESIGN 19. One per profile, stored under `profile:<id>`. */
export interface SaveFile {
  schemaVersion: number;
  profile: Profile;
  world: WorldState;
  meta: SimMeta;
  /** Parent Mode's recent activity, newest first. */
  activity: ActivityEntry[];
}

export function saveKey(profileId: string): string {
  return `profile:${profileId}`;
}

export function toSaveFile(
  profile: Profile,
  state: SimState,
  activity: ActivityEntry[] = [],
): SaveFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: structuredClone(profile),
    world: state.world,
    meta: state.meta,
    activity: [...activity],
  };
}

export function toSimState(save: SaveFile): SimState {
  return { world: save.world, meta: save.meta };
}

/** A fresh profile wearing the default starter outfit. */
export function newProfile(id: string, username: string, avatar: AvatarLoadout): Profile {
  return {
    id,
    username,
    avatar: structuredClone(avatar),
    ownedAvatarItems: [],
    savedOutfits: [null, null, null],
    tutorial: 'reveal',
  };
}
