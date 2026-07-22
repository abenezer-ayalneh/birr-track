import { createHash } from 'node:crypto'

import { BotText, botText } from './telegram.i18n'
import { renderBotHtml } from './telegram-html'

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

// This golden is based on the dirty working-tree catalog at the start of the refresh,
// including the pre-existing Registration reason/next-step placeholders.
const RETAINED_AMHARIC_KEYS = [
	'shortDescription',
	'description',
	'languagePrompt',
	'languageSaved',
	'openMiniApp',
	'registerBusiness',
	'submitReceipt',
	'inviteCommand',
	'welcomeRegistered',
	'welcomePlatformOwner',
	'registerOrInvite',
	'alreadyRegistered',
	'onlyManagersInvite',
	'onlyOwnerInviteManager',
	'chooseInviteRole',
	'waiter',
	'manager',
	'selectStaffMember',
	'inviteSelectPrompt',
	'notRegistered',
	'inviteSent',
	'inviteSkipped',
	'inviteBatchFailed',
	'failedCreateInvite',
	'inviteRedeemed',
	'inviterNotify',
	'removedFromBusiness',
	'memberLeftBusiness',
	'waiterRemovedByManager',
	'submitReceiptPrompt',
	'unknownPhotoUser',
	'suspendedBusiness',
	'pendingBusiness',
	'throttled',
	'receivedOne',
	'receivedMany',
	'reviewPing',
	'approveOnlyPlatformOwner',
	'rejectOnlyPlatformOwner',
	'alreadyApproved',
	'alreadyRejected',
	'businessNotFound',
	'cannotApprove',
	'cannotReject',
	'failedApprove',
	'failedReject',
	'businessApprovedCb',
	'businessRejectedCb',
	'ownerApproved',
	'ownerRejected',
	'rejectedNextStep',
	'approvedLine',
	'rejectedLine',
	'newRegistration',
	'approveButton',
	'rejectButton',
	'commands',
	'help',
] as const satisfies readonly (keyof BotText)[]

describe('Telegram copy catalog', () => {
	it('keeps the complete English catalog on its reviewed golden', () => {
		expect(digest(botText('en'))).toBe('a09edc278995cb54257986c836a034680e5c3a6e56b3e3dce76e83136a723666')
	})

	it('keeps every retained Amharic surface byte-for-byte on its reviewed golden', () => {
		const am = botText('am')
		const retained = Object.fromEntries(RETAINED_AMHARIC_KEYS.map((key) => [key, am[key]]))
		expect(digest(retained)).toBe('e738bab8df669243309993401a46ae50897c692286d2c41f12b49ef11faa9ae0')
	})

	it('uses the four approved Amharic CTA translations exactly', () => {
		expect({
			viewRegistration: botText('am').viewRegistration,
			reviseRegistration: botText('am').reviseRegistration,
			reviewTransactions: botText('am').reviewTransactions,
			contactSupport: botText('am').contactSupport,
		}).toEqual({
			viewRegistration: 'ምዝገባዎን ይመልከቱ',
			reviseRegistration: 'ምዝገባዎን ያስተካክሉ',
			reviewTransactions: 'ትራንዛክሽኖችን ይገምግሙ',
			contactSupport: 'ድጋፍ ያግኙ',
		})
	})

	it('uses the standard English actions and exact compact Receipt acknowledgements', () => {
		const en = botText('en')
		expect({
			openMiniApp: en.openMiniApp,
			registerBusiness: en.registerBusiness,
			viewRegistration: en.viewRegistration,
			reviseRegistration: en.reviseRegistration,
			reviewTransactions: en.reviewTransactions,
			contactSupport: en.contactSupport,
			submitReceipt: en.submitReceipt,
			inviteCommand: en.inviteCommand,
			approveButton: en.approveButton,
			rejectButton: en.rejectButton,
			receivedOne: en.receivedOne,
			receivedMany: en.receivedMany,
		}).toEqual({
			openMiniApp: 'Open Mini App',
			registerBusiness: 'Register a Business',
			viewRegistration: 'View Registration',
			reviseRegistration: 'Revise Registration',
			reviewTransactions: 'Review Transactions',
			contactSupport: 'Contact Support',
			submitReceipt: 'Submit Receipt',
			inviteCommand: 'Invite Member',
			approveButton: 'Approve',
			rejectButton: 'Reject',
			receivedOne: '✅ Receipt received',
			receivedMany: '✅ {count} Receipts received',
		})
	})

	it('keeps profiles, commands, buttons, and callback popups plain text', () => {
		const en = botText('en')
		const plainValues = [
			en.shortDescription,
			en.description,
			en.openMiniApp,
			en.registerBusiness,
			en.viewRegistration,
			en.reviseRegistration,
			en.reviewTransactions,
			en.contactSupport,
			en.submitReceipt,
			en.inviteCommand,
			en.approveButton,
			en.rejectButton,
			en.languageSaved,
			en.inviteOnlyManagersCb,
			en.inviteOnlyOwnerCb,
			en.approveOnlyPlatformOwner,
			en.rejectOnlyPlatformOwner,
			en.alreadyApproved,
			en.alreadyRejected,
			en.businessNotFound,
			en.cannotApprove,
			en.cannotReject,
			en.failedApprove,
			en.failedReject,
			en.businessApprovedCb,
			en.businessRejectedCb,
			...Object.values(en.commands).flatMap((commands) => commands.flatMap((command) => [command.command, command.description])),
		]

		for (const value of plainValues) {
			expect(value).not.toMatch(/[<>]/)
		}
	})

	it('renders every English scalar surface with only trusted markup and escaped hostile values', () => {
		const values = {
			actorName: 'Cafe <Addis> & Co',
			businessName: 'Cafe <Addis> & Co',
			count: 2,
			displayName: 'Cafe <Addis> & Co',
			memberName: 'Cafe <Addis> & Co',
			names: 'Cafe <Addis> & Co',
			nextStep: 'Cafe <Addis> & Co',
			reason: 'Cafe <Addis> & Co',
			reference: 'Cafe <Addis> & Co',
			registrantName: 'Cafe <Addis> & Co',
			role: 'Cafe <Addis> & Co',
			selection: 'Cafe <Addis> & Co',
			telegramUserId: 'Cafe <Addis> & Co',
			username: 'Cafe <Addis> & Co',
		}
		const scalarTemplates = Object.values(botText('en')).filter((value): value is string => typeof value === 'string')

		for (const template of scalarTemplates) {
			const rendered = renderBotHtml(template, values)
			if (template.includes('{')) {
				expect(rendered).not.toContain('Cafe <Addis> & Co')
			}
		}
	})
})
