import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Language } from '../api/types'
import { useApi } from '../lib/useApi'
import { useRole } from '../lib/useRole'

const LANGUAGES: Language[] = ['en', 'am']

export function LanguageSelector() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { me } = useRole()
  const { i18n, t } = useTranslation()

  useEffect(() => {
    if (me?.language && i18n.language !== me.language) {
      void i18n.changeLanguage(me.language)
      localStorage.setItem('birr-track-language', me.language)
    }
  }, [i18n, me?.language])

  const mutation = useMutation({
    mutationFn: (language: Language) => api.updateLanguage(language),
    onSuccess: (language) => {
      localStorage.setItem('birr-track-language', language)
      void i18n.changeLanguage(language)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  const current = (me?.language || i18n.language || 'en') as Language

  return (
    <label className="language-selector" title={t('language.label')}>
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={current}
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate(event.target.value as Language)}
        aria-label={t('language.label')}
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
