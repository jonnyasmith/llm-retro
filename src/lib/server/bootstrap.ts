import { openDatabase } from './database/connection';
import { initialiseRuntime } from './runtime';

const connection = openDatabase();
initialiseRuntime(connection.database);

export const bootstrap = connection;
