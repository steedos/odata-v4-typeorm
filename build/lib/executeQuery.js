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
    let queryBuilder = inputQueryBuilder;
    queryBuilder = queryBuilder
        .andWhere(odataQuery.where)
        .setParameters(mapToObject(odataQuery.parameters));
    const queryRunner = inputQueryBuilder.obtainQueryRunner();
    const isPaging = query.$skip !== undefined || query.$top !== undefined;
    if (isPaging && query.$top === undefined) {
        query.$top = 100;
    }
    if (queryRunner && isPaging && [odata_v4_sql_1.SQLLang.MsSql, odata_v4_sql_1.SQLLang.Oracle].indexOf(options.type) >= 0) {
        // 老版本的SqlServer/Oracle数据库不支持OFFSET FETCH 的语法来翻页，只能单独处理
        // SqlServer 2012版本号options.version为11.0.3128.0，这以下的版本，比如2008/2005都不支持OFFSET FETCH 的语法来翻页
        const oldVersionMsSql = options.type === odata_v4_sql_1.SQLLang.MsSql && options.version && parseInt(options.version) < 11;
        const tooOldVersionMsSql = oldVersionMsSql && parseInt(options.version) < 9;
        // Oracle 12c版本号options.version为12.2...，这以下的版本，比如10.2都不支持OFFSET FETCH 的语法来翻页
        const oldVersionOracle = options.type === odata_v4_sql_1.SQLLang.Oracle && options.version && parseInt(options.version) < 12;
        if (oldVersionMsSql || oldVersionOracle) {
            let selectFields = "*";
            if (odataQuery.select && odataQuery.select !== '*') {
                selectFields = odataQuery.select;
            }
            let orderby = odataQuery.orderby;
            if (oldVersionMsSql && !(orderby && orderby !== '1')) {
                orderby = "(select null) ASC";
            }
            const RowNumberKey = "RowNumber";
            if (oldVersionMsSql) {
                if (tooOldVersionMsSql) {
                    queryBuilder = queryBuilder.select(`top ${query.$top} ${selectFields}`);
                }
                else {
                    queryBuilder = queryBuilder.select(`${selectFields},ROW_NUMBER() OVER(ORDER BY ${orderby}) ${RowNumberKey}`);
                }
            }
            else if (oldVersionOracle) {
                queryBuilder = queryBuilder.select(`${selectFields}`);
            }
            if (oldVersionOracle && odataQuery.orderby && odataQuery.orderby !== '1') {
                const orders = odataQuery.orderby.split(',').map(i => i.trim());
                orders.forEach((item) => {
                    queryBuilder = queryBuilder.addOrderBy(...(item.split(' ')));
                });
            }
            let qs = queryBuilder.getQueryAndParameters();
            if (returnSql) {
                return qs;
            }
            let splicedSql = "";
            let start = query.$skip ? query.$skip : 0;
            let end = 0;
            if (query.$top) {
                end = start + query.$top;
            }
            if (oldVersionMsSql) {
                if (tooOldVersionMsSql) {
                    splicedSql = `SELECT * FROM (${qs[0]}) A`;
                }
                else {
                    let betweenSql = "";
                    if (end) {
                        betweenSql = `BETWEEN ${start} + 1 and ${end}`;
                    }
                    else {
                        betweenSql = `> ${start}`;
                    }
                    splicedSql = `SELECT * FROM (${qs[0]}) A WHERE ${RowNumberKey} ${betweenSql}`;
                }
            }
            else if (oldVersionOracle) {
                splicedSql = `SELECT * FROM (SELECT A.*, ROWNUM ${RowNumberKey} FROM (${qs[0]}) A ${end ? ('WHERE ROWNUM <= ' + end) : ''}) b WHERE B.${RowNumberKey} > ${start}`;
            }
            try {
                const result = yield queryRunner.query(splicedSql, qs[1]);
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
            finally {
                if (queryRunner !== queryBuilder.queryRunner) {
                    yield queryRunner.release();
                }
                if (queryBuilder.connection.driver.options.type === "sqljs") {
                    // this.connection.driver instanceof SqljsDriver
                    // SqljsDriver is not export from typeorm,so we user driver.options.type to check the SqljsDriver instance
                    yield queryBuilder.connection.driver.autoSave();
                }
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
    const queryRunner = inputQueryBuilder.obtainQueryRunner();
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