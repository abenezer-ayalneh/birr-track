import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

const BUSINESSES_TABLE = 'businesses'
const MANAGERS_TABLE = 'managers'
const TRANSACTIONS_TABLE = 'transactions'
const EDIT_LOGS_TABLE = 'edit_logs'

export class InitialSchema1712050000000 implements MigrationInterface {
	name = 'InitialSchema1712050000000'

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

		await queryRunner.createTable(
			new Table({
				name: BUSINESSES_TABLE,
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						generationStrategy: 'uuid',
						default: 'uuid_generate_v4()',
					},
					{
						name: 'name',
						type: 'varchar',
						length: '255',
						isNullable: false,
						isUnique: true,
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

		await queryRunner.createTable(
			new Table({
				name: MANAGERS_TABLE,
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						generationStrategy: 'uuid',
						default: 'uuid_generate_v4()',
					},
					{
						name: 'businessId',
						type: 'uuid',
						isNullable: false,
					},
					{
						name: 'email',
						type: 'varchar',
						length: '255',
						isNullable: false,
						isUnique: true,
					},
					{
						name: 'passwordHash',
						type: 'varchar',
						length: '255',
						isNullable: false,
					},
				],
			}),
		)
		await queryRunner.createIndex(
			MANAGERS_TABLE,
			new TableIndex({
				name: 'idx_manager_business_id',
				columnNames: ['businessId'],
			}),
		)
		await queryRunner.createForeignKey(
			MANAGERS_TABLE,
			new TableForeignKey({
				columnNames: ['businessId'],
				referencedTableName: BUSINESSES_TABLE,
				referencedColumnNames: ['id'],
				onDelete: 'CASCADE',
			}),
		)

		await queryRunner.createTable(
			new Table({
				name: TRANSACTIONS_TABLE,
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
					},
					{
						name: 'telegramName',
						type: 'varchar',
						length: '255',
						isNullable: false,
					},
					{
						name: 'amount',
						type: 'numeric',
						precision: 14,
						scale: 2,
						isNullable: false,
					},
					{
						name: 'transactionId',
						type: 'varchar',
						length: '128',
						isNullable: false,
					},
					{
						name: 'timestamp',
						type: 'timestamptz',
						isNullable: false,
					},
					{
						name: 'bankName',
						type: 'varchar',
						length: '120',
						isNullable: false,
					},
					{
						name: 'confidence',
						type: 'float',
						isNullable: false,
					},
					{
						name: 'isDuplicate',
						type: 'boolean',
						default: false,
						isNullable: false,
					},
					{
						name: 'imageUrl',
						type: 'text',
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
			TRANSACTIONS_TABLE,
			new TableIndex({
				name: 'idx_transaction_duplicate_lookup',
				columnNames: ['transactionId', 'amount', 'timestamp'],
			}),
		)
		await queryRunner.createIndex(
			TRANSACTIONS_TABLE,
			new TableIndex({
				name: 'idx_transaction_telegram_user_id',
				columnNames: ['telegramUserId'],
			}),
		)
		await queryRunner.createIndex(
			TRANSACTIONS_TABLE,
			new TableIndex({
				name: 'idx_transaction_created_at',
				columnNames: ['createdAt'],
			}),
		)

		await queryRunner.createTable(
			new Table({
				name: EDIT_LOGS_TABLE,
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						generationStrategy: 'uuid',
						default: 'uuid_generate_v4()',
					},
					{
						name: 'transactionId',
						type: 'uuid',
						isNullable: false,
					},
					{
						name: 'fieldName',
						type: 'varchar',
						length: '80',
						isNullable: false,
					},
					{
						name: 'oldValue',
						type: 'text',
						isNullable: true,
					},
					{
						name: 'newValue',
						type: 'text',
						isNullable: true,
					},
					{
						name: 'editedBy',
						type: 'varchar',
						length: '120',
						isNullable: false,
					},
					{
						name: 'editedAt',
						type: 'timestamptz',
						default: 'now()',
						isNullable: false,
					},
				],
			}),
		)
		await queryRunner.createIndex(
			EDIT_LOGS_TABLE,
			new TableIndex({
				name: 'idx_edit_log_transaction_id',
				columnNames: ['transactionId'],
			}),
		)
		await queryRunner.createForeignKey(
			EDIT_LOGS_TABLE,
			new TableForeignKey({
				columnNames: ['transactionId'],
				referencedTableName: TRANSACTIONS_TABLE,
				referencedColumnNames: ['id'],
				onDelete: 'CASCADE',
			}),
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const editLogTable = await queryRunner.getTable(EDIT_LOGS_TABLE)
		const transactionForeignKey = editLogTable?.foreignKeys.find((key) => key.columnNames.includes('transactionId'))
		if (transactionForeignKey) {
			await queryRunner.dropForeignKey(EDIT_LOGS_TABLE, transactionForeignKey)
		}
		await queryRunner.dropTable(EDIT_LOGS_TABLE)

		await queryRunner.dropTable(TRANSACTIONS_TABLE)

		const managerTable = await queryRunner.getTable(MANAGERS_TABLE)
		const businessForeignKey = managerTable?.foreignKeys.find((key) => key.columnNames.includes('businessId'))
		if (businessForeignKey) {
			await queryRunner.dropForeignKey(MANAGERS_TABLE, businessForeignKey)
		}
		await queryRunner.dropTable(MANAGERS_TABLE)

		await queryRunner.dropTable(BUSINESSES_TABLE)
	}
}
