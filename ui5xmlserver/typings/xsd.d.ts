interface XmlBase {
	[x: string]: any
}

interface Element extends XmlBase {
	$: {
		name?: string,
		type?: string,
		substitutionGroup?: string,
		minOccurs?: number | string
		maxOccurs?: number | string
		ref?: string
	}

	attribute?: Attribute[];
	complexType?: ComplexType[];
	annotation?: Annotation[];
	sequence?: any[]
}

interface ComplexContent extends XmlBase {
	extension?: Extension[];
	attribute?: Attribute[];
}

interface Sequence extends XmlBase {
	element?: Element[];
	choice?: Choice[];
}

interface Choice extends XmlBase {
	$: {
		minOccurs: number | string,
		maxOccurs: number | string
	}
	element?: Element[];
	any?: Any[]
}

interface Any extends XmlBase {
	$: {
		processContents?: string;
		namespace?: string;
	}
}

interface SimpleType {
	$: {
		name: string;
	}
	restriction: Restriction[]
}

interface Restriction {

	$: {
		/**
		 * Base type of the restriction (for example xsd:string)
		 * 
		 * @type {string}@memberof Restriction
		 */
		base?: string;
	}
	enumeration?: Enumeration[]
}

interface Enumeration {
	$: {
		value: string;
	}
	annotation: Annotation[];
}

interface ComplexType extends Annotated {
	$: {
		/**
		 * Will be restricted to required or prohibited
		 * 
		 * @type {string}
		 */
		name: string
		/**
		 * Not allowed if simpleContent child is chosen. May be overridden by setting on complexContent child.
		 * 
		 * @type {boolean}
		 */
		mixed?: boolean
		abstract?: boolean
		final?: any
		block?: any
		defaultAttributesApply?: boolean
		id?: string
	}
	attribute?: Attribute[];
	complexContent: ComplexContent[];
	element?: Element[];
	sequence?: any[]
}

/**
 * This type is extended by all types which allow annotation
       other than <schema> itself
     
 * 
 * @interface Annotated
 * @extends {XmlBase}
 */
interface Annotated extends XmlBase {
	$: {
		id?: string
	}
}

interface Extension extends ComplexType {
	$: {
		/**
		 * Will be restricted to required or prohibited
		 * 
		 * @type {string}
		 */
		name: string
		/**
		 * Not allowed if simpleContent child is chosen. May be overridden by setting on complexContent child.
		 * 
		 * @type {boolean}
		 */
		mixed?: boolean
		abstract?: boolean
		final?: any
		block?: any
		defaultAttributesApply?: boolean
		id?: string
		/**
		 * Reference to the base type, will always be (<namespace>:)<typename> (namespace is optional)
		 * 
		 * @type {string}
		 */
		base: string
	}
}

interface Attribute extends XmlBase {
	$: {
		name: string;
		type: string;
	}
	annotation?: Annotation[];

	// Additional properties for navigation
	owner?: ComplexType;
	schema: XmlSchema;
}

interface Annotation extends XmlBase {
	documentation?: string[];
}

interface XmlSchema extends XmlBase {
	complexType?: ComplexType[];
	element?: Element[];
	simpleType?: SimpleType[];
}