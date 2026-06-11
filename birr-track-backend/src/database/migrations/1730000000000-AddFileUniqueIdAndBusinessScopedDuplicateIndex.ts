import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm'

const TRANSACTIONS_TABLE = 'transactions'

export class AddFileUniqueIdAndBusinessScopedDuplicateIndex1730000000000 implements MigrationInterface {
	name = 'AddFileUniqueIdAndBusinessScopedDuplicateIndex1730000000000'

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.addColumn(
			TRANSACTIONS_TABLE,
			new TableColumn({
				name: 'fileUniqueId',
				type: 'varchar',
				length: '255',
				isNullable: true,
			}),
		)

		const transactionTable = await queryRunner.getTable(TRANSACTIONS_TABLE)
		const oldDuplicateIndex = transactionTable?.indices.find((idx) => idx.name === 'idx_transaction_duplicate_lookup')
		if (oldDuplicateIndex) {
			await queryRunner.dropIndex(TRANSACTIONS_TABLE, oldDuplicateIndex)
		}

		await queryRunner.createIndex(
			TRANSACTIONS_TABLE,
			new TableIndex({
				name: 'idx_transaction_duplicate_lookup',
				columnNames: ['businessId', 'transactionId', 'amount', 'timestamp'],
			}),
		)

		await queryRunner.createIndex(
			TRANSACTIONS_TABLE,
			new TableIndex({
				name: 'idx_transaction_idempotency',
				columnNames: ['businessId', 'fileUniqueId'],
				isUnique: true,
			}),
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const transactionTable = await queryRunner.getTable(TRANSACTIONS_TABLE)

		const idempotencyIndex = transactionTable?.indices.find((idx) => idx.name === 'idx_transaction_idempotency')
		if (idempotencyIndex) {
			await queryRunner.dropIndex(TRANSACTIONS_TABLE, idempotencyIndex)
		}

		const newDuplicateIndex = transactionTable?.indices.find((idx) => idx.name === 'idx_transaction_duplicate_lookup')
		if (newDuplicateIndex) {
			await queryRunner.dropIndex(TRANSACTIONS_TABLE, newDuplicateIndex)
		}

		await queryRunner.dropColumn(TRANSACTIONS_TABLE, 'fileUniqueId')

		await queryRunner.createIndex(
			TRANSACTIONS_TABLE,
			new TableIndex({
				name: 'idx_transaction_duplicate_lookup',
				columnNames: ['transactionId', 'amount', 'timestamp'],
			}),
		)
	}
}
