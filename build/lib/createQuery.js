"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const visitor_1 = require("./visitor");
const odata_v4_parser_1 = require("odata-v4-parser");
const odata_v4_sql_1 = require("odata-v4-sql");
function createQuery(odataQuery, options = {}) {
    if (!options.type) {
        options.type = odata_v4_sql_1.SQLLang.Oracle;
    }
    let ast = (typeof odataQuery == 'string' ? odata_v4_parser_1.query(odataQuery) : odataQuery);
    return new visitor_1.TypeOrmVisitor(options).Visit(ast).asType();
}
exports.createQuery = createQuery;
//# sourceMappingURL=createQuery.js.map