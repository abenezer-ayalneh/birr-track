import { BotCommand } from 'telegraf/types'

import { SupportedLanguage } from '../users/entities/user.entity'

export type BotRole = 'unknown' | 'waiter' | 'manager' | 'owner' | 'platform_owner'

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
	en: 'English',
	am: 'አማርኛ',
}

export type BotText = {
	shortDescription: string
	description: string
	languagePrompt: string
	languageSaved: string
	selectionConfirmed: string
	openMiniApp: string
	registerBusiness: string
	viewRegistration: string
	reviseRegistration: string
	reviewTransactions: string
	contactSupport: string
	submitReceipt: string
	inviteCommand: string
	welcomeRegistered: string
	welcomePlatformOwner: string
	registerOrInvite: string
	alreadyRegistered: string
	onlyManagersInvite: string
	onlyOwnerInviteManager: string
	inviteOnlyManagersCb: string
	inviteOnlyOwnerCb: string
	chooseInviteRole: string
	waiter: string
	manager: string
	owner: string
	selectStaffMember: string
	inviteSelectPrompt: string
	notRegistered: string
	inviteResultCreated: string
	inviteResultPartial: string
	inviteResultNone: string
	inviteSent: string
	inviteSkipped: string
	inviteBatchFailed: string
	failedCreateInvite: string
	inviteRedeemed: string
	inviterNotify: string
	telegramUserFallback: string
	removedFromBusiness: string
	memberLeftBusiness: string
	waiterRemovedByManager: string
	businessManagement: string
	reasonPrefix: string
	reasonNotProvided: string
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
	rejectedNextStep: string
	approvedLine: string
	rejectedLine: string
	newRegistration: string
	approveButton: string
	rejectButton: string
	commands: Record<BotRole, BotCommand[]>
	help: Record<BotRole, string>
}

const en: BotText = {
	shortDescription: 'Submit Receipts and track Business Transactions with Birr Track.',
	description: 'Waiters submit Receipts in Telegram. Managers and Owners review Transactions and manage their Business in the Mini App.',
	languagePrompt: '🌐 <b>Choose your language</b>\n\nSelect the language you want Birr Track to use.',
	languageSaved: 'Language updated.',
	selectionConfirmed: '✅ <b>{selection} selected</b>',
	openMiniApp: 'Open Mini App',
	registerBusiness: 'Register a Business',
	viewRegistration: 'View Registration',
	reviseRegistration: 'Revise Registration',
	reviewTransactions: 'Review Transactions',
	contactSupport: 'Contact Support',
	submitReceipt: 'Submit Receipt',
	inviteCommand: 'Invite Member',
	welcomeRegistered: '👋 <b>Welcome back</b>\n\n<b>Business:</b> {businessName}\n<b>Role:</b> {role}\n\nSubmit a Receipt or open the Mini App.',
	welcomePlatformOwner: '🛡️ <b>Platform Owner tools</b>\n\nReview Registrations and manage Businesses in the Mini App.',
	registerOrInvite: '🧾 <b>Set up Birr Track</b>\n\nRegister a Business, or ask a Manager or Owner for an Invite.',
	alreadyRegistered: '✅ <b>Registration already complete</b>\n\n<b>Business:</b> {businessName}\n\nOpen the Mini App or submit a Receipt.',
	onlyManagersInvite: '🔒 <b>Invite unavailable</b>\n\nOnly a Manager or Owner can invite a Waiter.\n\nAsk a Manager or Owner for an Invite.',
	onlyOwnerInviteManager: '🔒 <b>Invite unavailable</b>\n\nOnly the Owner can invite a Manager.\n\nAsk the Owner to create this Invite.',
	inviteOnlyManagersCb: 'Manager or Owner required.',
	inviteOnlyOwnerCb: 'Owner required.',
	chooseInviteRole: '👥 <b>Choose a role</b>\n\nSelect the role for this Invite.',
	waiter: 'Waiter',
	manager: 'Manager',
	owner: 'Owner',
	selectStaffMember: 'Select people',
	inviteSelectPrompt: '👤 <b>Select people</b>\n\n<b>Role:</b> {role}\n\nChoose up to 10 Telegram contacts.',
	notRegistered: '🔒 <b>Registration required</b>\n\nStart Birr Track with /start before creating an Invite.',
	inviteResultCreated: '✅ <b>Invites created</b>',
	inviteResultPartial: '⚠️ <b>Some Invites need attention</b>',
	inviteResultNone: '❌ <b>No Invites created</b>',
	inviteSent: '<b>Created ({count} {role}):</b> {names}\nAsk them to start the bot to join.',
	inviteSkipped: '<b>Already Business members ({count}):</b> {names}',
	inviteBatchFailed: '<b>Not created ({count}):</b> {names}\nTry those Invites again.',
	failedCreateInvite: '❌ <b>Invite not created</b>\n\nTry again, or contact support if the problem continues.',
	inviteRedeemed: '✅ <b>Invite accepted</b>\n\n<b>Business:</b> {businessName}\n<b>Role:</b> {role}\n\nOpen the Mini App to get started.',
	inviterNotify:
		'✅ <b>Member joined</b>\n\n<b>Business:</b> {businessName}\n<b>Member:</b> {displayName}\n<b>Role:</b> {role}\n\nOpen the Mini App to manage members.',
	telegramUserFallback: 'Telegram account {telegramUserId}',
	removedFromBusiness:
		'🚪 <b>Business access removed</b>\n\n<b>Business:</b> {businessName}\n<b>Removed by:</b> {actorName}\n{reason}\n\nAsk a Manager or Owner for a new Invite if you need access again.',
	memberLeftBusiness: '👋 <b>Member left</b>\n\n<b>Business:</b> {businessName}\n<b>Member:</b> {displayName}\n\nOpen the Mini App to review your team.',
	waiterRemovedByManager:
		'🚪 <b>Waiter removed</b>\n\n<b>Business:</b> {businessName}\n<b>Waiter:</b> {memberName}\n<b>Manager:</b> {actorName}\n{reason}\n\nOpen the Mini App to review your team.',
	businessManagement: 'Business management',
	reasonPrefix: 'Reason: ',
	reasonNotProvided: 'Reason not provided.',
	submitReceiptPrompt: '📸 <b>Submit a Receipt</b>\n\nTake or attach one clear Receipt photo and send it here.',
	unknownPhotoUser: '🧾 <b>Registration required</b>\n\nRegister a Business, or ask a Manager or Owner for an Invite.',
	suspendedBusiness: '⛔ <b>Business suspended</b>\n\n<b>Business:</b> {businessName}\n\nContact Support for help restoring access.',
	pendingBusiness: '⏳ <b>Registration pending</b>\n\n<b>Business:</b> {businessName}\n\nView Registration for the latest status.',
	throttled: '⏱️ <b>Please slow down</b>\n\nToo many Receipts arrived at once.\n\nWait one minute, then submit the Receipt again.',
	receivedOne: '✅ Receipt received',
	receivedMany: '✅ {count} Receipts received',
	reviewPing: '⚠️ <b>Transaction needs review</b>\n\nA Transaction is in Needs Review.\n\nReview Transactions to correct it.',
	approveOnlyPlatformOwner: 'Only the Platform Owner can approve registrations.',
	rejectOnlyPlatformOwner: 'Only the Platform Owner can reject registrations.',
	alreadyApproved: 'Already approved.',
	alreadyRejected: 'Already rejected.',
	businessNotFound: 'Business not found.',
	cannotApprove: 'Cannot approve this Business.',
	cannotReject: 'Cannot reject this Business.',
	failedApprove: 'Failed to approve.',
	failedReject: 'Failed to reject.',
	businessApprovedCb: 'Business approved.',
	businessRejectedCb: 'Business rejected.',
	ownerApproved: '✅ <b>Registration approved</b>\n\n<b>Business:</b> {businessName}\n\nYour Business is now active.',
	ownerRejected: '❌ <b>Registration needs revision</b>\n\n<b>Business:</b> {businessName}\n{reason}\n\n{nextStep}',
	rejectedNextStep: 'Use the Revise Registration action below to update and resubmit.',
	approvedLine: '✅ <b>Registration approved</b>\n\n<b>Business:</b> {businessName}\n\nThe Prospective Owner has been notified.',
	rejectedLine: '❌ <b>Registration rejected</b>\n\n<b>Business:</b> {businessName}\n\nThe Prospective Owner has been notified.',
	newRegistration:
		'🆕 <b>Registration submitted</b>\n\n<b>Business:</b> {businessName}\n<b>Prospective Owner:</b> {registrantName}\n<b>Telegram ID:</b> <code>{telegramUserId}</code>\n\nApprove or Reject this Registration.',
	approveButton: 'Approve',
	rejectButton: 'Reject',
	commands: {
		unknown: [
			{ command: 'start', description: 'Start or refresh Birr Track' },
			{ command: 'help', description: 'Show help for your role' },
			{ command: 'register', description: 'Register a Business' },
			{ command: 'lang', description: 'Choose your language' },
		],
		waiter: [
			{ command: 'start', description: 'Refresh your Birr Track menu' },
			{ command: 'help', description: 'Show Waiter help' },
			{ command: 'lang', description: 'Choose your language' },
		],
		manager: [
			{ command: 'start', description: 'Refresh your Birr Track menu' },
			{ command: 'help', description: 'Show Manager help' },
			{ command: 'lang', description: 'Choose your language' },
			{ command: 'invite', description: 'Invite a Waiter' },
		],
		owner: [
			{ command: 'start', description: 'Refresh your Birr Track menu' },
			{ command: 'help', description: 'Show Owner help' },
			{ command: 'lang', description: 'Choose your language' },
			{ command: 'invite', description: 'Invite a Waiter or Manager' },
		],
		platform_owner: [
			{ command: 'start', description: 'Open Platform Owner tools' },
			{ command: 'help', description: 'Show Platform Owner help' },
			{ command: 'lang', description: 'Choose your language' },
		],
	},
	help: {
		unknown:
			'ℹ️ <b>Birr Track help</b>\n\n<b>Getting started</b>\n• Register a Business in the Mini App.\n• If your Business already uses Birr Track, ask a Manager or Owner for an Invite.\n\n<b>Commands</b>\n/start — Start or refresh Birr Track\n/register — Register a Business\n/lang — Choose your language\n/help — Show this help',
		waiter: '🧾 <b>Waiter help</b>\n\n<b>Receipts</b>\n• Send one clear Receipt photo in this chat.\n• Use Submit Receipt for a reminder.\n\n<b>Transactions</b>\n• Open the Mini App to review your Transactions.\n\n<b>Commands</b>\n/start — Refresh your menu\n/lang — Choose your language\n/help — Show this help',
		manager:
			'👥 <b>Manager help</b>\n\n<b>Receipts</b>\n• Submit a Receipt photo in this chat.\n\n<b>Team</b>\n• Use Invite Member or /invite to invite a Waiter.\n\n<b>Transactions</b>\n• Open the Mini App to review Transactions.\n\n<b>Commands</b>\n/start — Refresh your menu\n/invite — Invite a Waiter\n/lang — Choose your language\n/help — Show this help',
		owner: '🏢 <b>Owner help</b>\n\n<b>Receipts</b>\n• Submit a Receipt photo in this chat.\n\n<b>Team</b>\n• Use Invite Member or /invite to invite a Waiter or Manager.\n\n<b>Business</b>\n• Open the Mini App to manage your Business and review Transactions.\n\n<b>Commands</b>\n/start — Refresh your menu\n/invite — Invite a Waiter or Manager\n/lang — Choose your language\n/help — Show this help',
		platform_owner:
			'🛡️ <b>Platform Owner help</b>\n\n<b>Registrations</b>\n• Approve or Reject Registration alerts in this chat.\n\n<b>Businesses</b>\n• Open the Mini App to manage Businesses.\n\n<b>Commands</b>\n/start — Open Platform Owner tools\n/lang — Choose your language\n/help — Show this help',
	},
}

const am: BotText = {
	shortDescription: 'የክፍያ ደረሰኞችን በቴሌግራም ያስገቡ እና የቢዝነስዎን ትራንሳክሽኖች ይከታተሉ።',
	description: 'Birr Track የክፍያ ደረሰኞችን ለማስመዝገብ፣ ለመገምገም እና በAdmin Panel ለመከታተል ይረዳል።',
	languagePrompt: 'ቋንቋዎን ይምረጡ።',
	languageSaved: 'የቋንቋ ምርጫዎ ተመዝግቧል።',
	selectionConfirmed: '{selection}',
	openMiniApp: 'Mini App ክፈት',
	registerBusiness: 'በMini App ቢዝነስ ይመዝግቡ',
	viewRegistration: 'ምዝገባዎን ይመልከቱ',
	reviseRegistration: 'ምዝገባዎን ያስተካክሉ',
	reviewTransactions: 'ትራንዛክሽኖችን ይገምግሙ',
	contactSupport: 'ድጋፍ ያግኙ',
	submitReceipt: '📸 ደረሰኝ ላክ',
	inviteCommand: '/ይጋብዙ',
	welcomeRegistered: 'እንኳን ወደ {businessName} በደህና መጡ! ከታች ያሉትን አማራጮች ይጠቀሙ ወይም /help ብለው ይላኩ።',
	welcomePlatformOwner: 'እንኳን ደህና መጡ አለቃ። የቢዝነስ ምዝገባዎችን ለመገምገም "Open App" የሚለውን ይጫኑ።',
	registerOrInvite: 'እስካሁን አልተመዘገቡም። ቢዝነስዎን ለማስመዝገብ /register ብለው ይላኩ ወይም ከማናጀሮ ግብዣ ይጠይቁ።',
	alreadyRegistered: 'ከ{businessName} ጋር ቀድሞ ተመዝግበዋል።',
	onlyManagersInvite: 'አስተናጋጆች መጋበዝ የሚችሉት ማናጀር እና የቢዝነሱ ባለቤት ብቻ ናቸው።',
	onlyOwnerInviteManager: 'ማናጀሮችን መጋበዝ የሚችለው የቢዝነሱ ባለቤት ብቻ ነው።',
	inviteOnlyManagersCb: 'አስተናጋጆች መጋበዝ የሚችሉት ማናጀር እና የቢዝነሱ ባለቤት ብቻ ናቸው።',
	inviteOnlyOwnerCb: 'ማናጀሮችን መጋበዝ የሚችለው የቢዝነሱ ባለቤት ብቻ ነው።',
	chooseInviteRole: 'ምን ሚና መጋበዝ ይፈልጋሉ?',
	waiter: 'አስተናጋጅ',
	manager: 'ማናጀር',
	owner: '',
	selectStaffMember: 'ሰራተኞችን ይምረጡ',
	inviteSelectPrompt: 'አሁን እንደ {role} ሆነው የሚጋበዙ እስከ 10 ሰራተኞችን ይምረጡ።',
	notRegistered: 'አልተመዘገቡም።',
	inviteResultCreated: '',
	inviteResultPartial: '',
	inviteResultNone: '',
	inviteSent: 'ለ{count} {role} ግብዣ ተፈጥሯል፦ {names}። bot ሲያስጀምሩ ይቀላቀላሉ።',
	inviteSkipped: 'ቀድሞ የቢዝነስ አባል የሆኑ {count} ሰዎች ተዘለዋል፦ {names}።',
	inviteBatchFailed: 'ለ{count} ሰዎች ግብዣ መፍጠር አልተቻለም፦ {names}። እባክዎ ደግመው ይሞክሩ።',
	failedCreateInvite: 'ግብዣ መፍጠር አልተቻለም',
	inviteRedeemed: 'እንኳን ወደ Birr Track በደህና መጡ! {businessName} ወደሚባለው ቢዝነስ እንደ {role} ሆነው ተጨምረዋል። ለመጀመር "Open App" ሚለውን ይንኩት።',
	inviterNotify: '{displayName} (@{username}) ግብዣዎን ተቀብሎ/ተቀብላ እንደ {role} ተቀላቅሏል/ተቀላቅላለች።',
	telegramUserFallback: 'Telegram #{telegramUserId}',
	removedFromBusiness: 'ከ{businessName} ቢዝነስ በ{actorName} ተወግደዋል። {reason} እንደገና ለመቀላቀል አዲስ Invite ያስፈልግዎታል።',
	memberLeftBusiness: '{displayName} ከ{businessName} ቢዝነስ ወጥተዋል።',
	waiterRemovedByManager: '{memberName} ከ{businessName} ቢዝነስ በ{actorName} ተወግደዋል። {reason}',
	businessManagement: 'Business management',
	reasonPrefix: 'ምክንያት: ',
	reasonNotProvided: 'ምክንያት አልተሰጠም።',
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
	ownerRejected: '"{businessName}" የሚለው ቢዝነስዎ ውድቅ ሆኗል። {reason} {nextStep}',
	rejectedNextStep: 'ለማስተካከልና እንደገና ለመላክ Mini App ይክፈቱ።',
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
		manager: [
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
			'/invite - አስተናጋጅ ጋብዝ',
		].join('\n'),
		owner: [
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
			'/invite - አስተናጋጅ ወይም ማናጀር ጋብዝ',
		].join('\n'),
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

const texts: Record<SupportedLanguage, BotText> = { en, am }

export function botText(language: SupportedLanguage): BotText {
	return texts[language] ?? texts.en
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
	return value === 'en' || value === 'am'
}
