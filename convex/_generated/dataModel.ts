/* eslint-disable */
/**
 * Development-time data model equivalent to Convex code generation.
 * Run `bun run convex:codegen` after connecting a deployment to regenerate it.
 */
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  TableNamesInDataModel,
} from "convex/server";

import schema from "../schema";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames> = Doc<TableName>["_id"];
