import { entityKind, type ColumnBuilderBaseConfig, type ColumnBaseConfig } from 'drizzle-orm'
import {
  MySqlColumnBuilderWithAutoIncrement,
  MySqlColumnWithAutoIncrement,
  type AnyMySqlTable,
} from 'drizzle-orm/mysql-core'

export type MySqlBigIntStringBuilderInitial<TName extends string> = MySqlBigIntStringBuilder<{
  name: TName
  dataType: 'string'
  columnType: 'MySqlBigIntString'
  data: string
  driverParam: string | number | bigint
  enumValues: undefined
}>

export class MySqlBigIntStringBuilder<
  T extends ColumnBuilderBaseConfig<'string', 'MySqlBigIntString'>,
> extends MySqlColumnBuilderWithAutoIncrement<T, { unsigned: boolean }> {
  static readonly [entityKind]: string = 'MySqlBigIntStringBuilder'
  constructor(name: T['name'], unsigned = false) {
    super(name, 'string', 'MySqlBigIntString')
    this.config.unsigned = unsigned
  }
  build<TTableName extends string>(table: AnyMySqlTable<{ name: TTableName }>) {
    // drizzle's builder types cannot express this custom column type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new MySqlBigIntString(table, this.config) as any
  }
}

export class MySqlBigIntString<
  T extends ColumnBaseConfig<'string', 'MySqlBigIntString'>,
> extends MySqlColumnWithAutoIncrement<T, { unsigned: boolean }> {
  static readonly [entityKind]: string = 'MySqlBigIntString'
  getSQLType(): string {
    return `bigint${this.config.unsigned ? ' unsigned' : ''}`
  }
  mapFromDriverValue(value: unknown): string {
    return String(value)
  }
}

export function bigint<TName extends string>(
  name: TName,
  config?: { mode?: 'string' | 'number' | 'bigint'; unsigned?: boolean },
): MySqlBigIntStringBuilderInitial<TName> {
  return new MySqlBigIntStringBuilder(name, config?.unsigned)
}
