import { languageMatches, localeOfText } from './language.js';

describe('languageMatches', () => {
  it('accepts Arabic for ar and English for en', () => {
    expect(languageMatches('ar', 'لا تقلق، ففهم JOIN يتطلب وقتاً.')).toBe(true);
    expect(languageMatches('en', "Don't worry, JOINs take time.")).toBe(true);
  });

  it('rejects the other language, and an empty text', () => {
    expect(languageMatches('ar', "Don't worry, JOINs take time.")).toBe(false);
    expect(languageMatches('en', 'لا تقلق، ففهم JOIN يتطلب وقتاً.')).toBe(
      false,
    );
    expect(languageMatches('ar', '123 ...')).toBe(false);
  });

  it('ignores code words and digits inside an Arabic text', () => {
    expect(
      languageMatches(
        'ar',
        'اكتب استعلام SELECT مع JOIN بين جدولين خلال 10 دقائق.',
      ),
    ).toBe(true);
  });
});

describe('localeOfText', () => {
  it('reads Arabic and English titles', () => {
    expect(localeOfText('تعلم PostgreSQL', 'en')).toBe('ar');
    expect(localeOfText('Learn PostgreSQL', 'ar')).toBe('en');
    expect(localeOfText('Comprendre les JOIN', 'ar')).toBe('en');
  });

  it('falls back to the account language when the title does not say', () => {
    expect(localeOfText('2024-Q4', 'ar')).toBe('ar');
    expect(localeOfText('', 'en')).toBe('en');
    expect(localeOfText('日本語を学ぶ', 'ar')).toBe('ar');
  });
});
