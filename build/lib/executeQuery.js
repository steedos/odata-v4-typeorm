"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const createQuery_1 = require("./createQuery");
const odata_v4_sql_1 = require("odata-v4-sql");
const mapToObject = (aMap) => {
    const obj = {};
    if (aMap) {
        aMap.forEach((v, k) => {
            obj[k] = v;
        });
    }
    return obj;
};
const queryToOdataString = (query) => {
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
const processIncludes = (queryBuilder, odataQuery, alias) => {
    if (odataQuery.includes && odataQuery.includes.length > 0) {
        odataQuery.includes.forEach(item => {
            queryBuilder = queryBuilder.leftJoinAndSelect((alias ? alias + '.' : '') + item.navigationProperty, item.navigationProperty, item.where.replace(/typeorm_query/g, item.navigationProperty), mapToObject(item.parameters));
            if (item.orderby && item.orderby != '1') {
                const orders = item.orderby.split(',').map(i => i.trim().replace(/typeorm_query/g, item.navigationProperty));
                orders.forEach((itemOrd) => {
                    queryBuilder = queryBuilder.addOrderBy(...(itemOrd.split(' ')));
                });
            }
            if (item.includes && item.includes.length > 0) {
                processIncludes(queryBuilder, { includes: item.includes }, item.navigationProperty);
            }
        });
    }
    return queryBuilder;
};
const executeQueryByQueryBuilder = (inputQueryBuilder, query, options, returnSql = false) => __awaiter(this, void 0, void 0, function* () {
    const alias = inputQueryBuilder.expressionMap.mainAlias.name;
    options.alias = alias;
    //const filter = createFilter(query.$filter, {alias: alias});
    let odataQuery = {};
    if (query) {
        const odataString = queryToOdataString(query);
        if (odataString) {
            odataQuery = createQuery_1.createQuery(odataString, options);
        }
    }
    const queryRunner = inputQueryBuilder.connection.driver.createQueryRunner("master");
    const isPaging = query.$skip !== undefined || query.$top !== undefined;
    if (queryRunner && isPaging && options.type == odata_v4_sql_1.SQLLang.MsSql) {
        // 老版本的SQL server 不支持OFFSET FETCH 的语法来翻页，只能单独处理
        const connectionOptions = queryRunner.connection.options.options;
        const tdsVersion = connectionOptions && connectionOptions.tdsVersion;
        if (tdsVersion && tdsVersion.replace(/[^\d]/g, "") < 74) {
            // tdsVersion is less then 7_4, like 7_1,7_2,7_3_A,7_3_B...etc, the default value is 7_4
            // 7_4是2012及以上版本的SQL Server
            if (query) {
                const odataString = queryToOdataString(query);
                if (odataString) {
                    // 因queryRunner.query函数传入params参数的方式未能调式成功（可能是原厂家BUG），
                    // 所以这里useParameters设置为false，直接把参数值注入sql语句中
                    options.useParameters = false;
                    odataQuery = createQuery_1.createQuery(odataString, options);
                }
            }
            const runSql = odataQuery.from(alias);
            if (returnSql) {
                return runSql;
            }
            // let params = Array.from(odataQuery.parameters.values());
            // let params = mapToObject(odataQuery.parameters);
            // const result = await queryRunner.query(runSql, params);
            const result = yield queryRunner.query(runSql);
            if (query.$count && query.$count !== 'false') {
                return {
                    items: result.concat(),
                    count: result.length
                };
            }
            else {
                return result.concat();
            }
        }
    }
    let queryBuilder = inputQueryBuilder;
    queryBuilder = queryBuilder
        .andWhere(odataQuery.where)
        .setParameters(mapToObject(odataQuery.parameters));
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
        const resultData = yield queryBuilder.getManyAndCount();
        return {
            items: resultData[0],
            count: resultData[1]
        };
    }
    return queryBuilder.getMany();
});
const executeQuery = (repositoryOrQueryBuilder, query, options) => __awaiter(this, void 0, void 0, function* () {
    // options = options || {};
    const alias = options.alias || '';
    let queryBuilder = null;
    // check that input object is query builder
    if (typeof repositoryOrQueryBuilder.expressionMap !== 'undefined') {
        queryBuilder = repositoryOrQueryBuilder;
    }
    else {
        queryBuilder = yield repositoryOrQueryBuilder.createQueryBuilder(alias);
    }
    const result = yield executeQueryByQueryBuilder(queryBuilder, query, options);
    return result;
});
exports.executeQuery = executeQuery;
const executeCountQueryByQueryBuilder = (inputQueryBuilder, query, options) => __awaiter(this, void 0, void 0, function* () {
    const alias = inputQueryBuilder.expressionMap.mainAlias.name;
    options.alias = alias;
    //const filter = createFilter(query.$filter, {alias: alias});
    let odataQuery = {};
    if (query) {
        const odataString = queryToOdataString(query);
        if (odataString) {
            odataQuery = createQuery_1.createQuery(odataString, options);
        }
    }
    const queryRunner = inputQueryBuilder.connection.driver.createQueryRunner("master");
    let queryBuilder = inputQueryBuilder;
    queryBuilder = queryBuilder
        .andWhere(odataQuery.where)
        .setParameters(mapToObject(odataQuery.parameters));
    queryBuilder = processIncludes(queryBuilder, odataQuery, alias);
    return yield queryBuilder.getCount();
});
const executeCountQuery = (repositoryOrQueryBuilder, query, options) => __awaiter(this, void 0, void 0, function* () {
    // options = options || {};
    const alias = options.alias || '';
    let queryBuilder = null;
    // check that input object is query builder
    if (typeof repositoryOrQueryBuilder.expressionMap !== 'undefined') {
        queryBuilder = repositoryOrQueryBuilder;
    }
    else {
        queryBuilder = repositoryOrQueryBuilder.createQueryBuilder(alias);
    }
    const result = yield executeCountQueryByQueryBuilder(queryBuilder, query, options);
    return result;
});
exports.executeCountQuery = executeCountQuery;
const getExecuteQuerySQL = (repositoryOrQueryBuilder, query, options) => __awaiter(this, void 0, void 0, function* () {
    // options = options || {};
    const alias = options.alias || '';
    let queryBuilder = null;
    // check that input object is query builder
    if (typeof repositoryOrQueryBuilder.expressionMap !== 'undefined') {
        queryBuilder = repositoryOrQueryBuilder;
    }
    else {
        queryBuilder = yield repositoryOrQueryBuilder.createQueryBuilder(alias);
    }
    const result = executeQueryByQueryBuilder(queryBuilder, query, options, true);
    return result;
});
exports.getExecuteQuerySQL = getExecuteQuerySQL;
//# sourceMappingURL=executeQuery.js.map