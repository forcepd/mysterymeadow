import { useMemo } from 'react';
import { avatarDataUri } from '../art/avatarSvg';
import type { AvatarLoadout } from '../profile/avatar';
import { usePortraitProviders } from './portraitProviders';

/** The layered avatar as an image. */
export function AvatarView({
  loadout,
  height = 200,
  className,
  label,
}: {
  loadout: AvatarLoadout;
  height?: number;
  className?: string | undefined;
  /** Accessible name; decorative (hidden) when omitted. */
  label?: string;
}) {
  const portraits = usePortraitProviders();
  // The 3D world's avatar when it's loaded, else the original's picture.
  const src = useMemo(
    () => (portraits ? portraits.avatar(loadout) : avatarDataUri(loadout)),
    [loadout, portraits],
  );
  return (
    <img
      src={src}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ height, width: (height * 132) / 224 }}
      draggable={false}
    />
  );
}
