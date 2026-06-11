import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm'

const USERS_TABLE = 'users'
const INVITES_TABLE = 'invites'
const BUSINESSES_TABLE = 'businesses'
const TRANSACTIONS_TABLE = 'transactions'

export class AddUsersInvitesAndMultiTenancy1718050000000 implements MigrationInterface {
	name = 'AddUsersInvitesAndMultiTenancy1718050000000'

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: USERS_TABLE,
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						generationStrategy: 'uuid',
						default: 'uuid_generate_v4()',
					},
					{
						name: 'telegramUserId',
						type: 'bigint',
						isNullable: false,
						isUnique: true,
					},
					{
						name: 'displayName',
						type: 'varchar',
						length: '255',
						isNullable: false,
					},
					{
						name: 'businessId',
						type: 'uuid',
						isNullable: true,
					},
					{
						name: 'role',
						type: 'varchar',
						length: '20',
						isNullable: false,
					},
					{
						name: 'removedAt',
						type: 'timestamptz',
						isNullable: true,
					},
					{
						name: 'createdAt',
						type: 'timestamptz',
						default: 'now()',
						isNullable: false,
					},
				],
			}),
		)

		await queryRunner.createIndex(
			USERS_TABLE,
			new TableIndex({
				name: 'idx_user_business_id',
				columnNames: ['businessId'],
			}),
		)

		await queryRunner.createForeignKey(
			USERS_TABLE,
			new TableForeignKey({
				columnNames: ['businessId'],
				referencedTableName: BUSINESSES_TABLE,
				referencedColumnNames: ['id'],
				onDelete: 'SET NULL',
			}),
		)

		await queryRunner.createTable(
			new Table({
				name: INVITES_TABLE,
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						generationStrategy: 'uuid',
						default: 'uuid_generate_v4()',
					},
					{
						name: 'inviteeTelegramId',
						type: 'bigint',
						isNullable: false,
					},
					{
						name: 'businessId',
						type: 'uuid',
						isNullable: false,
					},
					{
						name: 'role',
						type: 'varchar',
						length: '20',
						isNullable: false,
					},
					{
						name: 'createdByUserId',
						type: 'uuid',
						isNullable: false,
					},
					{
						name: 'status',
						type: 'varchar',
						length: '20',
						default: "'pending'",
						isNullable: false,
					},
					{
						name: 'expiresAt',
						type: 'timestamptz',
						isNullable: false,
					},
					{
						name: 'createdAt',
						type: 'timestamptz',
						default: 'now()',
						isNullable: false,
					},
				],
			}),
		)

		await queryRunner.createIndex(
			INVITES_TABLE,
			new TableIndex({
				name: 'idx_invite_business_id',
				columnNames: ['businessId'],
			}),
		)

		await queryRunner.createIndex(
			INVITES_TABLE,
			new TableIndex({
				name: 'uq_invite_pending_invitee',
				columnNames: ['inviteeTelegramId'],
				isUnique: true,
				where: `"status" = 'pending'`,
			}),
		)

		await queryRunner.createForeignKey(
			INVITES_TABLE,
			new TableForeignKey({
				columnNames: ['businessId'],
				referencedTableName: BUSINESSES_TABLE,
				referencedColumnNames: ['id'],
				onDelete: 'CASCADE',
			}),
		)

		await queryRunner.createForeignKey(
			INVITES_TABLE,
			new TableForeignKey({
				columnNames: ['createdByUserId'],
				referencedTableName: USERS_TABLE,
				referencedColumnNames: ['id'],
				onDelete: 'CASCADE',
			}),
		)

		const businessTable = await queryRunner.getTable(BUSINESSES_TABLE)
		if (businessTable?.findColumnByName('name')?.isUnique) {
			const businessNameIndex = businessTable.indices.find((idx) => idx.columnNames.includes('name') && idx.isUnique)
			if (businessNameIndex) {
				await queryRunner.dropIndex(BUSINESSES_TABLE, businessNameIndex)
			}
		}

		await queryRunner.addColumn(
			BUSINESSES_TABLE,
			new TableColumn({
				name: 'status',
				type: 'varchar',
				length: '20',
				default: "'pending'",
				isNullable: false,
			}),
		)

		await queryRunner.addColumn(
			BUSINESSES_TABLE,
			new TableColumn({
				name: 'ownerUserId',
				type: 'uuid',
				isNullable: true,
			}),
		)

		await queryRunner.addColumn(
			TRANSACTIONS_TABLE,
			new TableColumn({
				name: 'businessId',
				type: 'uuid',
				isNullable: true,
			}),
		)

		await queryRunner.addColumn(
			TRANSACTIONS_TABLE,
			new TableColumn({
				name: 'userId',
				type: 'uuid',
				isNullable: true,
			}),
		)

		await queryRunner.addColumn(
			TRANSACTIONS_TABLE,
			new TableColumn({
				name: 'status',
				type: 'varchar',
				length: '20',
				default: "'recorded'",
				isNullable: false,
			}),
		)

		await queryRunner.addColumn(
			TRANSACTIONS_TABLE,
			new TableColumn({
				name: 'editedByUploader',
				type: 'boolean',
				default: false,
				isNullable: false,
			}),
		)

		const transactionTable = await queryRunner.getTable(TRANSACTIONS_TABLE)
		const amountColumn = transactionTable?.findColumnByName('amount')
		if (amountColumn && !amountColumn.isNullable) {
			await queryRunner.changeColumn(
				TRANSACTIONS_TABLE,
				'amount',
				new TableColumn({
					name: 'amount',
					type: 'numeric',
					precision: 14,
					scale: 2,
					isNullable: true,
				}),
			)
		}

		const transactionIdColumn = transactionTable?.findColumnByName('transactionId')
		if (transactionIdColumn && !transactionIdColumn.isNullable) {
			await queryRunner.changeColumn(
				TRANSACTIONS_TABLE,
				'transactionId',
				new TableColumn({
					name: 'transactionId',
					type: 'varchar',
					length: '128',
					isNullable: true,
				}),
			)
		}

		const timestampColumn = transactionTable?.findColumnByName('timestamp')
		if (timestampColumn && !timestampColumn.isNullable) {
			await queryRunner.changeColumn(
				TRANSACTIONS_TABLE,
				'timestamp',
				new TableColumn({
					name: 'timestamp',
					type: 'timestamptz',
					isNullable: true,
				}),
			)
		}

		const bankNameColumn = transactionTable?.findColumnByName('bankName')
		if (bankNameColumn && !bankNameColumn.isNullable) {
			await queryRunner.changeColumn(
				TRANSACTIONS_TABLE,
				'bankName',
				new TableColumn({
					name: 'bankName',
					type: 'varchar',
					length: '120',
					isNullable: true,
				}),
			)
		}

		await queryRunner.renameColumn(TRANSACTIONS_TABLE, 'imageUrl', 'imageKey')

		await queryRunner.createIndex(
			TRANSACTIONS_TABLE,
			new TableIndex({
				name: 'idx_transaction_business_id',
				columnNames: ['businessId'],
			}),
		)

		await queryRunner.createForeignKey(
			TRANSACTIONS_TABLE,
			new TableForeignKey({
				columnNames: ['businessId'],
				referencedTableName: BUSINESSES_TABLE,
				referencedColumnNames: ['id'],
				onDelete: 'SET NULL',
			}),
		)

		await queryRunner.createForeignKey(
			TRANSACTIONS_TABLE,
			new TableForeignKey({
				columnNames: ['userId'],
				referencedTableName: USERS_TABLE,
				referencedColumnNames: ['id'],
				onDelete: 'SET NULL',
			}),
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const transactionTable = await queryRunner.getTable(TRANSACTIONS_TABLE)
		const businessForeignKey = transactionTable?.foreignKeys.find((key) => key.columnNames.includes('businessId'))
		if (businessForeignKey) {
			await queryRunner.dropForeignKey(TRANSACTIONS_TABLE, businessForeignKey)
		}
		const userForeignKey = transactionTable?.foreignKeys.find((key) => key.columnNames.includes('userId'))
		if (userForeignKey) {
			await queryRunner.dropForeignKey(TRANSACTIONS_TABLE, userForeignKey)
		}

		const businessIdIndex = transactionTable?.indices.find((idx) => idx.name === 'idx_transaction_business_id')
		if (businessIdIndex) {
			await queryRunner.dropIndex(TRANSACTIONS_TABLE, businessIdIndex)
		}

		await queryRunner.renameColumn(TRANSACTIONS_TABLE, 'imageKey', 'imageUrl')

		await queryRunner.dropColumn(TRANSACTIONS_TABLE, 'editedByUploader')
		await queryRunner.dropColumn(TRANSACTIONS_TABLE, 'status')
		await queryRunner.dropColumn(TRANSACTIONS_TABLE, 'userId')
		await queryRunner.dropColumn(TRANSACTIONS_TABLE, 'businessId')

		await queryRunner.changeColumn(
			TRANSACTIONS_TABLE,
			'bankName',
			new TableColumn({
				name: 'bankName',
				type: 'varchar',
				length: '120',
				isNullable: false,
			}),
		)

		await queryRunner.changeColumn(
			TRANSACTIONS_TABLE,
			'timestamp',
			new TableColumn({
				name: 'timestamp',
				type: 'timestamptz',
				isNullable: false,
			}),
		)

		await queryRunner.changeColumn(
			TRANSACTIONS_TABLE,
			'transactionId',
			new TableColumn({
				name: 'transactionId',
				type: 'varchar',
				length: '128',
				isNullable: false,
			}),
		)

		await queryRunner.changeColumn(
			TRANSACTIONS_TABLE,
			'amount',
			new TableColumn({
				name: 'amount',
				type: 'numeric',
				precision: 14,
				scale: 2,
				isNullable: false,
			}),
		)

		await queryRunner.dropColumn(BUSINESSES_TABLE, 'ownerUserId')
		await queryRunner.dropColumn(BUSINESSES_TABLE, 'status')

		const inviteTable = await queryRunner.getTable(INVITES_TABLE)
		const businessFk = inviteTable?.foreignKeys.find((key) => key.columnNames.includes('businessId'))
		if (businessFk) {
			await queryRunner.dropForeignKey(INVITES_TABLE, businessFk)
		}
		const userFk = inviteTable?.foreignKeys.find((key) => key.columnNames.includes('createdByUserId'))
		if (userFk) {
			await queryRunner.dropForeignKey(INVITES_TABLE, userFk)
		}
		await queryRunner.dropTable(INVITES_TABLE)

		const userTable = await queryRunner.getTable(USERS_TABLE)
		const userBusinessFk = userTable?.foreignKeys.find((key) => key.columnNames.includes('businessId'))
		if (userBusinessFk) {
			await queryRunner.dropForeignKey(USERS_TABLE, userBusinessFk)
		}
		await queryRunner.dropTable(USERS_TABLE)
	}
}
