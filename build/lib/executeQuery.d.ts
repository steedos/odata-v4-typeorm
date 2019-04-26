import { SqlOptions } from './sqlOptions';
declare const executeQuery: (repositoryOrQueryBuilder: any, query: any, options: SqlOptions) => Promise<any>;
declare const executeCountQuery: (repositoryOrQueryBuilder: any, query: any, options: SqlOptions) => Promise<any>;
export { executeQuery, executeCountQuery };
