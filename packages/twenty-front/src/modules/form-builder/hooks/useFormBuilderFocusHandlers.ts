import { type FocusEvent } from 'react';

import { usePushFocusItemToFocusStack } from '@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack';
import { useRemoveFocusItemFromFocusStackById } from '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById';
import { FocusComponentType } from '@/ui/utilities/focus/types/FocusComponentType';

const FORM_BUILDER_FOCUS_ID = 'form-builder-editor';

const isEditableElement = (element: EventTarget | null) =>
  element instanceof HTMLElement &&
  element.matches('input, textarea, select, [contenteditable="true"]');

// Typing in the builder must not trigger the app's go-to hotkeys ("g" + "p"…),
// which also listen inside form fields.
export const useFormBuilderFocusHandlers = () => {
  const { pushFocusItemToFocusStack } = usePushFocusItemToFocusStack();
  const { removeFocusItemFromFocusStackById } =
    useRemoveFocusItemFromFocusStackById();

  const handleFocusCapture = (event: FocusEvent<HTMLElement>) => {
    if (!isEditableElement(event.target)) {
      return;
    }

    pushFocusItemToFocusStack({
      focusId: FORM_BUILDER_FOCUS_ID,
      component: {
        type: FocusComponentType.TEXT_INPUT,
        instanceId: FORM_BUILDER_FOCUS_ID,
      },
      globalHotkeysConfig: {
        enableGlobalHotkeysConflictingWithKeyboard: false,
      },
    });
  };

  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (isEditableElement(event.relatedTarget)) {
      return;
    }

    removeFocusItemFromFocusStackById({ focusId: FORM_BUILDER_FOCUS_ID });
  };

  return {
    onFocusCapture: handleFocusCapture,
    onBlurCapture: handleBlurCapture,
  };
};
