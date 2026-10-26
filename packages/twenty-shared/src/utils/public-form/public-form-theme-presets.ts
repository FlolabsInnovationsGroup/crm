import { type PublicFormTheme } from './public-form-definition-schema';

export type PublicFormThemePreset = {
  key: string;
  colors: Pick<
    PublicFormTheme,
    | 'primaryColor'
    | 'buttonTextColor'
    | 'backgroundColor'
    | 'textColor'
    | 'inputBackgroundColor'
    | 'borderColor'
  > &
    Pick<Partial<PublicFormTheme>, 'pageBackgroundColor'>;
};

export const PUBLIC_FORM_THEME_PRESETS: PublicFormThemePreset[] = [
  {
    key: 'clean',
    colors: {
      primaryColor: '#111111',
      buttonTextColor: '#ffffff',
      backgroundColor: '#ffffff',
      textColor: '#1f1f1f',
      inputBackgroundColor: '#ffffff',
      borderColor: '#d6d6d6',
      pageBackgroundColor: '#f4f4f5',
    },
  },
  {
    key: 'violet',
    colors: {
      primaryColor: '#6d28d9',
      buttonTextColor: '#ffffff',
      backgroundColor: '#ffffff',
      textColor: '#1e1b4b',
      inputBackgroundColor: '#faf5ff',
      borderColor: '#ddd6fe',
      pageBackgroundColor: '#f3e8ff',
    },
  },
  {
    key: 'ocean',
    colors: {
      primaryColor: '#0369a1',
      buttonTextColor: '#ffffff',
      backgroundColor: '#ffffff',
      textColor: '#0c1a2b',
      inputBackgroundColor: '#f8fbff',
      borderColor: '#cbe1f2',
      pageBackgroundColor: '#e6f1fa',
    },
  },
  {
    key: 'forest',
    colors: {
      primaryColor: '#15803d',
      buttonTextColor: '#ffffff',
      backgroundColor: '#ffffff',
      textColor: '#14271b',
      inputBackgroundColor: '#fbfdfb',
      borderColor: '#cfe3d4',
      pageBackgroundColor: '#ecf5ee',
    },
  },
  {
    key: 'sand',
    colors: {
      primaryColor: '#b45309',
      buttonTextColor: '#ffffff',
      backgroundColor: '#fffdf8',
      textColor: '#2b2114',
      inputBackgroundColor: '#ffffff',
      borderColor: '#eadfca',
      pageBackgroundColor: '#f6efe1',
    },
  },
  {
    key: 'midnight',
    colors: {
      primaryColor: '#a78bfa',
      buttonTextColor: '#0b0b14',
      backgroundColor: '#14141f',
      textColor: '#ececf4',
      inputBackgroundColor: '#1d1d2b',
      borderColor: '#33334a',
      pageBackgroundColor: '#0b0b14',
    },
  },
];
