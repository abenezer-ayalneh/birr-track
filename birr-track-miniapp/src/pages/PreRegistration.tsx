import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Language, RegistrationEntryState } from '../api/types'
import { useApi } from '../lib/useApi'
import { closeTelegramMiniApp, tryOpenTelegramLink } from '../lib/telegram'
import '../styles/pre-registration.css'

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME?.replace(/^@/, '')

type Props = {
	state: RegistrationEntryState
	onStateChange: (state: RegistrationEntryState) => void
}

export function PreRegistration({ state, onStateChange }: Props) {
	const { t, i18n } = useTranslation()
	const api = useApi()
	const [showForm, setShowForm] = useState(false)
	const [businessName, setBusinessName] = useState(state.registration?.businessName ?? '')
	const [validationError, setValidationError] = useState<string | null>(null)

	const registration = useMutation({
		mutationFn: () => api.submitRegistration(businessName, i18n.language === 'am' ? 'am' : 'en'),
		retry: 1,
		onSuccess: (nextState) => {
			setValidationError(null)
			setShowForm(false)
			onStateChange(nextState)
		},
	})

	function chooseLanguage(language: Language) {
		localStorage.setItem('birr-track-language', language)
		void i18n.changeLanguage(language)
	}

	function openBot() {
		if (!BOT_USERNAME) return
		// A plain bot link opens Telegram's native /start flow. The `invite` payload
		// belongs to the Manager/Owner invite-creation flow, not invite redemption.
		const url = `https://t.me/${BOT_USERNAME}`
		if (!tryOpenTelegramLink(url)) window.location.assign(url)
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!businessName.trim()) {
			setValidationError(t('entry.invalidBusinessName'))
			return
		}
		setValidationError(null)
		registration.mutate()
	}

	const role = state.invite?.role ? t(`entry.roles.${state.invite.role}`) : ''
	const errorMessage = validationError || (registration.error instanceof Error ? registration.error.message : null)

	if (state.status === 'pending') {
		return (
			<EntryShell state={state} onLanguageChange={chooseLanguage}>
				<div className="entry-status-card entry-status-card--pending">
					<div className="entry-status-icon">⏳</div>
					<h1>{t('entry.pendingTitle')}</h1>
					<p>{t('entry.pendingMessage', { businessName: state.registration?.businessName })}</p>
					<p className="entry-muted">{t('entry.pendingHint')}</p>
					<button className="entry-button entry-button--secondary" onClick={closeTelegramMiniApp}>{t('entry.close')}</button>
				</div>
			</EntryShell>
		)
	}

	if (state.status === 'invited') {
		return (
			<EntryShell state={state} onLanguageChange={chooseLanguage}>
				<div className="entry-status-card">
					<div className="entry-status-icon">✉️</div>
					<h1>{t('entry.invitedTitle')}</h1>
					<p>{t('entry.invitedMessage', { businessName: state.invite?.businessName, role })}</p>
					<p className="entry-muted">{t('entry.invitedHint')}</p>
					{BOT_USERNAME ? (
						<button className="entry-button entry-button--primary" onClick={openBot}>{t('entry.openBot')}</button>
					) : (
						<p className="entry-muted">{t('entry.joinDescription')}</p>
					)}
				</div>
			</EntryShell>
		)
	}

	if (state.status === 'rejected' && !showForm) {
		return (
			<EntryShell state={state} onLanguageChange={chooseLanguage}>
				<div className="entry-status-card entry-status-card--rejected">
					<div className="entry-status-icon">↻</div>
					<h1>{t('entry.rejectedTitle')}</h1>
					<p>{t('entry.rejectedMessage', { businessName: state.registration?.businessName })}</p>
					<p className="entry-muted">
						{state.rejectionReason ? t('entry.rejectedReason', { reason: state.rejectionReason }) : t('entry.rejectedGeneric')}
					</p>
					<button className="entry-button entry-button--primary" onClick={() => setShowForm(true)}>{t('entry.revise')}</button>
				</div>
			</EntryShell>
		)
	}

	return (
		<EntryShell state={state} onLanguageChange={chooseLanguage}>
			{showForm ? (
				<form className="entry-form" onSubmit={submit}>
					<h1>{t('entry.formTitle')}</h1>
					<label className="entry-label" htmlFor="business-name">{t('entry.businessName')}</label>
					<input
						id="business-name"
						className="entry-input"
						value={businessName}
						onChange={(event) => setBusinessName(event.target.value)}
						placeholder={t('entry.businessNamePlaceholder')}
						maxLength={255}
						autoFocus
					/>
					<p className="entry-note">{t('entry.approvalNote')}</p>
					{errorMessage && <p className="entry-error">{errorMessage}</p>}
					<div className="entry-form-actions">
						<button type="button" className="entry-button entry-button--secondary" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
						<button type="submit" className="entry-button entry-button--primary" disabled={registration.isPending}>
							{registration.isPending ? t('common.saving') : t('entry.submit')}
						</button>
					</div>
				</form>
			) : (
				<>
					<div className="entry-steps">
						<EntryStep number="1" title={t('entry.steps.sendTitle')} text={t('entry.steps.sendText')} />
						<EntryStep number="2" title={t('entry.steps.extractTitle')} text={t('entry.steps.extractText')} />
						<EntryStep number="3" title={t('entry.steps.reviewTitle')} text={t('entry.steps.reviewText')} />
					</div>
					<div className="entry-actions">
						<button className="entry-choice" onClick={() => setShowForm(true)}>
							<strong>{t('entry.registerTitle')}</strong>
							<span>{t('entry.registerDescription')}</span>
						</button>
						<button className="entry-choice" onClick={openBot} disabled={!BOT_USERNAME}>
							<strong>{t('entry.joinTitle')}</strong>
							<span>{t('entry.joinDescription')}</span>
						</button>
					</div>
					{!BOT_USERNAME && <p className="entry-muted entry-bot-warning">{t('entry.joinDescription')}</p>}
				</>
			)}
		</EntryShell>
	)
}

function EntryShell({ state, onLanguageChange, children }: { state: RegistrationEntryState; onLanguageChange: (language: Language) => void; children: ReactNode }) {
	const { t, i18n } = useTranslation()
	const currentLanguage = (i18n.language === 'am' ? 'am' : 'en') as Language

	return (
		<main className="entry-page">
			<div className="entry-toolbar">
				<div className="entry-brand">Birr Track</div>
				<label className="entry-language">
					<span className="sr-only">{t('language.label')}</span>
					<select value={currentLanguage} onChange={(event) => onLanguageChange(event.target.value as Language)} aria-label={t('language.label')}>
						<option value="en">{t('language.en')}</option>
						<option value="am">{t('language.am')}</option>
					</select>
				</label>
			</div>
			<div className="entry-content">
				<div className="entry-identity">👤 {t('entry.identity', { name: state.displayName })}</div>
				{state.status !== 'pending' && state.status !== 'rejected' && <h1 className="entry-title">{t('entry.title')}</h1>}
				{state.status !== 'pending' && state.status !== 'rejected' && <p className="entry-subtitle">{t('entry.subtitle')}</p>}
				{children}
			</div>
		</main>
	)
}

function EntryStep({ number, title, text }: { number: string; title: string; text: string }) {
	return (
		<div className="entry-step">
			<div className="entry-step-number">{number}</div>
			<div><strong>{title}</strong><p>{text}</p></div>
		</div>
	)
}
