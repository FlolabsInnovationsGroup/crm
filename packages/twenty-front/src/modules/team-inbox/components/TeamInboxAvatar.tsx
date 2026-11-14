import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { type ThemeColor, themeCssVariables } from 'twenty-ui/theme';
import { stringToThemeColor } from 'twenty-ui/utilities';

import { getContactInitials } from '@/team-inbox/utils/getContactInitials';

const StyledAvatar = styled.span<{ color: ThemeColor; size: number }>`
  align-items: center;
  background: ${({ color }) => themeCssVariables.tag.background[color]};
  border-radius: 50%;
  color: ${({ color }) => themeCssVariables.tag.text[color]};
  display: inline-flex;
  flex-shrink: 0;
  font-size: ${({ size }) => `${Math.round(size * 0.34)}px`};
  font-weight: 700;
  height: ${({ size }) => `${size}px`};
  justify-content: center;
  line-height: 1;
  overflow: hidden;
  width: ${({ size }) => `${size}px`};

  img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

type TeamInboxAvatarProps = {
  name: string;
  colorSeed?: string;
  size: number;
  imageUrl?: string | null;
};

export const TeamInboxAvatar = ({
  name,
  colorSeed,
  size,
  imageUrl,
}: TeamInboxAvatarProps) => {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const hasImage = isNonEmptyString(imageUrl) && imageUrl !== failedImageUrl;

  return (
    <StyledAvatar
      aria-hidden
      color={stringToThemeColor(colorSeed ?? name)}
      size={size}
    >
      {hasImage ? (
        <img
          src={imageUrl}
          alt=""
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        getContactInitials(name)
      )}
    </StyledAvatar>
  );
};
