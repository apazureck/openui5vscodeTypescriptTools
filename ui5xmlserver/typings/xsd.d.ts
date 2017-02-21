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
	sequence?: Sequence[];
	complexType?: ComplexType[];
	annotation?: Annotation[];
}

interface XmlComplexContent extends XmlBase {
	extension?: Extension[];
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

interface ComplexType extends XmlBase {
	$: {
		name: string
	}
	complexContent?: XmlComplexContent[];
	attribute?: Attribute[];
}

interface Extension extends XmlBase {
	$: {
		base: string;
	}
	attribute?: Attribute[];
	sequence?: Sequence[];
}

interface Attribute extends XmlBase {
	$: {
		name: string;
		type: string;
	}
	annotation?: Annotation[];

	// Additional properties for navigation
	__owner?: ComplexType;
}

interface Annotation extends XmlBase {
	documentation?: string[];
}

interface XmlSchema extends XmlBase {
	complexType?: ComplexType[];
	element?: Element[];
}