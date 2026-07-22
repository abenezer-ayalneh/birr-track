import { renderBotHtml, withTelegramHtml } from './telegram-html'

describe('telegram-html', () => {
	describe('renderBotHtml', () => {
		it('preserves the supported trusted catalog tags', () => {
			expect(renderBotHtml('✅ <b>Saved</b>\n\n<i>Reference:</i> <code>{reference}</code>', { reference: 42 })).toBe(
				'✅ <b>Saved</b>\n\n<i>Reference:</i> <code>42</code>',
			)
		})

		it('escapes every HTML-sensitive character in runtime values', () => {
			expect(renderBotHtml('<b>Business:</b> {businessName}', { businessName: `Cafe <Addis> & Co "Prime" 'One'` })).toBe(
				'<b>Business:</b> Cafe &lt;Addis&gt; &amp; Co &quot;Prime&quot; &#39;One&#39;',
			)
		})

		it('escapes repeated placeholder values independently', () => {
			expect(renderBotHtml('{name} / <code>{name}</code>', { name: 'A&B' })).toBe('A&amp;B / <code>A&amp;B</code>')
		})

		it('rejects a missing placeholder value', () => {
			expect(() => renderBotHtml('{businessName}', {})).toThrow('Missing bot HTML placeholder value: businessName')
			expect(() => renderBotHtml('{businessName}', { businessName: undefined })).toThrow('Missing bot HTML placeholder value: businessName')
		})

		it.each(['<a href="{url}">Open</a>', '<b class="title">Title</b>', '<u>Title</u>', '2 < 3', '<b>Title'])(
			'rejects unsupported or malformed markup: %s',
			(template) => {
				expect(() => renderBotHtml(template, { url: 'https://example.com' })).toThrow()
			},
		)

		it('rejects mismatched trusted tags', () => {
			expect(() => renderBotHtml('<b><i>Title</b></i>')).toThrow('unmatched closing <b>')
		})
	})

	describe('withTelegramHtml', () => {
		it('creates HTML parse options', () => {
			expect(withTelegramHtml()).toEqual({ parse_mode: 'HTML' })
		})

		it('preserves other options and enforces HTML parse mode', () => {
			expect(withTelegramHtml({ disable_notification: true, parse_mode: 'Markdown' })).toEqual({
				disable_notification: true,
				parse_mode: 'HTML',
			})
		})
	})
})
