import { BotCommand } from 'telegraf/types'

import { SupportedLanguage } from '../users/entities/user.entity'

export type BotRole = 'unknown' | 'waiter' | 'manager' | 'owner' | 'platform_owner'

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
	en: 'English',
	am: 'አማርኛ',
}

type BotText = {
	shortDescription: string
	description: string
	languagePrompt: string
	languageSaved: string
	openApp: string
	openMiniApp: string
	submitReceipt: string
	inviteCommand: string
	askManagerInvite: string
	welcomeRegistered: string
	welcomePlatformOwner: string
	registerOrInvite: string
	registerSuccess: string
	alreadyRegistered: string
	askBusinessName: string
	businessNameEmpty: string
	onlyManagersInvite: string
	chooseInviteRole: string
	waiter: string
	manager: string
	selectStaffMember: string
	inviteSelectPrompt: string
	notRegistered: string
	inviteSent: string
	failedCreateInvite: string
	inviteRedeemed: string
	inviterNotify: string
	submitReceiptPrompt: string
	unknownPhotoUser: string
	suspendedBusiness: string
	pendingBusiness: string
	throttled: string
	receivedOne: string
	receivedMany: string
	reviewPing: string
	approveOnlyPlatformOwner: string
	rejectOnlyPlatformOwner: string
	alreadyApproved: string
	alreadyRejected: string
	businessNotFound: string
	cannotApprove: string
	cannotReject: string
	failedApprove: string
	failedReject: string
	businessApprovedCb: string
	businessRejectedCb: string
	ownerApproved: string
	ownerRejected: string
	approvedLine: string
	rejectedLine: string
	newRegistration: string
	approveButton: string
	rejectButton: string
	commands: Record<BotRole, BotCommand[]>
	help: Record<BotRole, string>
}

const en: BotText = {
	shortDescription: 'Submit payment Receipts and track Business Transactions from Telegram.',
	description:
		'Birr Track helps business owners or managers track credit receipts. Waiters submit payment receipts and managers or owners review work in the Admin Panel.',
	languagePrompt: 'Choose your language.',
	languageSaved: 'Language saved.',
	openApp: 'Open App',
	openMiniApp: 'Open Mini App',
	submitReceipt: '📸 Submit Receipt',
	inviteCommand: '/invite',
	askManagerInvite: 'Ask your manager for an invite',
	welcomeRegistered: 'Welcome back to {businessName}! Use the menu below or send /help for options.',
	welcomePlatformOwner: 'Welcome, Platform Owner. Open the Admin Panel below to review Business registrations and manage Businesses.',
	registerOrInvite: "You're not registered yet. Send /register to create a Business, or ask your Manager for an Invite.",
	registerSuccess: "Thank you! Your Business registration has been submitted for approval. We'll notify you when it's ready.",
	alreadyRegistered: 'You are already registered with {businessName}.',
	askBusinessName: 'What is your Business name?',
	businessNameEmpty: 'Business name cannot be empty. Please try again.',
	onlyManagersInvite: 'Only Managers and Owners can invite Waiters.',
	chooseInviteRole: 'What role would you like to invite?',
	waiter: 'Waiter',
	manager: 'Manager',
	selectStaffMember: 'Select staff member',
	inviteSelectPrompt: 'Now select the staff member to invite as a {role}:',
	notRegistered: 'You are not registered.',
	inviteSent: 'Invite sent! The staff member will be added as a {role} when they start the bot.',
	failedCreateInvite: 'Failed to create Invite',
	inviteRedeemed: "Welcome to Birr Track! You've been added to {businessId} as a {role}. Open the Mini App to get started.",
	inviterNotify: '{displayName} (@{username}) has accepted your Invite and joined as a {role}.',
	submitReceiptPrompt: 'Attach or take a Receipt photo and send it here.',
	unknownPhotoUser: "You're not registered. Send /register to create a Business, or ask your Manager for an Invite.",
	suspendedBusiness: 'Your Business is temporarily suspended. Please contact support.',
	pendingBusiness: "Your Business registration is pending approval. We'll notify you when you're ready to go.",
	throttled: "You're sending Receipts too quickly. Please wait a minute and try again.",
	receivedOne: 'Received ✓',
	receivedMany: 'Received {count} Receipts ✓',
	reviewPing: '⚠️ 1 Receipt needs your attention. Open the app to fix it.',
	approveOnlyPlatformOwner: 'Only the Platform Owner can approve registrations.',
	rejectOnlyPlatformOwner: 'Only the Platform Owner can reject registrations.',
	alreadyApproved: 'Already approved.',
	alreadyRejected: 'Already rejected.',
	businessNotFound: 'Business not found.',
	cannotApprove: 'Cannot approve this Business.',
	cannotReject: 'Cannot reject this Business.',
	failedApprove: 'Failed to approve.',
	failedReject: 'Failed to reject.',
	businessApprovedCb: 'Business approved!',
	businessRejectedCb: 'Business rejected.',
	ownerApproved: 'Your Business "{businessName}" has been approved! You can now start accepting Receipts from your team.',
	ownerRejected: 'Your Business registration for "{businessName}" was not approved at this time. Please contact support for details.',
	approvedLine: 'Approved: {businessName}',
	rejectedLine: 'Rejected: {businessName}',
	newRegistration: 'New Business registration:\n\nBusiness: {businessName}\nRegistrant: {registrantName} ({profileLink})\n\nApprove or reject below.',
	approveButton: '✅ Approve',
	rejectButton: '❌ Reject',
	commands: {
		unknown: [
			{ command: 'start', description: 'Start or refresh your session' },
			{ command: 'help', description: 'Show what this bot can do' },
			{ command: 'register', description: 'Register a Business' },
			{ command: 'lang', description: 'Choose language' },
		],
		waiter: [
			{ command: 'start', description: 'Refresh your menu' },
			{ command: 'help', description: 'Show help' },
			{ command: 'lang', description: 'Choose language' },
		],
		manager: [],
		owner: [],
		platform_owner: [],
	},
	help: {
		unknown: [
			'Birr Track helps Businesses record payment Receipts from Telegram.',
			'',
			'Commands:',
			'/start - Start or refresh your Birr Track session.',
			'/help - Show what this bot can do.',
			'/register - Register a Business as its Owner.',
			'/lang - Choose language.',
			'',
			'If your Business already uses Birr Track, ask a Manager or Owner to invite you.',
		].join('\n'),
		waiter: [
			'Birr Track records your Business payment Receipts.',
			'',
			'What you can do:',
			'- Send a Receipt photo here to record it.',
			'- Open the Admin Panel when you need to review Transactions.',
			'',
			'Commands:',
			'/start - Refresh your menu.',
			'/help - Show this help message.',
			'/lang - Choose language.',
		].join('\n'),
		manager: '',
		owner: '',
		platform_owner: [
			"You are Birr Track App's owner.",
			'',
			'Commands:',
			'/start - Show the Admin Panel button.',
			'/help - Show this help message.',
			'/lang - Choose language.',
		].join('\n'),
	},
}
en.commands.manager = [...en.commands.waiter, { command: 'invite', description: 'Invite a Waiter' }]
en.commands.owner = [...en.commands.waiter, { command: 'invite', description: 'Invite a Waiter or Manager' }]
en.commands.platform_owner = en.commands.waiter
en.help.manager = en.help.waiter.replace('Receipts.', 'Receipts and helps Managers review Transactions.') + '\n/invite - Invite a Waiter.'
en.help.owner = en.help.waiter.replace('Receipts.', 'Receipts and helps Owners manage their Business.') + '\n/invite - Invite a Waiter or Manager.'

const am: BotText = {
	shortDescription: 'የክፍያ ደረሰኞችን በቴሌግራም ያስገቡ እና የቢዝነስዎን ትራንሳክሽኖች ይከታተሉ።',
	description: 'Birr Track የክፍያ ደረሰኞችን ለማስመዝገብ፣ ለመገምገም እና በAdmin Panel ለመከታተል ይረዳል።',
	languagePrompt: 'ቋንቋዎን ይምረጡ።',
	languageSaved: 'የቋንቋ ምርጫዎ ተመዝግቧል።',
	openApp: 'መተግበሪያ ክፈት',
	openMiniApp: 'Mini App ክፈት',
	submitReceipt: '📸 ደረሰኝ ላክ',
	inviteCommand: '/ይጋብዙ',
	askManagerInvite: 'ከማናጀር ግብዣ ይጠይቁ',
	welcomeRegistered: 'እንኳን ወደ {businessName} በደህና መጡ! ከታች ያሉትን አማራጮች ይጠቀሙ ወይም /help ብለው ይላኩ።',
	welcomePlatformOwner: 'እንኳን ደህና መጡ አለቃ። የቢዝነስ ምዝገባዎችን ለመገምገም "Open App" የሚለውን ይጫኑ።',
	registerOrInvite: 'እስካሁን አልተመዘገቡም። ቢዝነስዎን ለማስመዝገብ /register ብለው ይላኩ ወይም ከማናጀሮ ግብዣ ይጠይቁ።',
	registerSuccess: 'እናመሰግናለን! የቢዝነስ ምዝገባዎ ለማጽደቅ ተልኳል። ሲጸድቅ እናሳውቅዎታለን።',
	alreadyRegistered: 'ከ{businessName} ጋር ቀድሞ ተመዝግበዋል።',
	askBusinessName: 'የቢዝነስዎ ስም ምንድነው?',
	businessNameEmpty: 'የቢዝነስዎ ስም ባዶ መሆን አይችልም። እባክዎ ደግመው ይሞክሩ።',
	onlyManagersInvite: 'አስተናጋጆች መጋበዝ የሚችሉት ማናጀር እና የቢዝነሱ ባለቤት ብቻ ናቸው።',
	chooseInviteRole: 'ምን ሚና መጋበዝ ይፈልጋሉ?',
	waiter: 'አስተናጋጅ',
	manager: 'ማናጀር',
	selectStaffMember: 'ሰራተኛ ይምረጡ',
	inviteSelectPrompt: 'አሁን እንደ {role} የሚጋበዘውን ሰራተኛ ይምረጡ።',
	notRegistered: 'አልተመዘገቡም።',
	inviteSent: 'ግብዣው ተልኳል! የተላከላቸው ሰው ይህን bot ሲያስጀምሩት እንደ {role} ሆነው የገባሉ።',
	failedCreateInvite: 'ግብዣ መፍጠር አልተቻለም',
	inviteRedeemed: 'እንኳን ወደ Birr Track በደህና መጡ! {businessName} ወደሚባለው ቢዝነስ እንደ {role} ሆነው ተጨምረዋል። ለመጀመር "Open App" ሚለውን ይንኩት።',
	inviterNotify: '{displayName} (@{username}) ግብዣዎን ተቀብሎ/ተቀብላ እንደ {role} ተቀላቅሏል/ተቀላቅላለች።',
	submitReceiptPrompt: 'የደረሰኝ ፎቶ እዚህ ይላኩ።',
	unknownPhotoUser: 'አልተመዘገቡም። ቢዝነስዎን ለማስመዝገብ /register በለው ይላኩ ወይም ከማናጀሮ ግብዣ ይጠይቁ።',
	suspendedBusiness: 'ቢዝነስዎ ለጊዜው ታግዷል። እባክዎ /support ብለው በመላክ ምክንያቱን መጠየቅ ይችላሉ።',
	pendingBusiness: 'የቢዝነስ ምዝገባዎ እስኪጸድቅ በመጠባበቅ ላይ ነው። ሲጸድቅ እናሳውቅዎታለን።',
	throttled: 'ደረሰኞችን በጣም በፍጥነት እየላኩ ነው። ለአንድ ደቂቃ ይጠብቁ እና ደግመው ይሞክሩ።',
	receivedOne: 'ተቀብለናል ✓',
	receivedMany: '{count} ደረሰኞች ተቀብለናል ✓',
	reviewPing: '⚠️ 1 ደረሰኝ ትኩረትዎን ይፈልጋል። ለማስተካከል app ይክፈቱ።',
	approveOnlyPlatformOwner: 'የዚህ መተግበሪያ ባለቤት ብቻ ነው ይህን ማጽደቅ የሚችለው።',
	rejectOnlyPlatformOwner: 'የዚህ መተግበሪያ ባለቤት ብቻ ነው ይህን ውድቅ ማድረግ የሚችለው።',
	alreadyApproved: 'ከዚህ በፊት ጸድቋል።',
	alreadyRejected: 'ከዚህ በፊት ውድቅ ሆኗል።',
	businessNotFound: 'ቢዝነሱ አልተገኘም።',
	cannotApprove: 'ይህን ቢዝነስ ማጽደቅ አልተቻለም።',
	cannotReject: 'ይህን ቢዝነስ ውድቅ ማድረግ አልተቻለም።',
	failedApprove: 'ይህን ቢዝነስ ማጽደቅ አልተሳካም።',
	failedReject: 'ይህን ቢዝነስ ውድቅ ማድረግ አልተሳካም።',
	businessApprovedCb: 'ቢዝነስዎ ጸድቋል!',
	businessRejectedCb: 'ቢዝነስዎ ውድቅ ተድርጓል!',
	ownerApproved: '"{businessName}" የሚለው ቢዝነስዎ ጸድቋል! ከአሁን ጀምሮ ሪሲቶችን መመዝገብ ይችላሉ።',
	ownerRejected: '"{businessName}" የሚለው ቢዝነስዎ ውድቅ ሆኗል። ሌላ ምንረዳዎት ነገር ካለ እባክዎን ይጠይቁን።',
	approvedLine: '{businessName}፡ ጸድቋል።',
	rejectedLine: '{businessName}፡ ውድቅ ሆኗል።',
	newRegistration: 'የአዲስ ቢዝነስ ምዝገባ:\n\nቢዝነስ: {businessName}\nተመዝጋቢ: {registrantName} ({profileLink})\n\nከታች ባሉት ማጽደቅ ወይም ውድቅ ማድረግ ይችላሉ።',
	approveButton: '✅ አጽድቅ',
	rejectButton: '❌ ውድቅ አድርግ',
	commands: {
		unknown: [
			{ command: 'start', description: 'ጀምር ወይም አድስ' },
			{ command: 'help', description: 'እገዛ አሳይ' },
			{ command: 'register', description: 'ቢዝነስ መዝግብ' },
			{ command: 'lang', description: 'ቋንቋ ምረጥ' },
		],
		waiter: [
			{ command: 'start', description: 'ዝርዝሩን አድስ' },
			{ command: 'help', description: 'እገዛ አሳይ' },
			{ command: 'lang', description: 'ቋንቋ ምረጥ' },
		],
		manager: [],
		owner: [],
		platform_owner: [],
	},
	help: {
		unknown: [
			'Birr Track የቢዝነስዎን የክፍያ ሪሲቶች ቴሌግራም ላይ ሆነው ለመቆጣጠር ይረዳዎታል',
			'',
			'ትእዛዞች:',
			'/start - ቦቱን ለማስጀመር ወይም ለማደስ',
			'/help - ይህ ቦት ምን ማድረግ እንደሚችል ለማወቅ',
			'/register - እንደባለቤት ሆነው ቢዝነስዎን ለማስመዝገብ',
			'/lang - ቋንቋ ለመቀየር',
			'',
			'ቢዝነስዎ ከዚህ በፊት የተመዘገበ ከሆነ ማናጀርዎ ወይም የቢዝነሱ ባለቤት እንዲጋብዝዎት ይጠይቁ።',
		].join('\n'),
		waiter: [
			'የBirr Track መተግበሪያ የሰበሰቧቸውን የክፍያ ሪሲቶችን ለአለቃዎ ለማስመዝገብ ይረዳዎታል።',
			'',
			'ማድረግ የሚችሏቸው ነገሮች:',
			'- የሪሲቱን ፎቶ እዚህ ቦት ላይ ሲልኩት ወድያው ይመዘገባል።',
			'- "Open App" የሚለውን ተጭነው እስካሁን ያስመዘገቧቸውን ሪሲቶች ማየት ይችላሉ።',
			'',
			'ትእዛዞች:',
			'/start - ቦቱን ለማስጀመር ወይም ለማደስ',
			'/help - ይህ ቦት ምን ማድረግ እንደሚችል ለማወቅ',
			'/lang - ቋንቋ ለመቀየር',
		].join('\n'),
		manager: '',
		owner: '',
		platform_owner: [
			'የBirr Track መተግበሪያ ባለቤት ኖት።',
			'',
			'ትእዛዞች:',
			'/start - ቦቱን ለማስጀመር ወይም ለማደስ',
			'/help - ይህ ቦት ምን ማድረግ እንደሚችል ለማወቅ',
			'/lang - ቋንቋ ለመቀየር',
		].join('\n'),
	},
}
am.commands.manager = [...am.commands.waiter, { command: 'invite', description: 'አስተናጋጅ ጋብዝ' }]
am.commands.owner = [...am.commands.waiter, { command: 'invite', description: 'አስተናጋጅ ወይም ማናጀር ጋብዝ' }]
am.commands.platform_owner = am.commands.waiter
am.help.manager = am.help.waiter + '\n/invite - አስተናጋጅ ጋብዝ'
am.help.owner = am.help.waiter + '\n/invite - አስተናጋጅ ወይም ማናጀር ጋብዝ'

const texts: Record<SupportedLanguage, BotText> = { en, am }

export function botText(language: SupportedLanguage): BotText {
	return texts[language] ?? texts.en
}

export function formatBotText(template: string, values: Record<string, string | number | undefined>): string {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
	return value === 'en' || value === 'am'
}
