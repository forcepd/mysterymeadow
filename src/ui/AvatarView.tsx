import { useMemo } from 'react';
import { avatarDataUri } from '../art/avatarSvg';
import type { AvatarLoadout } from '../profile/avatar';

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
  const src = useMemo(() => avatarDataUri(loadout), [loadout]);
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
