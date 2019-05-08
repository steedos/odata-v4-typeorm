import {createQuery} from './createQuery';
import { SqlOptions } from './sqlOptions';
import { SQLLang } from 'odata-v4-sql';

const mapToObject = (aMap) => {
  const obj = {};
  if (aMap) {
    aMap.forEach((v, k) => {
      obj[k] = v;
    });
  }
  return obj;
};

const queryToOdataString = (query): string => {
  let result = '';
  for (let key in query) {
    if (key.startsWith('$')) {
      if (result !== '') {
        result += '&';
      }
      result += `${key}=${query[key]}`;
    }
  }
  return result;
};

const processIncludes = (queryBuilder: any, odataQuery: any, alias: string) => {
  if (odataQuery.includes && odataQuery.includes.length > 0) {
    odataQuery.includes.forEach(item => {
      queryBuilder = queryBuilder.leftJoinAndSelect(
        (alias ? alias + '.' : '') + item.navigationProperty,
        item.navigationProperty,
        item.where.replace(/typeorm_query/g, item.navigationProperty),
        mapToObject(item.parameters)
      );

      if (item.orderby && item.orderby != '1') {
        const orders = item.orderby.split(',').map(i => i.trim().replace(/typeorm_query/g, item.navigationProperty));
        orders.forEach((itemOrd) => {
          queryBuilder = queryBuilder.addOrderBy(...(itemOrd.split(' ')));
        });
      }

      if (item.includes && item.includes.length > 0) {
        processIncludes(queryBuilder, {includes: item.includes}, item.navigationProperty);
      }
    });
  }

  return queryBuilder;
};

const executeQueryByQueryBuilder = async (inputQueryBuilder, query, options: SqlOptions, returnSql: boolean = false) => {
  const alias = inputQueryBuilder.expressionMap.mainAlias.name;
  options.alias = alias;
  //const filter = createFilter(query.$filter, {alias: alias});
  let odataQuery: any = {};
  if (query) {
    const odataString = queryToOdataString(query);
    if (odataString) {
      odataQuery = createQuery(odataString, options);
    }
  }
  let queryBuilder = inputQueryBuilder;

  queryBuilder = queryBuilder
    .andWhere(odataQuery.where)
    .setParameters(mapToObject(odataQuery.parameters));

  const queryRunner = inputQueryBuilder.connection.driver.createQueryRunner("master");
  const isPaging = query.$skip !== undefined || query.$top !== undefined;
  if (queryRunner && isPaging && options.type == SQLLang.MsSql) {
    // 老版本的SQL server 不支持OFFSET FETCH 的语法来翻页，只能单独处理
    const connectionOptions = queryRunner.connection.options.options;
    const tdsVersion = connectionOptions && connectionOptions.tdsVersion;
    if (tdsVersion && tdsVersion.replace(/[^\d]/g, "") < 74) {
      // tdsVersion is less then 7_4, like 7_1,7_2,7_3_A,7_3_B...etc, the default value is 7_4
      // 7_4是2012及以上版本的SQL Server
      let selectFields = "*";
      if (odataQuery.select && odataQuery.select != '*') {
        selectFields = odataQuery.select.split(',').map(i => i.trim()).join(",");
      }
      let orderby = odataQuery.orderby;
      if (!(orderby && orderby !== '1')) {
        orderby = "(select null) ASC";
      }
      const RowIdKey = "RowId";
      queryBuilder = queryBuilder.select(`${selectFields},ROW_NUMBER() OVER(ORDER BY ${orderby}) AS ${RowIdKey}`);
      let qs = queryBuilder.getQueryAndParameters();
      if (returnSql) {
        return qs;
      }
      let start = query.$skip ? query.$skip : 0;
      let end = 0;
      if (query.$top){
        end = start + query.$top;
      }
      let betweenSql = "";
      if (end){
        betweenSql = `BETWEEN ${start} + 1 and ${end}`;
      }
      else{
        betweenSql = `> ${start}`;
      }
      const result = await queryRunner.query(`SELECT * from (${qs[0]}) as a WHERE ${RowIdKey} ${betweenSql}`, qs[1]);
      if (query.$count && query.$count !== 'false') {
        return {
          items: result.concat(),
          count: result.length
        }
      }
      else {
        return result.concat();
      }
    }
  }

  if (odataQuery.select && odataQuery.select != '*') {
    queryBuilder = queryBuilder.select(odataQuery.select.split(',').map(i => i.trim()));
  }

  queryBuilder = processIncludes(queryBuilder, odataQuery, alias);

  if (odataQuery.orderby && odataQuery.orderby !== '1') {
    const orders = odataQuery.orderby.split(',').map(i => i.trim());
    orders.forEach((item) => {
      queryBuilder = queryBuilder.addOrderBy(...(item.split(' ')));
    });
  }
  queryBuilder = queryBuilder.skip(query.$skip || 0);
  if (query.$top) {
    queryBuilder = queryBuilder.take(query.$top);
  }
  if (returnSql) {
    return {
      sql: queryBuilder.getSql(),
      query: queryBuilder.getQuery()
    };
  }
  if (query.$count && query.$count !== 'false') {
    const resultData = await queryBuilder.getManyAndCount();
    return {
      items: resultData[0],
      count: resultData[1]
    }
  }

  return queryBuilder.getMany();
};

const executeQuery = async (repositoryOrQueryBuilder: any, query, options: SqlOptions) => {
  // options = options || {};
  const alias =  options.alias || '';
  let queryBuilder = null;

  // check that input object is query builder
  if (typeof repositoryOrQueryBuilder.expressionMap !== 'undefined') {
    queryBuilder = repositoryOrQueryBuilder;
  } else {
    queryBuilder = await repositoryOrQueryBuilder.createQueryBuilder(alias);
  }
  const result = await executeQueryByQueryBuilder(queryBuilder, query, options);
  return result;
};


const executeCountQueryByQueryBuilder = async (inputQueryBuilder, query, options: SqlOptions) => {
  const alias = inputQueryBuilder.expressionMap.mainAlias.name;
  options.alias = alias;
  //const filter = createFilter(query.$filter, {alias: alias});
  let odataQuery: any = {};
  if (query) {
    const odataString = queryToOdataString(query);
    if (odataString) {
      odataQuery = createQuery(odataString, options);
    }
  }
  const queryRunner = inputQueryBuilder.connection.driver.createQueryRunner("master");
  let queryBuilder = inputQueryBuilder;
  queryBuilder = queryBuilder
    .andWhere(odataQuery.where)
    .setParameters(mapToObject(odataQuery.parameters));

  queryBuilder = processIncludes(queryBuilder, odataQuery, alias);

  return await queryBuilder.getCount();
};

const executeCountQuery = async (repositoryOrQueryBuilder: any, query, options: SqlOptions) => {
  // options = options || {};
  const alias = options.alias || '';
  let queryBuilder = null;

  // check that input object is query builder
  if (typeof repositoryOrQueryBuilder.expressionMap !== 'undefined') {
    queryBuilder = repositoryOrQueryBuilder;
  } else {
    queryBuilder = repositoryOrQueryBuilder.createQueryBuilder(alias);
  }
  const result = await executeCountQueryByQueryBuilder(queryBuilder, query, options);
  return result;
};

const getExecuteQuerySQL = async (repositoryOrQueryBuilder: any, query, options: SqlOptions) => {
  // options = options || {};
  const alias = options.alias || '';
  let queryBuilder = null;

  // check that input object is query builder
  if (typeof repositoryOrQueryBuilder.expressionMap !== 'undefined') {
    queryBuilder = repositoryOrQueryBuilder;
  } else {
    queryBuilder = await repositoryOrQueryBuilder.createQueryBuilder(alias);
  }
  const result = executeQueryByQueryBuilder(queryBuilder, query, options, true);
  return result;
};

export { executeQuery, executeCountQuery, getExecuteQuerySQL};