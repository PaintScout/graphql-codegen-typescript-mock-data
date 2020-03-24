import { PluginFunction } from '@graphql-codegen/plugin-helpers';
export declare function toPascalCase(str: string): string;
export interface TypescriptMocksPluginConfig {
    typesFile?: string;
    addTypename?: boolean;
}
export declare const plugin: PluginFunction<TypescriptMocksPluginConfig>;
