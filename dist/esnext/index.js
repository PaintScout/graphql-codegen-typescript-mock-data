import { printSchema, parse, visit } from 'graphql';
import casual from 'casual';
import { pascalCase } from 'pascal-case';
export function toPascalCase(str) {
    if (str.charAt(0) === '_') {
        return str.replace(/^(_*)(.*)/, (_match, underscorePrefix, typeName) => `${underscorePrefix}${pascalCase(typeName || '')}`);
    }
    return pascalCase(str || '');
}
const toMockName = (name) => {
    return `mock${name}`;
};
const hashedString = (value) => {
    let hash = 0;
    if (value.length === 0) {
        return hash;
    }
    for (let i = 0; i < value.length; i++) {
        let char = value.charCodeAt(i);
        // eslint-disable-next-line no-bitwise
        hash = (hash << 5) - hash + char;
        // eslint-disable-next-line no-bitwise
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};
const getNamedType = (typeName, fieldName, types, namedType) => {
    if (!namedType) {
        return '';
    }
    casual.seed(hashedString(typeName + fieldName));
    const name = namedType.name.value;
    switch (name) {
        case 'String':
            return `'${casual.word}'`;
        case 'Float':
            return Math.round(casual.double(0, 10) * 100) / 100;
        case 'ID':
            return `'${casual.uuid}'`;
        case 'Boolean':
            return casual.boolean;
        case 'Int':
            return casual.integer(0, 9999);
        case 'Date':
            return `'${new Date(casual.unix_time).toISOString()}'`;
        default:
            const foundType = types.find(enumType => enumType.name === name);
            if (foundType) {
                switch (foundType.type) {
                    case 'enum':
                        // It's an enum
                        const value = foundType.values ? foundType.values[0] : '';
                        return `${foundType.name}.${toPascalCase(value)}`;
                    case 'union':
                        // Return the first union type node.
                        return getNamedType(typeName, fieldName, types, foundType.types && foundType.types[0]);
                    default:
                        throw `foundType is unknown: ${foundType.name}: ${foundType.type}`;
                }
            }
            return `${toMockName(name)}()`;
    }
};
const generateMockValue = (typeName, fieldName, types, currentType) => {
    switch (currentType.kind) {
        case 'NamedType':
            return getNamedType(typeName, fieldName, types, currentType);
        case 'NonNullType':
            return generateMockValue(typeName, fieldName, types, currentType.type);
        case 'ListType':
            const value = generateMockValue(typeName, fieldName, types, currentType.type);
            return `[${value}]`;
    }
};
const getMockString = (typeName, fields, addTypename = false) => {
    const typename = addTypename ? `\n        __typename: '${typeName}',` : '';
    return `
export const ${toMockName(typeName)} = (overrides?: Partial<${typeName}>): ${typeName} => {
    return {${typename}
${fields}
        ...overrides
    };
};`;
};
// This plugin was generated with the help of ast explorer.
// https://astexplorer.net
// Paste your graphql schema in it, and you'll be able to see what the `astNode` will look like
export const plugin = (schema, documents, config) => {
    const printedSchema = printSchema(schema); // Returns a string representation of the schema
    const astNode = parse(printedSchema); // Transforms the string into ASTNode
    // List of types that are enums
    const types = [];
    const visitor = {
        EnumTypeDefinition: node => {
            const name = node.name.value;
            if (!types.find((enumType) => enumType.name === name)) {
                types.push({
                    name,
                    type: 'enum',
                    values: node.values ? node.values.map(node => node.name.value) : [],
                });
            }
        },
        UnionTypeDefinition: node => {
            const name = node.name.value;
            if (!types.find(enumType => enumType.name === name)) {
                types.push({
                    name,
                    type: 'union',
                    types: node.types,
                });
            }
        },
        FieldDefinition: node => {
            const fieldName = node.name.value;
            return {
                name: fieldName,
                mockFn: (typeName) => {
                    const value = generateMockValue(typeName, fieldName, types, node.type);
                    return `        ${fieldName}: ${value},`;
                },
            };
        },
        InputObjectTypeDefinition: node => {
            const fieldName = node.name.value;
            return {
                typeName: fieldName,
                mockFn: () => {
                    const mockFields = node.fields
                        ? node.fields
                            .map(field => {
                            const value = generateMockValue(fieldName, field.name.value, types, field.type);
                            return `        ${field.name.value}: ${value},`;
                        })
                            .join('\n')
                        : '';
                    return getMockString(fieldName, mockFields, false);
                },
            };
        },
        ObjectTypeDefinition: node => {
            // This function triggered per each type
            const typeName = node.name.value;
            if (typeName === 'Query' || typeName === 'Mutation') {
                return null;
            }
            const { fields } = node;
            return {
                typeName,
                mockFn: () => {
                    const mockFields = fields ? fields.map(({ mockFn }) => mockFn(typeName)).join('\n') : '';
                    return getMockString(typeName, mockFields, !!config.addTypename);
                },
            };
        },
    };
    const result = visit(astNode, { leave: visitor });
    const definitions = result.definitions.filter((definition) => !!definition);
    const typesFile = config.typesFile ? config.typesFile.replace(/\.[\w]+$/, '') : null;
    const typeImports = definitions
        .map(({ typeName }) => typeName)
        .filter((typeName) => !!typeName);
    typeImports.push(...types.map(({ name }) => name));
    // List of function that will generate the mock.
    // We generate it after having visited because we need to distinct types from enums
    const mockFns = definitions.map(({ mockFn }) => mockFn).filter((mockFn) => !!mockFn);
    const typesFileImport = typesFile
        ? `/* eslint-disable @typescript-eslint/no-use-before-define,@typescript-eslint/no-unused-vars */
import { ${typeImports.join(', ')} } from '${typesFile}';\n`
        : '';
    return `${typesFileImport}${mockFns.map((mockFn) => mockFn()).join('\n')}
`;
};
//# sourceMappingURL=index.js.map