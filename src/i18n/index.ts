import { cookies } from 'next/headers';
import ptBR from '@/locales/pt-BR.json';
import itIT from '@/locales/it-IT.json';

export type AdminUiLanguage = 'pt-BR' | 'it-IT';
export type SupportedLanguage = 'pt-BR' | 'it-IT' | 'en-US';

export type TranslationDictionary = typeof ptBR;

const dictionaries: Record<string, TranslationDictionary> = {
  'pt-BR': ptBR as unknown as TranslationDictionary,
  'it-IT': itIT as unknown as TranslationDictionary,
  'en-US': ptBR as unknown as TranslationDictionary, // Fallback momentâneo enquanto en-US estiver preparado para futuro
};

export function getDictionary(lang?: string): TranslationDictionary {
  if (!lang || !dictionaries[lang]) {
    return dictionaries['pt-BR'];
  }
  return dictionaries[lang];
}

export async function getAdminLanguage(): Promise<AdminUiLanguage> {
  try {
    const cookieStore = await cookies();
    const lang = cookieStore.get('wai_admin_language')?.value;
    if (lang === 'it-IT') {
      return 'it-IT';
    }
    return 'pt-BR'; // Padrão da interface do administrador: português Brasil
  } catch {
    return 'pt-BR';
  }
}
