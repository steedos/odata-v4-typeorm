import { Token } from 'odata-v4-parser/lib/lexer';
import { Visitor } from 'odata-v4-sql/lib/visitor';
export declare class TypeOrmVisitor extends Visitor {
    includes: TypeOrmVisitor[];
    alias: string;
    constructor(options: any);
    from(table: string): string;
    asMsSql(): this;
    asPostgreSql(): this;
    asType(): this;
    protected VisitExpand(node: Token, context: any): void;
    protected VisitSelectItem(node: Token, context: any): void;
    protected VisitODataIdentifier(node: Token, context: any): void;
    private getIdentifier(originalIdentifier, context);
    protected VisitEqualsExpression(node: Token, context: any): void;
    protected VisitNotEqualsExpression(node: Token, context: any): void;
    protected VisitLiteral(node: Token, context: any): void;
    protected VisitNotExpression(node: Token, context: any): void;
    protected VisitMethodCallExpression(node: Token, context: any): void;
}
