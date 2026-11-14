import { t } from '@lingui/core/macro';
import { type ReactNode, useState } from 'react';
import { ListItemButton } from 'twenty-ui/components/navigation';

import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { LegacyDropdownContent } from '@/ui/layout/dropdown/components/LegacyDropdownContent';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';

export type TeamInboxMenuItem = { value: string; label: string };

type TeamInboxMenuProps = {
  dropdownId: string;
  trigger: ReactNode;
  items: TeamInboxMenuItem[];
  selectedValue?: string | null;
  isSearchable?: boolean;
  searchPlaceholder?: string;
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  onSelect: (value: string) => void;
};

export const TeamInboxMenu = ({
  dropdownId,
  trigger,
  items,
  selectedValue,
  isSearchable = false,
  searchPlaceholder,
  placement = 'bottom-start',
  onSelect,
}: TeamInboxMenuProps) => {
  const { closeDropdown } = useCloseDropdown();
  const [searchInput, setSearchInput] = useState('');
  const query = searchInput.trim().toLowerCase();
  const visibleItems =
    query === ''
      ? items
      : items.filter((item) => item.label.toLowerCase().includes(query));

  const handleSelect = (value: string) => {
    onSelect(value);
    setSearchInput('');
    closeDropdown(dropdownId);
  };

  return (
    <Dropdown
      dropdownId={dropdownId}
      dropdownPlacement={placement}
      dropdownOffset={{ y: 6 }}
      clickableComponent={trigger}
      onClose={() => setSearchInput('')}
      dropdownComponents={
        <LegacyDropdownContent
          widthInPixels={GenericDropdownContentWidth.ExtraLarge}
        >
          {isSearchable && (
            <>
              <DropdownMenuSearchInput
                value={searchInput}
                placeholder={searchPlaceholder ?? t`Search`}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItemsContainer hasMaxHeight>
            {visibleItems.map((item) => (
              <ListItemButton
                key={item.value}
                role="option"
                aria-selected={item.value === selectedValue}
                selected={item.value === selectedValue}
                indicator="check"
                onClick={() => handleSelect(item.value)}
              >
                {item.label}
              </ListItemButton>
            ))}
          </DropdownMenuItemsContainer>
        </LegacyDropdownContent>
      }
    />
  );
};
