import { CompletionItem } from 'vscode-languageserver'

declare interface XmlStorage {
	[x: string]: StorageSchema
}

declare interface StorageSchema {
	schemanamespace?: string,
	schema: XmlSchema,
	referencedNamespaces: { [x: string]: string }, targetNamespace: string
}

declare interface Storage {
	i18nItems?: CompletionItem[];
}

declare interface ComplexTypeEx extends ComplexType {
	// Additional properties for navigation
	basetype?: ComplexTypeEx;
	schema: StorageSchema;
}

declare interface ElementEx extends Element {
	ownerschema?: StorageSchema
}