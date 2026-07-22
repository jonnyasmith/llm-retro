import { openDatabase } from './database/connection';
import { initialiseRuntime } from './runtime';

const connection = openDatabase();
const runtime = initialiseRuntime(connection.database);

export const bootstrap = { ...connection, ...runtime };
