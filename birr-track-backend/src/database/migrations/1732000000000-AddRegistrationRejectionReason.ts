import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddRegistrationRejectionReason1732000000000 implements MigrationInterface {
	name = 'AddRegistrationRejectionReason1732000000000'

	public async up(queryRunner: QueryRunner): Promise<void> {
		const table = await queryRunner.getTable('businesses')
		if (!table?.findColumnByName('rejectionReason')) {
			await queryRunner.addColumn(
				'businesses',
				new TableColumn({
					name: 'rejectionReason',
					type: 'varchar',
					length: '1000',
					isNullable: true,
				}),
			)
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const table = await queryRunner.getTable('businesses')
		if (table?.findColumnByName('rejectionReason')) {
			await queryRunner.dropColumn('businesses', 'rejectionReason')
		}
	}
}
