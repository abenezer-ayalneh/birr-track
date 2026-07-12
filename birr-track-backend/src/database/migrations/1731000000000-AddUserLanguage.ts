import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddUserLanguage1731000000000 implements MigrationInterface {
	name = 'AddUserLanguage1731000000000'

	public async up(queryRunner: QueryRunner): Promise<void> {
		const table = await queryRunner.getTable('users')
		if (!table?.findColumnByName('language')) {
			await queryRunner.addColumn(
				'users',
				new TableColumn({
					name: 'language',
					type: 'varchar',
					length: '2',
					default: "'en'",
					isNullable: false,
				}),
			)
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const table = await queryRunner.getTable('users')
		if (table?.findColumnByName('language')) {
			await queryRunner.dropColumn('users', 'language')
		}
	}
}
